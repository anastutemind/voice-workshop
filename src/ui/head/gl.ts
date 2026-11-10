/**
 * The painted plate stretched by the sheet (scene.ts, warp.ts), drawn by the
 * graphics card on a canvas of its own, which the page lays under the canvas
 * the rest is drawn on (a picture made by the card is never copied onto
 * another canvas: on many computers that means fetching it back from the
 * card, a tenth of a second each time).
 *
 * The sheet's cells are drawn as textured triangles; a cell a parting crosses
 * is drawn once for each side, each side only as far as the parting. Then the
 * air of the instant is taken out (made clear, so what is under the layer
 * shows through it), except where the tongue is: the acoustic grid's straight
 * steps never cut the tongue.
 */
import type { HeadScene, Mat, Sheet } from './scene';
import type { Warp } from './warp';
import { BACKDROP_FRAME } from './frame';

/** Where the layer fades out instead of ending on a cut, in its pixels from the top left: where it is clear, then where it is whole. */
export interface Fades { neck: [number, number]; left?: [number, number]; top?: [number, number]; bottom?: [number, number] }

/** The plate's dark background (0..1): a pixel of the plate is taken as the head's colour, times how much of it the head covers, over this. */
export const PLATE_BG: [number, number, number] = [13 / 255, 13 / 255, 21 / 255];

const VERT = `
attribute vec2 aAt;      // where the point is now, world cm
attribute vec2 aRest;    // where it is on the plate, canonical cm
attribute vec3 aSide;    // a part of a cut cell: how far inside its two lines (cm), and 1 for the part that takes the rest
uniform vec4 uWorld;     // world cm to clip space: x * a + b, y * c + d
varying vec2 vUv;
varying vec3 vSide;
void main() {
  vUv = vec2((aRest.x - ${BACKDROP_FRAME.x0.toFixed(1)}) / ${(BACKDROP_FRAME.x1 - BACKDROP_FRAME.x0).toFixed(1)}, (${BACKDROP_FRAME.y1.toFixed(1)} - aRest.y) / ${(BACKDROP_FRAME.y1 - BACKDROP_FRAME.y0).toFixed(1)});
  vSide = aSide;
  gl_Position = vec4(aAt.x * uWorld.x + uWorld.y, aAt.y * uWorld.z + uWorld.w, 0.0, 1.0);
}`;
const FRAG = `
precision highp float;
uniform sampler2D uPlate;
uniform sampler2D uMask;
uniform vec3 uBg;
uniform float uAA;       // device pixels per canonical cm
uniform float uAlpha;
uniform float uTall;
uniform vec4 uEdgeX;     // fades toward the left edge: clear at x, whole at y (pixels)
uniform vec4 uEdgeY;     // ...toward the top (x, y) and the bottom (z, w)
uniform vec2 uNeck;      // ...and where the neck ends
varying vec2 vUv;
varying vec3 vSide;
void main() {
  float cover = clamp(min(vSide.x, vSide.y) * uAA + 0.5 + vSide.z, 0.0, 1.0);
  float m = texture2D(uMask, vUv).r;
  vec3 c = max(texture2D(uPlate, vUv).rgb - (1.0 - m) * uBg, 0.0);
  float px = gl_FragCoord.x, py = uTall - gl_FragCoord.y;
  float a = cover * uAlpha;
  a *= clamp((px - uEdgeX.x) / (uEdgeX.y - uEdgeX.x), 0.0, 1.0);
  a *= clamp((py - uEdgeY.x) / (uEdgeY.y - uEdgeY.x), 0.0, 1.0) * clamp((py - uEdgeY.z) / (uEdgeY.w - uEdgeY.z), 0.0, 1.0);
  a *= clamp((py - uNeck.x) / (uNeck.y - uNeck.x), 0.0, 1.0);
  gl_FragColor = vec4(c * a, m * a);
}`;
const FLAT_VERT = `
attribute vec2 aAt;
uniform vec4 uWorld;
void main() { gl_Position = vec4(aAt.x * uWorld.x + uWorld.y, aAt.y * uWorld.z + uWorld.w, 0.0, 1.0); }`;
const FLAT_FRAG = `
precision mediump float;
uniform vec4 uColor;
void main() { gl_FragColor = uColor; }`;

interface Built {
  warp: Warp;
  rest: WebGLBuffer; at: WebGLBuffer; idx: WebGLBuffer; nIdx: number;
  /** the parts of cut cells: six corners each */
  partRest: WebGLBuffer; partAt: WebGLBuffer; partSide: WebGLBuffer; nPart: number; partNodes: Int32Array; partAtData: Float32Array;
  frameRest: WebGLBuffer; frameAt: WebGLBuffer; frameIdx: WebGLBuffer; nFrame: number;
}

export class AnatomyGL {
  readonly cv: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private flat: WebGLProgram;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private at: { at: number; rest: number; side: number; flatAt: number };
  private plate: WebGLTexture | null = null;
  private mask: WebGLTexture | null = null;
  private plateOf: unknown = null;
  private built: Built | null = null;
  private poly: WebGLBuffer;
  lost = false;

  /** null when the computer has no graphics card to draw with */
  static make(): AnatomyGL | null {
    try { return new AnatomyGL(); } catch { return null; }
  }

  private constructor() {
    const cv = document.createElement('canvas');
    const opts: WebGLContextAttributes = { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: true, powerPreference: 'low-power' };
    const gl = (cv.getContext('webgl2', opts) ?? cv.getContext('webgl', opts)) as WebGLRenderingContext | null;
    if (!gl) throw new Error('no WebGL');
    this.cv = cv;
    this.gl = gl;
    const program = (vs: string, fs: string) => {
      const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
      const p = gl.createProgram()!;
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
      return p;
    };
    this.prog = program(VERT, FRAG);
    this.flat = program(FLAT_VERT, FLAT_FRAG);
    for (const u of ['uWorld', 'uPlate', 'uMask', 'uBg', 'uAA', 'uAlpha', 'uTall', 'uEdgeX', 'uEdgeY', 'uNeck']) this.loc[u] = gl.getUniformLocation(this.prog, u);
    this.loc.fWorld = gl.getUniformLocation(this.flat, 'uWorld');
    this.loc.fColor = gl.getUniformLocation(this.flat, 'uColor');
    this.at = { at: gl.getAttribLocation(this.prog, 'aAt'), rest: gl.getAttribLocation(this.prog, 'aRest'), side: gl.getAttribLocation(this.prog, 'aSide'), flatAt: gl.getAttribLocation(this.flat, 'aAt') };
    this.poly = gl.createBuffer()!;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
  }

  private texture(src: TexImageSource, gray: boolean): WebGLTexture | null {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gray ? gl.LUMINANCE : gl.RGB, gray ? gl.LUMINANCE : gl.RGB, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // (the newer cards' context makes any picture smaller smoothly; the older one only pictures of a power of two)
    const two = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    if (two) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, two ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    return t;
  }

  private build(sh: Sheet): Built {
    const gl = this.gl, W = sh.warp;
    const buf = (target: number, data: ArrayBufferView, usage: number) => { const b = gl.createBuffer()!; gl.bindBuffer(target, b); gl.bufferData(target, data, usage); return b; };
    const idx: number[] = [];
    for (const pc of W.whole) idx.push(pc.k[0], pc.k[1], pc.k[2], pc.k[0], pc.k[2], pc.k[3]);
    // the parts: each corner with how far inside the part's lines it is
    const nodes: number[] = [], prest: number[] = [], side: number[] = [];
    for (const pc of W.parts) {
      for (const c of [0, 1, 2, 0, 2, 3]) {
        const n = pc.k[c], x = W.rest[2 * n], y = W.rest[2 * n + 1];
        nodes.push(n);
        prest.push(x, y);
        const l = pc.lines;
        const d1 = l.length >= 3 ? l[0] * x + l[1] * y + l[2] : 1e3;
        const d2 = l.length >= 6 ? l[3] * x + l[4] * y + l[5] : 1e3;
        side.push(d1, d2, pc.takesRest ? 1 : 0);
      }
    }
    const fIdx: number[] = [];
    for (let q = 0; q < sh.frameRest.length / 8; q++) fIdx.push(4 * q, 4 * q + 1, 4 * q + 2, 4 * q, 4 * q + 2, 4 * q + 3);
    return {
      warp: W,
      rest: buf(gl.ARRAY_BUFFER, new Float32Array(W.rest), gl.STATIC_DRAW),
      at: buf(gl.ARRAY_BUFFER, sh.at, gl.DYNAMIC_DRAW),
      idx: buf(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW), nIdx: idx.length,
      partRest: buf(gl.ARRAY_BUFFER, new Float32Array(prest), gl.STATIC_DRAW),
      partAt: buf(gl.ARRAY_BUFFER, new Float32Array(prest.length), gl.DYNAMIC_DRAW),
      partSide: buf(gl.ARRAY_BUFFER, new Float32Array(side), gl.STATIC_DRAW),
      nPart: nodes.length, partNodes: new Int32Array(nodes), partAtData: new Float32Array(prest.length),
      frameRest: buf(gl.ARRAY_BUFFER, sh.frameRest, gl.STATIC_DRAW),
      frameAt: buf(gl.ARRAY_BUFFER, sh.frameAt, gl.DYNAMIC_DRAW),
      frameIdx: buf(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(fIdx), gl.STATIC_DRAW), nFrame: fIdx.length,
    };
  }

  /**
   * Draws the head for a posture, `w` by `h` pixels: the plate stretched by the scene's sheet, the air in `cut`
   * (world polygons) taken out of it except inside `keep`, and `clear` taken out whatever is kept but `hard` (the
   * teeth). `world` maps world centimetres to the layer's pixels (no turn). Returns false while the pictures are
   * not there.
   */
  render(sc: HeadScene, world: Mat, w: number, h: number, plate: { img: TexImageSource; mask: TexImageSource } | null, cut: number[][], keep: number[][], fades: Fades, alpha = 1, clear: number[][] = [], hard: number[][] = []): boolean {
    const gl = this.gl, cv = this.cv;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clearStencil(0);
    gl.stencilMask(0xff);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    if (!plate) return false;
    if (this.plateOf !== plate.img) {
      this.plate = this.texture(plate.img, false);
      this.mask = this.texture(plate.mask, true);
      this.plateOf = plate.img;
    }
    const sh = sc.sheet();
    if (!this.built || this.built.warp !== sh.warp) this.built = this.build(sh);
    const B = this.built;
    const U = this.loc, A = this.at;
    const wv: [number, number, number, number] = [(2 * world[0]) / w, (2 * world[4]) / w - 1, (-2 * world[3]) / h, 1 - (2 * world[5]) / h];

    // ---- the plate
    gl.useProgram(this.prog);
    gl.uniform4f(U.uWorld, ...wv);
    gl.uniform1i(U.uPlate, 0);
    gl.uniform1i(U.uMask, 1);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.mask);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.plate);
    gl.uniform3f(U.uBg, ...PLATE_BG);
    gl.uniform1f(U.uAA, Math.abs(world[0]) * sc.s);
    gl.uniform1f(U.uAlpha, alpha);
    gl.uniform1f(U.uTall, h);
    const off: [number, number] = [-1e6, -1e6 + 1];
    const L = fades.left ?? off, T = fades.top ?? off, Bo = fades.bottom ?? off;
    gl.uniform4f(U.uEdgeX, L[0], L[1], 0, 0);
    gl.uniform4f(U.uEdgeY, T[0], T[1], Bo[0], Bo[1]);
    gl.uniform2f(U.uNeck, fades.neck[0], fades.neck[1]);
    gl.enableVertexAttribArray(A.at);
    gl.enableVertexAttribArray(A.rest);
    // the still frame round the sheet, then the sheet's whole cells (the frame and the sheet overlap a little,
    // so no hairline opens where they meet)
    gl.disableVertexAttribArray(A.side);
    gl.vertexAttrib3f(A.side, 1e3, 1e3, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.frameAt); gl.bufferSubData(gl.ARRAY_BUFFER, 0, sh.frameAt); gl.vertexAttribPointer(A.at, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.frameRest); gl.vertexAttribPointer(A.rest, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.frameIdx);
    gl.drawElements(gl.TRIANGLES, B.nFrame, gl.UNSIGNED_SHORT, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.at); gl.bufferSubData(gl.ARRAY_BUFFER, 0, sh.at); gl.vertexAttribPointer(A.at, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.rest); gl.vertexAttribPointer(A.rest, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.idx);
    // air and soft tissue, then the parts of cut cells (soft tissue too), then bone and teeth over them
    const soft = 6 * B.warp.soft;
    gl.drawElements(gl.TRIANGLES, soft, gl.UNSIGNED_SHORT, 0);
    // the parts of cut cells, each only on its side
    if (B.nPart) {
      for (let i = 0; i < B.nPart; i++) { const n = B.partNodes[i]; B.partAtData[2 * i] = sh.at[2 * n]; B.partAtData[2 * i + 1] = sh.at[2 * n + 1]; }
      gl.enableVertexAttribArray(A.side);
      gl.bindBuffer(gl.ARRAY_BUFFER, B.partAt); gl.bufferSubData(gl.ARRAY_BUFFER, 0, B.partAtData); gl.vertexAttribPointer(A.at, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, B.partRest); gl.vertexAttribPointer(A.rest, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, B.partSide); gl.vertexAttribPointer(A.side, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, B.nPart);
      gl.disableVertexAttribArray(A.side);
      gl.vertexAttrib3f(A.side, 1e3, 1e3, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, B.at); gl.vertexAttribPointer(A.at, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, B.rest); gl.vertexAttribPointer(A.rest, 2, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.idx);
    gl.drawElements(gl.TRIANGLES, B.nIdx - soft, gl.UNSIGNED_SHORT, 2 * soft);
    gl.disableVertexAttribArray(A.rest);

    // ---- the air taken out, but not where the tongue is
    gl.useProgram(this.flat);
    gl.uniform4f(U.fWorld, ...wv);
    gl.enableVertexAttribArray(A.flatAt);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.poly);
    gl.enable(gl.STENCIL_TEST);
    gl.colorMask(false, false, false, false);
    const fan = (p: number[]) => {
      const n = p.length / 2;
      if (n < 3) return;
      const tri = new Float32Array(6 * (n - 2));
      for (let i = 1; i + 1 < n; i++) tri.set([p[0], p[1], p[2 * i], p[2 * i + 1], p[2 * i + 2], p[2 * i + 3]], 6 * (i - 1));
      gl.bufferData(gl.ARRAY_BUFFER, tri, gl.STREAM_DRAW);
      gl.vertexAttribPointer(A.flatAt, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3 * (n - 2));
    };
    const cover = (p: number[]) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1]), gl.STREAM_DRAW);
      gl.vertexAttribPointer(A.flatAt, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    // what is kept: bit 2, set inside any of the polygons (each filled even-odd in bit 4, then added)
    for (const p of keep) {
      if (p.length < 6) continue;
      gl.stencilMask(0x04);
      gl.stencilFunc(gl.ALWAYS, 0, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
      fan(p);
      gl.stencilMask(0x02);
      gl.stencilFunc(gl.EQUAL, 0x04, 0x04);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
      gl.stencilFunc(gl.EQUAL, 0x04, 0x06);
      cover(p);
      gl.stencilMask(0x04);
      gl.clear(gl.STENCIL_BUFFER_BIT);
    }
    // small pieces (three or four corners: the air's strip) taken out directly, wherever nothing is kept
    gl.colorMask(true, true, true, true);
    gl.stencilMask(0x00);
    gl.stencilFunc(gl.EQUAL, 0x00, 0x02);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.blendFunc(gl.ZERO, gl.ZERO);
    gl.uniform4f(U.fColor, 0, 0, 0, 0);
    const small: number[] = [];
    for (const p of cut) {
      if (p.length !== 6 && p.length !== 8) continue;
      small.push(p[0], p[1], p[2], p[3], p[4], p[5]);
      if (p.length === 8) small.push(p[0], p[1], p[4], p[5], p[6], p[7]);
    }
    if (small.length) {
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(small), gl.STREAM_DRAW);
      gl.vertexAttribPointer(A.flatAt, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, small.length / 2);
    }
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (const p of cut) {
      if (p.length < 10) continue;
      // inside the polygon: bit 1 (even-odd), then cleared where it is set and bit 2 is not
      gl.colorMask(false, false, false, false);
      gl.stencilMask(0x01);
      gl.stencilFunc(gl.ALWAYS, 0, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
      fan(p);
      gl.colorMask(true, true, true, true);
      gl.stencilFunc(gl.EQUAL, 0x01, 0x03);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.blendFunc(gl.ZERO, gl.ZERO);
      gl.uniform4f(U.fColor, 0, 0, 0, 0);
      cover(p);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      // (clearing bit 1 only: the mask still guards bit 2)
    }
    // what is taken out whatever is kept there, but not the teeth: bit 8 marks those
    if (clear.length) {
      for (const p of hard) {
        if (p.length < 6) continue;
        gl.colorMask(false, false, false, false);
        gl.stencilMask(0x04);
        gl.stencilFunc(gl.ALWAYS, 0, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
        fan(p);
        gl.stencilMask(0x08);
        gl.stencilFunc(gl.EQUAL, 0x04, 0x0c);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
        cover(p);
        gl.stencilMask(0x04);
        gl.clear(gl.STENCIL_BUFFER_BIT);
      }
    }
    for (const p of clear) {
      if (p.length < 6) continue;
      gl.colorMask(false, false, false, false);
      gl.stencilMask(0x01);
      gl.stencilFunc(gl.ALWAYS, 0, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
      fan(p);
      gl.colorMask(true, true, true, true);
      gl.stencilFunc(gl.EQUAL, 0x01, 0x09);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.blendFunc(gl.ZERO, gl.ZERO);
      gl.uniform4f(U.fColor, 0, 0, 0, 0);
      cover(p);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clear(gl.STENCIL_BUFFER_BIT);
    }
    gl.stencilMask(0xff);
    gl.colorMask(true, true, true, true);
    gl.disable(gl.STENCIL_TEST);
    gl.disableVertexAttribArray(A.flatAt);
    return true;
  }
}
