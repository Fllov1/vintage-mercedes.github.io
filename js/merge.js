import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Perf: collapses a group's direct static mesh children into one mesh per material
 * (hundreds of tiny procedural meshes → a handful of draw calls). Sub-groups are left alone,
 * so animated pieces (pistons, glovebox lid, needles…) keep working.
 */
export function mergeStatic(group, { castShadow = false } = {}) {
  const byMat = new Map();
  for (const m of [...group.children]) {
    if (!m.isMesh || m.isSkinnedMesh) continue;
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(m);
  }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    const geos = list.map(m => {
      m.updateMatrix();
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      return g.applyMatrix4(m.matrix);
    });
    const merged = new THREE.Mesh(mergeGeometries(geos), mat);
    merged.castShadow = castShadow; merged.receiveShadow = false;
    list.forEach(m => group.remove(m));
    group.add(merged);
  }
}
