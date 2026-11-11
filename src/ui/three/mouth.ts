/**
 * The inside of the mouth of the whole head, made to be seen from every side and with every opening:
 *
 *  - the vault: a closed, smooth lining from the teeth back to the throat (the palate above with its cross ridges, the
 *    sides, the floor), as wide as the dental arch is, lit by the opening only and so darker and redder the deeper it
 *    lies, down to the soft dark of the throat: never black, never a hole;
 *  - the tongue: lofted from the model's own tongue (the section the scene gives: its back, its tip, its under side),
 *    as wide as the mouth lets it be, rounded, with its midline groove, its papillae and its wet shine, moving as the
 *    model's tongue moves;
 *  - the teeth: the scan's enamel (translucent and cool at the biting edge, warmer toward the neck, darker where
 *    one crown meets the next), the gum round their necks.
 *
 * All of it is three.js's physical material, so that the studio's lights and its image-based light shine on it as on
 * the skin; the light inside is the opening's: one number per point, how far it lies behind the front teeth.
 */
import * as THREE from 'three';
import type { HeadScene } from '../head/scene';
import { BACKDROP_GLSL } from './studio';

export interface MouthUniforms {
  /** the world x of the front of the upper teeth, and how deep the light goes into the mouth (cm) */
  uFront: { value: number };
  uReach: { value: number };
  /** below this world height the inside of the head's skin is not drawn (the inside of the neck) */
  uCutY: { value: number };
  /** the view's aspect and size in pixels (the same objects as the skin's): what is not to be seen is drawn in the backdrop's colour */
  uAspect: { value: THREE.Vector2 };
  uRes: { value: THREE.Vector2 };
}

const PARS_VS = 'attribute float crown; attribute float gap; attribute vec3 blob; varying float vCrown; varying float vGap; varying vec3 vBlob; varying vec3 vWP;';
const PARS_FS = `
varying float vCrown; varying float vGap; varying vec3 vBlob; varying vec3 vWP;
uniform float uFront; uniform float uReach; uniform float uCutY; uniform vec2 uAspect; uniform vec2 uRes;
${BACKDROP_GLSL}
float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
/** how much of the opening's light reaches a point: all of it at the front, down to a dim red glow in the throat */
float mouthLight( vec3 p ) {
  float d = clamp( ( uFront - p.x ) / uReach, 0.0, 1.5 );
  return mix( 1.0, 0.07, pow( smoothstep( 0.0, 1.3, d ), 0.75 ) );
}`;

function patch(m: THREE.MeshPhysicalMaterial, u: MouthUniforms, kind: 'teeth' | 'tongue' | 'cavity', dim = 1): void {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n${PARS_VS}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCrown = crown; vGap = gap; vBlob = blob; vWP = position;');
    let fs = s.fragmentShader.replace('#include <common>', `#include <common>\n${PARS_FS}`);
    // the colour of what it is
    const color = {
      teeth: `
        // enamel: cool and clear at the biting edge, ivory over the body, warm and darker toward the neck, the gum above that
        vec3 enamel = mix( vec3( 0.52, 0.55, 0.57 ), vec3( 0.80, 0.72, 0.56 ), smoothstep( 0.0, 0.34, vCrown ) );
        enamel = mix( enamel, vec3( 0.66, 0.5, 0.36 ), smoothstep( 0.45, 0.78, vCrown ) );
        enamel *= 0.93 + 0.1 * vn3( vWP * 9.0 );
        vec3 gum = mix( vec3( 0.5, 0.15, 0.15 ), vec3( 0.36, 0.075, 0.08 ), smoothstep( 0.8, 1.0, vCrown ) );
        gum *= 0.9 + 0.2 * vn3( vWP * 14.0 );
        diffuseColor.rgb = mix( enamel, gum, smoothstep( 0.82, 0.96, vCrown ) );
        // where one crown meets the next, and in the gum's fold: dark
        diffuseColor.rgb *= 1.0 - 0.72 * vGap;`,
      tongue: `
        float coat = smoothstep( 0.0, 1.0, vn3( vWP * vec3( 3.0, 1.5, 3.0 ) ) ) * smoothstep( 4.2, 2.0, vWP.x ) * smoothstep( 0.5, 1.2, vWP.x );
        vec3 flesh = mix( vec3( 0.46, 0.085, 0.085 ), vec3( 0.58, 0.16, 0.15 ), vn3( vWP * 5.0 ) );
        flesh = mix( flesh, vec3( 0.62, 0.42, 0.37 ), 0.34 * coat );
        float groove = exp( -pow( vWP.z / 0.14, 2.0 ) );
        flesh *= 1.0 - 0.2 * groove;
        flesh *= 0.92 + 0.16 * vn3( vWP * 22.0 );
        diffuseColor.rgb = flesh;`,
      cavity: `
        float ridges = 0.5 + 0.5 * sin( vWP.x * 15.0 + 2.0 * vn3( vWP * 2.0 ) );
        float roof = smoothstep( 0.2, 0.9, vBlob.y );
        vec3 mucosa = mix( vec3( 0.42, 0.095, 0.095 ), vec3( 0.52, 0.2, 0.19 ), roof * ( 0.3 + 0.7 * ridges ) );
        mucosa *= 0.88 + 0.24 * vn3( vWP * 11.0 );
        diffuseColor.rgb = mucosa;`,
    }[kind];
    fs = fs.replace('#include <map_fragment>', `#include <map_fragment>\n${color}`);
    // the bump of what it is
    const bump = kind === 'tongue'
      ? `float hh = 0.55 * vn3( vWP * 24.0 ) + 0.45 * vn3( vWP * 11.0 ); float bs = 0.06;`
      : kind === 'cavity' ? 'float hh = vn3( vWP * 20.0 ) * 0.6 + 0.4 * ( 0.5 + 0.5 * sin( vWP.x * 15.0 ) ); float bs = 0.05;' : '';
    if (bump) {
      fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          ${bump}
          vec3 sx = dFdx( - vViewPosition ), sy = dFdy( - vViewPosition );
          float dx = dFdx( hh ), dy = dFdy( hh );
          vec3 r1 = cross( sy, normal ), r2 = cross( normal, sx );
          float det = dot( sx, r1 );
          normal = normalize( abs( det ) * normal - bs * sign( det ) * ( dx * r1 + dy * r2 ) );
        }`);
    }
    // the light the opening lets in, and the red that comes back from the walls
    fs = fs.replace('#include <opaque_fragment>', `
      {
        float ml = mouthLight( vWP );
        ${kind === 'teeth' ? 'ml *= 1.0 - 0.35 * smoothstep( 0.55, 1.0, vCrown );' : ''}
        ${kind === 'cavity' ? ( dim < 1 ? 'ml = 0.55 + 0.45 * ml;' : 'ml *= 1.0 - 0.8 * smoothstep( 0.8, 3.0, abs( vWP.z ) );' ) : ''}
        outgoingLight *= ml * ${dim.toFixed(2)};
        outgoingLight += vec3( 0.045, 0.008, 0.007 ) * ( 0.4 + 0.6 * ml );
      }
      #include <opaque_fragment>`);
    // (the inside of the neck, seen from below: the backdrop's own colour, so that the neck ends in nothing)
    if (dim < 1) fs = fs.replace('#include <dithering_fragment>', '#include <dithering_fragment>\nif ( vWP.y < uCutY || ( vWP.y < uCutY + 10.0 && vWP.x < 2.6 ) ) gl_FragColor = vec4( backdropColor( gl_FragCoord.xy / uRes * 2.0 - 1.0, uAspect, gl_FragCoord.xy ), 1.0 );');
    s.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => `vw-mouth-${kind}-1`;
}

/** The inside of the head's skin where it is seen from within (the cheeks' lining at the corners of the mouth): the vault's own mucosa. */
export function innerMaterial(u: MouthUniforms): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, ior: 1.38, clearcoat: 0.3, clearcoatRoughness: 0.3, side: THREE.BackSide });
  patch(m, u, 'cavity', 0.75);
  m.customProgramCacheKey = () => 'vw-mouth-inner-1';
  return m;
}

export interface MouthMaterials { teeth: THREE.MeshPhysicalMaterial; tongue: THREE.MeshPhysicalMaterial; cavity: THREE.MeshPhysicalMaterial; uniforms: MouthUniforms }

export function mouthMaterials(view: { uAspect: MouthUniforms['uAspect']; uRes: MouthUniforms['uRes'] }): MouthMaterials {
  const uniforms: MouthUniforms = { uFront: { value: 9 }, uReach: { value: 4.2 }, uCutY: { value: -1e3 }, uAspect: view.uAspect, uRes: view.uRes };
  const teeth = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0, ior: 1.6, clearcoat: 0.6, clearcoatRoughness: 0.12, sheen: 0, side: THREE.DoubleSide });
  const tongue = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0, ior: 1.38, clearcoat: 0.7, clearcoatRoughness: 0.22, side: THREE.DoubleSide });
  const cavity = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, ior: 1.38, clearcoat: 0.45, clearcoatRoughness: 0.3, side: THREE.DoubleSide });
  patch(teeth, uniforms, 'teeth'); patch(tongue, uniforms, 'tongue'); patch(cavity, uniforms, 'cavity');
  return { teeth, tongue, cavity, uniforms };
}

/** Per point of the teeth: how much it is at the side of its crown, where the next crown meets it (`gap`), and the direction of a round crown there (`blob`). */
export function teethShape(canon: Float32Array, index: Uint32Array, count: number): { gap: Float32Array; blob: Float32Array } {
  const root = Int32Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => { while (root[i] !== i) { root[i] = root[root[i]]; i = root[i]; } return i; };
  for (let t = 0; t < index.length; t += 3) { const a = find(index[t]); root[find(index[t + 1])] = a; root[find(index[t + 2])] = a; }
  const sum = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < count; i++) {
    const r = find(i), s = sum.get(r) ?? [0, 0, 0, 0];
    s[0] += canon[3 * i]; s[1] += canon[3 * i + 1]; s[2] += canon[3 * i + 2]; s[3]++;
    sum.set(r, s);
  }
  const gap = new Float32Array(count), blob = new Float32Array(3 * count);
  const half = new Map<number, number>();
  const arch = (x: number, z: number): [number, number] => { const dx = x - 3.0, dz = z; const l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
  for (let i = 0; i < count; i++) {
    const r = find(i), s = sum.get(r)!, cx = s[0] / s[3], cy = s[1] / s[3], cz = s[2] / s[3];
    const [tx, tz] = arch(cx, cz);
    const p = (canon[3 * i] - cx) * tx + (canon[3 * i + 2] - cz) * tz;
    half.set(r, Math.max(half.get(r) ?? 0.05, Math.abs(p)));
    const dx = canon[3 * i] - cx, dy = canon[3 * i + 1] - cy, dz = canon[3 * i + 2] - cz, l = Math.hypot(dx, dy, dz) || 1;
    blob[3 * i] = dx / l; blob[3 * i + 1] = dy / l; blob[3 * i + 2] = dz / l;
  }
  for (let i = 0; i < count; i++) {
    const r = find(i), s = sum.get(r)!, cx = s[0] / s[3], cz = s[2] / s[3];
    const [tx, tz] = arch(cx, cz);
    const p = Math.abs((canon[3 * i] - cx) * tx + (canon[3 * i + 2] - cz) * tz) / half.get(r)!;
    const x = Math.min(1, Math.max(0, (p - 0.62) / 0.34));
    gap[i] = x * x * (3 - 2 * x);
  }
  return { gap, blob };
}

const smooth = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

/** y of a polyline of (x, y) pairs at x: the highest (or lowest) place where it crosses that x. */
function crossing(pts: ArrayLike<number>, x: number, top: boolean): number | null {
  let best: number | null = null;
  for (let i = 0; i + 3 < pts.length + 0; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
    if ((x0 - x) * (x1 - x) > 0 || x0 === x1) continue;
    const y = y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    if (best === null || (top ? y > best : y < best)) best = y;
  }
  return best;
}

const K = 22, R = 30, M = 20;

/** The vault and the tongue, as geometry that is re-made from the model's scene whenever the posture changes. */
export class MouthParts {
  readonly cavityGeo = new THREE.BufferGeometry();
  readonly tongueGeo = new THREE.BufferGeometry();
  private cavP = new Float32Array(3 * ((K + 1) * R + 1));
  private tonP = new Float32Array(3 * ((M + 1) * R + 1));

  constructor() {
    const idx = (rings: number, closeFront: boolean) => {
      const out: number[] = [];
      for (let k = 0; k < rings; k++) for (let j = 0; j < R; j++) {
        const a = k * R + j, b = k * R + (j + 1) % R, c = a + R, d = b + R;
        out.push(a, c, b, b, c, d);
      }
      const last = rings * R, cap = (rings + 1) * R;
      for (let j = 0; j < R; j++) out.push(last + j, cap, last + (j + 1) % R);
      if (closeFront) for (let j = 0; j < R; j++) out.push(j, (j + 1) % R, cap + 1);
      return out;
    };
    this.cavityGeo.setAttribute('position', new THREE.BufferAttribute(this.cavP, 3));
    this.cavityGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.cavP.length), 3));
    this.cavityGeo.setAttribute('blob', new THREE.BufferAttribute(new Float32Array(this.cavP.length), 3));
    this.cavityGeo.setAttribute('crown', new THREE.BufferAttribute(new Float32Array(this.cavP.length / 3), 1));
    this.cavityGeo.setAttribute('gap', new THREE.BufferAttribute(new Float32Array(this.cavP.length / 3), 1));
    this.cavityGeo.setIndex(idx(K, false));
    this.tongueGeo.setAttribute('position', new THREE.BufferAttribute(this.tonP, 3));
    this.tongueGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.tonP.length), 3));
    this.tongueGeo.setAttribute('blob', new THREE.BufferAttribute(new Float32Array(this.tonP.length), 3));
    this.tongueGeo.setAttribute('crown', new THREE.BufferAttribute(new Float32Array(this.tonP.length / 3), 1));
    this.tongueGeo.setAttribute('gap', new THREE.BufferAttribute(new Float32Array(this.tonP.length / 3), 1));
    this.tongueGeo.setIndex(idx(M, false));
  }

  /**
   * Makes the vault and the tongue for a posture. `arch(x)`: the half width of the dental arch inside the teeth at
   * world x; `front`: the world x of the front of the upper teeth; `s`: world cm per canonical cm.
   */
  update(sc: HeadScene, arch: (x: number) => number, front: number, s: number): void {
    const tg = sc.tongue, up = sc.upper;
    // the model's tongue: its tip (the front-most place) and its back
    let tipX = -1e9, backX = 1e9;
    for (let i = 0; i < tg.length; i += 2) { tipX = Math.max(tipX, tg[i]); backX = Math.min(backX, tg[i]); }
    backX = Math.max(backX, -0.3 * s);
    const roof = (x: number) => {
      // (the palate: the highest place of the air's upper edge there, above the mouth's own height)
      let best: number | null = null;
      for (let i = 0; i + 3 < up.length; i += 2) {
        const x0 = up[i], y0 = up[i + 1], x1 = up[i + 2], y1 = up[i + 3];
        if (Math.min(y0, y1) < 7.6 * s || (x0 - x) * (x1 - x) > 0 || x0 === x1) continue;
        const y = y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
        if (best === null || y > best) best = y;
      }
      return best;
    };
    let lastRoof = 9.3 * s;
    const roofAt = (x: number) => { const r = roof(Math.min(x, 5.7 * s)); if (r !== null) lastRoof = r; return lastRoof; };
    // ---- the vault
    const xF = front - 0.7 * s, xB = -0.55 * s;
    const P = this.cavP;
    const floorAt = (x: number) => {
      const t = crossing(tg, x, true);
      if (t !== null && x <= tipX) return t - 1.0 * s;
      return 5.0 * s;
    };
    for (let k = 0; k <= K; k++) {
      const x = xF + (xB - xF) * (k / K);
      const yT = Math.max(roofAt(x) + 0.15 * s, 8.4 * s + 2.0 * s * smooth((x - 5.2 * s) / (2.2 * s)));
      const yB = Math.min(floorAt(x), yT - 0.8 * s);
      const w = (Math.max(0.5 * s, arch(x)) + 0.5 * s) * (0.8 + 0.2 * smooth((x - xB) / (3.2 * s))) * (0.6 + 0.4 * smooth((xF - x) / (2.4 * s)));
      const yc = 0.5 * (yT + yB), h = 0.5 * (yT - yB);
      const shrink = k === K ? 0.45 : 1;
      for (let j = 0; j < R; j++) {
        const a = (2 * Math.PI * j) / R, c = Math.cos(a), sn = Math.sin(a);
        const e = 2 / 2.0;
        P[3 * (k * R + j)] = x;
        P[3 * (k * R + j) + 1] = yc + shrink * h * Math.sign(sn) * Math.pow(Math.abs(sn), e);
        P[3 * (k * R + j) + 2] = shrink * w * Math.sign(c) * Math.pow(Math.abs(c), e);
      }
    }
    const cap = (K + 1) * R;
    P[3 * cap] = xB - 0.6 * s; P[3 * cap + 1] = 0.5 * (roofAt(xB) + floorAt(xB)); P[3 * cap + 2] = 0;
    // ---- the tongue
    const T = this.tonP;
    const x0 = backX, x1 = tipX - 0.05 * s;
    for (let k = 0; k <= M; k++) {
      const x = x0 + (x1 - x0) * (k / M);
      const top = crossing(tg, x, true) ?? 6 * s, bot0 = crossing(tg, x, false) ?? top - 3 * s;
      const bot = Math.max(bot0, top - 2.6 * s);
      const fromTip = (x1 - x) / (1.5 * s), tip = fromTip < 1 ? Math.sqrt(Math.max(0, 1 - (1 - fromTip) * (1 - fromTip))) : 1;
      const fromBack = (x - x0) / (0.9 * s), back = fromBack < 1 ? 0.55 + 0.45 * smooth(fromBack) : 1;
      const w = Math.max(0.3 * s, arch(Math.max(x, 2.6 * s)) + 0.25 * s) * tip * back;
      const yc = 0.5 * (top + bot), h = 0.5 * (top - bot);
      for (let j = 0; j < R; j++) {
        const a = (2 * Math.PI * j) / R, c = Math.cos(a), sn = Math.sin(a);
        const e = 2 / 2.4;
        T[3 * (k * R + j)] = x;
        T[3 * (k * R + j) + 1] = yc + h * Math.sign(sn) * Math.pow(Math.abs(sn), e) - (sn > 0 ? 0.1 * s * Math.exp(-Math.pow((w * c) / (0.3 * s), 2)) : 0);
        T[3 * (k * R + j) + 2] = w * Math.sign(c) * Math.pow(Math.abs(c), e);
      }
    }
    const tc = (M + 1) * R;
    T[3 * tc] = tipX + 0.15 * s; T[3 * tc + 1] = 0.5 * ((crossing(tg, x1, true) ?? 6 * s) + (crossing(tg, x1, false) ?? 5 * s)); T[3 * tc + 2] = 0;
    for (const [g, n] of [[this.cavityGeo, this.cavP.length / 3], [this.tongueGeo, this.tonP.length / 3]] as const) {
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
      // (the vault's roof is where its outward normal looks up: the ridges)
      const nrm = g.attributes.normal as THREE.BufferAttribute, blob = g.attributes.blob as THREE.BufferAttribute;
      for (let i = 0; i < n; i++) blob.setXYZ(i, nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      blob.needsUpdate = true;
    }
    this.cavityGeo.computeBoundingSphere(); this.tongueGeo.computeBoundingSphere();
  }

  dispose(): void { this.cavityGeo.dispose(); this.tongueGeo.dispose(); }
}
