import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { store, useUi, useTick, FieldMode } from '../store';
import { voice } from '../voice/voice';
import { useL, useT } from '../i18n';
import { fieldRgb } from '../canvas';
import { buildTractMeshes, TractMeshes, Pouch, RING_SIDE } from '../three/meshes';
import { Body, buildBody, GH, GW, LipMove, LipProfile, placeBody, silhouette } from '../three/head3d';
import { buildHead, Head, loadScan, paintingOutline, placeHead, placeTeeth, restBite, Scan, shadeHead } from '../three/fullHead';
import { computeGeometry } from '../../dsp/tract/geometry';
import { N_SECTIONS } from '../../dsp/tract/areaFunction';
import type { SolidId, TractGeometry } from '../../dsp/tract/geometry';
import type { Telemetry } from '../../dsp/engine/engine';
import { FACE_LOWER, FACE_PROFILE, FACE_UPPER, headScene, HeadScene, Mat } from '../head/scene';
import { Backdrop, getBackdrop } from '../head/painter';
import { paintHead } from '../tutor/faces';
import { azimuth, backdrop, lightRig, studioEnvironment } from '../three/studio';
import { hairShells, seamWeights, skinMaterials } from '../three/skin';
import { eyeMaterial, eyeUniforms } from '../three/eyes';
import { MouthParts, innerMaterial, mouthMaterials, teethShape } from '../three/mouth';

type Preset = 'side' | 'front' | 'top' | 'three';
type AnchorKey = keyof TractMeshes['anchors'];
type Rgb = [number, number, number];

const LABELS: Record<AnchorKey, { it: string; en: string }> = {
  tongue: { it: 'lingua', en: 'tongue' },
  palate: { it: 'palato duro (osso)', en: 'hard palate (bone)' },
  velum: { it: 'velo', en: 'velum' },
  teeth: { it: 'denti', en: 'teeth' },
  lips: { it: 'labbra', en: 'lips' },
  larynx: { it: 'laringe', en: 'larynx' },
  pharynx: { it: 'faringe', en: 'pharynx' },
  piriform: { it: 'seni piriformi', en: 'piriform fossae' },
  channels: { it: 'canali laterali', en: 'lateral channels' },
  supra: { it: 'cavità sopralinguale', en: 'supralingual cavity' },
};
const ANCHORS = Object.keys(LABELS) as AnchorKey[];

/** The cut face is painted on a picture of this size, over this much of the world (in units of the head's scale, cm). */
const PLATE = { w: 1024, h: 1536, x0: -11.5, x1: 13.5, y0: -8.5, y1: 29 };
/** The painted face is painted again at most this often while the head moves (seconds): the airway behind it moves at every frame. */
const REPAINT = 0.06;

const rgbOf = (css: string, fallback: Rgb): Rgb => {
  const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(css);
  return m ? [+m[1] / 255, +m[2] / 255, +m[3] / 255] : fallback;
};
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The colour of each wall of the airway, from the painting's own colours: what is seen in the hollow belongs to the face it is cut in. */
function wallTones(bd: Backdrop | null): Record<SolidId | 'none', Rgb> {
  const tissue = rgbOf(bd?.tone.tissue ?? '', [0.47, 0.15, 0.16]), mucosa = rgbOf(bd?.tone.mucosa ?? '', [0.79, 0.61, 0.55]);
  const tongue = rgbOf(bd?.tone.tongue ?? '', [0.69, 0.34, 0.34]);
  const red = mix(tissue, tongue, 0.55);
  return {
    wall: mix(red, mucosa, 0.3), palate: mix(mucosa, tongue, 0.32), velum: mix(mucosa, tongue, 0.5), upperLip: mix(tongue, mucosa, 0.3), lowerLip: mix(tongue, mucosa, 0.3),
    larynx: mix(mucosa, red, 0.45), tongue: mix(tongue, tissue, 0.12), floor: red,
    // (between the teeth the far wall is the cheek: the teeth themselves stand in front of it)
    upperIncisor: mix(red, tissue, 0.35), lowerIncisor: mix(red, tissue, 0.35), none: red,
  };
}

/**
 * The painted profile of the lips at rest: the painting's own, closed as the painting has them (and as the
 * scanned head bent onto it has them). The body behind the cut and the whole head carry their lips by it,
 * so that they are where the painted lips are in every posture: apart as far as the painted ones, and shut
 * when they shut, neither lip over the other.
 */
function lipProfile(): LipProfile | null {
  const upper = FACE_UPPER.slice(), lower = FACE_LOWER.slice();
  return upper.length / 2 === FACE_PROFILE.upper[1] && lower.length / 2 === FACE_PROFILE.lower[1] ? { upper, lower } : null;
}

/** How far the painted lips are from where the jaw alone would have them, point by point of their profile. */
function lipMove(sc: HeadScene, rest: LipProfile): LipMove {
  const of = (face: number[], [from]: readonly [number, number], profile: number[], w: number) => {
    const out: number[] = [];
    for (let i = 0; i < profile.length; i += 2) {
      const q = sc.place(profile[i], profile[i + 1], w), k = 2 * from + i;
      out.push((face[k] ?? q[0]) - q[0], (face[k + 1] ?? q[1]) - q[1]);
    }
    return out;
  };
  return { upper: of(sc.upperFace, FACE_PROFILE.upper, rest.upper, 0), lower: of(sc.lowerFace, FACE_PROFILE.lower, rest.lower, 1) };
}

/** Value 0..1 of the chosen field at grid line i (as in the head view). */
function fieldAt(g: TractGeometry, i: number, mode: FieldMode, tel: Telemetry | null): number {
  if (!tel) return 0.15;
  const k = Math.max(0, Math.min(N_SECTIONS - 1, Math.floor((g.s[i] / g.length) * N_SECTIONS)));
  if (mode === 'pressure') return tel.pRms[k];
  if (mode === 'velocity') return tel.uRms[k];
  const u = k <= tel.constrictionIndex ? tel.ug : tel.uMouth;
  const vel = u / Math.max(g.hits[i].area, 0.02);
  return Math.min(1, Math.log10(1 + vel / 30) / 2.3);
}

/** One light for everything that is shaded here, a little above and to the left of the eye (in the eye's own frame). */
const LIGHT = 'normalize(vec3(-0.28, 0.46, 0.84))';

/** The painted cut face: the picture as it is, nothing added to it. */
const PLATE_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const PLATE_FS = 'uniform sampler2D map; uniform float uOpacity; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv) * uOpacity; }';

const SHADE_VS = `
attribute vec3 tone; attribute vec3 field; attribute float lat; attribute float front;
uniform float uField;
varying vec3 vCol; varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vLat; varying float vFront;
void main() {
  vCol = mix(tone, field, uField);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalMatrix * normal; vV = -mv.xyz; vP = position; vLat = lat; vFront = front;
  gl_Position = projectionMatrix * mv;
}`;
/**
 * The walls of the airway, seen in the hollow behind the cut face: wet mucosa in the colours of the painting,
 * lit from where the eye is (the light comes in through the cut), darker the deeper they lie, mottled a
 * little as living tissue is, with the small highlight of a wet surface.
 */
const WALL_FS = `
uniform float uDepth; uniform float uField; uniform vec4 uMouth;
varying vec3 vCol; varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vLat; varying float vFront;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  // (in a whole head its own lips and teeth are the front of the mouth: the airway's walls of the lips and the
  // incisors are not drawn, nor anything in front of its teeth; the tongue and the palate are)
  if (uMouth.z > 0.5 && (vFront > 0.5 || vP.x > uMouth.w)) discard;
  vec3 n = normalize(vN), v = normalize(vV);
  if (dot(n, v) < 0.0) n = -n;
  float depth = clamp(-vP.z / uDepth, 0.0, 1.0);
  float mott = 0.9 + 0.2 * (0.6 * noise(vP * 2.3) + 0.4 * noise(vP * 6.1));
  vec3 base = vCol * mix(mott, 1.0, uField);
  vec3 L = ${LIGHT};
  float wrap = 0.46 + 0.54 * max(dot(n, L), 0.0);
  // the light comes in by the cut: what lies deep in the hollow is in the dark
  float shade = mix(1.0, mix(0.13, 0.55, uField), pow(depth, 0.7));
  // (in a whole head it comes in by the mouth only: dark a little way behind the front teeth)
  // (the tongue's front and the palate behind the teeth catch the light; the throat is dark)
  float behind = clamp((uMouth.x - vP.x) / uMouth.y, 0.0, 1.0);
  shade = mix(shade, mix(1.0, mix(0.03, 0.4, uField), pow(behind, 1.15)), uMouth.z);
  vec3 c = base * wrap * shade;
  // flesh in shadow stays red, never grey
  c += vec3(0.07, 0.01, 0.012) * (1.0 - wrap) * (1.0 - uField) * shade;
  float spec = pow(max(dot(n, normalize(L + v)), 0.0), 56.0) * 0.2 * (1.0 - depth) * (1.0 - depth);
  gl_FragColor = vec4(c + vec3(spec), 1.0);
}`;
/** The air of the near half, when the head is not cut through it: a clear cast standing out of the cut face. */
const GLASS_FS = `
uniform float uField;
varying vec3 vCol; varying vec3 vN; varying vec3 vV;
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  if (dot(n, v) < 0.0) n = -n;
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.4);
  vec3 c = mix(vec3(0.82, 0.9, 0.98), vCol, uField);
  float a = mix(0.07, 0.3, uField) + 0.5 * rim;
  float spec = pow(max(dot(n, normalize(${LIGHT} + v)), 0.0), 90.0) * 0.55;
  gl_FragColor = vec4(c * a + vec3(spec), min(1.0, a + spec));
}`;
/** The teeth, the gums and the fossa: solid things standing in the hollow, lit and darkened by depth as its walls are. */
const SOLID_VS = `
varying vec3 vN; varying vec3 vV; varying float vZ; varying float vX;
void main() {
  vec4 p = vec4(position, 1.0); vec3 n = normal;
  #ifdef USE_INSTANCING
    mat3 m = mat3(instanceMatrix);
    n = m * (n / vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2])));
    p = instanceMatrix * p;
  #endif
  vec4 w = modelMatrix * p;
  vec4 mv = viewMatrix * w;
  vN = normalMatrix * n; vV = -mv.xyz; vZ = w.z; vX = w.x;
  gl_Position = projectionMatrix * mv;
}`;
const SOLID_FS = `
uniform vec3 uColor; uniform float uDepth; uniform float uShine; uniform float uDark; uniform vec4 uMouth;
varying vec3 vN; varying vec3 vV; varying float vZ; varying float vX;
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  if (dot(n, v) < 0.0) n = -n;
  vec3 L = ${LIGHT};
  float depth = clamp(-vZ / uDepth, 0.0, 1.0);
  float wrap = 0.56 + 0.44 * max(dot(n, L), 0.0);
  vec3 c = uColor * wrap * mix(1.0, uDark, depth);
  // (in a whole head the light comes in by the mouth only: what lies behind the front teeth is in the dark)
  float behind = clamp((uMouth.x - vX) / uMouth.y, 0.0, 1.0);
  c *= mix(1.0, mix(1.0, 0.03, pow(behind, 0.55)), uMouth.z);
  // (in a mouth the light that comes back from the walls is red)
  c += vec3(0.05, 0.016, 0.014) * (1.0 - wrap) * (1.0 - uMouth.z * behind);
  float spec = pow(max(dot(n, normalize(L + v)), 0.0), 48.0) * uShine * (1.0 - 0.6 * depth) * (1.0 - uMouth.z * behind);
  gl_FragColor = vec4(c + vec3(spec), 1.0);
}`;
const BODY_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalMatrix * normal; vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
/** The skin of the half head behind the cut: the photograph, shaded by the form it lies on. */
const BODY_FS = `
uniform sampler2D map;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  if (dot(n, v) < 0.0) n = -n;
  vec3 base = texture2D(map, vUv).rgb;
  // (the photograph has its own light in it: the form only turns it down a little where it turns away)
  float lit = 0.5 + 0.5 * dot(n, normalize(vec3(-0.1, 0.3, 0.95)));
  float limb = pow(clamp(dot(n, v), 0.0, 1.0), 0.5);
  gl_FragColor = vec4(base * mix(0.5, 1.0, lit) * mix(0.66, 1.0, limb), 1.0);
}`;

/**
 * The vocal tract in three dimensions, as it is in a head: the head cut down
 * the middle and seen from the cut. The cut face is the painted anatomy, the
 * very picture the head view shows, moving as it moves; behind it the airway
 * goes into the far half of the head as a hollow with wet walls, from the
 * same cross-sections the sound is computed with; and the half head itself
 * has its body and its skin, so that turning it shows a head and not a card.
 * Drag to turn, wheel to zoom.
 */
export default function Tract3DView() {
  const L = useL();
  const t = useT();
  const ui = useUi();
  const host = useRef<HTMLDivElement | null>(null);
  const labelEls = useRef<Partial<Record<AnchorKey, HTMLSpanElement | null>>>({});
  const [cut, setCut] = useState(true);
  const [tissues, setTissues] = useState(true);
  const [labels, setLabels] = useState(true);
  const [lost, setLost] = useState<string | null>(null);
  const opts = useRef({ cut, tissues, labels });
  opts.current = { cut, tissues, labels };
  const presetRef = useRef<(p: Preset) => void>(() => undefined);
  useTick(ui.numbers ? 4 : 0);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, stencil: true, powerPreference: 'low-power' });
    } catch {
      setLost('nowebgl');
      return;
    }
    // (the pixel ratio is at most 2, and lower while the head is being turned: the picture is made when asked, and sharp at rest)
    const prHigh = Math.min(2, window.devicePixelRatio || 1), prLow = Math.min(1.25, prHigh);
    let pr = prHigh;
    renderer.setPixelRatio(pr);
    renderer.setClearColor(0x10141d, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.localClippingEnabled = true;
    const canvas = renderer.domElement;
    canvas.className = 'fill';
    canvas.setAttribute('aria-label', 'vocal tract 3D');
    el.prepend(canvas);
    let dirty = true;
    const onLost = (e: Event) => { e.preventDefault(); setLost('lost'); };
    const onRestored = () => { setLost(null); dirty = true; };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 1, 400);
    // (the studio: the skin, the eyes and the hair take its lights and its image-based light; the painted anatomy and the
    // airway are shaded by their own rules)
    scene.add(camera);
    scene.environment = studioEnvironment(renderer);
    scene.environmentIntensity = 0.2;
    const rig = lightRig(scene, camera);
    scene.add(backdrop());
    const backdropMesh = scene.children[scene.children.length - 1] as THREE.Mesh;

    const geom0 = store.derived().geom;
    let meshes = buildTractMeshes(geom0);
    let lastGeom: TractGeometry | null = null;
    let sc: HeadScene | null = null;
    let bd: Backdrop | null = null;
    let tones = wallTones(null);

    // ---- the airway: one ring of points on every grid line, the far half of it for the hollow, the near half for the cast
    const ringN = 2 * RING_SIDE, mid = (RING_SIDE - 1) / 2, rays = meshes.air.positions.length / 3 / ringN;
    const halfIndex = (order: number[]) => {
      const idx = new Uint32Array((rays - 1) * (order.length - 1) * 6);
      let q = 0;
      for (let i = 0; i < rays - 1; i++) for (let j = 0; j + 1 < order.length; j++) {
        const a = i * ringN + order[j], b = i * ringN + order[j + 1], c = a + ringN, d = b + ringN;
        idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
      }
      return new THREE.BufferAttribute(idx, 1);
    };
    const far: number[] = [], near: number[] = [];
    for (let j = mid; j >= 0; j--) far.push(j);
    for (let j = 0; j <= mid; j++) far.push(ringN - 1 - j);
    for (let j = mid; j < RING_SIDE; j++) near.push(j);
    for (let j = RING_SIDE - 1; j >= mid; j--) near.push(ringN - 1 - j);
    const count = rays * ringN;
    const posAttr = new THREE.BufferAttribute(meshes.air.positions, 3);
    const toneCol = new Float32Array(count * 3), fieldCol = new Float32Array(count * 3), lat = new Float32Array(count), frontOf = new Float32Array(count);
    for (let i = 0; i < rays; i++) for (let j = 0; j < RING_SIDE; j++) {
      const a = Math.abs(Math.sin((Math.PI / 2) * (-1 + (2 * j) / (RING_SIDE - 1))));
      lat[i * ringN + j] = a; lat[i * ringN + ringN - 1 - j] = a;
    }
    const toneAttr = new THREE.BufferAttribute(toneCol, 3), fieldAttr = new THREE.BufferAttribute(fieldCol, 3), latAttr = new THREE.BufferAttribute(lat, 1), frontAttr = new THREE.BufferAttribute(frontOf, 1);
    // (the whole ring gives every point its normal; the two halves share them)
    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute('position', posAttr);
    ringGeo.setIndex(new THREE.BufferAttribute(meshes.air.index, 1));
    ringGeo.computeVertexNormals();
    const half = (order: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', posAttr);
      g.setAttribute('normal', ringGeo.attributes.normal);
      g.setAttribute('tone', toneAttr);
      g.setAttribute('field', fieldAttr);
      g.setAttribute('lat', latAttr);
      g.setAttribute('front', frontAttr);
      g.setIndex(halfIndex(order));
      return g;
    };
    // (where the front teeth are, how far behind them the mouth is dark, whether the head is whole (then the light
    // comes into the mouth by the lips only), and in front of where the airway's walls are not drawn then)
    const wallUniforms = { uDepth: { value: 2.2 }, uField: { value: 0 }, uMouth: { value: new THREE.Vector4(9, 2.6, 0, 0) } };
    const wallMat = new THREE.ShaderMaterial({
      uniforms: wallUniforms, vertexShader: SHADE_VS, fragmentShader: WALL_FS, side: THREE.DoubleSide,
      stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilRef: 1, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.ReplaceStencilOp,
    });
    const hollowGeo = half(far), castGeo = half(near);
    const hollow = new THREE.Mesh(hollowGeo, wallMat);
    hollow.frustumCulled = false;
    scene.add(hollow);
    const glassMat = new THREE.ShaderMaterial({
      uniforms: { uField: wallUniforms.uField }, vertexShader: SHADE_VS, fragmentShader: GLASS_FS, side: THREE.DoubleSide,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    // (the near half of the airway's walls, for the whole head: seen into through the open mouth)
    const nearWall = new THREE.Mesh(castGeo, wallMat);
    nearWall.frustumCulled = false; nearWall.visible = false;
    scene.add(nearWall);
    const cast = new THREE.Mesh(castGeo, glassMat);
    cast.frustumCulled = false;
    cast.renderOrder = 3;
    scene.add(cast);

    // ---- the cut face: the painted head, on a picture of its own
    const plateCv = document.createElement('canvas');
    plateCv.width = PLATE.w; plateCv.height = PLATE.h;
    const plateTex = new THREE.CanvasTexture(plateCv);
    plateTex.colorSpace = THREE.NoColorSpace;
    plateTex.premultiplyAlpha = true;
    plateTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const plateUniforms = { map: { value: plateTex }, uOpacity: { value: 1 } };
    const plateMat = new THREE.ShaderMaterial({
      uniforms: plateUniforms, vertexShader: PLATE_VS, fragmentShader: PLATE_FS,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), plateMat);
    plate.renderOrder = 2;
    plate.visible = false;
    scene.add(plate);

    // ---- the half head behind the cut: its skin, and the tissue inside it
    let body: Body | null = null;
    const lips = lipProfile();
    const skinCv = document.createElement('canvas');
    skinCv.width = 768; skinCv.height = 1152;
    const skinTex = new THREE.CanvasTexture(skinCv);
    skinTex.colorSpace = THREE.NoColorSpace;
    skinTex.anisotropy = plateTex.anisotropy;
    const skinMat = new THREE.ShaderMaterial({ uniforms: { map: { value: skinTex } }, vertexShader: BODY_VS, fragmentShader: BODY_FS, side: THREE.DoubleSide });
    const skinMesh = new THREE.Mesh(new THREE.BufferGeometry(), skinMat);
    const trayMat = new THREE.MeshBasicMaterial({ color: 0x180809, side: THREE.DoubleSide });
    const trayMesh = new THREE.Mesh(new THREE.BufferGeometry(), trayMat);
    for (const m of [skinMesh, trayMesh]) { m.visible = false; m.frustumCulled = false; scene.add(m); }
    let skinPos = new Float32Array(0), trayPos = new Float32Array(0);
    const photo = new Image();
    photo.decoding = 'async';
    const paintSkin = () => {
      const c = skinCv.getContext('2d');
      if (!c) return;
      c.fillStyle = bd?.tone.skin ?? '#ba887b';
      c.fillRect(0, 0, skinCv.width, skinCv.height);
      if (photo.complete && photo.naturalWidth) {
        // (first a little larger, round the middle of the head: where the head runs a hair past the photograph's
        // own edge it has the colours of that edge, not a bare tone)
        const w = skinCv.width, h = skinCv.height, mx = 0.44 * w, my = 0.4 * h;
        for (const k of [1.09, 1.06, 1.03]) c.drawImage(photo, mx - mx * k, my - my * k, w * k, h * k);
        c.drawImage(photo, 0, 0, w, h);
      }
      skinTex.needsUpdate = true;
      dirty = true;
    };
    photo.onload = () => { paintSkin(); dirty = true; };
    photo.src = 'skin/face.webp';

    // ---- the whole head: a scanned head bent onto the painting, in a skin made for it
    let scan: Scan | null = null, head: Head | null = null;
    let headPos = new Float32Array(0), headNormal = new Float32Array(0);
    const skin = skinMaterials();
    const eyeU = eyeUniforms();
    skin.uniforms.uEyeL = eyeU.uEyeL; skin.uniforms.uEyeR = eyeU.uEyeR;
    const headUniforms = { ...eyeU, ...skin.uniforms };
    // (the skin: its albedo, and the picture of its detail: red the bump of pores and stubble, green how rough, blue where there is hair)
    const flat = (r: number, g: number, b: number, space: string) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); t.colorSpace = space; t.needsUpdate = true; return t; };
    const blankAlbedo = flat(150, 110, 95, THREE.SRGBColorSpace), blankDetail = flat(128, 140, 0, THREE.NoColorSpace);
    for (const m of [skin.material, skin.hairMaterial]) { m.map = blankAlbedo; m.roughnessMap = blankDetail; }
    skin.material.bumpMap = blankDetail;
    const loader0 = new THREE.TextureLoader(), loader = loader0;
    const eyeMat = eyeMaterial(eyeU);
    // (the inside of the head, seen through a cut or the mouth's opening: flesh in the dark)
    const mouth = mouthMaterials(skin.uniforms);
    const innerMat = innerMaterial(mouth.uniforms);
    const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    const headGeo = new THREE.BufferGeometry(), eyeGeo = new THREE.BufferGeometry();
    const headMesh = new THREE.Mesh(headGeo, skin.material);
    const eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    const innerMesh = new THREE.Mesh(headGeo, innerMat);
    const hairMesh = new THREE.Mesh(new THREE.BufferGeometry(), skin.hairMaterial);
    const headParts = [headMesh, eyeMesh, innerMesh, hairMesh];
    for (const m of headParts) { m.frustumCulled = false; m.visible = false; m.renderOrder = -1; scene.add(m); }
    hairMesh.renderOrder = -0.9;
    loader0.load('head3d/iris.jpg', (tx) => {
      tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; tx.needsUpdate = true;
      eyeU.uIrisTex.value = tx; eyeU.uIrisMix.value = 0.96; dirty = true;
    }, undefined, () => undefined);
    void loadScan(renderer).then((sn) => { scan = sn; dirty = true; });
    // (the skin is laid out as the scan's file lays out its texture: glTF's way up, not flipped)
    let skinReady = false;
    loader.load('head3d/skin.jpg', (tx) => {
      tx.colorSpace = THREE.SRGBColorSpace; tx.flipY = false; tx.anisotropy = plateTex.anisotropy; tx.needsUpdate = true;
      skin.material.map = tx; skin.hairMaterial.map = tx; skinReady = true; dirty = true;
    });
    loader.load('head3d/skin-detail.jpg', (tx) => {
      tx.colorSpace = THREE.NoColorSpace; tx.flipY = false; tx.anisotropy = plateTex.anisotropy; tx.needsUpdate = true;
      skin.material.roughnessMap = tx; skin.material.bumpMap = tx; skin.hairMaterial.roughnessMap = tx; dirty = true;
    }, undefined, () => undefined);
    // (cavity and thickness at every point of the head, baked from its mesh: two bytes each; the points must be the same)
    let seamSoft: Float32Array | undefined;
    let aoBytes: Uint8Array | null = null;
    void fetch('head3d/skin-ao.bin').then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => { if (b) { aoBytes = new Uint8Array(b); dirty = true; applyAo(); } }).catch(() => undefined);
    const applyAo = () => {
      if (!head || !aoBytes || aoBytes.length !== 2 * head.base) return;
      const a = headGeo.attributes.aoThin.array as Float32Array;
      for (let i = 0; i < head.count; i++) {
        // (the points of the subdivision take the mean of their parents')
        const p0 = head.parents[2 * i], p1 = head.parents[2 * i + 1];
        for (let c = 0; c < 2; c++) a[3 * i + c] = (p0 < 0 ? aoBytes[2 * i + c] : 0.5 * (aoBytes[2 * p0 + c] + aoBytes[2 * p1 + c])) / 255;
      }
      headGeo.attributes.aoThin.needsUpdate = true;
    };
    /** The head is made when the scan, its skin, the photograph of the side and the painting are all there. */
    const makeHead = () => {
      if (head || !scan || !skinReady || !bd || !(photo.complete && photo.naturalWidth)) return;
      const inside = silhouette(bd.img);
      if (!inside) { scan = null; return; }
      const outline = paintingOutline(inside, GW, GH);
      if (outline.line.length < 200) { scan = null; return; }
      head = buildHead(scan, outline, lips);
      eyeU.uEyeL.value.set(...head.eyes[0]); eyeU.uEyeR.value.set(...head.eyes[1]);
      headPos = new Float32Array(head.count * 3); headNormal = new Float32Array(head.count * 3);
      const g = headGeo;
      g.setAttribute('position', new THREE.BufferAttribute(headPos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(headNormal, 3));
      g.setAttribute('canon', new THREE.BufferAttribute(head.canon, 3));
      g.setAttribute('facing', new THREE.BufferAttribute(head.facing, 3));
      g.setAttribute('kind', new THREE.BufferAttribute(head.kind, 1));
      g.setAttribute('uv', new THREE.BufferAttribute(head.uv, 2));
      const ao = new Float32Array(3 * head.count), seam = seamWeights(head.index, head.same, head.count, scan.position.length / 3, 10);
      for (let i = 0; i < head.count; i++) { ao[3 * i] = 1; ao[3 * i + 2] = seam[i]; }
      g.setAttribute('aoThin', new THREE.BufferAttribute(ao, 3));
      seamSoft = seam;
      applyAo();
      // (the skin and the eyes are drawn apart: the eyeballs are the triangles of kind 1)
      const skinIdx: number[] = [], eyeIdx: number[] = [];
      for (let t = 0; t < head.index.length; t += 3) (head.kind[head.index[t]] === 1 ? eyeIdx : skinIdx).push(head.index[t], head.index[t + 1], head.index[t + 2]);
      g.setIndex(new THREE.BufferAttribute(Uint32Array.from(skinIdx), 1));
      for (const k of ['position', 'normal', 'canon', 'facing', 'kind', 'uv']) eyeGeo.setAttribute(k, g.attributes[k]);
      eyeGeo.setIndex(new THREE.BufferAttribute(Uint32Array.from(eyeIdx), 1));
      hairMesh.geometry = hairShells(g, 14);
      // the teeth: the lower row's place at rest is where a shut jaw closes it on the upper one
      if (head.teeth) {
        const p = voice.sounding(), shut = { ...p.articulators, jaw: 0 };
        try { bite = restBite(head.teeth, headScene(computeGeometry(shut, p.anatomy, p.teeth), p.anatomy, shut)); } catch { bite = null; }
        teethPos = new Float32Array(head.teeth.canon.length);
        const tg = teethMesh.geometry;
        tg.setAttribute('position', new THREE.BufferAttribute(teethPos, 3));
        tg.setAttribute('crown', new THREE.BufferAttribute(head.teeth.crown, 1));
        const shape = teethShape(head.teeth.canon, head.teeth.index, head.teeth.lower.length);
        tg.setAttribute('gap', new THREE.BufferAttribute(shape.gap, 1));
        tg.setAttribute('blob', new THREE.BufferAttribute(shape.blob, 3));
        // (the dental arch: the furthest each side of the upper row stands at each x, less the thickness of a tooth)
        archBins = new Float32Array(40);
        const m = head.teeth.lower.length / 2;
        for (let i = 0; i < m; i++) {
          const k = Math.round(head.teeth.canon[3 * i] / 0.4) + 4;
          if (k >= 0 && k < archBins.length) archBins[k] = Math.max(archBins[k], Math.abs(head.teeth.canon[3 * i + 2]) - 0.55);
        }
        for (let k = 1; k < archBins.length; k++) if (archBins[k] === 0) archBins[k] = archBins[k - 1] * 0.6;
        tg.setIndex(new THREE.BufferAttribute(head.teeth.index, 1));
        // (the model's own teeth give way to them)
        if (lastGeom) refresh(lastGeom);
      }
      paintDue = true;
      if (import.meta.env.DEV) Object.assign(window, { tract3d: { head, scan, headMesh, eyeMesh, hairMesh, camera, headUniforms, skin, scene, rig, scene3: () => sc, meshes: () => meshes, controls: () => controls, render: () => { dirty = true; } } });
    };

    // ---- the teeth of the far half, along their arch
    const toothGeo = new RoundedBoxGeometry(1, 1, 1, 4, 0.26);
    {
      // a crown is fullest at its middle and narrower at the gum and at its edge
      const p = toothGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = 1 - 0.12 * (2 * y) * (2 * y); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
      toothGeo.computeVertexNormals();
    }
    const solid = (rgb: Rgb, shine: number, dark: number) => new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Vector3(...rgb) }, uDepth: wallUniforms.uDepth, uShine: { value: shine }, uDark: { value: dark }, uMouth: wallUniforms.uMouth }, vertexShader: SOLID_VS, fragmentShader: SOLID_FS, side: THREE.DoubleSide,
    });
    // The far teeth bound the mouth at the side. The model's airway closes a little inside them (its sections are
    // lenses, without the gums), so its wall would hide them: they are drawn after it, among themselves by depth.
    // (they are drawn only where the wall of the airway is what is seen, never over the skin: the wall marks
    // those places as it is drawn, and its own depth is put back to far there before they are)
    const inFront = (m: THREE.Mesh, order: number) => {
      m.renderOrder = order;
      const mat = m.material as THREE.Material;
      mat.stencilWrite = true; mat.stencilFunc = THREE.EqualStencilFunc; mat.stencilRef = 1;
      mat.stencilFail = mat.stencilZFail = mat.stencilZPass = THREE.KeepStencilOp;
    };
    {
      const far = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
        vertexShader: 'void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }', fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
        colorWrite: false, depthFunc: THREE.AlwaysDepth, depthWrite: true,
        stencilWrite: true, stencilFunc: THREE.EqualStencilFunc, stencilRef: 1, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
      }));
      far.frustumCulled = false; far.renderOrder = 0.4;
      scene.add(far);
    }
    const toothMat = solid([0.92, 0.88, 0.79], 0.32, 0.7);
    // (the whole head has the scan's own teeth: drawn after the walls of the mouth, over them, and under the lips)
    const mouthParts = new MouthParts();
    const cavityMesh = new THREE.Mesh(mouthParts.cavityGeo, mouth.cavity), tongueMesh = new THREE.Mesh(mouthParts.tongueGeo, mouth.tongue);
    for (const m of [cavityMesh, tongueMesh]) { m.frustumCulled = false; m.visible = false; m.renderOrder = 0.3; scene.add(m); }
    /** the half width of the dental arch inside the teeth (world cm) at a world x, from the upper row at rest */
    let archBins = new Float32Array(0);
    const archAt = (x: number) => {
      const k = x / ((sc?.s ?? 1) * 0.4) + 4;
      const i = Math.max(0, Math.min(archBins.length - 2, Math.floor(k))), f = Math.max(0, Math.min(1, k - i));
      return ((archBins[i] ?? 0) * (1 - f) + (archBins[i + 1] ?? 0) * f) * (sc?.s ?? 1);
    };
    const teethMat = mouth.teeth;
    const teethMesh = new THREE.Mesh(new THREE.BufferGeometry(), teethMat);
    teethMesh.frustumCulled = false; teethMesh.visible = false; teethMesh.renderOrder = 0.6;
    scene.add(teethMesh);
    let teethPos = new Float32Array(0), bite: Float32Array | null = null;
    const teeth = new THREE.InstancedMesh(toothGeo, toothMat, 64);
    teeth.frustumCulled = false;
    scene.add(teeth);
    inFront(teeth, 0.6);
    const dummy = new THREE.Object3D();
    // the gums the teeth stand in: a ridge along each arch, at the necks of its teeth
    const gumMat = solid([0.74, 0.42, 0.42], 0.2, 0.26);
    const gums = [new THREE.Mesh(new THREE.BufferGeometry(), gumMat), new THREE.Mesh(new THREE.BufferGeometry(), gumMat)];
    gums.forEach((m, i) => { m.frustumCulled = false; scene.add(m); inFront(m, i === 0 ? 0.5 : 0.55); });
    const placeGums = () => {
      for (const lower of [false, true]) {
        const pts: THREE.Vector3[] = [];
        let r = 0.5;
        for (const th of meshes.teeth) {
          if (th.z > 0 || th.lower !== lower) continue;
          // (the neck of a tooth: the end of its crown away from the other arch, turned as the tooth is)
          const up = lower ? -1 : 1;
          pts.push(new THREE.Vector3(th.x - Math.sin(th.tilt) * 0.8 * th.h * up, th.y + Math.cos(th.tilt) * 0.8 * th.h * up, th.z));
          r = 0.64 * th.d;
        }
        const m = gums[lower ? 1 : 0];
        m.geometry.dispose();
        if (pts.length < 3) { m.geometry = new THREE.BufferGeometry(); continue; }
        // from the midline, where the cut face shows the gum of the front teeth
        pts.unshift(new THREE.Vector3(pts[0].x + 0.25, pts[0].y, 0));
        m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, r, 10, false);
      }
    };

    // ---- the piriform fossa of the far half: the air in it, and the water
    const pouchMat = solid([0.54, 0.23, 0.24], 0.14, 0.4);
    const waterMat = new THREE.MeshStandardMaterial({ color: 0xa9cbdc, roughness: 0.12, transparent: true, opacity: 0.55 });
    const pouchParts = [new THREE.Mesh(new THREE.BufferGeometry(), pouchMat), new THREE.Mesh(new THREE.BufferGeometry(), waterMat)];
    for (const m of pouchParts) { scene.add(m); inFront(m, 0.7); }
    let pouchKey = '';
    const UP = new THREE.Vector3(0, 1, 0);
    const placePouch = (p: Pouch) => {
      const k = [p.length, p.air, p.rOpen, p.rBottom].map((x) => x.toFixed(3)).join(',');
      const rAt = (x: number) => p.rOpen + (p.rBottom - p.rOpen) * (p.length > 0 ? x / p.length : 0);
      const parts: [number, number][] = [[0, p.air], [p.air, p.length]];
      if (k !== pouchKey) {
        pouchKey = k;
        parts.forEach(([a, b], q) => {
          const m = pouchParts[q];
          m.geometry.dispose();
          // +y toward the opening; a closed bottom on the deepest part
          m.geometry = b - a > 1e-3 ? new THREE.CylinderGeometry(rAt(a), rAt(b), b - a, 20, 1, !(b >= p.length - 1e-6)) : new THREE.BufferGeometry();
        });
      }
      const quat = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(-p.dx, -p.dy, 0));
      parts.forEach(([a, b], q) => {
        const m = pouchParts[q], c = 0.5 * (a + b);
        m.position.set(p.x + p.dx * c, p.y + p.dy * c, -p.z);
        m.quaternion.copy(quat);
        m.userData.on = b - a > 1e-3;
        m.visible = !!m.userData.on;
      });
    };

    /** The cut face and the body, for the posture that is shown: painted and placed when the head has moved, not more often than the eye needs. */
    let painted = 0, paintDue = false;
    const paintPlate = () => {
      painted = performance.now();
      paintDue = false;
      placeGums();
      if (!bd || !sc || !lastGeom) return;
      const p = voice.sounding(), s = sc.s;
      const k = PLATE.w / ((PLATE.x1 - PLATE.x0) * s);
      const world: Mat = [k, 0, 0, -k, -PLATE.x0 * s * k, PLATE.y1 * s * k];
      const lc = plateCv.getContext('2d');
      if (!lc) return;
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.clearRect(0, 0, PLATE.w, PLATE.h);
      try { paintHead(lc, sc, world, bd, lastGeom, p.articulators); } catch (e) { console.error(e); }
      plateTex.needsUpdate = true;
      plate.scale.set((PLATE.x1 - PLATE.x0) * s, (PLATE.y1 - PLATE.y0) * s, 1);
      plate.position.set(0.5 * (PLATE.x0 + PLATE.x1) * s, 0.5 * (PLATE.y0 + PLATE.y1) * s, 0);
      plate.visible = true;
      if (head?.teeth && bite && teethPos.length) {
        placeTeeth(head.teeth, bite, sc, teethPos);
        (teethMesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        teethMesh.geometry.computeVertexNormals();
        const fx = sc.place(head.teeth.front, 8.5, 0)[0];
        mouth.uniforms.uFront.value = fx; mouth.uniforms.uReach.value = 4.3 * sc.s;
        mouthParts.update(sc, archAt, fx, sc.s);
        // (the mouth is dark from the head's own front teeth back, and the airway's walls begin behind them)
        wallUniforms.uMouth.value.x = fx; wallUniforms.uMouth.value.w = fx + 0.1 * sc.s;
      }
      if (head) {
        placeHead(head, sc, headPos, lips ? lipMove(sc, lips) : undefined);
        shadeHead(head, headPos, headNormal, seamSoft);
        (headGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (headGeo.attributes.normal as THREE.BufferAttribute).needsUpdate = true;
        // (the neck's skin is whole from three centimetres above where the painted neck ends, and gone at its end)
        skin.uniforms.uFade.value.set(sc.neckEnd + 0.3 * sc.s, sc.neckEnd + 3.6 * sc.s);
        skin.uniforms.uHairLen.value = 0.34 * sc.s;
        mouth.uniforms.uCutY.value = sc.neckEnd + 7.5 * sc.s;
        for (const m of headParts) m.visible = true;
      }
      if (body) {
        placeBody(body, sc, skinPos, trayPos, lips ? lipMove(sc, lips) : undefined);
        for (const m of [skinMesh, trayMesh]) (m.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        skinMesh.geometry.computeVertexNormals();
        skinMesh.visible = trayMesh.visible = true;
        // (inside the whole head its own inner side is the dark behind the cut face: the tray would stand out of a real nose)
        if (head) trayMesh.visible = false;
      }
    };

    const refresh = (g: TractGeometry) => {
      const p = voice.sounding();
      meshes = buildTractMeshes(g, meshes);
      posAttr.needsUpdate = true;
      ringGeo.computeVertexNormals();
      sc = headScene(g, p.anatomy, p.articulators);
      wallUniforms.uDepth.value = 2.3 * g.scale;
      wallUniforms.uMouth.value.y = 3.8 * g.scale;
      if (!head?.teeth) { wallUniforms.uMouth.value.x = g.landmarks.upperEdge[0] + 0.15 * g.scale; wallUniforms.uMouth.value.w = 1e3; }
      // every wall in the colour of what it is, the two running into one another where they meet at the side
      for (let i = 0; i < rays; i++) {
        const h = g.hits[Math.min(i, g.lastRay)];
        const up = tones[h.upId ?? 'none'], low = tones[h.lowId ?? 'none'];
        // (the walls that are the lips and the incisors: a whole head has its own)
        const lipOrTooth = (id: SolidId | undefined | null) => id === 'upperLip' || id === 'lowerLip' || id === 'upperIncisor' || id === 'lowerIncisor';
        const fu = lipOrTooth(h.upId) ? 1 : 0, fl = lipOrTooth(h.lowId) ? 1 : 0;
        for (let j = 0; j < ringN; j++) {
          const q = i * ringN + j, own = j < RING_SIDE ? up : low, other = j < RING_SIDE ? low : up, m = 0.5 * lat[q] * lat[q];
          for (let c = 0; c < 3; c++) toneCol[3 * q + c] = own[c] + (other[c] - own[c]) * m;
          frontOf[q] = j < RING_SIDE ? fu : fl;
        }
      }
      toneAttr.needsUpdate = true;
      frontAttr.needsUpdate = true;
      let n = 0;
      // (the teeth come arch by arch, from the middle back, a pair at each place: in a whole head the mouth
      // shows the front ones only, the incisors and the canines; those behind them are in the cheeks' dark)
      const perArch = meshes.teeth.length / 2;
      for (let q = 0; q < meshes.teeth.length; q++) {
        const th = meshes.teeth[q];
        if (th.z > 0 && opts.current.cut) continue;
        if (!opts.current.cut && head && Math.floor((q % perArch) / 2) >= 3) continue;
        dummy.position.set(th.x, th.y, th.z);
        dummy.rotation.set(0, 0, 0);
        dummy.rotateZ(th.tilt);
        dummy.rotateY(-th.yaw);
        dummy.scale.set(th.d, th.h, th.w);
        dummy.updateMatrix();
        teeth.setMatrixAt(n++, dummy.matrix);
      }
      teeth.count = n;
      teeth.instanceMatrix.needsUpdate = true;
      placePouch(meshes.pouch);
      paintDue = true;
    };

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.zoomToCursor = true;
    controls.minDistance = 8;
    controls.maxDistance = 160;
    controls.minPolarAngle = 0.08; controls.maxPolarAngle = Math.PI - 0.08;
    let lastMove = -1e9;
    controls.addEventListener('change', () => { dirty = true; lastMove = performance.now(); });
    const preset = (p: Preset) => {
      // (how far round from straight on the cut, toward the face; the angle from straight above; the distance)
      const s0 = lastGeom?.scale ?? 1;
      const view: Record<Preset, [number, number, number]> = {
        side: [0, 1.5, 78 * s0],
        front: [Math.PI / 2, 1.5, 78 * s0],
        three: [Math.PI / 4, 1.42, 78 * s0],
        top: [-Math.PI / 2, 1.45, 78 * s0],
      };
      const [az, pol, d] = view[p];
      const tx = -0.6 * s0, ty = 12.6 * s0;
      controls.target.set(tx, ty, 0);
      camera.position.set(tx + d * Math.sin(pol) * Math.sin(az), ty + d * Math.cos(pol), d * Math.sin(pol) * Math.cos(az));
      controls.update();
      dirty = true;
    };
    presetRef.current = preset;
    preset('three');

    const resize = () => {
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      (backdropMesh.material as THREE.ShaderMaterial).uniforms.uAspect.value.set(w / h, 1);
      skin.uniforms.uAspect.value.set(w / h, 1);
      skin.uniforms.uRes.value.set(w * pr, h * pr);
      dirty = true;
    };
    // the controls over the view, measured when they change size: a label that
    // would fall under one of them is hidden
    const blocked: [number, number, number, number][] = [];
    const controlEls = Array.from(el.querySelectorAll<HTMLElement>('.overlay-top, .views3d, .overlay-bottom'));
    const measureControls = () => {
      const box = el.getBoundingClientRect();
      blocked.length = 0;
      for (const c of controlEls) {
        const r = c.getBoundingClientRect();
        if (r.width > 0) blocked.push([r.left - box.left, r.top - box.top, r.right - box.left, r.bottom - box.top]);
      }
    };
    resize();
    measureControls();
    const ro = new ResizeObserver(() => { resize(); measureControls(); });
    ro.observe(el);
    for (const c of controlEls) ro.observe(c);

    const v = new THREE.Vector3();
    const placed: [number, number][] = [];
    let raf = 0, shown = '', wasSounding = false;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      // the painting, when it has arrived: its colours for the walls, its silhouette for the body
      if (!bd) {
        bd = getBackdrop();
        if (bd) {
          tones = wallTones(bd);
          const tr = rgbOf(bd.tone.tissue, [0.47, 0.15, 0.16]);
          trayMat.color.setRGB(tr[0] * 0.2, tr[1] * 0.2, tr[2] * 0.2, THREE.SRGBColorSpace);
          (pouchMat.uniforms.uColor.value as THREE.Vector3).set(...mix(tones.larynx, tones.floor, 0.5));
          (gumMat.uniforms.uColor.value as THREE.Vector3).set(...mix(rgbOf(bd.tone.mucosa, [0.79, 0.61, 0.55]), tones.tongue, 0.6));
          body = buildBody(bd.img, lips ?? undefined);
          if (body) {
            skinPos = new Float32Array(body.count * 3); trayPos = new Float32Array(body.trayDepth.length * 3);
            skinMesh.geometry.setAttribute('position', new THREE.BufferAttribute(skinPos, 3));
            skinMesh.geometry.setAttribute('uv', new THREE.BufferAttribute(body.uv, 2));
            skinMesh.geometry.setIndex(new THREE.BufferAttribute(body.index, 1));
            trayMesh.geometry.setAttribute('position', new THREE.BufferAttribute(trayPos, 3));
            trayMesh.geometry.setIndex(new THREE.BufferAttribute(body.trayIndex, 1));
          }
          paintSkin();
          lastGeom = null;
        }
      }
      makeHead();
      const { geom } = store.derived();
      if (geom !== lastGeom) { lastGeom = geom; refresh(geom); dirty = true; }
      if (paintDue && now - painted >= REPAINT * 1000) { paintPlate(); dirty = true; }
      const o = opts.current;
      // the sound field on the walls of the airway
      const tel = store.ui.audioOn ? store.telemetry : null;
      const mode = store.ui.field;
      if (tel) {
        const ray = meshes.air.ray;
        let prev = -1, r = 0, gc = 0, b = 0;
        for (let q = 0; q < ray.length; q++) {
          if (ray[q] !== prev) { prev = ray[q]; [r, gc, b] = fieldRgb(fieldAt(geom, prev, mode, tel)); }
          fieldCol[3 * q] = r / 255; fieldCol[3 * q + 1] = gc / 255; fieldCol[3 * q + 2] = b / 255;
        }
        fieldAttr.needsUpdate = true;
        dirty = true;
      }
      if (!!tel !== wasSounding) { wasSounding = !!tel; dirty = true; }
      wallUniforms.uField.value = tel ? 0.86 : 0;
      const key2 = `${o.cut}|${o.tissues}|${o.labels}|${mode}`;
      if (key2 !== shown) { shown = key2; dirty = true; if (lastGeom) refresh(lastGeom); }
      controls.update();
      // (the picture is drawn coarser while the head is being turned, and sharp when it rests)
      const moving = now - lastMove < 260;
      if (moving !== (pr === prLow) && prLow !== prHigh) { pr = moving ? prLow : prHigh; renderer.setPixelRatio(pr); skin.uniforms.uRes.value.set(el.clientWidth * pr, el.clientHeight * pr); dirty = true; }
      if (!dirty) return;
      dirty = false;
      // (the lights go with the eye; the studio's light turns round the head with it)
      rig.target.position.copy(controls.target);
      scene.environmentRotation.y = azimuth(camera, controls.target);
      // cut open: the far half and the cut face. Whole: both halves of everything, the cut face left out (it
      // is inside). Without the tissues: the airway alone, its walls all round when the head is whole.
      const whole = !o.cut && !!head;
      // (the head shows its own mouth when it is whole, and when cut open it is seen from outside, from the far
      // side; from the side of the cut, its anatomy shows the model's, in the hollow behind the painted section)
      const ownTeeth = o.tissues && !!head?.teeth && !!bite && (!o.cut || camera.position.z < 0);
      wallUniforms.uMouth.value.z = whole && o.tissues ? 1 : 0;
      cast.visible = !o.cut && !head;
      nearWall.visible = whole && !ownTeeth;
      hollow.visible = !ownTeeth;
      for (const m of pouchParts) m.visible = !ownTeeth && !!m.userData.on;
      plateUniforms.uOpacity.value = whole ? 0 : o.tissues ? 1 : 0.16;
      // the scanned head is the skin; the half body raised from the silhouette stands in for it until it has come
      skinMesh.visible = !!body && plate.visible && o.tissues && !head;
      for (const m of headParts) m.visible = !!head && plate.visible && o.tissues;
      const clips = o.cut ? [clip] : [];
      for (const m of [skin.material, skin.hairMaterial, eyeMat, innerMat, mouth.teeth, mouth.tongue, mouth.cavity]) m.clippingPlanes = clips;
      teethMesh.visible = ownTeeth && headMesh.visible;
      cavityMesh.visible = tongueMesh.visible = teethMesh.visible;
      teeth.visible = !ownTeeth;
      for (const m of gums) m.visible = !ownTeeth;
      // (where the eye of the view is, in the head's own centimetres: the eyes look toward it)
      eyeU.uLook.value.copy(camera.position).multiplyScalar(1 / (sc?.s || 1));
      plate.visible = plate.visible && true;
      renderer.render(scene, camera);
      // labels, the later ones hidden where they would cover an earlier one or a control
      const w = el.clientWidth, h = el.clientHeight;
      placed.length = 0;
      for (const k of ANCHORS) {
        const span = labelEls.current[k];
        if (!span) continue;
        const a = meshes.anchors[k];
        // (they name what is inside: shown when the eye is on the side of the cut, or the tissues are off)
        const inside = !o.tissues || !head || (o.cut && camera.position.z > 0.15 * Math.abs(camera.position.x));
        if (!o.labels || !a || !inside) { span.style.display = 'none'; continue; }
        // (what is named lies on the cut face or in the far half behind it)
        v.set(a[0], a[1], k === 'teeth' ? 0 : -Math.abs(a[2])).project(camera);
        const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
        const covered = placed.some(([px, py]) => Math.abs(px - x) < 70 && Math.abs(py - y) < 16)
          || blocked.some(([x0, y0, x1, y1]) => x + 40 > x0 && x - 40 < x1 && y + 9 > y0 && y - 9 < y1);
        if (v.z > 1 || v.z < -1 || covered) { span.style.display = 'none'; continue; }
        placed.push([x, y]);
        span.style.display = '';
        span.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      photo.onload = null;
      for (const g of [ringGeo, hollowGeo, castGeo, plate.geometry, skinMesh.geometry, trayMesh.geometry, toothGeo]) g.dispose();
      for (const m of [wallMat, glassMat, plateMat, skinMat, trayMat, toothMat, gumMat, pouchMat, waterMat]) m.dispose();
      for (const m of gums) m.geometry.dispose();
      plateTex.dispose(); skinTex.dispose(); blankAlbedo.dispose(); blankDetail.dispose(); skin.material.dispose(); skin.hairMaterial.dispose(); eyeMat.dispose(); innerMat.dispose(); headGeo.dispose(); eyeGeo.dispose(); hairMesh.geometry.dispose(); mouth.teeth.dispose(); mouth.tongue.dispose(); mouth.cavity.dispose(); mouthParts.dispose(); teethMesh.geometry.dispose();
      teeth.dispose();
      for (const m of pouchParts) m.geometry.dispose();
      scene.environment?.dispose();
      backdropMesh.geometry.dispose(); (backdropMesh.material as THREE.Material).dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  // numbers on demand: the passages the cross-sections give
  let numbers = '';
  if (ui.numbers) {
    const { geom, af } = store.derived();
    let narrow = Infinity, lateral = 0;
    for (let i = 0; i <= geom.lastRay; i++) {
      if (geom.s[i] < 2.6 * geom.scale) continue;
      narrow = Math.min(narrow, geom.hits[i].area);
      lateral = Math.max(lateral, geom.hits[i].d <= 0 ? geom.hits[i].lateral : 0);
    }
    let cavity = 0;
    if (af.supralingual && af.supralingual.at >= 0) for (const x of af.supralingual.areas) if (x > 1e-3) cavity += af.dx;
    numbers = L({
      it: `passaggio più stretto ${narrow.toFixed(2)} cm²` + (lateral > 0 ? ` · canali laterali ${lateral.toFixed(2)} cm² · cavità sopralinguale ${cavity.toFixed(1)} cm` : '') + ` · seni piriformi: ${geom.piriform.length.toFixed(1)} cm d’aria`,
      en: `narrowest passage ${narrow.toFixed(2)} cm²` + (lateral > 0 ? ` · lateral channels ${lateral.toFixed(2)} cm² · supralingual cavity ${cavity.toFixed(1)} cm` : '') + ` · piriform fossae: ${geom.piriform.length.toFixed(1)} cm of air`,
    });
  }

  const fields: [FieldMode, string][] = [['pressure', t('fieldPressure')], ['velocity', t('fieldVelocity')], ['air', t('fieldAir')]];
  const presets: [Preset, { it: string; en: string }][] = [
    ['side', { it: 'lato', en: 'side' }], ['three', { it: '¾', en: '¾' }], ['front', { it: 'davanti', en: 'front' }], ['top', { it: 'dietro', en: 'back' }],
  ];
  return (
    <div className="tract3d" ref={host}>
      <div className="labels3d" aria-hidden>
        {ANCHORS.map((k) => <span key={k} ref={(e) => { labelEls.current[k] = e; }} className={`l3d l3d-${k}`}>{L(LABELS[k])}</span>)}
      </div>
      <div className="overlay-top">
        <div className="seg">
          {fields.map(([id, name]) => <button key={id} className={ui.field === id ? 'on' : ''} onClick={() => store.setUi({ field: id })}>{name}</button>)}
        </div>
      </div>
      <div className="overlay-top right">
        <button className={cut ? 'chip on' : 'chip'} title={L({ it: 'L’aria tagliata a metà con la testa, o intera: un calco che esce dal taglio', en: 'The air cut in half with the head, or whole: a cast standing out of the cut' })} onClick={() => setCut(!cut)}>{L({ it: 'Spaccato', en: 'Cutaway' })}</button>
        <button className={tissues ? 'chip on' : 'chip'} title={L({ it: 'La faccia del taglio, o il solo canale dell’aria dietro di essa', en: 'The cut face of the head, or only the airway behind it' })} onClick={() => setTissues(!tissues)}>{L({ it: 'Tessuti', en: 'Tissues' })}</button>
        <button className={labels ? 'chip on' : 'chip'} onClick={() => setLabels(!labels)}>Aa</button>
      </div>
      <div className="views3d seg">
        {presets.map(([id, name]) => <button key={id} onClick={() => presetRef.current(id)}>{L(name)}</button>)}
      </div>
      <div className="overlay-bottom hint">
        {lost === 'nowebgl'
          ? L({ it: 'Questo browser non offre WebGL: la vista 3D non è disponibile.', en: 'This browser offers no WebGL: the 3D view is not available.' })
          : lost === 'lost'
            ? L({ it: 'La scheda grafica ha perso il contesto: cambia vista e torna qui.', en: 'The graphics context was lost: switch views and come back.' })
            : numbers || L({ it: 'Trascina per girare, rotella per avvicinarti. Una testa tagliata a metà: il canale dell’aria entra nella metà rimasta.', en: 'Drag to turn, scroll to zoom. A head cut down the middle: its airway runs into the far half.' })}
      </div>
    </div>
  );
}
