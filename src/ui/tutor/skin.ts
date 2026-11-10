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
 * bent once onto the painting by scripts/skin-register.py). Round the mouth,
 * photographs of other mouths are laid over it by as much as the mouth of
 * the moment is like theirs: wide open, rounded and open, rounded and shut.
 * Each is stretched onto the same net, so their lips fall on one another and
 * on the anatomy's; what changes from one to the next is what a photograph
 * has and a stretched picture lacks: the hollow of the cheek, the folds of
 * pursed lips. Between parted lips is the inside of a photographed mouth
 * (its teeth, its tongue); when the skin is only half laid on, the layer is
 * open there instead and the anatomy under it is seen.
 *
 * The net is drawn by the graphics card (one textured mesh: a few
 * milliseconds on any computer) on a canvas of its own, which the page lays
 * over the anatomy's; without the card, triangle by triangle, the photograph
 * at rest alone.
 */
import { HeadScene, Mat } from '../head/scene';
import { BACKDROP_FRAME } from '../head/frame';
import { paintTriangle } from '../head/painter';
import { LIPS_MEET, CORNER, mouthMeasure, NET_REST, NET_TRIANGLES, NET_X, netKnots, NX, NY, ROW_LOWER, ROW_UPPER } from './skinNet';

/** The part of the face the mouth's photographs cover (canonical cm): they fade into the face at rest at its back, top and bottom. */
const PATCH = { x0: 3.9, y0: 1.4, x1: 13, y1: 11.2 };
const ease = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

interface Shape { at: [number, number]; /** how far apart its lips are at each line of the net, cm */ apart: number[]; uv: Float32Array; img: HTMLImageElement | null; tex: WebGLTexture | null }
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

/** The photographs, once they have loaded (null until the face at rest has; the mouths come after it). */
function loaded(): Skin | null {
  if (!asked && typeof Image !== 'undefined') {
    asked = true;
    void picture('skin/face.webp').then((face) => {
      skin = { face, shapes: {} };
      version++;
      return fetch('skin/net.json').then((r) => (r.ok ? r.json() : null)).then((net: { shapes: Record<string, { at: [number, number]; apart?: number[]; uv: number[] }> } | null) => {
        for (const [name, s] of Object.entries(net?.shapes ?? {})) {
          if (s.uv.length !== NET_REST.length) continue; // made for another net: the face at rest stands in
          const shape: Shape = { at: s.at, apart: s.apart ?? [], uv: new Float32Array(s.uv), img: null, tex: null };
          skin!.shapes[name] = shape;
          void picture(`skin/mouth-${name}.webp`).then((img) => { shape.img = img; version++; }, () => { /* the face at rest stands in */ });
        }
      });
    }).catch(() => { /* no skin: the anatomy alone */ });
  }
  return skin;
}

/**
 * How much of each photographed mouth the mouth of a posture shows (0..1, by name). Lips that are not pushed
 * forward go from the face at rest to the mouth wide open as they part; lips pushed forward are the rounded
 * mouths, the shut one or the open one by how far apart they are.
 */
export function mouthsOf(gap: number, forward: number, shapes: Record<string, { at: [number, number] }>): Record<string, number> {
  const out: Record<string, number> = {};
  const open = shapes.open, o = shapes.o, round = shapes.round;
  const far = Math.min(o?.at[1] ?? 9, round?.at[1] ?? 9);
  // (a millimetre forward is not a rounded mouth)
  const r = far < 9 ? ease((forward - 0.1) / Math.max(0.1, 0.9 * far - 0.1)) : 0;
  if (open) out.open = (1 - r) * ease((gap - 0.25) / Math.max(0.3, open.at[0] - 0.25));
  if (o && round) {
    const u = ease((gap - round.at[0]) / Math.max(0.2, o.at[0] - round.at[0]));
    out.o = r * u; out.round = r * (1 - u);
  } else if (o) out.o = r;
  else if (round) out.round = r;
  return out;
}

// ------------------------------------------------------------------ the graphics card

const VERT = `
attribute vec2 aAt;      // where the knot is now, world cm
attribute vec2 aUv;      // where it is in the picture
attribute vec2 aSoft;    // x: 0 on a lip's inner edge, 1 away from it; y: 0 where a mouth's picture ends, 1 inside it
uniform vec4 uWorld;     // world cm to clip space: x * a + b, y * c + d
varying vec2 vUv;
varying vec2 vSoft;
void main() {
  vUv = aUv;
  vSoft = aSoft;
  gl_Position = vec4(aAt.x * uWorld.x + uWorld.y, aAt.y * uWorld.z + uWorld.w, 0.0, 1.0);
}`;
const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform float uAlpha;    // how much of this picture is laid on
uniform float uFade;     // 1: the picture fades out toward its edges (a mouth's), 0: it does not (the whole face)
uniform float uOpen;     // 0: lips shut, 1: parted: their inner edges turn into the shadow of the mouth
uniform float uLit;      // how much light falls on it (the inside of a mouth that is barely open is dark)
uniform float uDeep;     // 1: the inside of the mouth, darker toward its middle by vSoft.x (1 at the lips, 0 deep in)
uniform float uTall;     // the picture's height, pixels
uniform vec4 uEdgeX;     // the picture fades out toward the frame's left edge: clear at x, whole at y (pixels); zw unused
uniform vec4 uEdgeY;     // ...toward its top (clear at x, whole at y) and its bottom (clear at z, whole at w)
uniform vec2 uNeck;      // ...and where the neck ends (clear at x, whole at y)
varying vec2 vUv;
varying vec2 vSoft;
void main() {
  vec4 c = texture2D(uTex, vUv);
  float lit = mix(mix(1.0, 0.55 + 0.45 * smoothstep(0.0, 1.0, vSoft.x), uOpen), 0.1 + 0.9 * vSoft.x, uDeep);
  float a = uAlpha * mix(1.0, vSoft.y, uFade);
  float px = gl_FragCoord.x, py = uTall - gl_FragCoord.y;
  a *= clamp((px - uEdgeX.x) / (uEdgeX.y - uEdgeX.x), 0.0, 1.0);
  a *= clamp((py - uEdgeY.x) / (uEdgeY.y - uEdgeY.x), 0.0, 1.0) * clamp((py - uEdgeY.z) / (uEdgeY.w - uEdgeY.z), 0.0, 1.0);
  a *= clamp((py - uNeck.x) / (uNeck.y - uNeck.x), 0.0, 1.0);
  gl_FragColor = vec4(c.rgb * lit * uLit, c.a) * a;
}`;

interface Card {
  cv: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  at: WebGLBuffer; uvFace: WebGLBuffer; uvMouth: WebGLBuffer; soft: WebGLBuffer; all: WebGLBuffer; part: WebGLBuffer;
  nAll: number; nPart: number;
  /** the inside of the mouth: its own few points (where, where in the picture, how lit), made anew for every posture */
  inAt: WebGLBuffer; inUv: WebGLBuffer; inSoft: WebGLBuffer; inside: WebGLBuffer; nInside: number;
  loc: { at: number; uv: number; soft: number; world: WebGLUniformLocation | null; alpha: WebGLUniformLocation | null; fade: WebGLUniformLocation | null; open: WebGLUniformLocation | null; lit: WebGLUniformLocation | null; deep: WebGLUniformLocation | null; tall: WebGLUniformLocation | null; edgeX: WebGLUniformLocation | null; edgeY: WebGLUniformLocation | null; neck: WebGLUniformLocation | null };
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

function makeCard(): Card | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  const opts: WebGLContextAttributes = { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false, powerPreference: 'low-power' };
  const gl = (cv.getContext('webgl2', opts) ?? cv.getContext('webgl', opts)) as WebGLRenderingContext | null;
  if (!gl) return null;
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const pr = gl.createProgram()!;
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  const n = NX * NY;
  // where every knot is in the picture of the whole face: its own place at rest, in the painting's frame
  const f = BACKDROP_FRAME, uvFace = new Float32Array(2 * n), soft = new Float32Array(2 * n);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, x = NET_REST[2 * k], y = NET_REST[2 * k + 1];
    uvFace[2 * k] = (x - f.x0) / (f.x1 - f.x0); uvFace[2 * k + 1] = (f.y1 - y) / (f.y1 - f.y0);
    // the lips' inner edges, in front of the corner of the mouth
    soft[2 * k] = (j === ROW_LOWER || j === ROW_UPPER) && y === LIPS_MEET ? 1 - ease((x - CORNER) / 0.6) : 1;
    soft[2 * k + 1] = ease((x - PATCH.x0) / 1.3) * ease((y - PATCH.y0) / 1.2) * ease((PATCH.y1 - y) / 0.9);
  }
  // the triangles of the part of the face a mouth's picture covers
  const part: number[] = [];
  const within = (k: number) => NET_REST[2 * k] >= PATCH.x0 && NET_REST[2 * k + 1] >= PATCH.y0 && NET_REST[2 * k + 1] <= PATCH.y1;
  const tri = NET_TRIANGLES.skin;
  for (let t = 0; t < tri.length; t += 3) if (within(tri[t]) && within(tri[t + 1]) && within(tri[t + 2])) part.push(tri[t], tri[t + 1], tri[t + 2]);
  const buffer = (target: number, data: ArrayBufferView, usage: number) => { const b = gl.createBuffer()!; gl.bindBuffer(target, b); gl.bufferData(target, data, usage); return b; };
  const c: Card = {
    cv, gl,
    at: buffer(gl.ARRAY_BUFFER, new Float32Array(2 * n), gl.DYNAMIC_DRAW),
    uvFace: buffer(gl.ARRAY_BUFFER, uvFace, gl.STATIC_DRAW),
    uvMouth: buffer(gl.ARRAY_BUFFER, new Float32Array(2 * n), gl.DYNAMIC_DRAW),
    soft: buffer(gl.ARRAY_BUFFER, soft, gl.STATIC_DRAW),
    all: buffer(gl.ELEMENT_ARRAY_BUFFER, tri, gl.STATIC_DRAW),
    part: buffer(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(part), gl.STATIC_DRAW),
    nAll: tri.length, nPart: part.length,
    inAt: buffer(gl.ARRAY_BUFFER, new Float32Array(8 * COLS), gl.DYNAMIC_DRAW),
    inUv: buffer(gl.ARRAY_BUFFER, new Float32Array(8 * COLS), gl.DYNAMIC_DRAW),
    inSoft: buffer(gl.ARRAY_BUFFER, IN_SOFT, gl.DYNAMIC_DRAW),
    inside: buffer(gl.ELEMENT_ARRAY_BUFFER, IN_TRIANGLES, gl.STATIC_DRAW), nInside: IN_TRIANGLES.length,
    loc: {
      at: gl.getAttribLocation(pr, 'aAt'), uv: gl.getAttribLocation(pr, 'aUv'), soft: gl.getAttribLocation(pr, 'aSoft'),
      world: gl.getUniformLocation(pr, 'uWorld'), alpha: gl.getUniformLocation(pr, 'uAlpha'), fade: gl.getUniformLocation(pr, 'uFade'), open: gl.getUniformLocation(pr, 'uOpen'), lit: gl.getUniformLocation(pr, 'uLit'), deep: gl.getUniformLocation(pr, 'uDeep'), tall: gl.getUniformLocation(pr, 'uTall'), edgeX: gl.getUniformLocation(pr, 'uEdgeX'), edgeY: gl.getUniformLocation(pr, 'uEdgeY'), neck: gl.getUniformLocation(pr, 'uNeck'),
    },
    face: null, lost: false,
  };
  gl.enableVertexAttribArray(c.loc.at); gl.enableVertexAttribArray(c.loc.uv); gl.enableVertexAttribArray(c.loc.soft);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  // a card that is taken away (the computer sleeps, too many pages draw) is asked for again
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); c.lost = true; });
  cv.addEventListener('webglcontextrestored', () => { card = undefined; for (const s of Object.values(skin?.shapes ?? {})) s.tex = null; version++; });
  return c;
}

/**
 * The inside of the mouth, between the lips' two edges in front of the corner: at every line of the net four
 * points, the upper lip's edge, the middle twice, the lower lip's edge. The top half shows what the photograph
 * has under its upper lip and the bottom half what it has over its lower lip, each at its own size: teeth do
 * not stretch when a mouth opens, the lips uncover them. A mouth less open than the photograph's shows less of
 * each (the middle of the photograph is left out); one as open shows it all.
 */
const COL0 = NET_X.indexOf(CORNER), COLS = NX - COL0;
const IN_SOFT = (() => { const a = new Float32Array(8 * COLS); for (let i = 0; i < COLS; i++) a.set([0, 1, 1, 1, 1, 1, 0, 1], 8 * i); return a; })();
const IN_TRIANGLES = (() => {
  const t: number[] = [];
  for (let i = 0; i + 1 < COLS; i++) for (const k of [0, 2]) { const a = 4 * i + k, b = a + 4; t.push(a, b, b + 1, a, b + 1, a + 1); }
  return new Uint16Array(t);
})();
const inAt = new Float32Array(8 * COLS), inUv = new Float32Array(8 * COLS);

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
 * Paints the head with its skin on the skin's canvas (`skinCanvas`), `w` by
 * `h` pixels, for a posture. `world` maps world centimetres to those pixels;
 * `inside` (0..1) is how much of the photographed inside of the mouth is
 * painted between parted lips (none: the skin is open there, and what is
 * under it is seen). Returns false while the photograph has not loaded (the
 * canvas is then empty).
 */
export function paintSkin(sc: HeadScene, world: Mat, w: number, h: number, inside: number, fades: SkinFades): boolean {
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
  // (an edge that does not fade: clear a long way off, whole just after)
  const off: [number, number] = [-1e6, -1e6 + 1];
  const L = fades.left ?? off, T = fades.top ?? off, B = fades.bottom ?? off;
  gl.uniform1f(c.loc.tall, h);
  gl.uniform4f(c.loc.edgeX, L[0], L[1], 0, 0);
  gl.uniform4f(c.loc.edgeY, T[0], T[1], B[0], B[1]);
  gl.uniform2f(c.loc.neck, fades.neck[0], fades.neck[1]);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  c.face ??= texture(gl, sk.face);
  // (every photograph of a mouth is handed to the graphics card as soon as it is here, while the face stands
  // still: handed over the first time a mouth opens, it held up that frame by a tenth of a second or more)
  for (const sh of Object.values(sk.shapes)) if (sh.img && !sh.tex) sh.tex = texture(gl, sh.img);
  // world cm to the layer's pixels (no turn in `world`), then to the card's own square, y up
  gl.uniform4f(c.loc.world, (2 * world[0]) / w, (2 * world[4]) / w - 1, (-2 * world[3]) / h, 1 - (2 * world[5]) / h);
  gl.uniform1f(c.loc.open, ease(m.gap / 0.5));
  gl.bindBuffer(gl.ARRAY_BUFFER, c.at);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, knots);
  gl.vertexAttribPointer(c.loc.at, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, c.soft);
  gl.vertexAttribPointer(c.loc.soft, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1f(c.loc.lit, 1);
  gl.uniform1f(c.loc.deep, 0);
  // ---- the inside of the mouth, under the skin: the wide-open photograph's
  const wide = sk.shapes.open;
  if (inside > 0.01 && m.gap > 0.03 && wide?.img && wide.apart.length === NX) {
    wide.tex ??= texture(gl, wide.img);
    for (let i = 0; i < COLS; i++) {
      const u = 2 * (ROW_UPPER * NX + COL0 + i), l = 2 * (ROW_LOWER * NX + COL0 + i);
      const ux = knots[u], uy = knots[u + 1], lx = knots[l], ly = knots[l + 1];
      const t = Math.min(0.5, (0.5 * Math.hypot(ux - lx, uy - ly)) / sc.s / Math.max(0.05, wide.apart[COL0 + i]));
      const au = wide.uv[u], av = wide.uv[u + 1], bu = wide.uv[l], bv = wide.uv[l + 1];
      inAt.set([ux, uy, 0.5 * (ux + lx), 0.5 * (uy + ly), 0.5 * (ux + lx), 0.5 * (uy + ly), lx, ly], 8 * i);
      inUv.set([au, av, au + t * (bu - au), av + t * (bv - av), bu + t * (au - bu), bv + t * (av - bv), bu, bv], 8 * i);
      // where the two halves meet, the inside is dark: as dark as the mouth is less open than the photograph's
      // (all of the photograph shown, nothing is darkened: its own shadow is there)
      const deep = Math.min(1, 2 * t);
      IN_SOFT.set([1, 1, deep, 1, deep, 1, 1, 1], 8 * i);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, c.inAt); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inAt); gl.vertexAttribPointer(c.loc.at, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, c.inUv); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inUv); gl.vertexAttribPointer(c.loc.uv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, c.inSoft); gl.bufferSubData(gl.ARRAY_BUFFER, 0, IN_SOFT); gl.vertexAttribPointer(c.loc.soft, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(c.loc.deep, 1);
    gl.bindTexture(gl.TEXTURE_2D, wide.tex);
    gl.uniform1f(c.loc.alpha, inside);
    gl.uniform1f(c.loc.fade, 0);
    gl.uniform1f(c.loc.open, 1);
    // (a mouth that is barely open is dark inside)
    gl.uniform1f(c.loc.lit, 0.3 + 0.7 * ease(m.gap / 1.3));
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.inside);
    gl.drawElements(gl.TRIANGLES, c.nInside, gl.UNSIGNED_SHORT, 0);
    gl.uniform1f(c.loc.deep, 0);
    gl.uniform1f(c.loc.lit, 1);
    gl.uniform1f(c.loc.open, ease(m.gap / 0.5));
    gl.bindBuffer(gl.ARRAY_BUFFER, c.at); gl.vertexAttribPointer(c.loc.at, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, c.soft); gl.vertexAttribPointer(c.loc.soft, 2, gl.FLOAT, false, 0, 0);
  }
  // ---- the whole face, at rest
  gl.bindBuffer(gl.ARRAY_BUFFER, c.uvFace);
  gl.vertexAttribPointer(c.loc.uv, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, c.face);
  gl.uniform1f(c.loc.alpha, 1);
  gl.uniform1f(c.loc.fade, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.all);
  gl.drawElements(gl.TRIANGLES, c.nAll, gl.UNSIGNED_SHORT, 0);
  // ---- the mouths it is like, each by its share. Laid one over another, a later one hides part of an earlier
  // one: each is laid on by more than its share, so that what is left of it in the end is its share
  const shares = Object.entries(mouthsOf(m.gap, m.forward, sk.shapes)).filter(([name, v]) => v > 0.004 && sk.shapes[name].img).sort((a, b) => b[1] - a[1]);
  let left = 1;
  for (const [, v] of shares) left -= v;
  gl.uniform1f(c.loc.fade, 1);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.part);
  for (const [name, v] of shares) {
    const s = sk.shapes[name];
    s.tex ??= texture(gl, s.img!);
    left += v;
    gl.bindBuffer(gl.ARRAY_BUFFER, c.uvMouth);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, s.uv);
    gl.vertexAttribPointer(c.loc.uv, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, s.tex);
    gl.uniform1f(c.loc.alpha, Math.min(1, v / Math.max(1e-3, left)));
    gl.drawElements(gl.TRIANGLES, c.nPart, gl.UNSIGNED_SHORT, 0);
  }
  return true;
}
