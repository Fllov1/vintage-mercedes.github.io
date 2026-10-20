import * as THREE from 'three';
import { starTexture } from './interior.js';

// Detailed wheel (assets/wheel.bin, see dev/wheel.html): tire (sidewall + tread), chrome rim with
// star centre cap, lug nuts, vented brake disc and caliper. Normalised: axle = X, tire radius = 1,
// outer face toward -X.

function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

function arcText(g, text, cx, cy, r, top) {
  const total = g.measureText(text).width;
  let a = (top ? -Math.PI / 2 : Math.PI / 2) + (top ? -1 : 1) * total / r / 2;
  for (const ch of text) {
    const w = g.measureText(ch).width, mid = a + (top ? 1 : -1) * w / r / 2;
    g.save(); g.translate(cx + Math.cos(mid) * r, cy + Math.sin(mid) * r); g.rotate(mid + (top ? 1 : -1) * Math.PI / 2);
    g.fillText(ch, 0, 0); g.restore();
    a += (top ? 1 : -1) * w / r;
  }
}

/** Period-style sidewall: black rubber, ivory whitewall band near the rim, moulded lettering. */
function sidewallTexture() {
  return canvasTex(1024, (g, s) => {
    const c = s / 2, ring = (r0, r1, col) => { g.beginPath(); g.arc(c, c, r1 * s, 0, Math.PI * 2); g.arc(c, c, r0 * s, 0, Math.PI * 2, true); g.fillStyle = col; g.fill(); };
    g.fillStyle = '#181516'; g.fillRect(0, 0, s, s);
    ring(0.345, 0.4, '#e9e1cf');                       // whitewall
    ring(0.398, 0.402, '#bdb3a0');
    ring(0.452, 0.455, '#262223'); ring(0.405, 0.408, '#262223'); // moulded rings
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const emboss = (text, r, top, size, weight = 600) => {
      g.font = `${weight} ${size}px Manrope, Arial, sans-serif`;
      g.fillStyle = '#0c0a0a'; arcText(g, text, c + 1, c + 1.5, r * s, top);
      g.fillStyle = '#3a3536'; arcText(g, text, c, c, r * s, top);
    };
    emboss('MERCEDES-BENZ', 0.43, true, 27, 700);
    emboss('190 SL  ·  6.40 — 13  ·  TUBELESS', 0.43, false, 17);
  });
}

function discTexture() {
  return canvasTex(512, (g, s) => {
    const c = s / 2; g.fillStyle = '#8b8781'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 450; i++) {
      const r = Math.random() * c, l = 110 + Math.random() * 90;
      g.strokeStyle = `rgba(${l},${l - 3},${l - 6},${0.08 + Math.random() * 0.12})`; g.lineWidth = 1 + Math.random() * 2;
      g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
    }
    const hat = g.createRadialGradient(c, c, 0, c, c, c * 0.42); hat.addColorStop(0, '#3a3637'); hat.addColorStop(0.95, '#4a4546'); hat.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hat; g.beginPath(); g.arc(c, c, c * 0.42, 0, Math.PI * 2); g.fill();
  });
}

const BLOB_GEO = new THREE.PlaneGeometry(1, 1);
const BLOB_MAT = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: canvasTex(128, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
}) });

export function createWheels(decoded) {
  const M = {
    sidewall: new THREE.MeshStandardMaterial({ map: sidewallTexture(), roughness: 0.72 }),
    tread: new THREE.MeshStandardMaterial({ color: 0x171516, roughness: 0.85 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xe6e6e6, metalness: 1, roughness: 0.1 }),
    hub: new THREE.MeshStandardMaterial({ color: 0x2a2526, metalness: 0.8, roughness: 0.35 }),
    logo: new THREE.MeshPhysicalMaterial({ map: starTexture('#141112'), metalness: 0.5, roughness: 0.2, clearcoat: 1 }),
    nuts: new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 1, roughness: 0.12 }),
    disc: new THREE.MeshStandardMaterial({ map: discTexture(), metalness: 1, roughness: 0.38 }),
    caliper: new THREE.MeshPhysicalMaterial({ color: 0x6e1424, metalness: 0.3, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 }),
  };
  const geo = Object.fromEntries(decoded.map(p => [p.name, p.geometry]));
  const mk = (names, parent) => names.forEach(n => {
    parent.add(new THREE.Mesh(geo[n], M[n])); // perf: no shadow casting (≈120k tris per wheel); a contact blob grounds it
  });

  /** One wheel corner. side: +1 = car's left (+X), -1 = right. */
  function corner(radius, side, width = 0.8) {
    const root = new THREE.Group();
    const orient = new THREE.Group(); orient.rotation.y = side > 0 ? Math.PI : 0; orient.scale.set(radius * width, radius, radius); root.add(orient);
    const spin = new THREE.Group(); orient.add(spin);
    const tire = new THREE.Group(), rim = new THREE.Group(), disc = new THREE.Group();
    spin.add(tire, rim, disc);
    mk(['sidewall', 'tread'], tire); mk(['rim', 'hub', 'logo', 'nuts'], rim); mk(['disc'], disc);
    mk(['caliper'], orient); // the caliper is fixed to the hub carrier: it doesn't spin
    const blob = new THREE.Mesh(BLOB_GEO, BLOB_MAT); blob.rotation.x = -Math.PI / 2; blob.scale.set(radius * 1.1, radius * 2.4, 1); root.add(blob);
    return {
      root, side,
      ground(y) { blob.position.y = 0.003 - y; },
      set(angle, steer, out, apart) {
        root.rotation.y = steer;
        spin.rotation.x = angle * (side > 0 ? -1 : 1);
        orient.position.x = blob.position.x = side * out;
        tire.position.x = -apart * 2.6; rim.position.x = -apart * 1.3; disc.position.x = -apart * 0.45;
      },
    };
  }
  return { corner, materials: M };
}
