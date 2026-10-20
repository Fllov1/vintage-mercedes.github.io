import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeStatic } from './merge.js';

// Procedural 190 SL cabin: ivory leather seats with vertical pleats, thin ivory steering wheel
// with chrome horn ring, body-colour dash with white-faced gauges, Becker-style radio, glovebox,
// tunnel + gear lever, pedals, carpets, door cards, mirror. Coordinates are car space
// (Y up, +Z front, +X = driver side / LHD). Unit ≈ 2.28 m.

const canvasTex = (size, draw) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
};

/** Mercedes three-pointed star (used on the steering hub and the wheel centre caps). */
export function starTexture(bg = '#141112') {
  return canvasTex(512, (g, s) => {
    const c = s / 2;
    g.fillStyle = bg; g.fillRect(0, 0, s, s);
    const chrome = g.createLinearGradient(0, 0, s, s);
    chrome.addColorStop(0, '#ffffff'); chrome.addColorStop(0.45, '#9a9a9a'); chrome.addColorStop(0.55, '#e8e8e8'); chrome.addColorStop(1, '#6d6d6d');
    g.strokeStyle = chrome; g.lineWidth = s * 0.045; g.beginPath(); g.arc(c, c, s * 0.42, 0, Math.PI * 2); g.stroke();
    g.fillStyle = chrome; g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 3, b = a + Math.PI / 3, R = s * 0.4, r = s * 0.06;
      g.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
      g.lineTo(c + Math.cos(b) * r, c + Math.sin(b) * r);
    }
    g.closePath(); g.fill();
  });
}

function gaugeTexture({ max, step, label, unit, red }) {
  return canvasTex(512, (g, s) => {
    const c = s / 2;
    const face = g.createRadialGradient(c, c * 0.8, 10, c, c, c);
    face.addColorStop(0, '#f6f0e3'); face.addColorStop(1, '#d9cfbb');
    g.fillStyle = face; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25; // 270° sweep
    if (red) { g.strokeStyle = '#8e1d31'; g.lineWidth = 14; g.beginPath(); g.arc(c, c, c * 0.84, a0 + (a1 - a0) * red, a1); g.stroke(); }
    g.fillStyle = '#1a1516'; g.strokeStyle = '#1a1516';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let v = 0; v <= max; v += step / 2) {
      const a = a0 + (a1 - a0) * v / max, major = v % step === 0;
      g.lineWidth = major ? 5 : 2;
      g.beginPath(); g.moveTo(c + Math.cos(a) * c * (major ? 0.76 : 0.8), c + Math.sin(a) * c * (major ? 0.76 : 0.8)); g.lineTo(c + Math.cos(a) * c * 0.9, c + Math.sin(a) * c * 0.9); g.stroke();
      if (major) { g.font = '600 38px Manrope, sans-serif'; g.fillText(String(v / (unit === 'x1000' ? 1000 : 1)), c + Math.cos(a) * c * 0.6, c + Math.sin(a) * c * 0.6); }
    }
    g.font = '500 26px Manrope, sans-serif'; g.fillStyle = '#5a504a'; g.fillText(label, c, c * 1.38);
    g.font = '400 20px Manrope, sans-serif'; g.fillText(unit, c, c * 1.52);
  });
}

function radioTexture() {
  return canvasTex(512, (g, s) => {
    g.fillStyle = '#efe4c9'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#3a2f2a'; g.font = '500 34px "JetBrains Mono", monospace'; g.textAlign = 'center';
    ['54', '60', '70', '80', '100', '120', '140', '160'].forEach((t, i) => g.fillText(t, 40 + i * 62, s * 0.38));
    g.fillRect(20, s * 0.5, s - 40, 3);
    for (let i = 0; i < 60; i++) g.fillRect(20 + i * (s - 40) / 60, s * 0.5 - (i % 5 ? 10 : 22), 2, i % 5 ? 10 : 22);
    g.fillStyle = '#8e1d31'; g.fillRect(s * 0.42, s * 0.18, 5, s * 0.5);
    g.font = '600 30px Manrope, sans-serif'; g.fillStyle = '#3a2f2a'; g.fillText('BECKER · MEXICO', s / 2, s * 0.8);
  });
}

export function createInterior({ paintColor }) {
  const root = new THREE.Group(); root.name = 'interior';
  const named = {};

  const M = {
    leather: new THREE.MeshPhysicalMaterial({ color: 0xd9c9ad, roughness: 0.55, sheen: 0.7, sheenRoughness: 0.5, sheenColor: 0xfff1db, clearcoat: 0.15, clearcoatRoughness: 0.5 }),
    piping: new THREE.MeshPhysicalMaterial({ color: 0x6e1424, roughness: 0.45, clearcoat: 0.4 }),
    dark: new THREE.MeshPhysicalMaterial({ color: 0x1b1617, roughness: 0.6, sheen: 0.4, sheenColor: 0x4a3c3e }),
    carpet: new THREE.MeshStandardMaterial({ color: 0x2b0c12, roughness: 1 }),
    chrome: new THREE.MeshPhysicalMaterial({ color: 0xe9e9e9, metalness: 1, roughness: 0.07 }),
    ivory: new THREE.MeshPhysicalMaterial({ color: 0xf0e6d0, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }),
    paint: new THREE.MeshPhysicalMaterial({ color: paintColor, metalness: 0.35, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transmission: 0, transparent: true, opacity: 0.12, clearcoat: 1, depthWrite: false }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x111010, roughness: 0.9 }),
    cavity: new THREE.MeshStandardMaterial({ color: 0x090707, roughness: 1 }),
  };
  M.paint.color = paintColor; // share the live paint colour so the dash follows the colour picker

  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; }; // no shadows: the cabin is small on screen
  const rbox = (w, h, d, r = 0.01) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));
  const group = (parent, x = 0, y = 0, z = 0, name) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); if (name) { g.name = name; named[name] = g; } return g; };

  // ---------- floor ----------
  const floor = group(root, 0, 0, 0, 'floor');
  mesh(rbox(0.82, 0.012, 0.64, 0.004), M.carpet, floor, 0, 0.128, -0.2);
  const tunnel = group(root, 0, 0, 0, 'tunnel');
  mesh(rbox(0.13, 0.085, 0.42, 0.03), M.carpet, tunnel, 0, 0.165, -0.12);
  // gear lever: chrome stick, ivory knob, leather boot
  const gear = group(tunnel, 0, 0.205, -0.02, 'gear');
  mesh(new THREE.ConeGeometry(0.022, 0.03, 20), M.dark, gear, 0, 0.012, 0);
  const stick = mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.14, 12), M.chrome, gear, 0, 0.07, -0.01); stick.rotation.x = -0.18;
  mesh(new THREE.SphereGeometry(0.014, 24, 16), M.ivory, gear, 0, 0.14, -0.022);
  // handbrake-ish ashtray + chrome plate on tunnel front
  mesh(rbox(0.07, 0.006, 0.04, 0.003), M.chrome, tunnel, 0, 0.208, 0.05);

  // pedals
  const pedals = group(root, 0.19, 0.17, 0.075, 'pedals');
  [-0.055, 0, 0.05].forEach((x, i) => {
    const p = mesh(rbox(i === 2 ? 0.02 : 0.03, 0.045, 0.006, 0.003), M.rubber, pedals, x, 0, 0); p.rotation.x = -0.5;
    mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.08, 8), M.chrome, pedals, x, 0.04, 0.02).rotation.x = 0.6;
  });

  // ---------- seats ----------
  const flute = new THREE.CapsuleGeometry(0.017, 0.17, 6, 14);
  function seat(name, sx) {
    const s = group(root, sx * 0.185, 0.14, -0.27, name);
    mesh(rbox(0.25, 0.05, 0.25, 0.012), M.dark, s, 0, 0.03, 0);                // frame
    mesh(rbox(0.25, 0.05, 0.24, 0.02), M.leather, s, 0, 0.075, 0.005);          // cushion
    for (let i = -2; i <= 2; i++) { const f = mesh(flute, M.leather, s, i * 0.038, 0.1, 0.01); f.rotation.x = Math.PI / 2; f.scale.set(1, 1, 0.55); }
    [-1, 1].forEach(k => { mesh(rbox(0.035, 0.07, 0.24, 0.015), M.leather, s, k * 0.11, 0.09, 0.005); mesh(new THREE.TorusGeometry(0.004, 0.003, 6, 8), M.piping, s, k * 0.093, 0.125, 0.12); });
    mesh(rbox(0.25, 0.008, 0.008, 0.003), M.piping, s, 0, 0.1, 0.127);          // front piping
    // backrest on a hinge
    const back = group(s, 0, 0.09, -0.11); back.rotation.x = -0.24; back.name = name + 'Back'; named[back.name] = back;
    mesh(rbox(0.25, 0.3, 0.055, 0.025), M.leather, back, 0, 0.15, 0);
    for (let i = -2; i <= 2; i++) { const f = mesh(flute, M.leather, back, i * 0.038, 0.14, 0.028); f.scale.set(1, 1.15, 0.5); }
    [-1, 1].forEach(k => mesh(rbox(0.035, 0.28, 0.07, 0.016), M.leather, back, k * 0.11, 0.145, 0.006));
    mesh(new THREE.CapsuleGeometry(0.03, 0.2, 6, 16).rotateZ(Math.PI / 2), M.leather, back, 0, 0.3, 0.004); // top roll
    mesh(rbox(0.22, 0.004, 0.004, 0.002), M.chrome, back, 0, 0.27, -0.03);       // chrome trim on the back
    return s;
  }
  seat('seatL', 1); seat('seatR', -1);

  // rear luggage shelf with leather straps
  const shelf = group(root, 0, 0, 0, 'shelf');
  mesh(rbox(0.78, 0.13, 0.12, 0.02), M.leather, shelf, 0, 0.2, -0.5);
  mesh(rbox(0.78, 0.01, 0.12, 0.004), M.piping, shelf, 0, 0.267, -0.5);
  [-0.18, 0.18].forEach(x => { mesh(rbox(0.025, 0.004, 0.13, 0.002), M.dark, shelf, x, 0.275, -0.5); mesh(rbox(0.03, 0.012, 0.012, 0.003), M.chrome, shelf, x, 0.28, -0.44); });

  // ---------- dashboard ----------
  const dash = group(root, 0, 0, 0, 'dash');
  mesh(rbox(0.84, 0.2, 0.04, 0.01), M.dark, dash, 0, 0.35, 0.13);                // firewall / lower dash
  const panel = mesh(rbox(0.86, 0.13, 0.035, 0.012), M.paint, dash, 0, 0.5, 0.1); panel.rotation.x = -0.12;
  mesh(new THREE.CapsuleGeometry(0.026, 0.8, 8, 20).rotateZ(Math.PI / 2), M.dark, dash, 0, 0.572, 0.088); // padded roll
  mesh(rbox(0.84, 0.006, 0.008, 0.003), M.chrome, dash, 0, 0.44, 0.086);
  mesh(rbox(0.84, 0.004, 0.006, 0.002), M.chrome, dash, 0, 0.548, 0.078);
  // passenger grab handle
  const grab = mesh(new THREE.TorusGeometry(0.05, 0.005, 10, 40, Math.PI), M.chrome, dash, -0.2, 0.535, 0.074); grab.rotation.x = Math.PI / 2 + 0.6;

  // gauges in front of the driver
  const gauges = group(dash, 0.19, 0.5, 0.079, 'gauges');
  gauges.rotation.x = -0.12;
  const needles = [];
  const gauge = (x, y, r, tex) => {
    const g = group(gauges, x, y, 0);
    mesh(new THREE.TorusGeometry(r + 0.004, 0.0045, 12, 48), M.chrome, g);
    const face = mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffe9c8, emissiveIntensity: 0.06, emissiveMap: tex }), g, 0, 0, 0.001);
    face.rotation.y = Math.PI; // face looks toward the driver (-Z)
    const pivot = group(g, 0, 0, -0.004);
    mesh(new THREE.BoxGeometry(0.002, r * 0.85, 0.001).translate(0, r * 0.38, 0), new THREE.MeshBasicMaterial({ color: 0x8e1d31 }), pivot);
    mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.004, 16).rotateX(Math.PI / 2), M.chrome, pivot);
    const dome = mesh(new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, 0.5), M.glass, g, 0, 0, -0.002); dome.rotation.x = -Math.PI / 2; dome.scale.z = 0.25;
    needles.push(pivot); return g;
  };
  gauge(-0.042, 0, 0.038, gaugeTexture({ max: 200, step: 40, label: 'km/h', unit: 'Mercedes-Benz', red: 0 }));
  gauge(0.042, 0, 0.038, gaugeTexture({ max: 6000, step: 1000, label: '1/min', unit: 'x1000', red: 0.95 }));
  gauge(0, -0.052, 0.016, gaugeTexture({ max: 100, step: 50, label: '', unit: '°C' }));
  // clock in the middle of the dash
  const clock = group(dash, 0, 0.53, 0.082, 'clock'); clock.rotation.x = -0.12;
  mesh(new THREE.TorusGeometry(0.024, 0.0035, 10, 40), M.chrome, clock);
  mesh(new THREE.CircleGeometry(0.023, 40), new THREE.MeshStandardMaterial({ map: gaugeTexture({ max: 12, step: 3, label: 'KIENZLE', unit: '' }), roughness: 0.5 }), clock, 0, 0, 0.001).rotation.y = Math.PI;

  // radio
  const radio = group(dash, 0, 0.465, 0.08, 'radio'); radio.rotation.x = -0.12;
  mesh(rbox(0.16, 0.045, 0.014, 0.004), M.chrome, radio);
  mesh(new THREE.PlaneGeometry(0.1, 0.02), new THREE.MeshStandardMaterial({ map: radioTexture(), emissive: 0xffd9a0, emissiveIntensity: 0.25, roughness: 0.4 }), radio, 0, 0.006, -0.0075).rotation.y = Math.PI;
  for (let i = 0; i < 5; i++) mesh(rbox(0.012, 0.009, 0.01, 0.002), M.ivory, radio, -0.03 + i * 0.015, -0.013, -0.008);
  [-1, 1].forEach(k => mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 24).rotateX(Math.PI / 2), M.chrome, radio, k * 0.068, 0, -0.01));

  // glovebox (бардачок): lid hinged at its bottom edge, cavity behind it
  mesh(rbox(0.19, 0.06, 0.05, 0.004), M.cavity, dash, -0.2, 0.475, 0.11);
  mesh(rbox(0.1, 0.012, 0.06, 0.003), M.piping, dash, -0.22, 0.455, 0.105); // service booklet inside
  const glove = group(dash, -0.2, 0.443, 0.078, 'glovebox'); glove.rotation.x = -0.12;
  const lid = group(glove);
  mesh(rbox(0.2, 0.068, 0.008, 0.004).translate(0, 0.034, 0), M.paint, lid);
  mesh(rbox(0.05, 0.007, 0.008, 0.003), M.chrome, lid, 0, 0.055, -0.006);
  named.gloveLid = lid;

  // ---------- steering wheel ----------
  const column = group(root, 0.19, 0.44, 0.02, 'steering');
  column.rotation.x = 0.72; // top of the rim leans toward the dash
  const wheel = group(column, 0, 0, 0, 'steeringWheel');
  mesh(new THREE.TorusGeometry(0.098, 0.0068, 16, 120), M.ivory, wheel);
  mesh(new THREE.TorusGeometry(0.062, 0.0026, 10, 90), M.chrome, wheel, 0, 0, -0.016);      // horn ring
  [0, Math.PI, -Math.PI / 2].forEach(a => {
    const sp = mesh(new THREE.CylinderGeometry(0.0035, 0.005, 0.085, 10), M.ivory, wheel, Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.006);
    sp.rotation.z = a + Math.PI / 2; sp.rotation.x = 0.18 * Math.sign(Math.cos(a) || 1);
    [0.3, 0.7].forEach(t => { // chrome wire pairs from hub to horn ring, period detail
      const w = mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.04, 6), M.chrome, wheel, Math.cos(a + (t - 0.5) * 0.5) * 0.04, Math.sin(a + (t - 0.5) * 0.5) * 0.04, -0.014);
      w.rotation.z = a + (t - 0.5) * 0.5 + Math.PI / 2;
    });
  });
  mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.02, 32).rotateX(Math.PI / 2), M.ivory, wheel, 0, 0, -0.006);
  const cap = mesh(new THREE.CircleGeometry(0.022, 40), new THREE.MeshPhysicalMaterial({ map: starTexture('#6e1424'), metalness: 0.4, roughness: 0.2, clearcoat: 1 }), wheel, 0, 0, -0.0165);
  cap.rotation.y = Math.PI;
  mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.2, 16).rotateX(Math.PI / 2), M.dark, column, 0, 0, 0.1);   // column
  mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.06, 8).rotateZ(Math.PI / 2), M.chrome, column, 0.03, 0.01, 0.03); // indicator stalk

  // ---------- door cards (attached to the door parts by the stage) ----------
  const doorCard = sx => {
    const g = new THREE.Group();
    mesh(rbox(0.014, 0.22, 0.42, 0.006), M.leather, g, 0, 0, 0);
    mesh(rbox(0.016, 0.006, 0.4, 0.003), M.piping, g, 0, 0.07, 0);
    mesh(rbox(0.018, 0.05, 0.3, 0.01), M.carpet, g, 0, -0.08, -0.02);                  // map pocket
    mesh(rbox(0.012, 0.012, 0.06, 0.004), M.chrome, g, -sx * 0.01, 0.03, 0.12);       // door handle
    const crank = group(g, -sx * 0.012, -0.02, 0.05);
    mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 16).rotateZ(Math.PI / 2), M.chrome, crank);
    mesh(rbox(0.004, 0.035, 0.006, 0.002).translate(0, 0.016, 0), M.chrome, crank, -sx * 0.004, 0, 0);
    mesh(new THREE.SphereGeometry(0.006, 12, 8), M.ivory, crank, -sx * 0.008, 0.032, 0);
    mergeStatic(g); mergeStatic(crank);
    return g;
  };

  // ---------- rear-view mirror (attached to the roof part) ----------
  const mirror = new THREE.Group();
  mesh(rbox(0.1, 0.032, 0.012, 0.008), M.chrome, mirror);
  mesh(new THREE.PlaneGeometry(0.09, 0.024), new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.02 }), mirror, 0, 0, -0.0065).rotation.y = Math.PI;
  mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.04, 8), M.chrome, mirror, 0, 0.03, 0.004);

  mergeStatic(mirror);
  // perf: one draw call per material per group
  const groups = []; root.traverse(o => { if (o.isGroup || o === root) groups.push(o); });
  groups.forEach(g => mergeStatic(g));

  // ---------- explode / animate ----------
  const home = {}; for (const k in named) home[k] = named[k].position.clone();
  const EXPL = {
    seatL: [0.32, 0.28, -0.05], seatR: [-0.32, 0.28, -0.05], steering: [0.08, 0.42, -0.15], dash: [0, 0.3, 0.32],
    tunnel: [0, 0.16, 0], shelf: [0, 0.22, -0.3], pedals: [0.1, -0.02, 0.18], radio: [0, 0, -0.12], gauges: [0, 0.04, -0.1], clock: [0, 0.06, -0.08],
  };
  const v = new THREE.Vector3();
  return {
    root, named, materials: M, doorCard, mirror,
    update(dt, { explode = 0, glove = 0, rpm = 0, speed = 0, steer = 0 }) {
      for (const k in EXPL) named[k].position.copy(home[k]).add(v.set(...EXPL[k]).multiplyScalar(explode));
      named.seatLBack.rotation.x = -0.24 - explode * 0.35;
      named.seatRBack.rotation.x = -0.24 - explode * 0.35;
      named.gloveLid.rotation.x = -1.25 * Math.max(glove, explode);
      named.steeringWheel.rotation.z = -steer * 2.2 + explode * 0.6;
      // needles: speedo follows scroll speed, tach follows the engine (or idles)
      const sweep = a => -Math.PI * 0.75 + a * Math.PI * 1.5;
      needles[0].rotation.z = -sweep(Math.min(1, speed));
      needles[1].rotation.z = -sweep(Math.min(1, (rpm || 800) / 6000));
      needles[2].rotation.z = -sweep(0.55);
    },
  };
}
