/**
 * The photographic studio of the 3D head: the light the skin is seen by, and the backdrop it stands before.
 *
 * Light: a three-point rig of directional lights that goes with the camera (key above and to the left of the
 * eye, a cool fill low on the right, a rim behind), and an image-based light, a dim studio dome with soft boxes
 * for key, fill and two strip lights behind, turned with the eye round the head, so that the glints on the skin and
 * on the eyes keep their place against the viewer from whichever side the head is seen. The backdrop is a
 * soft vignette (a slate grey, lighter behind the head) dithered against banding.
 *
 * Nothing here draws every frame: the view renders on demand.
 */
import * as THREE from 'three';

/** A panel of light for the studio dome: where it is (azimuth from the viewer, elevation), its size in degrees, its colour and strength. */
interface Panel { az: number; el: number; w: number; h: number; rgb: [number, number, number]; k: number }

const PANELS: Panel[] = [
  { az: -42, el: 34, w: 46, h: 40, rgb: [1.0, 0.94, 0.86], k: 7.5 },   // the key: a large soft box, camera left and high
  { az: 62, el: 6, w: 40, h: 50, rgb: [0.82, 0.9, 1.0], k: 1.7 },      // the fill: cool, low on the right
  { az: 148, el: 14, w: 9, h: 70, rgb: [1.0, 1.0, 1.0], k: 9 },       // rim strips behind, left and right
  { az: -148, el: 14, w: 9, h: 70, rgb: [1.0, 0.97, 0.94], k: 9 },
  { az: 0, el: 82, w: 70, h: 50, rgb: [1.0, 1.0, 1.0], k: 2.2 },       // a broad light overhead
  { az: 12, el: -62, w: 90, h: 40, rgb: [1.0, 0.82, 0.68], k: 0.55 },  // the floor's warm bounce
];

/** The studio's light as an environment map (a PMREM cube the standard materials read from `scene.environment`). */
export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();
  // (the dome: a dark neutral grey-blue, a little lighter toward the horizon)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; void main() { float h = vP.y; vec3 c = mix(vec3(0.07, 0.075, 0.09), vec3(0.16, 0.17, 0.2), exp(-5.0 * h * h)); c = mix(c, vec3(0.05, 0.04, 0.04), smoothstep(0.0, -0.8, h)); gl_FragColor = vec4(c, 1.0); }',
  }));
  env.add(dome);
  for (const p of PANELS) {
    const w = 2 * 40 * Math.tan((p.w * Math.PI) / 360), h = 2 * 40 * Math.tan((p.h * Math.PI) / 360);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.rgb[0] * p.k, p.rgb[1] * p.k, p.rgb[2] * p.k), side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const az = (p.az * Math.PI) / 180, el = (p.el * Math.PI) / 180;
    // (the viewer looks along -z from +z: az 0 is straight behind the viewer, toward +z; to the viewer's left is -x)
    m.position.set(40 * Math.cos(el) * Math.sin(az), 40 * Math.sin(el), 40 * Math.cos(el) * Math.cos(az));
    m.lookAt(0, 0, 0);
    env.add(m);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.02, 0.1, 200);
  pm.dispose();
  env.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
  return rt.texture;
}

export interface Rig { key: THREE.DirectionalLight; fill: THREE.DirectionalLight; rim: THREE.DirectionalLight; target: THREE.Object3D }

/** The directional lights of the rig, children of the camera (so that they keep their place in the eye's frame). */
export function lightRig(scene: THREE.Scene, camera: THREE.Camera): Rig {
  const target = new THREE.Object3D();
  scene.add(target);
  const mk = (rgb: number, k: number, x: number, y: number, z: number) => {
    const l = new THREE.DirectionalLight(rgb, k);
    l.position.set(x, y, z);
    l.target = target;
    camera.add(l);
    return l;
  };
  return {
    key: mk(0xfff1e2, 1.9, -1.0, 0.65, 0.4),
    fill: mk(0xcfe0ff, 0.18, 0.9, -0.15, 0.5),
    rim: mk(0xffffff, 1.2, 0.45, 0.45, -1.0),
    target,
  };
}

/** The backdrop's colour at a point of the screen (u: -1..1 each way; the aspect of the view): shared with what fades into it. */
export const BACKDROP_GLSL = `
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec3 backdropColor(vec2 u, vec2 aspect, vec2 frag) {
  vec2 q = u * vec2(aspect.x, 1.0) - vec2(0.0, 0.1);
  float r = length(q * vec2(0.8, 0.95));
  vec3 c = mix(vec3(0.215, 0.235, 0.275), vec3(0.055, 0.062, 0.082), smoothstep(0.0, 1.45, r));
  c += vec3(0.012, 0.01, 0.008) * smoothstep(-0.2, -1.0, u.y);
  c += (ign(frag) - 0.5) / 255.0 * 1.5;
  return c;
}`;

/** The backdrop: a full-screen slate vignette, drawn first and under everything. */
export function backdrop(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vU; void main() { vU = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }',
    fragmentShader: `varying vec2 vU; uniform vec2 uAspect;
      ${BACKDROP_GLSL}
      void main() { gl_FragColor = vec4(backdropColor(vU, uAspect, gl_FragCoord.xy), 1.0); }`,
    uniforms: { uAspect: { value: new THREE.Vector2(1.5, 1) } },
  }));
  m.frustumCulled = false;
  m.renderOrder = -100;
  return m;
}

/** The azimuth of the eye round the vertical through `target` (0 on +z, toward +x as it turns). */
export function azimuth(camera: THREE.Camera, target: THREE.Vector3): number {
  return Math.atan2(camera.position.x - target.x, camera.position.z - target.z);
}
