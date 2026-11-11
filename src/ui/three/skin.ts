/**
 * The skin, the buzz-cut hair and the neck's end of the whole head, as three.js's physical material with
 * the parts of a skin shader grafted into it (so that the studio's lights and its image-based light, the
 * tone mapping and the colour management are three.js's own):
 *
 *  - the albedo is the baked skin picture (public/head3d/skin.jpg), a little de-lit (the photographs have their
 *    own light in them) and tinted where the skin is the inside of the lips;
 *  - subsurface scattering, as the diffuse term: a wrap of the light round the terminator that goes further
 *    for red than for green and for blue (so the shadow's edge is warm), and light that comes through the thin
 *    places (ears, wings of the nose) when it is behind them;
 *  - a thin oily layer: GGX with a roughness picture (shiny on the forehead, nose and lips, matte on the
 *    stubble), a clear coat for the oil, a sheen for the fine down, Fresnel everywhere;
 *  - pores and stubble as a bump (public/head3d/skin-detail.jpg, red), cavity and thickness at every point of
 *    the head (public/head3d/skin-ao.bin, baked from the mesh by scripts/head3d-detail.py);
 *  - the end of the neck fading out (alpha to coverage, so no sorting), the inside of the lips wet.
 *
 * The hair is shells: the same head drawn again and again, each a little further out along the normal, and each
 * showing only the strands that are tall enough to reach it, where the picture's hair mask has hair.
 */
import * as THREE from 'three';
import { BACKDROP_GLSL } from './studio';

export interface SkinUniforms {
  /** the world height where the neck's skin is gone, and where it is whole again (the fade runs between) */
  uFade: { value: THREE.Vector2 };
  uDelight: { value: number };
  /** how far the hair stands out (world cm) */
  uHairLen: { value: number };
  /** the view's aspect and its size in pixels: the neck fades into the backdrop, which is a function of the screen */
  uAspect: { value: THREE.Vector2 };
  uRes: { value: THREE.Vector2 };
  /** the eyeballs (middle, radius), for the lashes: set by the view from the eyes' own uniforms */
  uEyeL: { value: THREE.Vector4 };
  uEyeR: { value: THREE.Vector4 };
}

const COMMON_VS = `
attribute vec3 canon; attribute vec3 facing; attribute float kind; attribute vec3 aoThin;
varying vec3 vCanon; varying vec3 vFacing; varying float vKind; varying vec3 vAoThin; varying vec3 vWPos; varying vec3 vObjN;`;

const COMMON_FS = `
varying vec3 vCanon; varying vec3 vFacing; varying float vKind; varying vec3 vAoThin; varying vec3 vWPos; varying vec3 vObjN;
uniform vec2 uFade; uniform float uDelight; uniform float uHairLen; uniform vec2 uAspect; uniform vec2 uRes; uniform vec4 uEyeL; uniform vec4 uEyeR;
${BACKDROP_GLSL}
vec3 gSmoothN = vec3(0.0, 0.0, 1.0); vec3 gHairT = vec3(0.0, 1.0, 0.0); float gThin = 0.0; float gSSS = 1.0; float gHair = 0.0;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }`;

/** the lights_physical chunk with the diffuse term replaced by the skin's (wrap and transmission), and the hair's highlight added */
function physicalChunk(): string {
  let c = THREE.ShaderChunk.lights_physical_pars_fragment;
  const diffuse = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
  if (!c.includes(diffuse)) throw new Error('lights_physical_pars_fragment has changed: the skin shader needs updating');
  c = c.replace(diffuse, `
	{
		// light that goes in the skin comes out round the terminator: red furthest, then green, blue hardly
		float nlS = mix( dot( gSmoothN, directLight.direction ), dot( geometryNormal, directLight.direction ), 0.6 );
		vec3 wrap = vec3( 0.62, 0.3, 0.12 ) * gSSS;
		vec3 w = clamp( ( vec3( nlS ) + wrap ) / ( 1.0 + wrap ), 0.0, 1.0 );
		w = w * w * ( 3.0 - 2.0 * w ) * ( 1.0 + 0.5 * wrap );
		reflectedLight.directDiffuse += directLight.color * w * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
		// and through thin places, from behind
		float tr = pow( saturate( dot( geometryViewDir, - directLight.direction ) ), 2.5 ) * 0.9 + saturate( - dot( gSmoothN, directLight.direction ) ) * 0.2;
		reflectedLight.directDiffuse += directLight.color * material.diffuseContribution * vec3( 1.0, 0.36, 0.2 ) * tr * gThin * 1.3;
		if ( gHair > 0.0 ) {
			// a short hair is lit along its length: the highlight is where the light's half vector is square to the strand
			vec3 H = normalize( directLight.direction + geometryViewDir );
			float tH = dot( gHairT, H );
			float kk = pow( sqrt( max( 0.0, 1.0 - tH * tH ) ), 40.0 );
			reflectedLight.directSpecular += directLight.color * kk * 0.22 * gHair * saturate( dot( gSmoothN, directLight.direction ) * 0.6 + 0.4 );
		}
	}`);
  return c;
}

function patch(m: THREE.MeshPhysicalMaterial, u: SkinUniforms, hair: boolean): void {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    let vs = s.vertexShader;
    vs = vs.replace('#include <common>', `#include <common>\n${COMMON_VS}\n${hair ? 'attribute float aShell; uniform float uHairLen;' : ''}`);
    vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
      vCanon = canon; vFacing = facing; vKind = kind; vAoThin = aoThin; vObjN = normal;
      ${hair ? 'transformed += normalize(normal) * uHairLen * aShell;' : ''}
      vWPos = transformed;`);
    s.vertexShader = vs;
    let fs = s.fragmentShader;
    fs = fs.replace('#include <common>', `#include <common>\n${COMMON_FS}`);
    fs = fs.replace('#include <lights_physical_pars_fragment>', physicalChunk());
    fs = fs.replace('#include <map_fragment>', `#include <map_fragment>
      vec4 dtl = texture2D( roughnessMap, vRoughnessMapUv );
      float hairM = dtl.b;
      vec3 base = diffuseColor.rgb;
      base = mix( vec3( dot( base, vec3( 0.2126, 0.7152, 0.0722 ) ) ), base, 0.9 );
      // the inner side of the lips, turned into the mouth: wet mucosa
      float mouth = ( 1.0 - smoothstep( 3.0, 4.2, abs( vCanon.z ) ) ) * smoothstep( 5.8, 6.8, vCanon.y ) * ( 1.0 - smoothstep( 9.6, 10.4, vCanon.y ) ) * ( 1.0 - smoothstep( 9.2, 9.9, vCanon.x ) ) * smoothstep( 4.0, 5.2, vCanon.x );
      float inward = smoothstep( 0.15, -0.45, normalize( vFacing ).x ) * mouth;
      base = mix( base, vec3( 0.36, 0.085, 0.075 ), 0.85 * inward ) * mix( 1.0, 0.5 * smoothstep( 8.9, 6.6, vCanon.x ) + 0.5, inward );
      // (the cut end of the neck, if it is seen)
      base = mix( base, base * 0.5, clamp( vKind - 1.0, 0.0, 1.0 ) );
      ${hair ? `
      // ----- the hair: strands in a cell grid laid on the skin (by the face it lies on, so that it does not stretch), as tall as their cell says
      vec3 an = abs( normalize( vObjN ) );
      vec3 pc = vCanon;
      vec2 q0 = ( an.y > an.x && an.y > an.z ) ? pc.xz : ( an.x > an.z ? pc.yz : pc.xy );
      float face = ( an.y > an.x && an.y > an.z ) ? 1.0 : ( an.x > an.z ? 2.0 : 3.0 );
      // (two grids, one turned against the other, so that no row of strands shows)
      float keep = 0.0, strandH = 1.0; vec2 cell = vec2( 0.0 );
      for ( int g = 0; g < 2; g++ ) {
        float ca = g == 0 ? 0.0 : 0.53, cs = cos( ca ), sn = sin( ca );
        vec2 qq = q0 * ( g == 0 ? 17.0 : 13.0 );
        qq += 0.45 * vec2( sin( qq.y * 0.37 + qq.x * 0.21 + float( g ) * 2.0 ), cos( qq.x * 0.41 - qq.y * 0.23 ) );
        vec2 q = mat2( cs, -sn, sn, cs ) * qq + face * 17.31 + float( g ) * 5.7;
        vec2 ce = floor( q ), fq = fract( q ) - 0.5;
        float rnd = hash12( ce );
        float sh = mix( 0.45, 1.0, hash12( ce + 11.7 ) );
        float rel = clamp( aShellH / sh, 0.0, 1.0 );
        float taper = mix( 0.36, 0.1, rel );
        vec2 off = 0.34 * vec2( hash12( ce + 2.0 ) - 0.5, hash12( ce + 5.0 ) - 0.5 );
        float inS = ( 1.0 - smoothstep( taper * 0.55, taper, length( fq - off ) ) ) * step( aShellH, sh );
        float grown = smoothstep( rnd * 0.8, rnd * 0.8 + 0.18, hairM * 1.3 );
        float k = inS * grown;
        if ( k > keep ) { keep = k; strandH = sh; cell = ce; }
      }
      if ( keep < 0.04 ) discard;
      vec3 hairC = mix( vec3( 0.03, 0.021, 0.017 ), vec3( 0.085, 0.057, 0.042 ), hash12( cell + 9.1 ) );
      base = hairC * mix( 0.4, 1.0, aShellH );
      float shellA = keep;
      ` : `
      // (the scalp under a buzz cut: the grey-brown of the roots, not the skin of the forehead)
      base = mix( base, vec3( 0.07, 0.05, 0.043 ) * ( 0.7 + 0.8 * clamp( dot( base, vec3( 0.33 ) ) * 3.0, 0.0, 1.0 ) ), 0.92 * smoothstep( 0.2, 0.65, hairM ) );
      `}
      ${hair ? '' : `
      // the lashes: dark strokes that run out from the upper lid's edge, and the lid's own dark line under them
      {
        vec4 E = vCanon.z < 0.0 ? uEyeL : uEyeR;
        vec3 d = vCanon - E.xyz;
        float dist = length( d ) - E.w;
        float top = smoothstep( -0.3, 0.3, d.y ) * smoothstep( -0.2, 0.6, d.x ) * smoothstep( 1.45, 1.0, abs( d.z ) );
        float band = smoothstep( -0.1, 0.03, dist ) * smoothstep( 0.32, 0.06, dist ) * top;
        float ang = atan( d.y, abs( d.z ) );
        float bin = floor( ang * 64.0 ), fr = fract( ang * 64.0 );
        float ln = hash12( vec2( bin, 3.7 ) );
        float stroke = step( abs( fr - 0.5 ), 0.14 + 0.1 * ln ) * step( 0.28, ln ) * smoothstep( 0.32, 0.1, dist );
        base = mix( base, vec3( 0.01, 0.007, 0.006 ), clamp( 0.8 * stroke * band + 0.3 * smoothstep( 0.16, 0.0, dist ) * top, 0.0, 0.9 ) );
      }`}
      diffuseColor.rgb = base;
      ${hair ? 'diffuseColor.a = shellA;' : ''}`);
    fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp( roughnessFactor, 0.12, 1.0 );
      ${hair ? 'roughnessFactor = 0.62;' : 'roughnessFactor = mix( roughnessFactor, 0.2, inward );'}`);
    fs = fs.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      gSmoothN = normalize( nonPerturbedNormal );
      gThin = vAoThin.y;
      gSSS = ${hair ? '0.0' : '1.0'};
      ${hair ? 'gHair = 1.0; gHairT = normalize( mix( vec3( 0.0, 1.0, 0.0 ), gSmoothN, 0.8 ) );' : ''}
      #ifdef USE_CLEARCOAT
        material.clearcoat *= ( 1.0 - smoothstep( 0.3, 0.6, roughnessFactor ) ) * ( 1.0 - hairM );
      #endif`);
    fs = fs.replace('#include <aomap_fragment>', `
      {
        float ao = vAoThin.x;
        ${hair ? 'ao *= mix( 0.3, 1.0, aShellH );' : ''}
        reflectedLight.indirectDiffuse *= ao;
        float dotNVa = saturate( dot( geometryNormal, geometryViewDir ) );
        reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNVa, ao, material.roughness );
        reflectedLight.directDiffuse *= mix( 1.0, ao, 0.45 );
        #ifdef USE_SHEEN
          sheenSpecularIndirect *= ao;
        #endif
        #ifdef USE_CLEARCOAT
          clearcoatSpecularIndirect *= ao;
        #endif
      }`);
    fs = fs.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      ${hair ? '' : '{ float fa = smoothstep( uFade.x, uFade.y, vWPos.y ); gl_FragColor.rgb = mix( backdropColor( gl_FragCoord.xy / uRes * 2.0 - 1.0, uAspect, gl_FragCoord.xy ), gl_FragColor.rgb, fa * fa * ( 3.0 - 2.0 * fa ) ); }'}`);
    fs = fs.replace('#include <opaque_fragment>', `
      ${hair ? 'diffuseColor.a = shellA * smoothstep( uFade.x, uFade.y, vWPos.y );' : `
      // the neck: darker toward its end as the shoulders would shade it
      outgoingLight *= mix( 0.9, 1.0, smoothstep( uFade.x, uFade.y, vWPos.y ) );`}
      #include <opaque_fragment>`);
    if (hair) {
      s.vertexShader = s.vertexShader.replace('varying vec3 vObjN;', 'varying vec3 vObjN; varying float aShellH;').replace('vObjN = normal;', 'vObjN = normal; aShellH = aShell;');
      fs = fs.replace('varying vec3 vObjN;', 'varying vec3 vObjN; varying float aShellH;');
    }
    s.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => (hair ? 'vw-hair-1' : 'vw-skin-1');
}

export interface Skin {
  material: THREE.MeshPhysicalMaterial;
  hairMaterial: THREE.MeshPhysicalMaterial;
  uniforms: SkinUniforms;
}

/** The two materials (skin and hair) with their shared uniforms, and the textures they read once they come. */
export function skinMaterials(): Skin {
  const uniforms: SkinUniforms = { uFade: { value: new THREE.Vector2(-1e3, -1e3 + 1) }, uDelight: { value: 1 }, uHairLen: { value: 0.34 }, uAspect: { value: new THREE.Vector2(1.5, 1) }, uRes: { value: new THREE.Vector2(1440, 823) }, uEyeL: { value: new THREE.Vector4(4.36, 16.61, -3.15, 2.46) }, uEyeR: { value: new THREE.Vector4(4.52, 16.85, 3.16, 2.44) } };
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 1, metalness: 0, ior: 1.4, side: THREE.FrontSide,
    sheen: 0.2, sheenColor: new THREE.Color(1.0, 0.82, 0.74), sheenRoughness: 0.5,
    clearcoat: 0.18, clearcoatRoughness: 0.3,
    bumpScale: 1.6,
  });
  patch(material, uniforms, false);
  const hairMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.62, metalness: 0, side: THREE.FrontSide, alphaToCoverage: true,
    sheen: 0.0,
  });
  patch(hairMaterial, uniforms, true);
  return { material, hairMaterial, uniforms };
}

/**
 * How near each point is to the seam where the neck grows from the jaw's edge (0 away from it, 1 on it, within
 * four rings of triangles of it): the points that the grown neck and the scan share (`same`) are the seam.
 */
export function seamWeights(index: Uint32Array, same: Int32Array, count: number, n0: number, rings = 5): Float32Array {
  const w = new Float32Array(count);
  const roots = new Set<number>();
  for (let i = n0; i < count; i++) if (same[i] < n0) roots.add(same[i]);
  const nb: number[][] = Array.from({ length: count }, () => []);
  for (let t = 0; t < index.length; t += 3) for (let k = 0; k < 3; k++) { const a = same[index[t + k]], b = same[index[t + (k + 1) % 3]]; if (a !== b) { nb[a].push(b); nb[b].push(a); } }
  let front: number[] = [...roots];
  const d = new Float32Array(count).fill(-1);
  for (const r of front) d[r] = 0;
  for (let step = 1; step <= rings && front.length; step++) {
    const nxt: number[] = [];
    for (const v of front) for (const u of nb[v]) if (d[u] < 0) { d[u] = step; nxt.push(u); }
    front = nxt;
  }
  for (let i = 0; i < count; i++) { const r = d[same[i]]; w[i] = r < 0 ? 0 : Math.max(0, 1 - r / rings); }
  return w;
}

/** The shells of the hair: the head's own attributes, drawn `n` times, the k-th at k / n of the hair's length. */
export function hairShells(head: THREE.BufferGeometry, n: number): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  for (const name of Object.keys(head.attributes)) g.setAttribute(name, head.attributes[name]);
  if (head.index) g.setIndex(head.index);
  const shell = new Float32Array(n);
  for (let k = 0; k < n; k++) shell[k] = (k + 0.5) / n;
  g.setAttribute('aShell', new THREE.InstancedBufferAttribute(shell, 1));
  g.instanceCount = n;
  return g;
}
