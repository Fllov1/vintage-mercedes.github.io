import * as THREE from 'three';
import { createEngine } from './engine.js';
import { createInterior } from './interior.js';
import { createWheels } from './wheel.js';

const lerp = THREE.MathUtils.lerp;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

/** Studio environment: dark room with long soft-boxes — gives the paint and chrome their reflections. */
function studioEnv(renderer) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(30, 14, 30), new THREE.MeshBasicMaterial({ color: 0x0c0b0b, side: THREE.BackSide })));
  const panel = (w, h, color, intensity, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); s.add(m);
  };
  panel(16, 1.2, 0xffffff, 4, [0, 6.8, -2], [Math.PI / 2, 0, 0]);
  panel(16, 1.2, 0xffffff, 3, [0, 6.8, 2.5], [Math.PI / 2, 0, 0]);
  panel(1.4, 10, 0xfff3ea, 2.2, [-14.5, 3, 0], [0, Math.PI / 2, 0]);
  panel(12, 3, 0xffffff, 1.6, [0, 3, 14.5], [0, 0, 0]);
  panel(10, 4, 0x8a1426, 2.5, [14.5, 2, -4], [0, -Math.PI / 2, 0]);
  panel(30, 30, 0x1b1718, 1, [0, -6.9, 0], [Math.PI / 2, 0, 0]);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.04);
  pm.dispose();
  return rt.texture;
}

function radialTexture(stops, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Decodes assets/car.bin (quantized positions/normals/uvs per part, see dev/build.html). */
function decodeParts(manifest, buf) {
  return manifest.parts.map(p => {
    const n = p.count;
    const q = new Uint16Array(buf, p.pos, n * 3), nn = new Int8Array(buf, p.nrm, n * 4), uq = new Uint16Array(buf, p.uv, n * 2);
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) { P[i * 3 + k] = p.min[k] + q[i * 3 + k] / 65535 * p.size[k]; N[i * 3 + k] = nn[i * 4 + k] / 127; }
      U[i * 2] = uq[i * 2] / 65535; U[i * 2 + 1] = uq[i * 2 + 1] / 65535;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    g.setIndex(new THREE.BufferAttribute(p.idx32 ? new Uint32Array(buf, p.idx, p.indexCount) : new Uint16Array(buf, p.idx, p.indexCount), 1));
    g.computeBoundingSphere();
    return { ...p, geometry: g };
  });
}

/** Paint shader: re-tints the baked red paint (mask.r) to any colour, darkens back faces of the hollow shell. */
function paintable(mat, uniforms) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = 'uniform vec3 uPaint;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_METALNESSMAP
  float pm = texture2D(metalnessMap, vMetalnessMapUv).r;
  float pl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = mix(diffuseColor.rgb, uPaint * clamp(pl / 0.15, 0.3, 1.5), smoothstep(0.15, 0.85, pm));
#endif
  if (!gl_FrontFacing) diffuseColor.rgb *= 0.18;`);
  };
  mat.customProgramCacheKey = () => 'paint';
}

export async function createStage(canvas, { onProgress = () => { } } = {}) {
  const isTouch = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  // perf: render scale is capped and then adapted to the measured frame time (see frame())
  const DPR_STEPS = [1.5, 1.25, 1, 0.85, 0.75];
  let dprStep = devicePixelRatio > 1.3 ? 1 : 2; // ≈1.25 on retina, 1 on regular screens
  if (isTouch) dprStep = Math.max(dprStep, 2);
  renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_STEPS[dprStep]));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.environment = studioEnv(renderer);
  scene.environmentIntensity = 0.9;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);

  // lights
  const key = new THREE.SpotLight(0xfff4ea, 38, 14, 0.55, 0.85, 1.6);
  key.position.set(1.8, 5.5, 2.6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.radius = 4; key.shadow.camera.near = 2; key.shadow.camera.far = 10;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xff4d64, 2.4); rim.position.set(-3, 1.6, -4); scene.add(rim);
  const front = new THREE.DirectionalLight(0xfff1e6, 1.1); front.position.set(-2.5, 1.2, 4); scene.add(front);
  const fill = new THREE.HemisphereLight(0xffffff, 0x1a0b0e, 0.5); scene.add(fill);

  // floor: soft bordeaux pool of light + real shadow catcher
  const floor = new THREE.Group(); scene.add(floor);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(120,20,36,0.55)'], [0.35, 'rgba(70,10,22,0.25)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = -0.002; floor.add(glow);
  const ao = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.6), new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(0,0,0,0.85)'], [0.6, 'rgba(0,0,0,0.4)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
  ao.rotation.x = -Math.PI / 2; ao.position.y = 0.001; floor.add(ao);
  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), new THREE.ShadowMaterial({ opacity: 0.55 }));
  shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.receiveShadow = true; floor.add(shadowCatcher);
  // concentric rings on the floor (echo of the HTML rings)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x9b2335, transparent: true, opacity: 0.22, depthWrite: false });
  [1.5, 2.2, 3.1].forEach((r, i) => { const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.006, 160), ringMat.clone()); m.material.opacity = 0.2 - i * 0.05; m.rotation.x = -Math.PI / 2; m.position.y = 0.002; floor.add(m); });

  // dust particles
  const dustN = isTouch ? 250 : 500, dp = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dp[i * 3] = (Math.random() - 0.5) * 14; dp[i * 3 + 1] = Math.random() * 5; dp[i * 3 + 2] = (Math.random() - 0.5) * 14; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.018, color: 0xd9a0a8, transparent: true, opacity: 0.45, depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  // ---------- load car ----------
  const total = { car: 0, wheel: 0, tex: 0 };
  const report = () => onProgress(Math.min(1, total.car * 0.3 + total.wheel * 0.5 + total.tex * 0.2));
  const fetchBin = async (url, key) => {
    const res = await fetch(url); const len = +res.headers.get('content-length') || 2e6;
    const reader = res.body.getReader(); const chunks = []; let got = 0;
    for (; ;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; total[key] = Math.min(1, got / len); report(); }
    const out = new Uint8Array(got); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out.buffer;
  };
  const texLoader = new THREE.TextureLoader();
  let texDone = 0;
  const loadTex = url => texLoader.loadAsync(url).then(t => { texDone++; total.tex = texDone / 2; report(); return t; });
  const [manifest, buf, wheelManifest, wheelBuf, albedo, mask] = await Promise.all([
    fetch('assets/car.json').then(r => r.json()), fetchBin('assets/car.bin', 'car'),
    fetch('assets/wheel.json').then(r => r.json()), fetchBin('assets/wheel.bin', 'wheel'),
    loadTex('assets/car.webp'), loadTex('assets/car-mask.png'),
    document.fonts?.ready, // canvas textures (gauges, sidewall lettering) use the web fonts
  ]);
  albedo.colorSpace = THREE.SRGBColorSpace; albedo.anisotropy = renderer.capabilities.getMaxAnisotropy();
  mask.colorSpace = THREE.NoColorSpace;

  const uniforms = { uPaint: { value: new THREE.Color('#5a0b17') } };
  const paint = new THREE.MeshPhysicalMaterial({
    map: albedo, metalnessMap: mask, roughnessMap: mask, clearcoatMap: mask,
    metalness: 1, roughness: 1, clearcoat: 1, clearcoatRoughness: 0.04, side: THREE.DoubleSide, envMapIntensity: 1.25,
  });
  paintable(paint, uniforms);
  const carMats = [paint];

  const car = new THREE.Group(); car.name = 'car'; scene.add(car);
  const parts = {};
  for (const p of decodeParts(manifest, buf)) {
    const mesh = new THREE.Mesh(p.geometry, paint);
    mesh.castShadow = true;
    const pivot = new THREE.Group(); pivot.position.fromArray(p.pivot); pivot.add(mesh); car.add(pivot);
    parts[p.name] = { ...p, obj: pivot, mesh, home: pivot.position.clone(), dir: new THREE.Vector3().fromArray(p.dir) };
  }

  // detailed wheels replace the generated model's blobby tires/rims
  const wheelKit = createWheels(decodeParts(wheelManifest, wheelBuf));
  const wheels = {};
  for (const k of ['FL', 'FR', 'RL', 'RR']) {
    const old = parts['tire' + k], side = Math.sign(old.home.x);
    const c = wheelKit.corner(k[0] === 'F' ? 0.205 : 0.182, side);
    c.root.position.copy(old.home); c.ground(old.home.y); c.front = k[0] === 'F'; car.add(c.root);
    wheels['wheel' + k] = c;
    for (const n of ['tire' + k, 'rim' + k]) {
      // the old tire parts also caught a strip of the wheel-arch lip; keep those triangles as body
      const g = parts[n].mesh.geometry, p = g.attributes.position, idx = g.index.array, keep = [];
      const r = (k[0] === 'F' ? 0.205 : 0.182) * 1.02;
      for (let t = 0; t < idx.length; t += 3) {
        let y = 0, z = 0; for (let j = 0; j < 3; j++) { y += p.getY(idx[t + j]); z += p.getZ(idx[t + j]); }
        if (Math.hypot(y / 3, z / 3) > r) keep.push(idx[t], idx[t + 1], idx[t + 2]);
      }
      if (keep.length) { g.setIndex(keep); parts[n].mesh.material = paint; parts.body.obj.attach(parts[n].obj); }
      else car.remove(parts[n].obj);
      delete parts[n];
    }
  }

  // cabin
  const interior = createInterior({ paintColor: uniforms.uPaint.value });
  car.add(interior.root);
  const cardL = interior.doorCard(1); cardL.position.set(-0.058, -0.02, -0.02); parts.doorL.obj.add(cardL);
  const cardR = interior.doorCard(-1); cardR.position.set(0.058, -0.02, -0.02); parts.doorR.obj.add(cardR);
  interior.mirror.position.set(0, -0.06, 0.31); parts.roof.obj.add(interior.mirror);

  // engine sits in the bay under the bonnet
  const engine = createEngine({});
  const ENGINE_HOME = new THREE.Vector3(0, 0.29, 0.5);
  engine.root.position.copy(ENGINE_HOME); engine.root.scale.setScalar(1.15); engine.root.visible = false;
  car.add(engine.root);

  // perf: compile every shader up front (otherwise the first appearance of the engine/cabin
  // stalls the scroll for a few frames while the GPU compiles programs)
  engine.root.visible = true; interior.root.visible = true;
  camera.position.set(0, 1, 4); camera.lookAt(0, 0.4, 0);
  try { await renderer.compileAsync(scene, camera); } catch { renderer.compile(scene, camera); }
  engine.root.visible = false;

  // ---------- state ----------
  const S = {
    az: 0.7, el: 0.12, dist: 4.6, ty: 0.38, tx: 0, tz: 0, shift: 0,
    ex: 0, hood: 0, roof: 0, doors: 0, trunk: 0, nose: 0, wheel: 0, tire: 0,
    engine: 0, eFocus: 0, eExplode: 0, carFade: 0, rpm: 0, spin: 0, iEx: 0, glove: 0,
  };
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const view = { look: 1 }; // how strongly the car follows the cursor
  const tmp = new THREE.Vector3(), tgt = new THREE.Vector3();
  let wheelAngle = 0, steer = 0, intro = 1;

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 42 : 30; camera.updateProjectionMatrix();
  }
  resize(); addEventListener('resize', resize);

  function applyParts(dt) {
    const ex = S.ex;
    const amt = {
      hood: Math.max(ex, S.hood), roof: Math.max(ex, S.roof), doorL: Math.max(ex, S.doors), doorR: Math.max(ex, S.doors),
      trunk: Math.max(ex, S.trunk), nose: Math.max(ex, S.nose), tail: ex, body: 0,
    };
    for (const name in parts) {
      const p = parts[name], o = p.obj;
      const a = amt[name] ?? 0;
      o.position.copy(p.home).addScaledVector(p.dir, a);
      o.rotation.set(0, 0, 0);
      if (name === 'hood') { o.rotation.x = -0.55 * a; }
      if (name === 'trunk') { o.rotation.x = 0.45 * a; }
      if (name === 'doorL') { o.rotation.y = 0.5 * a; }
      if (name === 'doorR') { o.rotation.y = -0.5 * a; }
      if (name === 'roof') { o.rotation.z = 0.0; o.rotation.x = -0.12 * a; }
      if (name === 'nose') { o.rotation.x = 0.15 * a; }
      o.visible = !(S.carFade > 0.98);
    }
    for (const k in wheels) {
      const w = wheels[k];
      w.set(wheelAngle, w.front ? steer * (1 - Math.min(1, S.wheel * 2)) : 0, S.wheel * 0.45, S.tire);
      w.root.visible = S.carFade < 0.98;
    }
    // the cabin can't be seen through the closed shell (opaque baked windows): skip drawing it
    interior.root.visible = S.carFade < 0.6 && Math.max(S.ex, S.roof, S.doors, S.iEx) > 0.02;
    interior.update(dt, { explode: S.iEx, glove: S.glove, rpm: S.rpm, speed: Math.abs(S.spin) / 25, steer });
    // fading the car out (engine chapters)
    const op = 1 - S.carFade;
    for (const m of carMats) { const t = op < 0.999; if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; } m.opacity = op; m.depthWrite = op > 0.5; }
    // engine
    const ev = S.engine > 0.01;
    engine.root.visible = ev;
    if (ev) {
      engine.root.position.copy(ENGINE_HOME).add(tmp.set(0, S.engine * 0.12 + S.eFocus * 0.28, S.eFocus * -0.2));
      engine.root.scale.setScalar(1.15 * (0.6 + 0.4 * S.engine) * (1 + S.eFocus * 0.9));
      engine.update(dt, S.rpm, S.eExplode);
      engine.edgeMat.opacity = 0.25 + 0.45 * S.eFocus;
    }
  }

  // Adaptive quality: if frames run slow (<≈48 fps), lower the render scale step by step;
  // on the weakest step drop the real-time shadow too (the floor blobs still ground the car).
  let acc = 0, n = 0, warm = 60;
  function adapt(raw) {
    if (raw > 0.1 || document.hidden) return;             // ignore stalls / background tabs
    if (warm > 0) { warm--; return; }                      // shaders compiling, assets settling
    acc += raw; n++;
    if (n < 90) return;
    const avg = acc / n; acc = 0; n = 0;
    if (avg > 1 / 48 && dprStep < DPR_STEPS.length - 1) {
      dprStep++;
      renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_STEPS[dprStep]));
      resize();
      if (dprStep >= 3) key.castShadow = false;
      warm = 30;
    }
  }

  const clock = new THREE.Clock();
  let running = true;
  function frame() {
    if (!running) return;
    const raw = clock.getDelta(), dt = Math.min(raw, 1 / 20), t = clock.elapsedTime;
    adapt(raw);
    pointer.sx = damp(pointer.sx, pointer.x, 3.2, dt); pointer.sy = damp(pointer.sy, pointer.y, 3.2, dt);
    intro = damp(intro, 0, 1.6, dt);

    // car "looks" at the cursor: yaw + slight pitch, front wheels steer toward it
    const look = view.look * (1 - S.carFade);
    car.rotation.y = pointer.sx * 0.42 * look + intro * -0.9;
    car.rotation.x = pointer.sy * 0.05 * look;
    steer = damp(steer, pointer.x * 0.45 * view.look, 4, dt);
    wheelAngle += (S.spin + intro * 9) * dt;

    applyParts(dt);

    // camera on a sphere around the target
    tgt.set(S.tx, S.ty, S.tz);
    if (S.eFocus > 0) { engine.root.getWorldPosition(tmp); tmp.y += 0.08; tgt.lerp(tmp, S.eFocus); }
    const dist = S.dist + intro * 2.2;
    camera.position.set(
      tgt.x + Math.sin(S.az) * Math.cos(S.el) * dist,
      tgt.y + Math.sin(S.el) * dist + pointer.sy * -0.08,
      tgt.z + Math.cos(S.az) * Math.cos(S.el) * dist,
    );
    camera.lookAt(tgt);
    camera.filmOffset = S.shift * (camera.aspect < 0.8 ? 0 : 1);
    camera.updateProjectionMatrix();

    dust.rotation.y = t * 0.012; dust.position.y = Math.sin(t * 0.1) * 0.15; // no per-vertex CPU work

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { clock.getDelta(); frame(); } });

  // project a part (or the engine) to screen space, for HTML hotspots
  const proj = new THREE.Vector3();
  function screenOf(name, offset = [0, 0, 0]) {
    const o = name === 'engine' ? engine.root : parts[name]?.obj ?? wheels[name]?.root ?? interior.named[name]; if (!o) return null;
    o.updateWorldMatrix(true, false);
    proj.set(...offset).applyMatrix4(o.matrixWorld).project(camera);
    return { x: (proj.x * 0.5 + 0.5) * innerWidth, y: (-proj.y * 0.5 + 0.5) * innerHeight, behind: proj.z > 1 };
  }

  return {
    S, pointer, view, engine, parts, renderer,
    start() { clock.getDelta(); frame(); },
    setPaint(hex) { uniforms.uPaint.value.set(hex); },
    get paint() { return uniforms.uPaint.value; },
    screenOf,
    skipIntro() { intro = 0; },
  };
}
