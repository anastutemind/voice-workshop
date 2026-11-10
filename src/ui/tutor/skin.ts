/**
 * The skin layer of the tutor's head: the same head as the painted anatomy,
 * seen from outside. It is photographs of one face in profile, stretched
 * over a net (skinNet.ts) that the model moves: the chin turns with the
 * model's jaw, each lip is carried by the model's lip, and the profile of
 * the face lies on the profile of the painted lips in every posture. So the
 * face lies on the anatomy that is under it and the two can be faded into
 * one another: nothing of the anatomy has to be cut to fit the skin.
 *
 * The whole head is the photograph of the face at rest (public/skin/face.webp,
 * bent once onto the painting by scripts/skin-register.py). Round the mouth
 * are many more photographs of the same face (shut, pressed, a little, half
 * and wide open, spread, rounded shut and open, the lip on the teeth, the
 * tongue between them...: public/skin/mouth-<shape>.webp), each fitted to the
 * net in the model's posture for its own sound. At every instant the model's
 * mouth is measured (visemes.ts) and the two photographs nearest it are
 * mixed with the face at rest, more of the nearer: being on one net, their
 * lips, corners and chins lie on one another, and as the posture moves the
 * mix moves with it, without a jump. The colour is the mix of the
 * photographs; the outline of the face is the outline of whichever has most
 * of the weight, so two outlines that do not quite agree leave neither a
 * ghost of one nor a dark notch between them.
 *
 * Between parted lips is the inside of a photographed mouth (its teeth, its
 * tongue), taken from the photographs that are at least as open as the
 * mouth of the moment: teeth are never stretched, the lips uncover them.
 * When the skin is only half laid on, the layer is open there instead and
 * the anatomy under it is seen.
 *
 * The net is drawn by the graphics card (a few milliseconds on any
 * computer) on a canvas of its own, which the page lays over the anatomy's;
 * without the card, triangle by triangle, the photograph at rest alone.
 */
import { HeadScene, Mat } from '../head/scene';
import { BACKDROP_FRAME } from '../head/frame';
import { paintTriangle } from '../head/painter';
import { LIPS_MEET, CORNER, INSIDE_FADE, INSIDE_LOWER_Y, INSIDE_UPPER_Y, INSIDE_X, insideGrid, mouthMeasure, NET_REST, NET_TRIANGLES, NET_X, netKnots, NX, NY, ROW_LOWER, ROW_UPPER, STOMION } from './skinNet';
import { MouthFeatures, mouthFeatures, photoWeights } from './visemes';
import { REST_ART, restGeom } from './readout';

/** The part of the face the mouth's photographs cover (canonical cm): they fade into the face at rest at its back, top and bottom. */
const PATCH = { x0: 3.9, y0: 1.4, x1: 13, y1: 11.2 };
const ease = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
/** pixels a centimetre in the photographs' frame (scripts/skin-register.py) */
const PX_CM = 64;

interface Shape {
  name: string;
  features: MouthFeatures;
  uv: Float32Array;
  /** how far apart its lips are in the photograph itself, at each column of the net in front of the corner, cm */
  open: Float32Array;
  img: HTMLImageElement | null;
  tex: WebGLTexture | null;
  /** its picture's place in the card's memory, for the face (patch uv) */
  buf: WebGLBuffer | null;
  /** where the inside's two grids are in its picture (the upper with the head, the lower with the jaw), and in the card */
  inUpper: Float32Array; inLower: Float32Array;
  bufUpper: WebGLBuffer | null; bufLower: WebGLBuffer | null;
}
interface Skin {
  face: HTMLImageElement;
  shapes: Record<string, Shape>;
}
let skin: Skin | null = null;
let asked = false;
let version = 0;
/** Changes when a picture of the skin arrives: what was painted without it is stale. */
export const skinVersion = (): number => version;

const picture = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => res(img);
  img.onerror = () => rej(new Error(src));
  img.src = src;
});

const COL0 = NET_X.indexOf(CORNER), COLS = NX - COL0, COL_STOMION = NET_X.indexOf(STOMION) - COL0;

/** The photographs, once they have loaded (null until the face at rest has; the mouths come after it). */
function loaded(): Skin | null {
  if (!asked && typeof Image !== 'undefined') {
    asked = true;
    void picture('skin/face.webp').then((face) => {
      skin = { face, shapes: {} };
      version++;
      return fetch('skin/net.json').then((r) => (r.ok ? r.json() : null)).then((net: { box: [number, number, number, number]; shapes: Record<string, { features?: MouthFeatures; uv: number[]; insideUpper?: number[]; insideLower?: number[] }> } | null) => {
        for (const [name, s] of Object.entries(net?.shapes ?? {})) {
          // (made for another net: the face at rest stands in)
          if (s.uv.length !== NET_REST.length || !s.features || s.insideUpper?.length !== IN_UPPER.length || s.insideLower?.length !== IN_LOWER.length) continue;
          const uv = new Float32Array(s.uv);
          // (how open the photograph's own mouth is: its lips' rows, in its own pixels)
          const open = new Float32Array(COLS);
          for (let i = 0; i < COLS; i++) {
            const u = 2 * (ROW_UPPER * NX + COL0 + i), l = 2 * (ROW_LOWER * NX + COL0 + i);
            open[i] = Math.hypot((uv[u] - uv[l]) * net!.box[2], (uv[u + 1] - uv[l + 1]) * net!.box[3]) / PX_CM;
          }
          const shape: Shape = { name, features: s.features, uv, open, img: null, tex: null, buf: null, inUpper: new Float32Array(s.insideUpper), inLower: new Float32Array(s.insideLower), bufUpper: null, bufLower: null };
          skin!.shapes[name] = shape;
          void picture(`skin/mouth-${name}.webp`).then((img) => { shape.img = img; idle(); }, () => { /* the face at rest stands in */ });
        }
      });
    }).catch(() => { /* no skin: the anatomy alone */ });
  }
  return skin;
}

let restFeatures: MouthFeatures | null = null;
/**
 * How much of each photographed mouth a mouth shows (0..1 by name; 'rest' is the face at rest), from the
 * measures of the mouth and of the photographs (two at most: a third adds little but a ghost of itself).
 */
export function mouthsOf(f: MouthFeatures, shapes: Record<string, { features: MouthFeatures }>): Record<string, number> {
  restFeatures ??= mouthFeatures(REST_ART, restGeom());
  const all: Record<string, MouthFeatures> = { rest: restFeatures };
  for (const [k, s] of Object.entries(shapes)) all[k] = s.features;
  return photoWeights(f, all, 2, 2);
}

// ------------------------------------------------------------------ the graphics card

/** the inside of the mouth: one photograph's, laid on by a share */
const VERT_IN = `
attribute vec2 aAt; attribute vec2 aUv; attribute vec2 aSoft;
uniform vec4 uWorld;
varying vec2 vUv; varying vec2 vSoft;
void main() {
  vUv = aUv; vSoft = aSoft;
  gl_Position = vec4(aAt.x * uWorld.x + uWorld.y, aAt.y * uWorld.z + uWorld.w, 0.0, 1.0);
}`;
const FRAG_IN = `
precision highp float;
uniform sampler2D uTex;
uniform float uAlpha;    // how much of this photograph is laid on
uniform float uLit;      // how much light falls inside (a mouth that is barely open is dark)
varying vec2 vUv;
varying vec2 vSoft;      // x: 1 at the front, 0 deep in the mouth; y: how much of this grid is laid on (the upper fades out downward)
void main() {
  vec4 c = texture2D(uTex, vUv);
  gl_FragColor = vec4(c.rgb * (0.35 + 0.65 * vSoft.x) * uLit, c.a) * (uAlpha * vSoft.y);
}`;
/** the face: the face at rest and two photographed mouths, mixed */
const VERT_FACE = `
attribute vec2 aAt; attribute vec2 aUvF; attribute vec2 aUv0; attribute vec2 aUv1; attribute vec2 aSoft;
uniform vec4 uWorld;
varying vec2 vUvF; varying vec2 vUv0; varying vec2 vUv1; varying vec2 vSoft;
void main() {
  vUvF = aUvF; vUv0 = aUv0; vUv1 = aUv1; vSoft = aSoft;
  gl_Position = vec4(aAt.x * uWorld.x + uWorld.y, aAt.y * uWorld.z + uWorld.w, 0.0, 1.0);
}`;
const FRAG_FACE = `
precision highp float;
uniform sampler2D uFace; uniform sampler2D uTex0; uniform sampler2D uTex1;
uniform vec2 uW;         // the shares of the two mouths (round the mouth: they fade into the face at rest away from it)
uniform float uMouthsOnly; // 1: the face at rest has no share here
uniform float uOpen;     // 0: lips shut, 1: parted: their inner edges turn into the shadow of the mouth
uniform float uTall;     // the canvas's height, pixels
uniform vec4 uEdgeX;     // the face fades out toward the frame's left edge: clear at x, whole at y (pixels)
uniform vec4 uEdgeY;     // ...toward its top (clear at x, whole at y) and its bottom (clear at z, whole at w)
uniform vec2 uNeck;      // ...and where the neck ends (clear at x, whole at y)
varying vec2 vUvF; varying vec2 vUv0; varying vec2 vUv1;
varying vec2 vSoft;      // x: 0 on a lip's inner edge, 1 away from it; y: 0 where the mouths' pictures end, 1 inside them
void main() {
  float w0 = uW.x * vSoft.y, w1 = uW.y * vSoft.y, wb = max(0.0, 1.0 - w0 - w1) * (1.0 - uMouthsOnly);
  vec4 b = texture2D(uFace, vUvF), p0 = texture2D(uTex0, vUv0), p1 = texture2D(uTex1, vUv1);
  // the colour: the photographs' own, each by its share, where each has skin
  vec4 acc = wb * b + w0 * p0 + w1 * p1;
  vec3 c = acc.a > 0.002 ? acc.rgb / acc.a : vec3(0.0);
  // the outline: the photograph with the most weight has its own wholly, the others by how much they have of
  // what it has (so where the photographs' outlines differ, neither a notch nor a ghost: and inside the face,
  // where all have skin, it is whole however the weight is shared)
  float top = max(max(wb, w0), max(w1, 1e-4));
  // (where only the mouths are drawn, as much of them as they have of the whole)
  top = max(top, uMouthsOnly);
  float a = max(max(b.a * min(1.0, wb / top), p0.a * min(1.0, w0 / top)), p1.a * min(1.0, w1 / top));
  float lit = mix(1.0, 0.55 + 0.45 * smoothstep(0.0, 1.0, vSoft.x), uOpen);
  float px = gl_FragCoord.x, py = uTall - gl_FragCoord.y;
  a *= clamp((px - uEdgeX.x) / (uEdgeX.y - uEdgeX.x), 0.0, 1.0);
  a *= clamp((py - uEdgeY.x) / (uEdgeY.y - uEdgeY.x), 0.0, 1.0) * clamp((py - uEdgeY.z) / (uEdgeY.w - uEdgeY.z), 0.0, 1.0);
  a *= clamp((py - uNeck.x) / (uNeck.y - uNeck.x), 0.0, 1.0);
  gl_FragColor = vec4(c * lit * a, a);
}`;

type Loc = WebGLUniformLocation | null;
interface Card {
  cv: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  pin: WebGLProgram; pface: WebGLProgram;
  at: WebGLBuffer; uvFace: WebGLBuffer; soft: WebGLBuffer; all: WebGLBuffer; nAll: number;
  /** the opening of the mouth between the lips (the net's triangles there, as far forward as the lips), and its dark */
  opening: WebGLBuffer; nOpening: number; dark: WebGLTexture | null;
  /** between the lips' rows in front of where they meet (drawn from the mouths alone) */
  front: WebGLBuffer; nFront: number;
  /** the inside of the mouth: two grids (where they are now; how lit, how much laid on; their triangles) */
  inAtU: WebGLBuffer; inAtL: WebGLBuffer; inSoftU: WebGLBuffer; inSoftL: WebGLBuffer; triU: WebGLBuffer; triL: WebGLBuffer; nU: number; nL: number;
  li: { at: number; uv: number; soft: number; world: Loc; alpha: Loc; lit: Loc };
  lf: { at: number; uvF: number; uv0: number; uv1: number; soft: number; world: Loc; w: Loc; only: Loc; open: Loc; tall: Loc; edgeX: Loc; edgeY: Loc; neck: Loc; face: Loc; tex0: Loc; tex1: Loc };
  face: WebGLTexture | null;
  lost: boolean;
}
let card: Card | null | undefined;

function texture(gl: WebGLRenderingContext, img: HTMLImageElement): WebGLTexture | null {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // (pictures of any size can be made smaller smoothly only by the newer cards' context)
  const two = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  if (two) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, two ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  return t;
}

function program(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram | null {
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const pr = gl.createProgram()!;
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(pr);
  return gl.getProgramParameter(pr, gl.LINK_STATUS) ? pr : null;
}

function makeCard(): Card | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  const opts: WebGLContextAttributes = { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: true, powerPreference: 'low-power' };
  const gl = (cv.getContext('webgl2', opts) ?? cv.getContext('webgl', opts)) as WebGLRenderingContext | null;
  if (!gl) return null;
  const pin = program(gl, VERT_IN, FRAG_IN), pface = program(gl, VERT_FACE, FRAG_FACE);
  if (!pin || !pface) return null;
  const n = NX * NY;
  // where every knot is in the picture of the whole face: its own place at rest, in the painting's frame
  const f = BACKDROP_FRAME, uvFace = new Float32Array(2 * n), soft = new Float32Array(2 * n);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, x = NET_REST[2 * k], y = NET_REST[2 * k + 1];
    uvFace[2 * k] = (x - f.x0) / (f.x1 - f.x0); uvFace[2 * k + 1] = (f.y1 - y) / (f.y1 - f.y0);
    // the lips' inner edges, in front of the corner of the mouth
    soft[2 * k] = (j === ROW_LOWER || j === ROW_UPPER) && y === LIPS_MEET ? 1 - ease((x - CORNER) / 0.6) : 1;
    soft[2 * k + 1] = x < PATCH.x0 || y < PATCH.y0 || y > PATCH.y1 ? 0 : ease((x - PATCH.x0) / 1.3) * ease((y - PATCH.y0) / 1.2) * ease((PATCH.y1 - y) / 0.9);
  }
  const tri = NET_TRIANGLES.skin;
  const buffer = (target: number, data: ArrayBufferView, usage: number) => { const b = gl.createBuffer()!; gl.bindBuffer(target, b); gl.bufferData(target, data, usage); return b; };
  const c: Card = {
    cv, gl, pin, pface,
    at: buffer(gl.ARRAY_BUFFER, new Float32Array(2 * n), gl.DYNAMIC_DRAW),
    uvFace: buffer(gl.ARRAY_BUFFER, uvFace, gl.STATIC_DRAW),
    soft: buffer(gl.ARRAY_BUFFER, soft, gl.STATIC_DRAW),
    all: buffer(gl.ELEMENT_ARRAY_BUFFER, tri, gl.STATIC_DRAW), nAll: tri.length,
    opening: buffer(gl.ELEMENT_ARRAY_BUFFER, OPENING, gl.STATIC_DRAW), nOpening: OPENING.length, dark: null,
    front: buffer(gl.ELEMENT_ARRAY_BUFFER, FRONT_TRIANGLES, gl.STATIC_DRAW), nFront: FRONT_TRIANGLES.length,
    inAtU: buffer(gl.ARRAY_BUFFER, new Float32Array(IN_UPPER.length), gl.DYNAMIC_DRAW),
    inAtL: buffer(gl.ARRAY_BUFFER, new Float32Array(IN_LOWER.length), gl.DYNAMIC_DRAW),
    inSoftU: buffer(gl.ARRAY_BUFFER, gridSoft(IN_UPPER, true), gl.STATIC_DRAW),
    inSoftL: buffer(gl.ARRAY_BUFFER, gridSoft(IN_LOWER, false), gl.STATIC_DRAW),
    triU: buffer(gl.ELEMENT_ARRAY_BUFFER, gridTriangles(INSIDE_UPPER_Y.length), gl.STATIC_DRAW),
    triL: buffer(gl.ELEMENT_ARRAY_BUFFER, gridTriangles(INSIDE_LOWER_Y.length), gl.STATIC_DRAW),
    nU: gridTriangles(INSIDE_UPPER_Y.length).length, nL: gridTriangles(INSIDE_LOWER_Y.length).length,
    li: {
      at: gl.getAttribLocation(pin, 'aAt'), uv: gl.getAttribLocation(pin, 'aUv'), soft: gl.getAttribLocation(pin, 'aSoft'),
      world: gl.getUniformLocation(pin, 'uWorld'), alpha: gl.getUniformLocation(pin, 'uAlpha'), lit: gl.getUniformLocation(pin, 'uLit'),
    },
    lf: {
      at: gl.getAttribLocation(pface, 'aAt'), uvF: gl.getAttribLocation(pface, 'aUvF'), uv0: gl.getAttribLocation(pface, 'aUv0'), uv1: gl.getAttribLocation(pface, 'aUv1'), soft: gl.getAttribLocation(pface, 'aSoft'),
      world: gl.getUniformLocation(pface, 'uWorld'), w: gl.getUniformLocation(pface, 'uW'), only: gl.getUniformLocation(pface, 'uMouthsOnly'), open: gl.getUniformLocation(pface, 'uOpen'), tall: gl.getUniformLocation(pface, 'uTall'),
      edgeX: gl.getUniformLocation(pface, 'uEdgeX'), edgeY: gl.getUniformLocation(pface, 'uEdgeY'), neck: gl.getUniformLocation(pface, 'uNeck'),
      face: gl.getUniformLocation(pface, 'uFace'), tex0: gl.getUniformLocation(pface, 'uTex0'), tex1: gl.getUniformLocation(pface, 'uTex1'),
    },
    face: null, lost: false,
  };
  gl.useProgram(pface);
  gl.uniform1i(c.lf.face, 0); gl.uniform1i(c.lf.tex0, 1); gl.uniform1i(c.lf.tex1, 2);
  // the dark of a mouth's inside, where no photograph's inside lies (a texel)
  c.dark = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, c.dark);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([34, 14, 14, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  // a card that is taken away (the computer sleeps, too many pages draw) is asked for again
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); c.lost = true; });
  cv.addEventListener('webglcontextrestored', () => { card = undefined; for (const s of Object.values(skin?.shapes ?? {})) { s.tex = null; s.buf = s.bufUpper = s.bufLower = null; } version++; });
  return c;
}

/**
 * Every photograph of a mouth is handed to the graphics card while nothing else is happening, one at a time:
 * handed over the first time a mouth needs it, it held up that frame by a tenth of a second or more.
 */
let idling = false;
function idle(): void {
  if (idling || typeof window === 'undefined') return;
  idling = true;
  const next = () => {
    // (the card is made the first time the skin is painted, or here: the photographs may come first)
    if (card === undefined) skinCanvas();
    const c = card, sk = skin;
    const todo = c && !c.lost && sk ? Object.values(sk.shapes).find((s) => s.img && !s.tex) : undefined;
    if (!todo || !c) { idling = false; return; }
    upload(c, todo);
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(next, { timeout: 400 }); else setTimeout(next, 30);
  };
  setTimeout(next, 0);
}
function upload(c: Card, s: Shape): void {
  const gl = c.gl;
  if (!s.img) return;
  s.tex ??= texture(gl, s.img);
  const buf = (data: Float32Array) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
  s.buf ??= buf(s.uv);
  s.bufUpper ??= buf(s.inUpper);
  s.bufLower ??= buf(s.inLower);
  // (what was painted without it may now be painted with it)
  version++;
}

/**
 * The opening of the mouth: the net's triangles between the lips' two rows, from the corner forward to where the
 * lips meet (in front of that the face's own photographs show what is there: the lips, or the room).
 */
const COL_FRONT = NET_X.indexOf(STOMION);
const OPENING = (() => {
  const t: number[] = [], m = NET_TRIANGLES.mouth;
  for (let i = 0; i < m.length; i += 3) if ([m[i], m[i + 1], m[i + 2]].every((v) => v % NX <= COL_FRONT)) t.push(m[i], m[i + 1], m[i + 2]);
  return new Uint16Array(t);
})();
/**
 * Between the lips' rows in front of where they meet: there a photographed mouth has its lips, pushed forward, or
 * the room (left out, a mouth with rounded lips showed a slit of nothing). Only the mouths are drawn there, not
 * the face at rest, whose lips meet in a line that would be drawn out into the room.
 */
const FRONT_TRIANGLES = (() => {
  const t: number[] = [], m = NET_TRIANGLES.mouth;
  for (let i = 0; i < m.length; i += 3) if ([m[i], m[i + 1], m[i + 2]].every((v) => v % NX >= COL_FRONT)) t.push(m[i], m[i + 1], m[i + 2]);
  return new Uint16Array(t);
})();

/** The inside's two grids at rest (canonical cm), and where a posture puts them (world cm). */
const IN_UPPER = insideGrid(INSIDE_UPPER_Y), IN_LOWER = insideGrid(INSIDE_LOWER_Y);
const inAtU = new Float32Array(IN_UPPER.length), inAtL = new Float32Array(IN_LOWER.length);
function gridTriangles(rows: number): Uint16Array {
  const n = INSIDE_X.length, t: number[] = [];
  for (let j = 0; j + 1 < rows; j++) for (let i = 0; i + 1 < n; i++) { const a = j * n + i; t.push(a, a + 1, a + n + 1, a, a + n + 1, a + n); }
  return new Uint16Array(t);
}
/** how lit each point of a grid is (darker deep in the mouth), and how much of the grid is laid on there */
function gridSoft(grid: Float32Array, upper: boolean): Float32Array {
  const out = new Float32Array(grid.length);
  for (let k = 0; k < grid.length; k += 2) {
    out[k] = ease((grid[k] - 6.0) / 1.8);
    out[k + 1] = upper ? ease((grid[k + 1] - INSIDE_FADE[0]) / (INSIDE_FADE[1] - INSIDE_FADE[0])) : 1;
  }
  return out;
}

const knots = new Float32Array(2 * NX * NY);

/** Where the skin fades out instead of ending on a cut, in the picture's pixels (from its top left): each pair is where it is clear, then where it is whole. */
export interface SkinFades { neck: [number, number]; left?: [number, number]; top?: [number, number]; bottom?: [number, number] }

let plain: HTMLCanvasElement | null = null;
/**
 * The canvas the skin is painted on. It is shown by the page itself, laid over the anatomy's canvas (and made
 * as clear as the layer is turned down): a picture made by the graphics card is not copied onto another
 * canvas, which on many computers means fetching it back from the card, a tenth of a second at a time.
 */
export function skinCanvas(): HTMLCanvasElement | null {
  if (card === undefined) card = makeCard();
  if (card && !card.lost) return card.cv;
  return typeof document === 'undefined' ? null : (plain ??= document.createElement('canvas'));
}

/**
 * Whether every photograph of the skin is in the graphics card (for a sheet of frames, which waits for them);
 * with `now`, those that have arrived are handed over at once.
 */
export function skinReady(now = false): boolean {
  const sk = loaded();
  if (now && sk) { skinCanvas(); if (card && !card.lost) for (const s of Object.values(sk.shapes)) if (s.img && !s.tex) upload(card, s); }
  return !!sk && Object.values(sk.shapes).every((s) => s.tex) && Object.keys(sk.shapes).length > 0;
}

/** What the last painting mixed (for a look at it): the mouths and their shares, and the inside's. */
export const skinMix: { face: Record<string, number>; inside: Record<string, number> } = { face: {}, inside: {} };

/**
 * Paints the head with its skin on the skin's canvas (`skinCanvas`), `w` by
 * `h` pixels, for a posture. `world` maps world centimetres to those pixels;
 * `inside` (0..1) is how much of the photographed inside of the mouth is
 * painted between parted lips (none: the skin is open there, and what is
 * under it is seen); `mouth` is the measures of the posture's mouth
 * (`mouthFeatures`), which choose the photographs. Returns false while the
 * photograph has not loaded (the canvas is then empty).
 */
export function paintSkin(sc: HeadScene, world: Mat, w: number, h: number, inside: number, fades: SkinFades, mouth?: MouthFeatures): boolean {
  const cv = skinCanvas();
  if (!cv) return false;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const sk = loaded();
  if (!sk) return false;
  netKnots(sc, knots);
  const m = mouthMeasure(sc);
  const c = card;
  if (!c || c.lost) {
    // without the graphics card: the face at rest, triangle by triangle
    const lc = cv.getContext('2d');
    if (!lc) return false;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, w, h);
    const tri = NET_TRIANGLES.skin;
    for (let t = 0; t < tri.length; t += 3) {
      const p: number[] = [], q: number[] = [];
      for (let k = 0; k < 3; k++) { const v = tri[t + k]; p.push(NET_REST[2 * v], NET_REST[2 * v + 1]); q.push(knots[2 * v], knots[2 * v + 1]); }
      paintTriangle(lc, world, p, q, sk.face);
    }
    // (its fades: the neck's and the frame's edges)
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'destination-out';
    for (const [pair, along] of [[fades.neck, 'y'], [fades.left, 'x'], [fades.top, 'y'], [fades.bottom, 'y']] as const) {
      if (!pair) continue;
      const g = along === 'x' ? lc.createLinearGradient(pair[0], 0, pair[1], 0) : lc.createLinearGradient(0, pair[0], 0, pair[1]);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = g;
      lc.fillRect(0, 0, w, h);
    }
    lc.globalCompositeOperation = 'source-over';
    return true;
  }
  const gl = c.gl;
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  c.face ??= texture(gl, sk.face);
  // (the photographs not yet in the card are not shown; they are handed over while nothing else happens)
  const ready: Record<string, Shape> = {};
  for (const s of Object.values(sk.shapes)) if (s.tex && s.buf) ready[s.name] = s;
  if (Object.values(sk.shapes).some((s) => s.img && !s.tex)) idle();
  // the measures of the mouth: given, or (without them) the lips' gap and how far forward they are
  const f: MouthFeatures = mouth ?? { open: Math.max(0, m.gap), teeth: Math.max(0, m.gap), round: Math.max(0, Math.min(1, m.forward / 0.6)), forward: Math.max(0, Math.min(1, m.forward / 0.6)), spread: 0, press: 0, tuck: 0, tongue: 0, tip: 0 };
  // world cm to the layer's pixels (no turn in `world`), then to the card's own square, y up
  const toClip: [number, number, number, number] = [(2 * world[0]) / w, (2 * world[4]) / w - 1, (-2 * world[3]) / h, 1 - (2 * world[5]) / h];

  // ---- the inside of the mouth, under the skin: from the photographs at least as open as the mouth is now. Each
  // is laid on two grids: its upper teeth and roof where its posture had them, with the head; its lower teeth and
  // tongue with the jaw, turned as far as the jaw of the moment is from its own. So its teeth keep their size and
  // place, and the lips (drawn over them) uncover as much of them as they are apart.
  skinMix.inside = {};
  if (inside > 0.01 && m.gap > 0.03) {
    const gapAt = (i: number) => {
      const u = 2 * (ROW_UPPER * NX + COL0 + i), l = 2 * (ROW_LOWER * NX + COL0 + i);
      return Math.hypot(knots[u] - knots[l], knots[u + 1] - knots[l + 1]) / sc.s;
    };
    const gap = gapAt(COL_STOMION);
    const open = Object.values(ready).filter((s) => s.open[COL_STOMION] > 0.12 && s.bufUpper && s.bufLower);
    let wide = open.filter((s) => s.open[COL_STOMION] >= Math.max(0.12, 0.85 * gap));
    if (!wide.length && open.length) wide = [open.reduce((a, b) => (b.open[COL_STOMION] > a.open[COL_STOMION] ? b : a))];
    if (wide.length) {
      const wts = photoWeights(f, Object.fromEntries(wide.map((s) => [s.name, s.features])), 2, 2);
      skinMix.inside = wts;
      for (let k = 0; k < IN_UPPER.length; k += 2) { const q = sc.place(IN_UPPER[k], IN_UPPER[k + 1], 0); inAtU[k] = q[0]; inAtU[k + 1] = q[1]; }
      for (let k = 0; k < IN_LOWER.length; k += 2) { const q = sc.place(IN_LOWER[k], IN_LOWER[k + 1], 1); inAtL[k] = q[0]; inAtL[k + 1] = q[1]; }
      gl.bindBuffer(gl.ARRAY_BUFFER, c.inAtU); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inAtU);
      gl.bindBuffer(gl.ARRAY_BUFFER, c.inAtL); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inAtL);
      gl.useProgram(c.pin);
      gl.uniform4f(c.li.world, ...toClip);
      gl.enableVertexAttribArray(c.li.at); gl.enableVertexAttribArray(c.li.uv); gl.enableVertexAttribArray(c.li.soft);
      gl.activeTexture(gl.TEXTURE0);
      // only between the lips: the opening is marked (and filled with the dark of a mouth), and the inside is laid
      // on it alone (a photograph's inside reaches past its own lips, which are not this mouth's)
      gl.bindBuffer(gl.ARRAY_BUFFER, c.at); gl.bufferSubData(gl.ARRAY_BUFFER, 0, knots); gl.vertexAttribPointer(c.li.at, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, c.uvFace); gl.vertexAttribPointer(c.li.uv, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, c.soft); gl.vertexAttribPointer(c.li.soft, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.STENCIL_TEST);
      gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT);
      gl.stencilFunc(gl.ALWAYS, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      gl.bindTexture(gl.TEXTURE_2D, c.dark);
      gl.uniform1f(c.li.lit, 1); gl.uniform1f(c.li.alpha, inside);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.opening);
      gl.drawElements(gl.TRIANGLES, c.nOpening, gl.UNSIGNED_SHORT, 0);
      gl.stencilFunc(gl.EQUAL, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      // (a mouth that is barely open is dark inside)
      gl.uniform1f(c.li.lit, 0.3 + 0.7 * ease(m.gap / 1.3));
      // the nearer first and whole, the other over it by its share
      const list = Object.entries(wts).sort((a, b) => b[1] - a[1]);
      let done = 0;
      for (const [name, v] of list) {
        const s = ready[name];
        gl.bindTexture(gl.TEXTURE_2D, s.tex);
        done += v;
        const share = inside * Math.min(1, v / Math.max(1e-3, done));
        // the lower grid, then the upper over it (the upper teeth are in front of the lower ones)
        const grids: [WebGLBuffer, WebGLBuffer, WebGLBuffer, WebGLBuffer, number][] = [[c.inAtL, s.bufLower!, c.inSoftL, c.triL, c.nL], [c.inAtU, s.bufUpper!, c.inSoftU, c.triU, c.nU]];
        for (const [at, uv, sf, tri, n] of grids) {
          gl.bindBuffer(gl.ARRAY_BUFFER, at); gl.vertexAttribPointer(c.li.at, 2, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, uv); gl.vertexAttribPointer(c.li.uv, 2, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, sf); gl.vertexAttribPointer(c.li.soft, 2, gl.FLOAT, false, 0, 0);
          gl.uniform1f(c.li.alpha, share);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tri);
          gl.drawElements(gl.TRIANGLES, n, gl.UNSIGNED_SHORT, 0);
        }
      }
      gl.disable(gl.STENCIL_TEST);
      gl.disableVertexAttribArray(c.li.at); gl.disableVertexAttribArray(c.li.uv); gl.disableVertexAttribArray(c.li.soft);
    }
  }

  // ---- the face: the face at rest, and round the mouth the two photographs nearest the mouth of the moment
  const wts = mouthsOf(f, ready);
  skinMix.face = wts;
  const mouths = Object.entries(wts).filter(([name]) => name !== 'rest' && ready[name]).sort((a, b) => b[1] - a[1]).slice(0, 2);
  gl.useProgram(c.pface);
  const L = c.lf;
  gl.uniform4f(L.world, ...toClip);
  // (an edge that does not fade: clear a long way off, whole just after)
  const off: [number, number] = [-1e6, -1e6 + 1];
  const FL = fades.left ?? off, FT = fades.top ?? off, FB = fades.bottom ?? off;
  gl.uniform1f(L.tall, h);
  gl.uniform4f(L.edgeX, FL[0], FL[1], 0, 0);
  gl.uniform4f(L.edgeY, FT[0], FT[1], FB[0], FB[1]);
  gl.uniform2f(L.neck, fades.neck[0], fades.neck[1]);
  gl.uniform1f(L.open, ease(m.gap / 0.5));
  gl.uniform2f(L.w, mouths[0]?.[1] ?? 0, mouths[1]?.[1] ?? 0);
  for (const a of [L.at, L.uvF, L.uv0, L.uv1, L.soft]) gl.enableVertexAttribArray(a);
  gl.bindBuffer(gl.ARRAY_BUFFER, c.at);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, knots);
  gl.vertexAttribPointer(L.at, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, c.uvFace); gl.vertexAttribPointer(L.uvF, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, c.soft); gl.vertexAttribPointer(L.soft, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, c.face);
  for (let i = 0; i < 2; i++) {
    // (no second mouth: the first again, with no share)
    const s = ready[(mouths[i] ?? mouths[0])?.[0] ?? ''];
    gl.activeTexture(gl.TEXTURE1 + i);
    gl.bindTexture(gl.TEXTURE_2D, s?.tex ?? c.face);
    gl.bindBuffer(gl.ARRAY_BUFFER, s?.buf ?? c.uvFace);
    gl.vertexAttribPointer(i ? L.uv1 : L.uv0, 2, gl.FLOAT, false, 0, 0);
  }
  gl.uniform1f(L.only, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.all);
  gl.drawElements(gl.TRIANGLES, c.nAll, gl.UNSIGNED_SHORT, 0);
  if (mouths.length) {
    gl.uniform1f(L.only, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.front);
    gl.drawElements(gl.TRIANGLES, c.nFront, gl.UNSIGNED_SHORT, 0);
  }
  for (const a of [L.at, L.uvF, L.uv0, L.uv1, L.soft]) gl.disableVertexAttribArray(a);
  gl.activeTexture(gl.TEXTURE0);
  return true;
}
