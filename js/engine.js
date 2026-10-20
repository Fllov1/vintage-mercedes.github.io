import * as THREE from 'three';
import { mergeStatic } from './merge.js';

// Procedural, stylised Mercedes M121 inline-four. The source model is a hollow shell, so the
// engine is built here: x-ray block, animated pistons/con-rods/crank, head, cam cover, twin carbs.
// Local axes: Z = crank axis (engine sits longitudinally), Y = up. Unit ≈ 1 m * 0.44 (car scale).

const BORE = 0.045, STROKE = 0.04, ROD = 0.075, PITCH = 0.062;
const CYL_Z = [-1.5, -0.5, 0.5, 1.5].map(i => i * PITCH);
// inline-4: pistons 1&4 and 2&3 move together; firing order 1-3-4-2
const PHASE = [0, Math.PI, Math.PI, 0];
const CRANK_Y = 0;

export function createEngine({ env }) {
  const root = new THREE.Group(); root.name = 'engine';
  const parts = {}; // explodable sub-groups

  const steel = new THREE.MeshStandardMaterial({ color: 0xb9b4ad, metalness: 1, roughness: 0.22, envMapIntensity: 1.2 });
  const polished = new THREE.MeshStandardMaterial({ color: 0xe8e4de, metalness: 1, roughness: 0.08 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1718, metalness: 0.6, roughness: 0.45 });
  const wine = new THREE.MeshStandardMaterial({ color: 0x5a0d18, metalness: 0.5, roughness: 0.25 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x8a1a2a, metalness: 0, roughness: 0.15, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xc4475a, transparent: true, opacity: 0.55 });
  const mats = [steel, polished, dark, wine, glass, edgeMat];

  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const xray = (parent, geo, x, y, z) => {
    add(parent, geo, glass, x, y, z);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat); e.position.set(x, y, z); parent.add(e);
  };

  // --- block (x-ray) ---
  const block = new THREE.Group(); root.add(block); parts.block = block;
  const deckY = CRANK_Y + STROKE / 2 + ROD + 0.03;
  xray(block, new THREE.BoxGeometry(0.13, deckY + 0.02, 0.29), 0, (deckY - 0.02) / 2, 0);
  CYL_Z.forEach(z => xray(block, new THREE.CylinderGeometry(BORE / 2 + 0.003, BORE / 2 + 0.003, 0.09, 28, 1, true), 0, deckY - 0.045, z));

  // --- crankshaft ---
  const crank = new THREE.Group(); crank.position.y = CRANK_Y; root.add(crank); parts.crank = crank;
  add(crank, new THREE.CylinderGeometry(0.009, 0.009, 0.36, 16).rotateX(Math.PI / 2), polished);
  const pins = [];
  CYL_Z.forEach((z, i) => {
    const web = new THREE.Group(); web.position.z = z; web.rotation.z = PHASE[i]; crank.add(web);
    [-1, 1].forEach(s => add(web, new THREE.BoxGeometry(0.035, 0.05, 0.007), steel, 0, STROKE / 4, s * 0.012));
    add(web, new THREE.CylinderGeometry(0.008, 0.008, 0.03, 12).rotateX(Math.PI / 2), polished, 0, STROKE / 2, 0);
    add(web, new THREE.CylinderGeometry(0.03, 0.03, 0.008, 24, 1, false, Math.PI * 0.6, Math.PI * 0.8).rotateX(Math.PI / 2), steel, 0, 0, 0);
    pins.push(web);
  });
  // flywheel + front pulley
  const fly = add(crank, new THREE.CylinderGeometry(0.075, 0.075, 0.016, 48).rotateX(Math.PI / 2), dark, 0, 0, -0.2);
  add(crank, new THREE.TorusGeometry(0.07, 0.004, 8, 64), polished, 0, 0, -0.209);
  add(crank, new THREE.CylinderGeometry(0.035, 0.035, 0.014, 32).rotateX(Math.PI / 2), polished, 0, 0, 0.19);

  // --- pistons + rods ---
  const pistons = [], rods = [];
  const pistonGeo = new THREE.CylinderGeometry(BORE / 2, BORE / 2, 0.034, 32);
  const ringGeo = new THREE.TorusGeometry(BORE / 2 + 0.0005, 0.0012, 6, 32).rotateX(Math.PI / 2);
  const rodGeo = new THREE.BoxGeometry(0.009, ROD, 0.007).translate(0, ROD / 2, 0);
  CYL_Z.forEach(z => {
    const p = new THREE.Group(); p.position.z = z; root.add(p); pistons.push(p);
    add(p, pistonGeo, polished);
    [0.01, 0.004, -0.002].forEach(y => add(p, ringGeo, dark, 0, y, 0));
    const r = add(root, rodGeo, steel); r.position.z = z; rods.push(r);
  });
  parts.pistons = pistons;

  // --- combustion glow (one per cylinder) ---
  const sparks = CYL_Z.map(z => {
    const m = add(root, new THREE.SphereGeometry(BORE / 2.3, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff6a3d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 0, deckY - 0.012, z);
    m.scale.y = 0.45; return m;
  });

  // --- cylinder head + cam cover ---
  const head = new THREE.Group(); head.position.y = deckY; root.add(head); parts.head = head;
  add(head, new THREE.BoxGeometry(0.14, 0.045, 0.3), steel, 0, 0.0225, 0);
  CYL_Z.forEach(z => { // spark plugs on the side
    add(head, new THREE.CylinderGeometry(0.004, 0.004, 0.03, 8).rotateZ(Math.PI / 2.6), polished, 0.08, 0.03, z);
    add(head, new THREE.CylinderGeometry(0.006, 0.006, 0.018, 12).rotateZ(Math.PI / 2.6), wine, 0.095, 0.037, z);
  });
  const cover = new THREE.Group(); cover.position.y = deckY + 0.045; root.add(cover); parts.cover = cover;
  const coverGeo = new THREE.CapsuleGeometry(0.045, 0.2, 8, 24).rotateX(Math.PI / 2); coverGeo.scale(1.25, 0.6, 1);
  add(cover, coverGeo, polished, 0, 0.02, 0);
  for (let i = -3; i <= 3; i++) add(cover, new THREE.BoxGeometry(0.11, 0.004, 0.006), steel, 0, 0.048, i * 0.03);
  add(cover, new THREE.CylinderGeometry(0.012, 0.012, 0.02, 16), wine, 0, 0.055, 0.12); // oil cap

  // --- oil pan ---
  const pan = new THREE.Group(); root.add(pan); parts.pan = pan;
  add(pan, new THREE.BoxGeometry(0.15, 0.06, 0.3), dark, 0, -0.07, 0);
  for (let i = -4; i <= 4; i++) add(pan, new THREE.BoxGeometry(0.152, 0.05, 0.003), steel, 0, -0.07, i * 0.032);

  // --- intake: twin Solex carbs + air cleaners (left), exhaust manifold (right) ---
  const intake = new THREE.Group(); root.add(intake); parts.intake = intake;
  [-0.075, 0.075].forEach(z => {
    add(intake, new THREE.CylinderGeometry(0.014, 0.014, 0.05, 16).rotateZ(Math.PI / 2), steel, -0.09, deckY + 0.01, z);
    add(intake, new THREE.BoxGeometry(0.04, 0.05, 0.05), polished, -0.13, deckY + 0.03, z);
    add(intake, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 40), wine, -0.13, deckY + 0.07, z);
    add(intake, new THREE.TorusGeometry(0.05, 0.004, 8, 40).rotateX(Math.PI / 2), polished, -0.13, deckY + 0.085, z);
  });
  const exhaust = new THREE.Group(); root.add(exhaust); parts.exhaust = exhaust;
  CYL_Z.forEach(z => {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0.07, deckY + 0.02, z), new THREE.Vector3(0.11, deckY - 0.01, z * 0.8), new THREE.Vector3(0.12, deckY - 0.08, z * 0.4), new THREE.Vector3(0.11, -0.05, -0.05)]);
    add(exhaust, new THREE.TubeGeometry(c, 24, 0.008, 10), steel);
  });

  // --- front: fan + timing cover ---
  const front = new THREE.Group(); root.add(front); parts.front = front;
  add(front, new THREE.BoxGeometry(0.12, 0.16, 0.014), dark, 0, 0.06, 0.155);
  const fan = new THREE.Group(); fan.position.set(0, 0.11, 0.2); front.add(fan);
  for (let i = 0; i < 4; i++) { const b = add(fan, new THREE.BoxGeometry(0.018, 0.075, 0.003), wine, 0, 0, 0); b.geometry.translate(0, 0.04, 0); b.rotation.z = i * Math.PI / 2; b.rotation.y = 0.35; }
  add(fan, new THREE.CylinderGeometry(0.014, 0.014, 0.012, 20).rotateX(Math.PI / 2), polished);

  // perf: merge static sub-assemblies (rods/sparks on the root stay separate: they animate)
  [block, crank, ...pins, ...pistons, head, cover, pan, intake, exhaust, front, fan].forEach(g => mergeStatic(g, { castShadow: g === cover || g === head }));

  // exploded offsets for the "pistons" chapter
  const home = {}; for (const k in parts) if (parts[k].isObject3D) home[k] = parts[k].position.clone();
  const EXPL = { cover: [0, 0.16, 0], head: [0, 0.1, 0], pan: [0, -0.1, 0], intake: [-0.14, 0.04, 0], exhaust: [0.14, 0, 0], front: [0, 0, 0.14], block: [0, 0, 0] };

  let angle = 0;
  const pistonY = a => STROKE / 2 * Math.cos(a) + Math.sqrt(ROD * ROD - (STROKE / 2 * Math.sin(a)) ** 2);

  return {
    root, mats, edgeMat, glass,
    /** crank angle in radians of cylinder 1 (0 = TDC), within a 4π cycle */
    get cycle() { return ((angle % (Math.PI * 4)) + Math.PI * 4) % (Math.PI * 4); },
    update(dt, rpm, explode) {
      angle += dt * rpm / 60 * Math.PI * 2;
      crank.rotation.z = -angle;
      fan.rotation.z = -angle;
      pistons.forEach((p, i) => {
        const a = angle + PHASE[i];
        const py = CRANK_Y + pistonY(a);
        p.position.y = py;
        const px = STROKE / 2 * Math.sin(a), pyPin = CRANK_Y + STROKE / 2 * Math.cos(a);
        rods[i].position.set(px, pyPin, CYL_Z[i]);
        rods[i].rotation.z = Math.atan2(px, py - pyPin); // tilt toward the pin
        // combustion: cylinder i fires at its own TDC after compression (firing order 1-3-4-2)
        const fireAt = [0, 3, 1, 2][i] * Math.PI; // offset within 720°
        const ph = ((angle - fireAt) % (Math.PI * 4) + Math.PI * 4) % (Math.PI * 4);
        sparks[i].material.opacity = ph < 0.9 ? (1 - ph / 0.9) * 0.9 : 0;
      });
      for (const k in EXPL) parts[k].position.copy(home[k]).addScaledVector(new THREE.Vector3(...EXPL[k]), explode);
    },
  };
}
