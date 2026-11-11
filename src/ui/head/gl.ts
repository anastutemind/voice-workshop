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
 * steps never cut the tongue. The air is then drawn again, as a cavity: the
 * picture so far is taken smaller and blurred (on the card, never copied back),
 * which tells each pixel of the air how near the tissue is and what colour it is,
 * and the air takes the tissue's colour and a wet light at its walls and goes
 * into a deep red dark away from them, with no edge of its own. The velum is the
 * model's, drawn here as the wet muscle it is. Last, everything drawn is faded
 * toward the edges of the frame and by how much of the layer shows, once.
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
varying vec2 vUv;
varying vec3 vSide;
void main() {
  float cover = clamp(min(vSide.x, vSide.y) * uAA + 0.5 + vSide.z, 0.0, 1.0);
  float m = texture2D(uMask, vUv).r;
  vec3 c = max(texture2D(uPlate, vUv).rgb - (1.0 - m) * uBg, 0.0);
  gl_FragColor = vec4(c * cover, m * cover);
}`;
// What the layer is as a whole: how much of it shows (the skin's cross-fade), and where it fades out toward the
// edges of the frame instead of ending on a cut. Applied once, to everything drawn, at the end: where two drawn
// pieces overlap (the still frame and the sheet do, a little) a pixel is not thereby more opaque.
const QUAD_VERT = `
attribute vec2 aAt;
varying vec2 vUv;
void main() { vUv = aAt * 0.5 + 0.5; gl_Position = vec4(aAt, 0.0, 1.0); }`;
const FADE_FRAG = `
precision highp float;
uniform float uAlpha;
uniform float uTall;
uniform vec4 uEdgeX;     // fades toward the left edge: clear at x, whole at y (pixels)
uniform vec4 uEdgeY;     // ...toward the top (x, y) and the bottom (z, w)
uniform vec2 uNeck;      // ...and where the neck ends
void main() {
  float px = gl_FragCoord.x, py = uTall - gl_FragCoord.y;
  float a = uAlpha;
  a *= clamp((px - uEdgeX.x) / (uEdgeX.y - uEdgeX.x), 0.0, 1.0);
  a *= clamp((py - uEdgeY.x) / (uEdgeY.y - uEdgeY.x), 0.0, 1.0) * clamp((py - uEdgeY.z) / (uEdgeY.w - uEdgeY.z), 0.0, 1.0);
  a *= clamp((py - uNeck.x) / (uNeck.y - uNeck.x), 0.0, 1.0);
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}`;
// The picture taken smaller and blurred (the tissue's colour and where it is, spread a few millimetres): what the
// cavity takes its walls' colour and its darkness from.
const BLUR_FRAG = `
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uStep;      // one texel of the source, or the blur's step
uniform float uSigma;    // texels; 0: take the picture smaller instead
varying vec2 vUv;
void main() {
  if (uSigma <= 0.0) {
    gl_FragColor = 0.25 * (texture2D(uSrc, vUv + uStep * vec2(-1.0, -1.0)) + texture2D(uSrc, vUv + uStep * vec2(1.0, -1.0))
      + texture2D(uSrc, vUv + uStep * vec2(-1.0, 1.0)) + texture2D(uSrc, vUv + uStep * vec2(1.0, 1.0)));
    return;
  }
  vec4 sum = vec4(0.0);
  float ws = 0.0;
  for (int i = -8; i <= 8; i++) {
    float x = float(i);
    float w = exp(-x * x / (2.0 * uSigma * uSigma));
    sum += w * texture2D(uSrc, vUv + uStep * x);
    ws += w;
  }
  gl_FragColor = sum / ws;
}`;
// The air of the instant: a cavity, not a hole. Near tissue it has the tissue's own colour (so it goes into the
// painting beside it with no edge) and a wet light; further from any wall it goes into a deep red dark, darker the
// further it is from the mouth, where the light comes from.
const CAV_VERT = `
attribute vec2 aAt;      // world cm
uniform vec4 uWorld;
varying vec2 vW;
void main() {
  vW = aAt;
  gl_Position = vec4(aAt.x * uWorld.x + uWorld.y, aAt.y * uWorld.z + uWorld.w, 0.0, 1.0);
}`;
const CAV_FRAG = `
precision highp float;
uniform sampler2D uBlur;
uniform vec2 uSize;      // the layer's size, pixels
uniform vec4 uLook;      // the mouth (world cm), and how far its light reaches
uniform vec2 uFade;      // world x where the cavity is shown in full, and where it has gone (the mouth opens onto the room)
varying vec2 vW;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec4 b = texture2D(uBlur, gl_FragCoord.xy / uSize);
  float a = b.a;                              // how much tissue is near: a half at a straight wall, less further in
  vec3 tissue = b.rgb / max(a, 0.02);
  float near = smoothstep(0.01, 0.46, a);
  float light = 0.28 + 0.72 * exp(-length(vW - uLook.xy) / uLook.z);
  // the far wall of the cavity, in shadow: folds of dark red mucosa
  float n = 0.55 * vnoise(vW * 0.9) + 0.3 * vnoise(vW * 2.3 + 7.0) + 0.15 * vnoise(vW * 5.1 + 3.0);
  vec3 deep = vec3(0.25, 0.075, 0.09) * (0.30 + 0.85 * light) * (0.62 + 0.8 * n);
  vec3 wall = tissue * (0.78 + 0.4 * light);
  vec3 c = mix(deep, wall, near * near * (3.0 - 2.0 * near));
  // the wet sheen on a wall: a soft light just inside it
  c += vec3(1.0, 0.8, 0.82) * (0.2 * exp(-pow((a - 0.38) / 0.09, 2.0)) * (0.3 + 0.7 * light));
  // toward the opening of the mouth the cavity goes into the dark of the room (which is what the layer lies on)
  float open = 1.0 - clamp((vW.x - uFade.x) / (uFade.y - uFade.x), 0.0, 1.0);
  c = mix(vec3(0.034, 0.016, 0.02), c, open);
  // (and clear altogether in front of it, so that what is drawn there is not a slab with an edge of its own)
  float vis = 1.0 - clamp((vW.x - uFade.y) / uLook.w, 0.0, 1.0);
  gl_FragColor = vec4(c * vis, vis);
}`;
const FLAT_VERT = `
attribute vec2 aAt;
uniform vec4 uWorld;
void main() { gl_Position = vec4(aAt.x * uWorld.x + uWorld.y, aAt.y * uWorld.z + uWorld.w, 0.0, 1.0); }`;
const FLAT_FRAG = `
precision mediump float;
uniform vec4 uColor;
void main() { gl_FragColor = uColor; }`;

// The velum (the soft palate): the model's, drawn as the wet pink muscle it is: lit on the side of the mouth, dark
// toward the nose, with the grain of the plate's own mucosa laid into it. Its end toward the nose and its root go
// into the tissue beside them.
const VEL_VERT = `
attribute vec2 aAt;      // world cm
attribute vec2 aUV;      // along the velum (0 at its root, 1 at its tip), across it (0 on the side of the mouth, 1 toward the nose)
uniform vec4 uWorld;
varying vec2 vUV;
varying vec2 vW;
void main() {
  vUV = aUV;
  vW = aAt;
  gl_Position = vec4(aAt.x * uWorld.x + uWorld.y, aAt.y * uWorld.z + uWorld.w, 0.0, 1.0);
}`;
const VEL_FRAG = `
precision highp float;
uniform sampler2D uPlate;
uniform vec2 uSwO;       // where on the plate a patch of its pink mucosa begins, and the two ways it runs (plate uv)
uniform vec2 uSwA;
uniform vec2 uSwB;
uniform float uWallX;    // world x of the pharynx's back wall: the velum goes no further back
uniform vec4 uWorldUv;   // world cm to the plate's uv, for what does not move (above the pharynx's bend)
varying vec2 vUV;
varying vec2 vW;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float u = vUV.x, v = clamp(vUV.y, 0.0, 1.0);
  vec3 sw = texture2D(uPlate, uSwO + clamp(u, 0.0, 1.0) * uSwA + v * uSwB).rgb;
  vec3 oral = vec3(0.86, 0.48, 0.46), mid = vec3(0.66, 0.28, 0.29), nasal = vec3(0.34, 0.12, 0.15);
  vec3 base = mix(mix(oral, mid, smoothstep(0.0, 0.42, v)), nasal, smoothstep(0.5, 0.95, v));
  // the grain of the plate's mucosa, kept to a little either way
  vec3 grain = clamp(sw / vec3(0.56, 0.30, 0.27), 0.8, 1.25);
  vec3 c = base * mix(vec3(1.0), grain, 0.8);
  // fine fibres along the muscle
  float fib = vnoise(vec2(u * 7.0, v * 26.0));
  c *= 0.93 + 0.14 * fib;
  // a wet light along the side of the mouth, broken here and there, and a rim of light on the very edge
  float wet = 0.45 + 0.55 * vnoise(vec2(u * 5.5 + 2.0, 1.0));
  c += vec3(1.0, 0.84, 0.85) * (0.20 * wet * exp(-pow((v - 0.10) / 0.07, 2.0)) + 0.10 * exp(-pow(v / 0.025, 2.0)));
  float a = smoothstep(0.0, 0.03, v) * (1.0 - smoothstep(0.78, 1.0, v)) * smoothstep(0.0, 0.1, u) * smoothstep(uWallX, uWallX + 0.2, vW.x);
  // it comes out from under the bone of the palate, not over it: where the painting under it is bone (cream: bright, a little yellow), it is not drawn
  vec3 under = texture2D(uPlate, vec2(vW.x * uWorldUv.x + uWorldUv.y, vW.y * uWorldUv.z + uWorldUv.w)).rgb;
  float bone = smoothstep(0.1, 0.18, under.r - under.b) * (1.0 - smoothstep(0.36, 0.5, under.r - under.b)) * smoothstep(0.58, 0.68, (under.r + under.g + under.b) / 3.0);
  a *= 1.0 - bone * (1.0 - smoothstep(0.25, 0.5, u));
  gl_FragColor = vec4(c * a, a);
}`;

interface Built {
  warp: Warp;
  rest: WebGLBuffer; at: WebGLBuffer; idx: WebGLBuffer; nIdx: number;
  /** the parts of cut cells: six corners each */
  partRest: WebGLBuffer; partAt: WebGLBuffer; partSide: WebGLBuffer; nPart: number; partNodes: Int32Array; partAtData: Float32Array;
  frameRest: WebGLBuffer; frameAt: WebGLBuffer; frameIdx: WebGLBuffer; nFrame: number;
}

/** A patch of the plate's pink mucosa that the velum's grain is taken from: its origin and its two ways (plate uv). Canonical (0.0, 8.75) to (0.95, 9.3). */
const SWATCH = (() => {
  const uv = (x: number, y: number): [number, number] => [(x - BACKDROP_FRAME.x0) / (BACKDROP_FRAME.x1 - BACKDROP_FRAME.x0), (BACKDROP_FRAME.y1 - y) / (BACKDROP_FRAME.y1 - BACKDROP_FRAME.y0)];
  const o = uv(0.0, 9.3), a = uv(0.95, 9.3), b = uv(0.0, 8.75);
  return { o, a: [a[0] - o[0], a[1] - o[1]] as [number, number], b: [b[0] - o[0], b[1] - o[1]] as [number, number] };
})();

/**
 * The velum's outline (world: its side toward the mouth from the root to the tip, then its side toward the nose back to
 * the root) as triangles for the card: x, y, and where along it and across it each corner is; the tip rounded off.
 */
function velumMesh(v: number[]): Float32Array | null {
  const half = v.length / 4;
  if (half < 2) return null;
  const out: number[] = [];
  const O = (j: number): [number, number] => [v[2 * j], v[2 * j + 1]];
  // (its body is drawn thicker toward the nose than the model's, which is the thin shell the air meets: the body goes
  // into the tissue behind it, with no edge of its own there)
  const GROW = 1.3;
  const N = (j: number): [number, number] => {
    const o = O(j), n: [number, number] = [v[2 * (2 * half - 1 - j)], v[2 * (2 * half - 1 - j) + 1]];
    return [o[0] + (n[0] - o[0]) * GROW, o[1] + (n[1] - o[1]) * GROW];
  };
  const push = (p: [number, number], u: number, w: number) => out.push(p[0], p[1], u, w);
  for (let j = 0; j + 1 < half; j++) {
    const u0 = j / (half - 1), u1 = (j + 1) / (half - 1);
    push(O(j), u0, 0); push(O(j + 1), u1, 0); push(N(j + 1), u1, 1);
    push(O(j), u0, 0); push(N(j + 1), u1, 1); push(N(j), u0, 1);
  }
  // the rounded tip: a half circle over the end
  const a = O(half - 1), b = N(half - 1);
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, r = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
  // (which way is out: away from the velum's middle)
  const m = O(half - 2), n = N(half - 2);
  const dx = cx - (m[0] + n[0]) / 2, dy = cy - (m[1] + n[1]) / 2, dl = Math.hypot(dx, dy) || 1;
  const ex = dx / dl, ey = dy / dl;
  const ax = (a[0] - cx) / (r || 1), ay = (a[1] - cy) / (r || 1);
  const K = 10;
  for (let k = 0; k < K; k++) {
    const t0 = (Math.PI * k) / K, t1 = (Math.PI * (k + 1)) / K;
    const q = (t: number): [number, number] => [cx + r * (ax * Math.cos(t) + ex * Math.sin(t)), cy + r * (ay * Math.cos(t) + ey * Math.sin(t))];
    const w = (t: number) => (1 - Math.cos(t)) / 2, u = (t: number) => 1 + 0.12 * Math.sin(t);
    push([cx, cy], 1, 0.5); push(q(t0), u(t0), w(t0)); push(q(t1), u(t1), w(t1));
  }
  return new Float32Array(out);
}

/** How the air of the instant is lit as a cavity (see CAV_FRAG): where the mouth is, how far its light reaches, where the cavity gives way to the room and over how far it then clears, how far the walls' light spreads (world cm). */
export interface CavityLook { mouth: [number, number]; reach: number; fade: [number, number]; vanish: number; spread: number }

/** How many times smaller the picture is taken for the blur (what it makes is smooth, over millimetres). */
const BLUR_DOWN = 6;

/** The picture of the layer so far, taken smaller and blurred (see BLUR_FRAG). */
interface Blur { w: number; h: number; qw: number; qh: number; copy: WebGLTexture; a: WebGLTexture; b: WebGLTexture; fa: WebGLFramebuffer; fb: WebGLFramebuffer }

export class AnatomyGL {
  readonly cv: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private flat: WebGLProgram;
  private fade: WebGLProgram;
  private blurProg: WebGLProgram;
  private cav: WebGLProgram;
  private vel: WebGLProgram;
  private quad: WebGLBuffer;
  private blur: Blur | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private at: { at: number; rest: number; side: number; flatAt: number; quadAt: number; blurAt: number; cavAt: number; velAt: number; velUV: number };
  private plate: WebGLTexture | null = null;
  private mask: WebGLTexture | null = null;
  private plateOf: unknown = null;
  private built: Built | null = null;
  private poly: WebGLBuffer;
  lost = false;

  /** null when the computer has no graphics card to draw with */
  static make(): AnatomyGL | null {
    try { return new AnatomyGL(); } catch (e) { console.warn('the anatomy cannot be drawn by the graphics card:', e); return null; }
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
      const sv = sh(gl.VERTEX_SHADER, vs), sf = sh(gl.FRAGMENT_SHADER, fs);
      gl.attachShader(p, sv);
      gl.attachShader(p, sf);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`${gl.getProgramInfoLog(p) ?? 'link'} ${gl.getShaderInfoLog(sv) ?? ''} ${gl.getShaderInfoLog(sf) ?? ''}`);
      return p;
    };
    this.prog = program(VERT, FRAG);
    this.flat = program(FLAT_VERT, FLAT_FRAG);
    this.fade = program(QUAD_VERT, FADE_FRAG);
    this.blurProg = program(QUAD_VERT, BLUR_FRAG);
    this.cav = program(CAV_VERT, CAV_FRAG);
    this.vel = program(VEL_VERT, VEL_FRAG);
    for (const u of ['uWorld', 'uPlate', 'uMask', 'uBg', 'uAA']) this.loc[u] = gl.getUniformLocation(this.prog, u);
    for (const u of ['uAlpha', 'uTall', 'uEdgeX', 'uEdgeY', 'uNeck']) this.loc['f' + u] = gl.getUniformLocation(this.fade, u);
    for (const u of ['uSrc', 'uStep', 'uSigma']) this.loc['b' + u] = gl.getUniformLocation(this.blurProg, u);
    for (const u of ['uWorld', 'uBlur', 'uSize', 'uLook', 'uFade']) this.loc['c' + u] = gl.getUniformLocation(this.cav, u);
    for (const u of ['uWorld', 'uPlate', 'uSwO', 'uSwA', 'uSwB', 'uWallX', 'uWorldUv']) this.loc['v' + u] = gl.getUniformLocation(this.vel, u);
    this.loc.fWorld = gl.getUniformLocation(this.flat, 'uWorld');
    this.loc.fColor = gl.getUniformLocation(this.flat, 'uColor');
    this.at = { at: gl.getAttribLocation(this.prog, 'aAt'), rest: gl.getAttribLocation(this.prog, 'aRest'), side: gl.getAttribLocation(this.prog, 'aSide'), flatAt: gl.getAttribLocation(this.flat, 'aAt'), quadAt: gl.getAttribLocation(this.fade, 'aAt'), blurAt: gl.getAttribLocation(this.blurProg, 'aAt'), cavAt: gl.getAttribLocation(this.cav, 'aAt'), velAt: gl.getAttribLocation(this.vel, 'aAt'), velUV: gl.getAttribLocation(this.vel, 'aUV') };
    this.poly = gl.createBuffer()!;
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
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

  /** the targets the cavity's blur is made in, for a layer of this size */
  private blurTargets(w: number, h: number): Blur {
    const gl = this.gl;
    if (this.blur && this.blur.w === w && this.blur.h === h) return this.blur;
    if (this.blur) { gl.deleteTexture(this.blur.copy); gl.deleteTexture(this.blur.a); gl.deleteTexture(this.blur.b); gl.deleteFramebuffer(this.blur.fa); gl.deleteFramebuffer(this.blur.fb); }
    const qw = Math.max(1, Math.ceil(w / BLUR_DOWN)), qh = Math.max(1, Math.ceil(h / BLUR_DOWN));
    const tex = (tw: number, th: number) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    };
    const fbo = (t: WebGLTexture) => {
      const f = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return f;
    };
    const copy = tex(w, h), a = tex(qw, qh), b = tex(qw, qh);
    const fa = fbo(a), fb = fbo(b);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return (this.blur = { w, h, qw, qh, copy, a, b, fa, fb });
  }

  /**
   * Draws the head for a posture, `w` by `h` pixels: the plate stretched by the scene's sheet, the air in `cut`
   * (world polygons) taken out of it except inside `keep`, and `clear` taken out whatever is kept but `hard` (the
   * teeth). The air is then drawn as a cavity (`look`), its walls the colour of the tissue beside them. `world` maps
   * world centimetres to the layer's pixels (no turn). Returns false while the pictures are not there.
   */
  render(sc: HeadScene, world: Mat, w: number, h: number, plate: { img: TexImageSource; mask: TexImageSource } | null, cut: number[][], keep: number[][], fades: Fades, alpha = 1, clear: number[][] = [], hard: number[][] = [], look: CavityLook | null = null): boolean {
    const gl = this.gl, cv = this.cv;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
    gl.disableVertexAttribArray(A.at);

    // ---- the air taken out, but not where the tongue is
    gl.useProgram(this.flat);
    gl.uniform4f(U.fWorld, ...wv);
    gl.enableVertexAttribArray(A.flatAt);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.poly);
    gl.enable(gl.STENCIL_TEST);
    gl.colorMask(false, false, false, false);
    const fan = (p: number[], at: number) => {
      const n = p.length / 2;
      if (n < 3) return;
      const tri = new Float32Array(6 * (n - 2));
      for (let i = 1; i + 1 < n; i++) tri.set([p[0], p[1], p[2 * i], p[2 * i + 1], p[2 * i + 2], p[2 * i + 3]], 6 * (i - 1));
      gl.bufferData(gl.ARRAY_BUFFER, tri, gl.STREAM_DRAW);
      gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3 * (n - 2));
    };
    const cover = (p: number[], at: number) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1]), gl.STREAM_DRAW);
      gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    const F = A.flatAt;
    // what is kept: bit 2, set inside any of the polygons (each filled even-odd in bit 4, then added)
    for (const p of keep) {
      if (p.length < 6) continue;
      gl.stencilMask(0x04);
      gl.stencilFunc(gl.ALWAYS, 0, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
      fan(p, F);
      gl.stencilMask(0x02);
      gl.stencilFunc(gl.EQUAL, 0x04, 0x04);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
      gl.stencilFunc(gl.EQUAL, 0x04, 0x06);
      cover(p, F);
      gl.stencilMask(0x04);
      gl.clear(gl.STENCIL_BUFFER_BIT);
    }
    // the air (small pieces: three or four corners, the air's strip) is taken out directly, wherever nothing is
    // kept; larger ones through the stencil. `paint` readies what is done with the pixels of each: the first time
    // they are made clear, the second time the cavity is drawn in them.
    const small: number[] = [];
    for (const p of cut) {
      if (p.length !== 6 && p.length !== 8) continue;
      small.push(p[0], p[1], p[2], p[3], p[4], p[5]);
      if (p.length === 8) small.push(p[0], p[1], p[4], p[5], p[6], p[7]);
    }
    const air = (at: number, paint: () => void) => {
      gl.colorMask(true, true, true, true);
      gl.stencilMask(0x00);
      gl.stencilFunc(gl.EQUAL, 0x00, 0x02);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      paint();
      if (small.length) {
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(small), gl.STREAM_DRAW);
        gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, small.length / 2);
      }
      for (const p of cut) {
        if (p.length < 10) continue;
        // inside the polygon: bit 1 (even-odd), then painted where it is set and bit 2 is not
        gl.colorMask(false, false, false, false);
        gl.stencilMask(0x01);
        gl.stencilFunc(gl.ALWAYS, 0, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
        fan(p, at);
        gl.colorMask(true, true, true, true);
        gl.stencilFunc(gl.EQUAL, 0x01, 0x03);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        paint();
        cover(p, at);
        gl.clear(gl.STENCIL_BUFFER_BIT);
        // (clearing bit 1 only: the mask still guards bit 2)
      }
    };
    air(F, () => { gl.blendFunc(gl.ZERO, gl.ZERO); gl.uniform4f(U.fColor, 0, 0, 0, 0); });
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // what is taken out whatever is kept there, but not the teeth: bit 8 marks those
    if (clear.length) {
      for (const p of hard) {
        if (p.length < 6) continue;
        gl.colorMask(false, false, false, false);
        gl.stencilMask(0x04);
        gl.stencilFunc(gl.ALWAYS, 0, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
        fan(p, F);
        gl.stencilMask(0x08);
        gl.stencilFunc(gl.EQUAL, 0x04, 0x0c);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
        cover(p, F);
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
      fan(p, F);
      gl.colorMask(true, true, true, true);
      gl.stencilFunc(gl.EQUAL, 0x01, 0x09);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.blendFunc(gl.ZERO, gl.ZERO);
      gl.uniform4f(U.fColor, 0, 0, 0, 0);
      cover(p, F);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clear(gl.STENCIL_BUFFER_BIT);
    }
    gl.stencilMask(0xff);
    gl.colorMask(true, true, true, true);
    gl.disableVertexAttribArray(F);

    // ---- the air as a cavity: the picture so far, smaller and blurred, tells each pixel of the air how near the
    // tissue is and what colour it is; the air's own pixels are then drawn again, over the clear ones
    if (look) {
      // (the velum is drawn twice: before the blur, so that the cavity's wall beside it has its colour, and over the
      // cavity's edge pixels at the end)
      // (the back wall of the pharynx, a little under the velum's tip and as high as it: the furthest back the air's
      // upper edge goes there)
      const tipY = sc.velum[sc.velum.length / 2 - 1];
      let wallX = Infinity;
      for (let i = 0; i < sc.upper.length; i += 2) if (sc.upper[i + 1] < tipY + 0.1 * sc.s && sc.upper[i + 1] > tipY - 1.5 * sc.s) wallX = Math.min(wallX, sc.upper[i]);
      if (!isFinite(wallX)) wallX = -1e3;
      const drawVelum = () => {
        const mesh = velumMesh(sc.velum);
        if (!mesh) return;
        gl.useProgram(this.vel);
        gl.uniform4f(U.vuWorld, ...wv);
        gl.uniform1i(U.vuPlate, 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.plate);
        gl.uniform2f(U.vuSwO, SWATCH.o[0], SWATCH.o[1]);
        gl.uniform2f(U.vuSwA, SWATCH.a[0], SWATCH.a[1]);
        gl.uniform2f(U.vuSwB, SWATCH.b[0], SWATCH.b[1]);
        gl.uniform1f(U.vuWallX, wallX);
        const F = BACKDROP_FRAME;
        gl.uniform4f(U.vuWorldUv, 1 / (sc.s * (F.x1 - F.x0)), -F.x0 / (F.x1 - F.x0), -1 / (sc.s * (F.y1 - F.y0)), F.y1 / (F.y1 - F.y0));
        gl.stencilMask(0x00);
        gl.stencilFunc(gl.EQUAL, 0x00, 0x02);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        gl.colorMask(true, true, true, true);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.poly);
        gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STREAM_DRAW);
        gl.enableVertexAttribArray(A.velAt);
        gl.enableVertexAttribArray(A.velUV);
        gl.vertexAttribPointer(A.velAt, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(A.velUV, 2, gl.FLOAT, false, 16, 8);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.length / 4);
        gl.disableVertexAttribArray(A.velAt);
        gl.disableVertexAttribArray(A.velUV);
      };
      drawVelum();
      const T = this.blurTargets(w, h);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, T.copy);
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
      gl.useProgram(this.blurProg);
      gl.uniform1i(U.buSrc, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.enableVertexAttribArray(A.blurAt);
      gl.vertexAttribPointer(A.blurAt, 2, gl.FLOAT, false, 0, 0);
      const sigma = Math.max(1.2, (look.spread * Math.abs(world[0])) / BLUR_DOWN);
      const pass = (to: WebGLFramebuffer, from: WebGLTexture, tw: number, th: number, stepX: number, stepY: number, sg: number) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, to);
        gl.viewport(0, 0, tw, th);
        gl.bindTexture(gl.TEXTURE_2D, from);
        gl.uniform2f(U.buStep, stepX, stepY);
        gl.uniform1f(U.buSigma, sg);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      pass(T.fa, T.copy, T.qw, T.qh, 1.5 / w, 1.5 / h, 0);
      pass(T.fb, T.a, T.qw, T.qh, 1 / T.qw, 0, sigma);
      pass(T.fa, T.b, T.qw, T.qh, 0, 1 / T.qh, sigma);
      gl.disableVertexAttribArray(A.blurAt);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.enable(gl.BLEND);
      gl.enable(gl.STENCIL_TEST);
      gl.useProgram(this.cav);
      gl.uniform4f(U.cuWorld, ...wv);
      gl.uniform1i(U.cuBlur, 0);
      gl.bindTexture(gl.TEXTURE_2D, T.a);
      gl.uniform2f(U.cuSize, w, h);
      gl.uniform4f(U.cuLook, look.mouth[0], look.mouth[1], look.reach, look.vanish);
      gl.uniform2f(U.cuFade, look.fade[0], look.fade[1]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.poly);
      gl.enableVertexAttribArray(A.cavAt);
      air(A.cavAt, () => gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA));
      gl.disableVertexAttribArray(A.cavAt);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      drawVelum();
    }
    gl.stencilMask(0xff);
    gl.colorMask(true, true, true, true);
    gl.disable(gl.STENCIL_TEST);

    // ---- the layer as a whole: how much shows, and the fade toward the frame's edges (everything drawn is multiplied by it)
    gl.useProgram(this.fade);
    gl.uniform1f(U.fuAlpha, alpha);
    gl.uniform1f(U.fuTall, h);
    const off: [number, number] = [-1e6, -1e6 + 1];
    const L = fades.left ?? off, T2 = fades.top ?? off, Bo = fades.bottom ?? off;
    gl.uniform4f(U.fuEdgeX, L[0], L[1], 0, 0);
    gl.uniform4f(U.fuEdgeY, T2[0], T2[1], Bo[0], Bo[1]);
    gl.uniform2f(U.fuNeck, fades.neck[0], fades.neck[1]);
    gl.blendFunc(gl.ZERO, gl.SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(A.quadAt);
    gl.vertexAttribPointer(A.quadAt, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(A.quadAt);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  }
}
