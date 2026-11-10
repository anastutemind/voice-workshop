/**
 * The mirror as a real face: a three-dimensional head whose jaw, lips and
 * tongue are moved by the model. Nothing is animated by hand: at every
 * frame the measures of the mouth taken on the side view (lipsOf: how far
 * apart the lips are, how far the teeth, rounded, spread, closed, the lower
 * lip on the teeth, the tongue between them) set the face's blend shapes,
 * so the mirror and the side view show the same mouth.
 *
 * The head is "Face Cap" by Bannaflak, from the three.js examples
 * (public/models/facecap.glb); see THIRD_PARTY_NOTICES.md.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Face } from './faces';
import { shapeOf } from './faces';
import { lipsOf, LipMeasures, LipState } from './readout';
import type { Articulators } from '../../dsp/tract/types';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const LIP_WORD: Record<LipState, string> = { closed: 'closed', teeth: 'on the top teeth', round: 'rounded', spread: 'spread', open: 'open' };

/** The blend shapes of the face for a mouth: each 0..1. `sep` is how far apart the teeth are, cm. */
export function blendOf(m: LipMeasures, a: Articulators, sep: number): Record<string, number> {
  const round = clamp01(a.lipRound), protr = clamp01(a.lipProtrude), spread = clamp01(-a.lipProtrude / 0.35), tuck = clamp01(a.lipTuck);
  const jaw = clamp01(Math.max(0, sep) / 2.7);
  const closed = m.state === 'closed';
  // the lips part more than the teeth (a smile on closed teeth) or less (lips together on an open jaw)
  const more = clamp01((m.gap - Math.max(0, sep)) / 1.3);
  const less = closed ? 1 : clamp01((Math.max(0, sep) - m.gap) / Math.max(0.2, sep));
  const out: Record<string, number> = {
    jawOpen: jaw,
    mouthClose: jaw * less,
    mouthPress_L: closed ? 0.35 : 0, mouthPress_R: closed ? 0.35 : 0,
    mouthUpperUp_L: 0.3 * more + 0.25 * tuck, mouthUpperUp_R: 0.3 * more + 0.25 * tuck,
    mouthLowerDown_L: 0.4 * more * (1 - tuck), mouthLowerDown_R: 0.4 * more * (1 - tuck),
    mouthPucker: round * (0.45 + 0.4 * protr),
    mouthFunnel: round * 0.35 + protr * 0.25 * (1 - round),
    mouthStretch_L: 0.5 * spread, mouthStretch_R: 0.5 * spread,
    mouthSmile_L: 0.22 * spread, mouthSmile_R: 0.22 * spread,
    mouthRollLower: 0.85 * tuck,
    tongueOut: m.between ? 0.55 : 0,
  };
  return out;
}

export function Mirror3D({ face, label, onFail }: { face: () => Face | null; label: string; onFail: () => void }) {
  const host = useRef<HTMLDivElement | null>(null);
  const word = useRef<HTMLSpanElement | null>(null);
  const getFace = useRef(face);
  getFace.current = face;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { onFail(); return; }
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
    // a soft key from the upper left, a cool fill, a rim: a face lit as in a studio
    // the soft light of a room all around (reflected in the wet of the lips, the teeth and the eyes), then the studio lights
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.5;
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xfff1e6, 0x1a1c24, 0.45));
    const key = new THREE.DirectionalLight(0xfff4ea, 1.9); key.position.set(-1.6, 1.8, 3); scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.7); fill.position.set(2.2, 0.2, 2); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.9); rim.position.set(0.5, 1.5, -3); scene.add(rim);

    let head: THREE.Mesh | null = null;
    let dict: Record<string, number> = {};
    let disposed = false, raf = 0;
    const target = new THREE.Vector3();
    const ktx2 = new KTX2Loader().setTranscoderPath('basis/').detectSupport(renderer);
    new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder).load('models/facecap.glb', (gltf) => {
      if (disposed) return;
      const root = gltf.scene;
      scene.add(root);
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.morphTargetDictionary && Object.keys(mesh.morphTargetDictionary).length > 20) head = mesh;
      });
      if (!head) { onFail(); return; }
      dict = (head as THREE.Mesh).morphTargetDictionary ?? {};
      // the frame: the lower face, from under the nose to the chin, a little from above as in a hand mirror
      const box = new THREE.Box3().setFromObject(head);
      const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      target.set(c.x, box.min.y + size.y * 0.25, box.max.z - size.z * 0.2);
      camera.position.set(c.x, target.y + size.y * 0.03, box.max.z + size.y * 0.95);
      camera.lookAt(target);
      // the scan's own colours are pale: warmed toward skin (the teeth and the eyes keep theirs)
      const mat = ((head as THREE.Mesh).material as THREE.MeshStandardMaterial).clone();
      mat.color.set(0xf3c2ab);
      mat.roughness = 0.5;
      (head as THREE.Mesh).material = mat;
      setReady(true);
    }, undefined, () => { if (!disposed) onFail(); });

    const resize = () => {
      const r = el.getBoundingClientRect();
      renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
      camera.aspect = Math.max(1, r.width) / Math.max(1, r.height);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const f = getFace.current();
      if (head && f) {
        const { geom } = shapeOf(f.pose);
        const m = lipsOf(f.pose.art, geom);
        const want = blendOf(m, f.pose.art, geom.slit.vertical);
        // a blink now and then
        const u = (t / 1000) % 4.6;
        want.eyeBlink_L = want.eyeBlink_R = u < 0.16 ? 1 - Math.abs(u - 0.08) / 0.08 : 0;
        const inf = head.morphTargetInfluences!;
        // no smoothing of its own: the pose is already smooth, and a second one would put the mirror behind the side view
        for (const k in dict) inf[dict[k]] = want[k] ?? 0;
        if (word.current && word.current.textContent !== LIP_WORD[m.state]) word.current.textContent = LIP_WORD[m.state];
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      ktx2.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div ref={host} className={ready ? 'mirror3d ready' : 'mirror3d'} role="img" aria-label={label}>
      <p className="mirror3d-state">Lips <span ref={word} /></p>
    </div>
  );
}
