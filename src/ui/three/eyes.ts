/**
 * The eyes of the whole head: the scan's two eyeballs, shaded as eyes are.
 *
 * Under a wet cornea (a clear coat on a smaller, more curved ball than the eye's, so the studio's soft boxes and
 * its lights stand in the eye as the catchlights they are), a white that is not white (warm, in the shadow of the
 * lids, a few fine veins, pink at the corners), and a brown iris (radial fibres, a dark ring at its rim, a paler ring
 * about the pupil, crypts), a pupil that is round and black. The gaze: straight ahead, and toward the eye of the
 * view, by a part of the way and never more than 15 degrees, so that he looks at whoever looks at him. The lashes
 * and the lid's own edge belong to the skin's picture; the upper lid's shadow on the ball is done here.
 */
import * as THREE from 'three';

export interface EyeUniforms {
  /** the middle and the radius of each eyeball (the far one, z < 0, first), in the head's centimetres */
  uEyeL: { value: THREE.Vector4 };
  uEyeR: { value: THREE.Vector4 };
  /** the colour of the iris (linear) */
  uIris: { value: THREE.Vector3 };
  /** the eye of the view, in the head's centimetres */
  uLook: { value: THREE.Vector3 };
  /** the iris's picture, when there is one (the polar picture: angle across, radius down), and how much of it is used */
  uIrisTex: { value: THREE.Texture | null };
  uIrisMix: { value: number };
}

export function eyeUniforms(): EyeUniforms {
  return {
    uEyeL: { value: new THREE.Vector4(4.36, 16.61, -3.15, 2.46) }, uEyeR: { value: new THREE.Vector4(4.52, 16.85, 3.16, 2.44) },
    uIris: { value: new THREE.Vector3(0.026, 0.0115, 0.0055) }, uLook: { value: new THREE.Vector3(60, 15, 0) },
    uIrisTex: { value: null }, uIrisMix: { value: 0 },
  };
}

const VS_PARS = 'attribute vec3 canon; varying vec3 vCanon;';
const FS_PARS = `
varying vec3 vCanon;
uniform vec4 uEyeL; uniform vec4 uEyeR; uniform vec3 uIris; uniform vec3 uLook; uniform sampler2D uIrisTex; uniform float uIrisMix;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`;

export function eyeMaterial(u: EyeUniforms): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.28, metalness: 0, ior: 1.376, clearcoat: 1, clearcoatRoughness: 0.025, side: THREE.FrontSide,
  });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n${VS_PARS}`).replace('#include <begin_vertex>', '#include <begin_vertex>\nvCanon = canon;');
    let fs = s.fragmentShader.replace('#include <common>', `#include <common>\n${FS_PARS}`);
    fs = fs.replace('#include <map_fragment>', `
      vec4 E = vCanon.z < 0.0 ? uEyeL : uEyeR;
      float side = vCanon.z < 0.0 ? -1.0 : 1.0;
      vec3 e = normalize( vCanon - E.xyz );
      // where he looks: ahead, a little down; toward the eye of the view by half the way, within 15 degrees each way
      vec3 toEye = normalize( uLook - E.xyz );
      float facing = smoothstep( -0.1, 0.45, toEye.x );
      float yaw = clamp( 0.55 * atan( toEye.z, toEye.x ), -0.262, 0.262 ) * facing - 0.012 * side;
      float pitch = -0.035 + clamp( 0.5 * asin( clamp( toEye.y, -1.0, 1.0 ) ), -0.2, 0.2 ) * facing;
      vec3 look = normalize( vec3( cos( pitch ) * cos( yaw ), sin( pitch ), cos( pitch ) * sin( yaw ) ) );
      float th = acos( clamp( dot( e, look ), -1.0, 1.0 ) );
      vec3 a1 = normalize( cross( look, vec3( 0.0, 1.0, 0.0 ) ) ), a2 = cross( a1, look );
      float ang = atan( dot( e, a2 ), dot( e, a1 ) );
      float irisR = asin( min( 0.95, 0.64 / E.w ) );
      float t = th / irisR;
      float pupil = 0.36 + 0.03 * sin( ang * 3.0 );
      // ----- iris
      vec2 pq = vec2( cos( ang ), sin( ang ) ) * t;
      float fib = vn( vec2( ang * 22.0, t * 3.0 ) ) * 0.6 + vn( vec2( ang * 53.0, t * 9.0 + 4.0 ) ) * 0.4;
      float fib2 = vn( vec2( ang * 9.0 + 3.0, t * 2.0 ) );
      vec3 ir = uIris * ( 0.62 + 0.9 * fib );
      vec3 amber = vec3( 0.12, 0.052, 0.018 );
      ir = mix( ir, amber * ( 0.5 + 0.7 * fib2 ), 0.55 * smoothstep( 0.78, 0.4, t ) * smoothstep( pupil + 0.01, pupil + 0.16, t ) );
      ir = mix( ir, amber * 0.7, 0.45 * smoothstep( 0.1, 0.0, abs( t - ( pupil + 0.2 ) ) ) );
      ir = mix( ir, vec3( 0.02, 0.011, 0.007 ), 0.7 * smoothstep( 0.62, 1.0, t ) );
      ir *= 1.0 - 0.45 * smoothstep( 0.9, 1.04, t );
      if ( uIrisMix > 0.0 ) {
        vec3 ph = texture2D( uIrisTex, 0.5 + 0.5 * pq * 0.96 ).rgb;
        ir = mix( ir, ph, uIrisMix * smoothstep( 1.0, 0.94, t ) );
      }
      ir = mix( vec3( 0.002 ), ir, smoothstep( pupil - 0.025, pupil + 0.025, t ) );
      // ----- the white: warm, shadowed by the lids, pink at the corners, a few veins that run to the iris
      vec3 white = vec3( 0.56, 0.49, 0.43 );
      float inner = clamp( -side * e.z * 2.2 - 0.9, 0.0, 1.0 ) * smoothstep( -0.2, 0.3, e.x );
      float corner = smoothstep( 0.45, 0.9, abs( e.z ) );
      white = mix( white, vec3( 0.52, 0.22, 0.17 ), 0.55 * corner + 0.55 * inner );
      float vein = smoothstep( 0.62, 0.9, vn( vec2( ang * 14.0 + sin( t * 3.0 ), t * 1.5 ) ) ) * smoothstep( 1.1, 1.8, t ) * smoothstep( 4.0, 2.0, t );
      white = mix( white, vec3( 0.55, 0.16, 0.13 ), 0.32 * vein );
      white *= 0.85 + 0.15 * vn( vec2( ang * 4.0, t ) );
      vec3 col = mix( ir, white, smoothstep( 0.97, 1.1, t ) );
      // the limbus: a dark soft ring where iris meets white
      col *= 1.0 - 0.5 * smoothstep( 0.2, 0.0, abs( t - 1.03 ) ) * smoothstep( 1.0, 1.05, t );
      // the upper lid's shadow, and the lower's: the ball is darker where the lids close over it
      col *= mix( 1.0, 0.38, smoothstep( -0.06, 0.22, e.y ) ) * mix( 1.0, 0.7, smoothstep( -0.3, -0.62, e.y ) );
      diffuseColor.rgb = col;
      // (the cornea over the iris: a smaller ball, more curved than the eye, in the view's frame)
      float onIris = smoothstep( 1.55, 0.95, t );
      vec3 cc = E.xyz + look * ( E.w - 0.95 );
      vec3 corneaN = normalize( mat3( viewMatrix ) * normalize( vCanon - cc ) );`);
    fs = fs.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      #ifdef USE_CLEARCOAT
        material.clearcoat = mix( 0.22, 1.0, onIris );
        material.clearcoatRoughness = mix( 0.2, 0.03, onIris );
      #endif`);
    fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        // the catchlights: the studio's soft boxes in the wet of the cornea, where the viewer sees them whichever side the head is seen from
        vec3 Rv = reflect( - normalize( vViewPosition ), corneaN );
        vec3 kd = normalize( vec3( -0.85, 0.5, 0.75 ) );
        vec3 q1 = Rv - kd * dot( Rv, kd );
        vec3 ax = normalize( cross( kd, vec3( 0.0, 1.0, 0.0 ) ) ), ay = cross( ax, kd );
        float box = smoothstep( 0.17, 0.12, abs( dot( q1, ax ) ) ) * smoothstep( 0.12, 0.085, abs( dot( q1, ay ) ) ) * step( 0.0, dot( Rv, kd ) );
        vec3 fd = normalize( vec3( 0.9, -0.1, 0.5 ) );
        vec3 q2 = Rv - fd * dot( Rv, fd );
        float soft = smoothstep( 0.1, 0.04, length( q2 ) ) * step( 0.0, dot( Rv, fd ) );
        totalEmissiveRadiance += ( vec3( 1.0, 0.97, 0.92 ) * box * 1.9 + vec3( 0.7, 0.8, 1.0 ) * soft * 0.5 ) * smoothstep( 1.25, 0.9, t );
      }`);
    fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( 0.3, 0.12, smoothstep( 1.4, 0.9, t ) );');
    fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize( mix( normal, corneaN, 0.75 * onIris ) );');
    fs = fs.replace('#include <clearcoat_normal_fragment_begin>', `#include <clearcoat_normal_fragment_begin>
      #ifdef USE_CLEARCOAT
        clearcoatNormal = normalize( mix( clearcoatNormal, corneaN, onIris ) );
      #endif`);
    s.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'vw-eye-1';
  return m;
}
