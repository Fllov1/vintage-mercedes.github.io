import { createStage } from './scene.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const D = Math.PI / 180;

/* ------------------------------------------------------------
   3D keyframes per section (data-scene). az/el in degrees.
   `end` = values at the end of a tall (sticky) section.
------------------------------------------------------------ */
const BASE = { az: 38, el: 7, dist: 4.7, tx: 0, ty: 0.36, tz: 0, shift: 0, look: 1, labels: 0,
  ex: 0, hood: 0, roof: 0, doors: 0, trunk: 0, nose: 0, wheel: 0, tire: 0, engine: 0, eFocus: 0, eExplode: 0, carFade: 0, rpm: 0, iEx: 0, glove: 0 };
const SCENES = {
  hero: { az: 38, el: 6, dist: 4.25, ty: 0.36, shift: -5.5 },
  history: { az: 90, el: 3, dist: 4.9, ty: 0.38, shift: 6.5, look: 0.55 },
  birth: { az: 148, el: 9, dist: 4.9, ty: 0.38, shift: -6.5, look: 0.55 },
  anatomy: { az: 34, el: 24, dist: 6.4, ty: 0.5, shift: -4.5, look: 0.45, labels: 1, ex: 0.25, wheel: 0.15,
    end: { az: 52, dist: 7.0, ex: 1, wheel: 0.9, tire: 0.15 } },
  body: { az: 62, el: 20, dist: 5.8, ty: 0.55, shift: -6, look: 0.5, hood: 0.95, roof: 0.65, doors: 1, trunk: 0.9, nose: 0.45, wheel: 0.2 },
  interior: { az: 128, el: 62, dist: 3.3, ty: 0.3, tz: -0.1, shift: 5, look: 0.25, labels: 1, roof: 1.3, doors: 1, glove: 1, iEx: 0,
    end: { az: 100, el: 50, dist: 3.9, iEx: 1 } },
  engine: { az: 28, el: 30, dist: 4.4, ty: 0.42, tz: 0.3, shift: -5, look: 0.35, hood: 1.5, roof: 0.6, doors: 0.3, engine: 1, eFocus: 0.25, carFade: 0.15, rpm: 900 },
  pistons: { az: 62, el: 14, dist: 2.7, shift: -5.5, look: 0, hood: 1.5, engine: 1, eFocus: 1, carFade: 1, rpm: 45, eExplode: 0.1,
    end: { az: 100, el: 18, dist: 3.5, eExplode: 1, rpm: 70 } },
  wheels: { az: -48, el: 12, dist: 3.1, tx: -1.0, ty: 0.26, tz: 0.48, shift: 5, look: 0.12, wheel: 1, tire: 1 },
  specs: { az: -48, el: 9, dist: 4.9, ty: 0.38, shift: 6.5, look: 0.6 },
  paint: { az: -22, el: 6, dist: 4.5, ty: 0.18, look: 1 },
  footer: { az: 12, el: 4, dist: 8, ty: -0.35, look: 1 },
};
const KEYS = Object.keys(BASE);

/* ------------------------------------------------------------ */
const HOTSPOTS = [
  { scene: 'anatomy', part: 'hood', at: [0, 0.07, 0.05], title: 'Капот', text: 'Алюмінієва панель — мінус кілограми над передньою віссю' },
  { scene: 'anatomy', part: 'roof', at: [0, 0.07, 0], title: 'Хардтоп', text: 'Знімний: влітку — родстер, взимку — купе' },
  { scene: 'anatomy', part: 'doorL', at: [0.02, 0.06, 0.05], title: 'Двері', text: 'Алюміній і хромована ручка' },
  { scene: 'anatomy', part: 'nose', at: [0, 0.12, 0.04], title: 'Решітка радіатора', text: 'Велика зірка по центру — фамільна риса SL', left: true },
  { scene: 'anatomy', part: 'wheelFL', at: [0.06, 0.19, 0.05], title: 'Колесо', text: 'Біла боковина, хромований диск, зірка на ковпачку', left: true },
  { scene: 'anatomy', part: 'trunk', at: [0, 0.06, 0], title: 'Багажник', text: 'Кришка — теж з алюмінію', left: true },
  { scene: 'interior', part: 'steeringWheel', at: [0, 0.1, 0], title: 'Кермо', text: 'Тонкий обід кольору слонової кістки й хромоване кільце сигналу' },
  { scene: 'interior', part: 'gauges', at: [0, 0.045, 0], title: 'Прилади', text: 'Спідометр до 200 км/год і тахометр — стрілки живі' },
  { scene: 'interior', part: 'radio', at: [0, 0.03, 0], title: 'Радіо Becker', text: 'Ламповий приймач із клавішами кольору слонової кістки', left: true },
  { scene: 'interior', part: 'glovebox', at: [0, 0.06, -0.04], title: 'Бардачок', text: 'Кришка в колір кузова, всередині — сервісна книжка', left: true },
  { scene: 'interior', part: 'seatR', at: [0, 0.2, 0], title: 'Сидіння', text: 'Шкіра з вертикальною прострочкою і бордовим кантом', left: true },
  { scene: 'anatomy', part: 'tail', at: [0, 0.08, -0.04], title: 'Задній бампер', text: 'Хром з вертикальними «іклами»', left: true },
];

/* ============================================================ */
const lenis = reduced ? null : new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true });
if (lenis) {
  lenis.stop();
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
gsap.registerPlugin(ScrollTrigger, SplitText);
if (reduced) document.documentElement.classList.add('reduced');
window.__lenis = lenis; // handy for debugging in devtools
const scrollTo = target => lenis ? lenis.scrollTo(target, { duration: 1.8 }) : $(target)?.scrollIntoView({ behavior: 'smooth' });
$$('[data-scroll]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); scrollTo(a.dataset.scroll); }));

/* ---------- loader ---------- */
const pctEl = $('#pct'), barEl = $('#bar');
let shown = 0, target = 0;
const tickLoader = () => { shown += (target - shown) * 0.12; pctEl.textContent = Math.round(shown * 100); barEl.style.transform = `scaleX(${shown})`; if (shown < 0.995) requestAnimationFrame(tickLoader); };
tickLoader();

let stage;
try {
  stage = await createStage($('#stage'), { onProgress: p => { target = p; } });
} catch (err) {
  console.error(err);
  $('#loader .mono').textContent = 'Не вдалося завантажити 3D — оновіть сторінку';
  throw err;
}
target = 1;
window.__stage = stage;
await new Promise(r => setTimeout(r, 450));

/* ---------- sections & scroll → state ---------- */
const sections = $$('[data-scene]');
let anchors = [];
function measure() {
  const vh = innerHeight;
  anchors = sections.map(s => {
    const top = s.offsetTop, h = s.offsetHeight, hold = Math.max(0, (h - vh) / 2);
    const mid = top + h / 2 - vh / 2;
    return { a: mid - hold, b: mid + hold, k: { ...BASE, ...SCENES[s.dataset.scene] } };
  });
}
measure();
addEventListener('resize', () => { measure(); ScrollTrigger.refresh(); });
new ResizeObserver(measure).observe(document.body);

function sceneAt(y) {
  const at = (i, p) => {
    const k = anchors[i].k; if (!k.end || p <= 0) return k;
    const o = {}; for (const key of KEYS) o[key] = lerp(k[key], k.end[key] ?? k[key], p); return o;
  };
  if (y <= anchors[0].a) return { st: at(0, 0), idx: 0 };
  for (let i = 0; i < anchors.length; i++) {
    const A = anchors[i];
    if (y <= A.b) return { st: at(i, A.b > A.a ? ease(clamp((y - A.a) / (A.b - A.a))) : 0), idx: i };
    const N = anchors[i + 1]; if (!N) break;
    if (y < N.a) {
      const t = ease(clamp((y - A.b) / (N.a - A.b)));
      const s0 = at(i, 1), s1 = at(i + 1, 0), o = {};
      for (const key of KEYS) o[key] = lerp(s0[key], s1[key], t);
      return { st: o, idx: t < 0.5 ? i : i + 1 };
    }
  }
  return { st: at(anchors.length - 1, 1), idx: anchors.length - 1 };
}

/* ---------- chrome: rail, nav, hud ---------- */
const railDots = $('#railDots');
sections.forEach((s, i) => {
  const li = document.createElement('li');
  li.innerHTML = `<span>${s.dataset.title}</span>`;
  li.addEventListener('click', () => scrollTo(s.id ? '#' + s.id : (i === 0 ? '#top' : s)));
  railDots.appendChild(li);
});
const dots = $$('li', railDots), navLinks = $$('.nav__links a');
const hudChapter = $('#hudChapter'), hudPct = $('#hudPct'), railFill = $('#railFill');
const nav = $('.nav');
let lastIdx = -1, lastY = 0;
function updateChrome(idx, y) {
  const max = document.documentElement.scrollHeight - innerHeight;
  const p = clamp(y / max);
  railFill.style.transform = `scaleY(${p})`;
  hudPct.textContent = String(Math.round(p * 100)).padStart(3, '0');
  nav.classList.toggle('is-hidden', y > lastY + 2 && y > innerHeight * 0.6);
  if (y < lastY - 2) nav.classList.remove('is-hidden');
  lastY = y;
  if (idx === lastIdx) return; lastIdx = idx;
  dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
  hudChapter.textContent = `${String(idx).padStart(2, '0')} — ${sections[idx].dataset.title}`;
  const id = sections[idx].id;
  navLinks.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + id || (id === 'pistons' && a.getAttribute('href') === '#engine') || ((id === 'body' || id === 'interior') && a.getAttribute('href') === '#anatomy')));
}

/* ---------- hotspots ---------- */
const hsRoot = $('#hotspots');
const hs = HOTSPOTS.map(h => {
  const el = document.createElement('div');
  el.className = 'hs' + (h.left ? ' hs--left' : '');
  el.innerHTML = `<i class="hs__dot"></i><i class="hs__line"></i><div class="hs__card"><b>${h.title}</b><small>${h.text}</small></div>`;
  el.addEventListener('mouseenter', () => cursor.classList.add('is-hover'));
  el.addEventListener('mouseleave', () => cursor.classList.remove('is-hover'));
  hsRoot.appendChild(el); return { ...h, el };
});
function updateHotspots(on, scene) {
  for (const h of hs) {
    const p = on > 0.6 && h.scene === scene ? stage.screenOf(h.part, h.at) : null;
    const vis = p && !p.behind && p.x > 40 && p.x < innerWidth - 40 && p.y > 80 && p.y < innerHeight - 40;
    h.el.classList.toggle('is-on', !!vis);
    if (vis) h.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
  }
}

/* ---------- four strokes ---------- */
const strokeEls = $$('#strokes li'), rpmEl = $('#rpm');
let lastStroke = -1;
function updateStrokes(active) {
  // cylinder 1 cycle: 0..π power, π..2π exhaust, 2π..3π intake, 3π..4π compression
  const c = stage.engine.cycle, q = Math.floor(c / Math.PI);
  const step = active ? [2, 3, 0, 1][q] : -1;
  if (step !== lastStroke) { lastStroke = step; strokeEls.forEach((li, i) => li.classList.toggle('is-active', i === step)); }
  rpmEl.textContent = Math.round(stage.S.rpm);
}

/* ---------- main loop: scroll → 3D ---------- */
const S = stage.S;
const filmShiftToPx = () => {
  const fov = (innerWidth / innerHeight < 0.8 ? 42 : 30) * D;
  return -innerWidth / (35 * 2 * Math.tan(fov / 2) * (innerWidth / innerHeight));
};
let pxPerShift = filmShiftToPx(); addEventListener('resize', () => { pxPerShift = filmShiftToPx(); });
const rootStyle = document.documentElement.style;
let lastShiftPx = null, lastT = performance.now(), labelsOn = 0;

gsap.ticker.add(() => {
  if (window.__freeze) return; // dev: lets devtools drive stage.S directly
  const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  const y = lenis ? lenis.animatedScroll : scrollY;
  const { st, idx } = sceneAt(y);
  const k = window.__snap ? 1 : 1 - Math.exp(-6 * dt);
  for (const key of KEYS) {
    if (key === 'look' || key === 'labels') continue;
    const v = key === 'az' || key === 'el' ? st[key] * D : st[key];
    S[key] += (v - S[key]) * k;
  }
  stage.view.look += (st.look - stage.view.look) * k;
  labelsOn += (st.labels - labelsOn) * k;
  // wheels roll with scroll velocity
  const vel = lenis ? lenis.velocity : 0;
  S.spin += ((vel * 0.9) - S.spin) * k;

  const shiftPx = Math.round(S.shift * pxPerShift * (innerWidth / innerHeight < 0.8 ? 0 : 1));
  if (shiftPx !== lastShiftPx) { rootStyle.setProperty('--shift', shiftPx + 'px'); lastShiftPx = shiftPx; }

  updateChrome(idx, y);
  updateHotspots(labelsOn, sections[idx].dataset.scene);
  updateStrokes(sections[idx].dataset.scene === 'pistons');
});

/* ---------- pointer: car looks at cursor ---------- */
addEventListener('pointermove', e => {
  stage.pointer.x = (e.clientX / innerWidth) * 2 - 1;
  stage.pointer.y = (e.clientY / innerHeight) * 2 - 1;
}, { passive: true });
if (!fine) { // touch: gentle idle sway instead of the cursor
  gsap.to(stage.pointer, { x: 0.35, duration: 4, ease: 'sine.inOut', yoyo: true, repeat: -1 });
}

/* ---------- custom cursor + magnetic buttons ---------- */
const cursor = $('#cursor'), cursorLabel = $('#cursorLabel');
if (fine) {
  const pos = { x: innerWidth / 2, y: innerHeight / 2 };
  const xTo = gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3' }), yTo = gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3' });
  addEventListener('pointermove', e => { pos.x = e.clientX; pos.y = e.clientY; xTo(pos.x); yTo(pos.y); cursor.classList.add('is-live'); }, { passive: true });
  document.addEventListener('pointerleave', () => cursor.classList.remove('is-live'));
  $$('a, button, .rail__dots li').forEach(el => {
    el.addEventListener('mouseenter', () => cursor.classList.add('is-hover'));
    el.addEventListener('mouseleave', () => cursor.classList.remove('is-hover'));
  });
  const heroSec = $('.hero');
  heroSec.addEventListener('mouseenter', () => { cursorLabel.textContent = 'Він стежить'; cursor.classList.add('has-label'); });
  heroSec.addEventListener('mouseleave', () => cursor.classList.remove('has-label'));
  $$('.magnetic').forEach(el => {
    const x = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, .4)' }), y = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, .4)' });
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); x((e.clientX - r.left - r.width / 2) * 0.3); y((e.clientY - r.top - r.height / 2) * 0.4); });
    el.addEventListener('pointerleave', () => { x(0); y(0); });
  });
}

/* ---------- paint ---------- */
$$('.swatch').forEach(b => b.addEventListener('click', () => {
  $$('.swatch').forEach(s => { s.classList.toggle('is-active', s === b); s.setAttribute('aria-checked', s === b); });
  const from = stage.paint.clone(), to = from.clone().set(b.dataset.color);
  const o = { t: 0 };
  gsap.to(o, { t: 1, duration: 1.1, ease: 'power2.inOut', onUpdate: () => stage.paint.copy(from).lerp(to, o.t) });
}));
$('#contactBtn').addEventListener('click', e => { if ($('#contactBtn').getAttribute('href') === '#') e.preventDefault(); });

/* ---------- text animations ---------- */
function animateText() {
  $$('.split').forEach(el => {
    const split = SplitText.create(el, { type: 'words', wordsClass: 'w', mask: 'words' });
    gsap.from(split.words, { yPercent: 110, duration: 1.1, ease: 'power4.out', stagger: 0.045, scrollTrigger: { trigger: el, start: 'top 85%' } });
  });
  ScrollTrigger.batch($$('.reveal').filter(el => !el.closest('.hero')), {
    start: 'top 88%',
    onEnter: b => gsap.to(b, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.08, overwrite: true }),
  });
  $$('[data-count]').forEach(el => {
    const to = +el.dataset.count, dec = +(el.dataset.dec || 0), o = { v: 0 };
    const fmt = v => v.toLocaleString('uk-UA', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: !('year' in el.dataset) });
    el.textContent = fmt(0);
    gsap.to(o, { v: to, duration: 2, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 90%' }, onUpdate: () => el.textContent = fmt(o.v) });
  });
}

/* ---------- go ---------- */
stage.start();
$('#loader').classList.add('is-done');
document.body.classList.remove('is-loading');
lenis?.start();
if (reduced) { stage.skipIntro(); $$('.reveal').forEach(el => { el.style.opacity = 1; el.style.transform = 'none'; }); }
else {
  animateText();
  const tl = gsap.timeline({ delay: 0.35 });
  tl.from('.hero__title .line > span', { yPercent: 105, duration: 1.4, ease: 'power4.out', stagger: 0.12 })
    .to('.hero .reveal', { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.1 }, '-=0.9')
    .from('.nav', { y: -30, opacity: 0, duration: 1, ease: 'power3.out', clearProps: 'transform,opacity' }, '-=1')
    .from('.rail, .hud', { opacity: 0, duration: 1 }, '-=0.6');
}
