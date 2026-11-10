import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { store, useUi, useTick, FieldMode } from '../store';
import { useL, useT } from '../i18n';
import { fieldRgb } from '../canvas';
import { buildTractMeshes, TractMeshes, Pouch } from '../three/meshes';
import { N_SECTIONS } from '../../dsp/tract/areaFunction';
import type { TractGeometry } from '../../dsp/tract/geometry';
import type { Telemetry } from '../../dsp/engine/engine';

type Preset = 'side' | 'front' | 'top' | 'three';
type AnchorKey = keyof TractMeshes['anchors'];

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
const WATER = new THREE.Color(0.27, 0.62, 0.92);

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

/**
 * The vocal tract in three dimensions: the air inside it (a cast of the
 * airway, coloured by the sound field) with the tongue, palate, velum,
 * pharynx, lips, teeth and the piriform fossae around it, all from the same
 * cross-sections the sound is computed with. Drag to turn, wheel to zoom.
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
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    } catch {
      setLost('nowebgl');
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.localClippingEnabled = true;
    renderer.setClearColor(0x121722, 1);
    const canvas = renderer.domElement;
    canvas.className = 'fill';
    canvas.setAttribute('aria-label', 'vocal tract 3D');
    el.prepend(canvas);
    const onLost = (e: Event) => { e.preventDefault(); setLost('lost'); };
    const onRestored = () => setLost(null);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    const scene = new THREE.Scene();
    // the soft light of a room all around: the walls of the tract shine wet, as tissue does
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 400);
    scene.add(new THREE.HemisphereLight(0xdfe7ff, 0x2a1d26, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(0.6, 1, 1.2);
    camera.add(key);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 0.6);
    rim.position.set(-1, 0.3, -0.8);
    camera.add(rim);
    scene.add(camera);

    const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    const clipOn: THREE.Plane[] = [clip];
    const geom0 = store.derived().geom;
    let meshes = buildTractMeshes(geom0);
    let lastGeom: TractGeometry = geom0;

    // the air
    const airGeo = new THREE.BufferGeometry();
    airGeo.setAttribute('position', new THREE.BufferAttribute(meshes.air.positions, 3));
    const airCol = new Float32Array(meshes.air.positions.length);
    airGeo.setAttribute('color', new THREE.BufferAttribute(airCol, 3));
    airGeo.setIndex(new THREE.BufferAttribute(meshes.air.index, 1));
    const airMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, side: THREE.DoubleSide, emissive: 0x0a1a20 });
    const air = new THREE.Mesh(airGeo, airMat);
    scene.add(air);

    // tissues
    const sheetMesh = (sh: TractMeshes['upper']) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(sh.positions, 3));
      g.setAttribute('color', new THREE.BufferAttribute(sh.colors, 3));
      g.setIndex(new THREE.BufferAttribute(sh.index, 1));
      const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
      const mesh = new THREE.Mesh(g, mat);
      scene.add(mesh);
      return mesh;
    };
    const upper = sheetMesh(meshes.upper);
    const lower = sheetMesh(meshes.lower);

    // teeth
    const toothGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.18);
    const toothMat = new THREE.MeshPhysicalMaterial({ color: 0xf1ead8, roughness: 0.22, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    const teeth = new THREE.InstancedMesh(toothGeo, toothMat, 64);
    scene.add(teeth);
    const dummy = new THREE.Object3D();

    // the piriform fossae: air and water in each pouch
    const pouchMat = new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.5, side: THREE.DoubleSide, color: 0x2ad4bd });
    const waterMat = new THREE.MeshStandardMaterial({ color: WATER, roughness: 0.2, transparent: true, opacity: 0.75 });
    const pouchParts: THREE.Mesh[] = [];
    for (let q = 0; q < 4; q++) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), q < 2 ? pouchMat : waterMat);
      scene.add(mesh);
      pouchParts.push(mesh);
    }
    let pouchKey = '';
    const Y = new THREE.Vector3(0, 1, 0);
    const placePouch = (p: Pouch) => {
      const k = [p.length, p.air, p.rOpen, p.rBottom].map((x) => x.toFixed(3)).join(',');
      const rAt = (x: number) => p.rOpen + (p.rBottom - p.rOpen) * (p.length > 0 ? x / p.length : 0);
      if (k !== pouchKey) {
        pouchKey = k;
        const parts: [number, number][] = [[0, p.air], [p.air, p.length]];
        for (let q = 0; q < 4; q++) {
          const [a, b] = parts[q < 2 ? 0 : 1];
          const m = pouchParts[q];
          m.geometry.dispose();
          // +y toward the opening; a closed bottom on the deepest part
          m.geometry = b - a > 1e-3 ? new THREE.CylinderGeometry(rAt(a), rAt(b), b - a, 18, 1, !(b >= p.length - 1e-6)) : new THREE.BufferGeometry();
        }
      }
      const dir = new THREE.Vector3(p.dx, p.dy, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(Y, dir.clone().negate());
      for (let q = 0; q < 4; q++) {
        const [a, b] = q < 2 ? [0, p.air] : [p.air, p.length];
        const m = pouchParts[q];
        const c = 0.5 * (a + b);
        m.position.set(p.x + p.dx * c, p.y + p.dy * c, (q % 2 === 0 ? 1 : -1) * p.z);
        m.quaternion.copy(quat);
        m.visible = b - a > 1e-3;
      }
    };

    const refresh = (g: TractGeometry) => {
      meshes = buildTractMeshes(g, meshes);
      airGeo.attributes.position.needsUpdate = true;
      airGeo.computeVertexNormals();
      for (const m of [upper, lower]) {
        m.geometry.attributes.position.needsUpdate = true;
        m.geometry.attributes.color.needsUpdate = true;
        m.geometry.computeVertexNormals();
      }
      meshes.teeth.forEach((th, i) => {
        dummy.position.set(th.x, th.y, th.z);
        dummy.rotation.set(0, 0, 0);
        dummy.rotateZ(th.tilt);
        dummy.rotateY(-th.yaw);
        dummy.scale.set(th.d, th.h, th.w);
        dummy.updateMatrix();
        teeth.setMatrixAt(i, dummy.matrix);
      });
      teeth.count = meshes.teeth.length;
      teeth.instanceMatrix.needsUpdate = true;
      placePouch(meshes.pouch);
    };
    refresh(geom0);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.zoomToCursor = true;
    controls.minDistance = 4;
    controls.maxDistance = 120;
    const preset = (p: Preset) => {
      const [cx, cy, cz] = meshes.center;
      const r = meshes.radius;
      const pos: Record<Preset, [number, number, number]> = {
        side: [cx, cy, cz + 2.7 * r],
        front: [cx + 2.7 * r, cy + 0.15 * r, cz],
        top: [cx, cy + 2.7 * r, cz + 0.02 * r],
        three: [cx + 1.3 * r, cy + 0.6 * r, cz + 2.2 * r],
      };
      // the camera a little higher than the centre, so that the head sits below the controls
      const lift = p === 'top' ? 0 : 0.12 * r;
      camera.position.set(pos[p][0], pos[p][1] + lift, pos[p][2]);
      controls.target.set(cx, cy + lift, cz);
      controls.update();
    };
    presetRef.current = preset;
    preset('three');

    const resize = () => {
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
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
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const { geom } = store.derived();
      if (geom !== lastGeom) { lastGeom = geom; refresh(geom); }
      const o = opts.current;
      // the sound field on the air
      const tel = store.ui.audioOn ? store.telemetry : null;
      const mode = store.ui.field;
      const ray = meshes.air.ray;
      let prev = -1, r = 0, gc = 0, b = 0;
      for (let q = 0; q < ray.length; q++) {
        if (ray[q] !== prev) { prev = ray[q]; [r, gc, b] = fieldRgb(fieldAt(lastGeom, prev, mode, tel)); }
        airCol[3 * q] = r / 255; airCol[3 * q + 1] = gc / 255; airCol[3 * q + 2] = b / 255;
      }
      airGeo.attributes.color.needsUpdate = true;
      const pf = lastGeom.piriform;
      let pi = 0;
      while (pi < lastGeom.lastRay && lastGeom.s[pi] < pf.at) pi++;
      const [pr, pg, pb] = fieldRgb(fieldAt(lastGeom, pi, mode, tel));
      pouchMat.color.setRGB(pr / 255, pg / 255, pb / 255);
      // tissues and the cut
      for (const m of [upper, lower]) {
        m.visible = o.tissues;
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.clippingPlanes = o.cut ? clipOn : null;
        mat.opacity = o.cut ? 0.95 : 0.35;
        mat.depthWrite = o.cut;
      }
      toothMat.clippingPlanes = o.cut ? clipOn : null;
      teeth.visible = o.tissues;
      controls.update();
      renderer.render(scene, camera);
      // labels, the later ones hidden where they would cover an earlier one or a control
      const w = el.clientWidth, h = el.clientHeight;
      placed.length = 0;
      for (const k of ANCHORS) {
        const span = labelEls.current[k];
        if (!span) continue;
        const a = meshes.anchors[k];
        if (!o.labels || !a) { span.style.display = 'none'; continue; }
        v.set(a[0], a[1], a[2]).project(camera);
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
      airGeo.dispose(); airMat.dispose();
      for (const m of [upper, lower]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
      toothGeo.dispose(); toothMat.dispose(); teeth.dispose();
      for (const m of pouchParts) m.geometry.dispose();
      pouchMat.dispose(); waterMat.dispose();
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
    ['side', { it: 'lato', en: 'side' }], ['front', { it: 'fronte', en: 'front' }], ['top', { it: 'alto', en: 'top' }], ['three', { it: '¾', en: '¾' }],
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
        <button className={cut ? 'chip on' : 'chip'} title={L({ it: 'Taglia la testa a metà, lungo il piano sagittale', en: 'Cut the head in half along the mid-sagittal plane' })} onClick={() => setCut(!cut)}>{L({ it: 'Spaccato', en: 'Cutaway' })}</button>
        <button className={tissues ? 'chip on' : 'chip'} onClick={() => setTissues(!tissues)}>{L({ it: 'Tessuti', en: 'Tissues' })}</button>
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
            : numbers || L({ it: 'Trascina per girare, rotella per avvicinarti. L’aria è colorata dal suono; i tessuti dalla loro natura: osso chiaro, tessuto molle rosa.', en: 'Drag to turn, scroll to zoom. The air is coloured by the sound; the tissues by what they are: pale bone, pink soft tissue.' })}
      </div>
    </div>
  );
}
