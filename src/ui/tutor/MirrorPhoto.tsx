/**
 * The mirror as a photograph: one man's face seen from the front, moving
 * with the model. It is made of many photographs of the same face in the
 * same place, the mouth in a different shape in each (shut, pressed, a
 * little, half and wide open, spread, rounded shut and open, the lip on the
 * teeth, the tongue between them...: public/mirror). At every frame the
 * model's mouth is measured (visemes.ts) and the nearest two or three
 * photographs are chosen and weighed by how near they are; each is warped
 * onto the same shape (the shape in between theirs, which follows the model
 * continuously), and they are mixed. Being warped onto one shape first,
 * their lips, corners and teeth lie on one another: what is mixed is never
 * two mouths in two places, so nothing is doubled or blurred, and as the
 * weights move with the posture the mouth moves with it, without a jump.
 *
 * The shape is a net of knots over the face (scripts/mirror-register.py
 * says where each knot is on each photograph: across the mouth the edges of
 * the lips, the corners, the chin; above the mouth nothing moves). The
 * graphics card draws it: the canvas is the page's own (never copied onto
 * another), and the photographs are handed to the card while nothing else
 * is happening, nearest ones first. Without a graphics card, or without the
 * photographs, the three-dimensional face takes its place (Mirror3D.tsx).
 */
import { useEffect, useRef, useState } from 'react';
import type { Face } from './faces';
import { shapeOf } from './faces';
import { lipsOf, LipState } from './readout';
import { morphShape, mouthFeatures, MouthFeatures, photoWeights } from './visemes';
import type { Articulators } from '../../dsp/tract/types';
import type { TractGeometry } from '../../dsp/tract/geometry';

const LIP_WORD: Record<LipState, string> = { closed: 'closed', teeth: 'on the top teeth', round: 'rounded', spread: 'spread', open: 'open' };

/** What scripts/mirror-register.py writes (public/mirror/morph.json). */
export interface MorphData {
  size: [number, number];
  cols: number;
  rows: number;
  /** the net's triangles: the skin (and lips), and the inside of the mouth between the lips' inner edges */
  skin: number[];
  inside: number[];
  pxPerCm: number;
  photos: Record<string, { features: MouthFeatures; gap: number; at: number[] }>;
}

/** how many photographs are mixed at most (visemes.ts gives no more) */
const MIX = 4;

const VERT = `
attribute vec2 aAt;
attribute vec2 aUv0; attribute vec2 aUv1; attribute vec2 aUv2; attribute vec2 aUv3;
uniform vec4 uFit;   // photograph pixels to clip space: x * a + b, y * c + d
varying vec2 vUv0; varying vec2 vUv1; varying vec2 vUv2; varying vec2 vUv3;
void main() {
  vUv0 = aUv0; vUv1 = aUv1; vUv2 = aUv2; vUv3 = aUv3;
  gl_Position = vec4(aAt.x * uFit.x + uFit.y, aAt.y * uFit.z + uFit.w, 0.0, 1.0);
}`;
const FRAG = `
precision highp float;
uniform sampler2D uTex0; uniform sampler2D uTex1; uniform sampler2D uTex2; uniform sampler2D uTex3;
uniform vec4 uW;
varying vec2 vUv0; varying vec2 vUv1; varying vec2 vUv2; varying vec2 vUv3;
void main() {
  vec3 c = uW.x * texture2D(uTex0, vUv0).rgb + uW.y * texture2D(uTex1, vUv1).rgb + uW.z * texture2D(uTex2, vUv2).rgb + uW.w * texture2D(uTex3, vUv3).rgb;
  gl_FragColor = vec4(c, 1.0);
}`;

interface Photo { name: string; features: MouthFeatures; gap: number; at: Float32Array; uv: WebGLBuffer; img: HTMLImageElement | null; tex: WebGLTexture | null }

/**
 * Draws the morphed face on a canvas of its own (WebGL). `draw` paints the face for a posture and says whether
 * it could; `pending` is how many photographs are still to be handed to the graphics card.
 */
export class MirrorMorph {
  readonly gl: WebGLRenderingContext;
  private data: MorphData | null = null;
  private photos: Photo[] = [];
  private at: WebGLBuffer;
  private skin: WebGLBuffer;
  private inside: WebGLBuffer;
  private loc: { at: number; uv: number[]; fit: WebGLUniformLocation | null; w: WebGLUniformLocation | null; tex: (WebGLUniformLocation | null)[] };
  private knots = new Float32Array(0);
  private queue: Photo[] = [];
  lost = false;

  static create(cv: HTMLCanvasElement): MirrorMorph | null {
    const opts: WebGLContextAttributes = { alpha: false, antialias: true, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false };
    const gl = (cv.getContext('webgl2', opts) ?? cv.getContext('webgl', opts)) as WebGLRenderingContext | null;
    if (!gl) return null;
    try { return new MirrorMorph(gl); } catch { return null; }
  }

  private constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('no program');
    gl.useProgram(pr);
    this.loc = {
      at: gl.getAttribLocation(pr, 'aAt'),
      uv: [gl.getAttribLocation(pr, 'aUv0'), gl.getAttribLocation(pr, 'aUv1'), gl.getAttribLocation(pr, 'aUv2'), gl.getAttribLocation(pr, 'aUv3')],
      fit: gl.getUniformLocation(pr, 'uFit'), w: gl.getUniformLocation(pr, 'uW'),
      tex: [gl.getUniformLocation(pr, 'uTex0'), gl.getUniformLocation(pr, 'uTex1'), gl.getUniformLocation(pr, 'uTex2'), gl.getUniformLocation(pr, 'uTex3')],
    };
    for (let i = 0; i < MIX; i++) gl.uniform1i(this.loc.tex[i], i);
    gl.enableVertexAttribArray(this.loc.at);
    for (const l of this.loc.uv) gl.enableVertexAttribArray(l);
    this.at = gl.createBuffer()!;
    this.skin = gl.createBuffer()!;
    this.inside = gl.createBuffer()!;
    (gl.canvas as HTMLCanvasElement).addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
  }

  /** Fetches the net and the photographs (resolves when the face at rest can be drawn). */
  async load(base = 'mirror/'): Promise<void> {
    const gl = this.gl;
    const data = (await (await fetch(`${base}morph.json`)).json()) as MorphData;
    this.data = data;
    const [W, H] = data.size;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.skin);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.skin), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.inside);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.inside), gl.STATIC_DRAW);
    this.knots = new Float32Array(data.cols * data.rows * 2);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.at);
    gl.bufferData(gl.ARRAY_BUFFER, this.knots, gl.DYNAMIC_DRAW);
    this.photos = Object.entries(data.photos).map(([name, p]) => {
      const at = new Float32Array(p.at);
      const uv = new Float32Array(at.length);
      for (let i = 0; i < at.length; i += 2) { uv[i] = (at[i] + 0.5) / W; uv[i + 1] = (at[i + 1] + 0.5) / H; }
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
      return { name, features: p.features, gap: p.gap, at, uv: b, img: null, tex: null };
    });
    const picture = (p: Photo) => new Promise<void>((res, rej) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { p.img = img; this.queue.push(p); res(); };
      img.onerror = () => rej(new Error(p.name));
      img.src = `${base}${p.name}.jpg`;
    });
    // the face at rest first (it is shown at once); the others come while it is
    const rest = this.photos.find((p) => p.name === 'rest');
    if (!rest) throw new Error('no face at rest');
    await picture(rest);
    this.upload(rest);
    for (const p of this.photos) if (p !== rest) void picture(p).catch(() => { /* left out */ });
  }

  private upload(p: Photo): void {
    const gl = this.gl;
    if (p.tex || !p.img) return;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, p.img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // (a picture made smaller is smooth only with the newer cards' context, which can make its smaller copies)
    const two = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    if (two) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, two ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    p.tex = t;
    p.img = null;
  }

  /** Hands every photograph to the graphics card now (for a sheet of frames, not for the page). */
  async uploadAll(): Promise<void> {
    // (waited for without timers, which a page in the background hardly runs)
    const t0 = performance.now();
    while (performance.now() - t0 < 20000 && (this.queue.length || this.photos.some((p) => !p.tex && !p.img))) {
      if (!this.uploadOne()) await fetch(`mirror/morph.json`, { cache: 'force-cache' });
    }
  }

  /** Hands one more photograph to the graphics card (the one nearest the mouth now): call while idle. */
  uploadOne(near?: MouthFeatures): boolean {
    if (!this.queue.length) return false;
    let i = 0;
    if (near) {
      const w = photoWeights(near, Object.fromEntries(this.queue.map((p) => [p.name, p.features])), 1);
      i = Math.max(0, this.queue.findIndex((p) => p.name in w));
    }
    const [p] = this.queue.splice(i, 1);
    this.upload(p);
    return true;
  }

  get pending(): number { return this.queue.length + this.photos.filter((p) => !p.tex && !p.img).length; }
  get ready(): boolean { return !!this.data && this.photos.some((p) => p.tex); }

  /**
   * Paints the face for a posture on a `w` by `h` canvas (the photograph covers it, centred; or the part `box` of
   * it, in its pixels: x0, y0, x1, y1). Returns the photographs mixed and their shares (for a look at what was
   * drawn), or null if nothing could be.
   */
  draw(art: Articulators, geom: TractGeometry, w: number, h: number, box?: [number, number, number, number]): Record<string, number> | null {
    const gl = this.gl, data = this.data;
    if (!data || this.lost) return null;
    const have = this.photos.filter((p) => p.tex);
    if (!have.length) return null;
    const f = mouthFeatures(art, geom);
    const byName = new Map(have.map((p) => [p.name, p]));
    const { skin: all, inside: inner } = morphShape(Object.fromEntries(have.map((p) => [p.name, p])), data.cols, f, this.knots);
    const k = this.knots;
    // ---- drawn
    const [x0, y0, x1, y1] = box ?? [0, 0, ...data.size];
    gl.viewport(0, 0, w, h);
    const sc = Math.max(w / (x1 - x0), h / (y1 - y0)), ox = (w - (x1 - x0) * sc) / 2 - x0 * sc, oy = (h - (y1 - y0) * sc) / 2 - y0 * sc;
    gl.uniform4f(this.loc.fit, (2 * sc) / w, (2 * ox) / w - 1, (-2 * sc) / h, 1 - (2 * oy) / h);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.at);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, k);
    gl.vertexAttribPointer(this.loc.at, 2, gl.FLOAT, false, 0, 0);
    const pass = (weights: Record<string, number>, idx: WebGLBuffer, n: number) => {
      const list = Object.entries(weights).sort((a, b) => b[1] - a[1]).slice(0, MIX);
      const ws = [0, 0, 0, 0];
      for (let i = 0; i < MIX; i++) {
        const [name, v] = list[Math.min(i, list.length - 1)];
        const p = byName.get(name)!;
        if (i < list.length) ws[i] = v;
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, p.tex);
        gl.bindBuffer(gl.ARRAY_BUFFER, p.uv);
        gl.vertexAttribPointer(this.loc.uv[i], 2, gl.FLOAT, false, 0, 0);
      }
      const sum = ws[0] + ws[1] + ws[2] + ws[3] || 1;
      gl.uniform4f(this.loc.w, ws[0] / sum, ws[1] / sum, ws[2] / sum, ws[3] / sum);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
      gl.drawElements(gl.TRIANGLES, n, gl.UNSIGNED_SHORT, 0);
    };
    pass(inner, this.inside, data.inside.length);
    pass(all, this.skin, data.skin.length);
    return all;
  }
}

export function MirrorPhoto({ face, label, onFail }: { face: () => Face | null; label: string; onFail: () => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const word = useRef<HTMLSpanElement | null>(null);
  const getFace = useRef(face);
  getFace.current = face;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const morph = MirrorMorph.create(cv);
    if (!morph) { onFail(); return; }
    let dead = false, raf = 0;
    let drawn: { face: Face | null; w: number; h: number } = { face: null, w: 0, h: 0 };
    let frames = 0;
    void morph.load().then(() => { if (!dead) { setReady(true); raf = requestAnimationFrame(frame); } }, () => { if (!dead) onFail(); });
    if (import.meta.env.DEV) Object.assign(window, { tutorMirror: morph });
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (morph.lost) { dead = true; cancelAnimationFrame(raf); onFail(); return; }
      const f = getFace.current();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (!f || !w || !h) return;
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; drawn = { face: null, w: 0, h: 0 }; }
      const { geom } = shapeOf(f.pose);
      frames++;
      // the face has not changed since it was drawn: one more photograph is handed to the card instead (one a
      // frame, nearest the mouth now first), so that none is handed over in a frame that needs it; while the
      // mouth moves, one every few frames
      const still = drawn.face === f && drawn.w === w && drawn.h === h;
      if ((still || frames % 6 === 0) && morph.uploadOne(mouthFeatures(f.pose.art, geom))) drawn = { face: null, w: 0, h: 0 };
      if (still) return;
      const st = lipsOf(f.pose.art, geom).state;
      if (word.current && word.current.textContent !== LIP_WORD[st]) word.current.textContent = LIP_WORD[st];
      if (morph.draw(f.pose.art, geom, w, h)) drawn = { face: f, w, h };
    };
    return () => { dead = true; cancelAnimationFrame(raf); };
  }, []);

  return (
    <div className={ready ? 'mirror3d ready' : 'mirror3d'} role="img" aria-label={label}>
      <canvas ref={canvas} />
      <p className="mirror3d-state">Lips <span ref={word} /></p>
    </div>
  );
}
