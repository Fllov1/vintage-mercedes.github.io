// Rules that split the single generated mesh into explodable parts.
// Car axes: +Z = front, +X = car's left side, Y = up. Units ≈ 1.88 = car length.
export const WHEELS = {
  front: { y: 0.205, z: 0.497, r: 0.205, xin: 0.33 },
  rear: { y: 0.285, z: -0.632, r: 0.158, xin: 0.27 },
};

// pivot = where the part rotates/spins around; dir = explode direction (world units at full explode)
export const PARTS = [
  { name: 'body', label: 'Кузов', group: 'body', pivot: [0, 0.4, 0], dir: [0, 0, 0] },
  { name: 'hood', label: 'Капот', group: 'body', pivot: [0, 0.55, 0.35], dir: [0, 0.9, 0.25] },
  { name: 'trunk', label: 'Кришка багажника', group: 'body', pivot: [0, 0.5, -0.7], dir: [0, 0.7, -0.35] },
  { name: 'roof', label: 'Хардтоп', group: 'body', pivot: [0, 0.72, -0.25], dir: [0, 1.0, -0.1] },
  { name: 'doorL', label: 'Двері', group: 'body', pivot: [0.5, 0.4, -0.15], dir: [0.8, 0.05, 0] },
  { name: 'doorR', label: 'Двері', group: 'body', pivot: [-0.5, 0.4, -0.15], dir: [-0.8, 0.05, 0] },
  { name: 'nose', label: 'Решітка й бампер', group: 'body', pivot: [0, 0.3, 0.88], dir: [0, 0.05, 0.75] },
  { name: 'tail', label: 'Задній бампер', group: 'body', pivot: [0, 0.25, -0.9], dir: [0, 0, -0.6] },
  ...['FL', 'FR', 'RL', 'RR'].flatMap(k => {
    const w = k[0] === 'F' ? WHEELS.front : WHEELS.rear, sx = k[1] === 'L' ? 1 : -1;
    const x = sx * (k[0] === 'F' ? 0.44 : 0.4);
    // the generated rear wheels float too high and small: drop + enlarge them a bit
    const rest = k[0] === 'R' ? { dy: -0.07, s: 1.12 } : null;
    return [
      { name: 'tire' + k, label: 'Шина', group: 'wheel', pivot: [x, w.y, w.z], dir: [sx * 0.75, 0, 0], rest },
      { name: 'rim' + k, label: 'Диск', group: 'wheel', pivot: [x, w.y, w.z], dir: [sx * 0.5, 0, 0], rest },
    ];
  }),
];
const ID = Object.fromEntries(PARTS.map((p, i) => [p.name, i]));

/** Old generated tires/rims: whole triangles by centroid (they're replaced by the detailed wheel). */
export function wheelOf(c) {
  const ax = Math.abs(c.x);
  for (const [axle, w] of [['F', WHEELS.front], ['R', WHEELS.rear]]) {
    const d = Math.hypot(c.y - w.y, c.z - w.z);
    if (d < w.r && ax > w.xin) return ID[(d < w.r * 0.66 ? 'rim' : 'tire') + axle + (c.x > 0 ? 'L' : 'R')];
  }
  return -1;
}

// Panels are cut out with axis-aligned boxes; triangles crossing a box face are split exactly on
// that plane, so every panel gets a clean straight edge instead of a triangle "saw".
// Each part = union of boxes; earlier entries win.
const I = Infinity;
export const REGIONS = [
  ['nose', [{ x: [-I, I], y: [-I, 0.3], z: [0.8, I] }, { x: [-0.3, 0.3], y: [-I, 0.5], z: [0.8, I] }]],
  ['tail', [{ x: [-I, I], y: [-I, 0.32], z: [-I, -0.86] }]],
  ['hood', [{ x: [-0.34, 0.34], y: [0.44, I], z: [0.12, 0.82] }]],
  ['trunk', [{ x: [-0.34, 0.34], y: [0.42, I], z: [-0.95, -0.6] }]],
  ['roof', [{ x: [-I, I], y: [0.62, I], z: [-0.68, 0.14] }]],
  ['doorL', [{ x: [0.4, I], y: [0.14, 0.62], z: [-0.43, 0.08] }]],
  ['doorR', [{ x: [-I, -0.4], y: [0.14, 0.62], z: [-0.43, 0.08] }]],
].map(([name, boxes]) => ({ id: ID[name], boxes }));
export const BODY = ID.body;
