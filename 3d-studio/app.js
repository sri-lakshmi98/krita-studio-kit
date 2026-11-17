// Tiny 3D Studio: main app (viewport, selection, panels, timeline, history, files).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { BASIC, CUTE, makeShape, makeText, textGeometry, loadFont, loadPicture, pictureMesh, dropToFloor, StudioLoader } from './shapes.js';
import { PRESETS, PASTELS, makeMaterial, setOpacity, setColor, presetOf, relinkMaterial, disposeMaterial } from './materials.js';
import { createEnv, BACKGROUNDS, LIGHTS, DEFAULT_SETTINGS } from './env.js';
import * as anim from './anim.js';
import * as io from './io.js';
import { icon } from './icons.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const AUTOSAVE_KEY = 'tiny3d-autosave';
const HINT_KEY = 'tiny3d-hint-off';
const FPS = anim.FPS;
const ASPECTS = { reel: [1080, 1920, 'Reel 9:16'], square: [1080, 1080, 'Square 1:1'], wide: [1920, 1080, 'Wide 16:9'] };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const S = {
  sel: [], mode: 'translate', snap: false, frame: 0, duration: 5, playing: false, loop: true,
  aspect: 'reel', history: [], hIdx: -1, exporting: false, restoring: false, warnedFull: false,
};

let renderer, scene, camera, orbit, tc, world, envApi;
let boxes = [];
const loader = new StudioLoader();

// ---------------------------------------------------------------- small UI helpers
let toastTimer;
function toast(msg, ms = 2800) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function fatal(html) {
  const b = $('#boot');
  b.hidden = false;
  b.innerHTML = '<div>' + html + '</div>';
  b.classList.add('err');
}

function fillIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const txt = el.textContent.trim();
    el.innerHTML = icon(el.dataset.icon) + (txt ? `<span>${txt}</span>` : '');
  });
}

function chips(sel, list, onPick) {
  const box = $(sel);
  box.innerHTML = '';
  for (const [id, label] of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = id;
    b.textContent = label;
    b.onclick = () => onPick(id);
    box.append(b);
  }
}
function chipOn(sel, id) { $(sel).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === id)); }

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const primary = () => S.sel[S.sel.length - 1] || null;
const isGroupish = (o) => !!o && !o.isMesh && o.children.length > 0;
const firstMesh = (o) => { let m = null; o.traverse((n) => { if (!m && n.isMesh && n.material && !Array.isArray(n.material)) m = n; }); return m; };

function main() {
  fillIcons();
  const view = $('#view');
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); // lighter on the GPU
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  view.prepend(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    fatal('<b>The 3D view stopped.</b><br>The graphics card needed a break. Your work is autosaved, so just reload the page.');
  });

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  camera.position.set(6, 4.5, 8);
  world = new THREE.Group();
  world.name = 'world';
  scene.add(world);
  envApi = createEnv(scene, renderer);

  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 1, 0);
  orbit.minDistance = 1;
  orbit.maxDistance = 60;
  orbit.maxPolarAngle = Math.PI * 0.52;
  orbit.addEventListener('change', req);
  orbit.addEventListener('end', scheduleAutosave);
  orbit.update();

  tc = new TransformControls(camera, renderer.domElement);
  tc.setSize(0.9);
  scene.add(tc.getHelper()); // r170: the gizmo is a separate helper object
  tc.addEventListener('change', req);
  tc.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });
  tc.addEventListener('mouseDown', onGizmoDown);
  tc.addEventListener('objectChange', onGizmoChange);
  tc.addEventListener('mouseUp', onGizmoUp);

  new ResizeObserver(resize).observe(view);
  buildUI();
  wirePicking();
  wireKeys();
  addEventListener('error', (e) => { if (e.message) toast('Oops: ' + e.message, 4000); });
  addEventListener('unhandledrejection', (e) => toast('Oops: ' + ((e.reason && e.reason.message) || e.reason), 4000));
  addEventListener('pagehide', autosave);
  resize();
  window.__t3dReady = true;
  $('#boot').hidden = true;
  start();
}

async function start() {
  applySettings(DEFAULT_SETTINGS, true);
  let loaded = false;
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw) { await loadProject(JSON.parse(raw)); loaded = true; }
  } catch (e) { console.warn('Autosave skipped', e); }
  if (!loaded) { starterScene(); resetHistory(); }
  let hintOff = false;
  try { hintOff = !!localStorage.getItem(HINT_KEY); } catch { /* storage blocked */ }
  $('#hint').hidden = hintOff;
  setFrame(0);
  syncSelection();
  S.ready = true;
  scheduleAutosave();
}

function starterScene() {
  const buddy = makeShape('buddy');
  world.add(buddy); dropToFloor(buddy);
  buddy.userData.auto = 'float';
  const snow = makeShape('snowman');
  world.add(snow); dropToFloor(snow);
  snow.position.x = -2.1; snow.rotation.y = 0.35;
  const tree = makeShape('tree');
  world.add(tree); dropToFloor(tree);
  tree.position.x = 2.2; tree.position.z = -0.8;
}

// ---------------------------------------------------------------- render on demand
let pending = false;
let lastT = 0;
function req() { if (!pending) { pending = true; requestAnimationFrame(loop); } }
function loop(now) {
  pending = false;
  if (S.exporting) return;
  if (S.playing) { tick(now); req(); }
  draw(camera);
}

function tick(now) {
  const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
  lastT = now;
  const end = S.duration * FPS;
  let f = S.frame + dt * FPS;
  if (f >= end) {
    if (S.loop) f %= end;
    else { f = end; setFrame(f, true); pause(); return; }
  }
  setFrame(f, true);
}

const saved = [];
function draw(cam) {
  // Auto motions are added only for this draw, then the real pose comes back.
  saved.length = 0;
  world.traverse((o) => {
    const a = o.userData.auto;
    if (a && a !== 'none' && o.visible) saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]);
  });
  const t = S.frame / FPS;
  for (const [o] of saved) anim.applyAuto(o, o.userData.auto, t, S.duration);
  scene.updateMatrixWorld();
  for (const b of boxes) b.update();
  renderer.render(scene, cam);
  if (saved.length) {
    for (const [o, p, q, s] of saved) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
    scene.updateMatrixWorld();
  }
}

function resize() {
  if (S.exporting) return;
  const v = $('#view');
  const w = v.clientWidth, h = v.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  layoutFrame();
  req();
}

// ---------------------------------------------------------------- aspect frame
function frameRect() {
  const v = $('#view');
  const W = v.clientWidth, H = v.clientHeight;
  const [aw, ah] = ASPECTS[S.aspect];
  const ar = aw / ah, m = 0.9;
  let h = H * m, w = h * ar;
  if (w > W * m) { w = W * m; h = w / ar; }
  return { x: (W - w) / 2, y: (H - h) / 2, w, h, W, H };
}
function layoutFrame() {
  const r = frameRect(), f = $('#frame');
  Object.assign(f.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  const [aw, ah, label] = ASPECTS[S.aspect];
  f.firstElementChild.textContent = `${label} · ${aw}×${ah}`;
}
function setAspect(a) {
  S.aspect = ASPECTS[a] ? a : 'reel';
  $('#aspect').value = S.aspect;
  const [w, h] = ASPECTS[S.aspect];
  $('#exportMenu [data-export=png] small').textContent = `PNG ${w}×${h}`;
  $('#exportMenu [data-export=webm] small').textContent = `WebM ${w}×${h}`;
  layoutFrame();
  scheduleAutosave();
}
// A copy of the view camera that sees exactly what is inside the dashed frame.
function exportCamera() {
  const r = frameRect();
  const cam = camera.clone();
  cam.setViewOffset(r.W, r.H, r.x, r.y, r.w, r.h);
  cam.updateProjectionMatrix();
  return cam;
}

// ---------------------------------------------------------------- selection
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let gizmoUsed = false;

function wirePicking() {
  const c = renderer.domElement;
  let down = null;
  c.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY, e.button]; });
  c.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (gizmoUsed) { gizmoUsed = false; return; }
    if (!d || d[2] !== 0 || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 5) return;
    pick(e);
  });
}

function topOf(o) {
  while (o && o.parent && o.parent !== world) o = o.parent;
  return o && o.parent === world ? o : null;
}
function visibleChain(o) {
  for (; o && o !== world; o = o.parent) if (!o.visible) return false;
  return true;
}

function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  for (const h of ray.intersectObjects(world.children, true)) {
    const top = topOf(h.object);
    if (!top || top.userData.locked || !visibleChain(h.object)) continue;
    select(top, e.shiftKey);
    return;
  }
  if (!e.shiftKey) select(null);
}

function select(obj, additive = false) {
  if (!obj) S.sel = [];
  else if (additive) {
    const i = S.sel.indexOf(obj);
    if (i >= 0) S.sel.splice(i, 1); else S.sel.push(obj);
  } else S.sel = [obj];
  if (obj) showTab('pObj');
  syncSelection();
}

function syncSelection() {
  S.sel = S.sel.filter((o) => o.parent === world);
  const p = primary();
  if (p && !p.userData.locked && p.visible) tc.attach(p); else tc.detach();
  for (const b of boxes) { scene.remove(b); b.geometry.dispose(); b.material.dispose(); }
  boxes = S.sel.filter((o) => o.visible).map((o) => {
    const b = new THREE.BoxHelper(o, o === p ? 0xffb020 : 0x56c2a6);
    b.material.depthTest = false;
    b.material.transparent = true;
    b.renderOrder = 999;
    scene.add(b);
    return b;
  });
  renderOutliner();
  renderPanel();
  renderMarkers();
  showPoseNote(false);
  req();
}

// Moving several things at once: the gizmo moves the last picked one,
// the others follow by the same change.
let drag = null;
function onGizmoDown() {
  gizmoUsed = true;
  const p = tc.object;
  if (!p) return;
  p.updateMatrix();
  drag = {
    inv: p.matrix.clone().invert(),
    others: S.sel.filter((o) => o !== p && !o.userData.locked).map((o) => { o.updateMatrix(); return [o, o.matrix.clone()]; }),
  };
}
function onGizmoChange() {
  const p = tc.object;
  if (drag && drag.others.length && p) {
    p.updateMatrix();
    const delta = p.matrix.clone().multiply(drag.inv);
    for (const [o, m] of drag.others) {
      o.matrix.multiplyMatrices(delta, m);
      o.matrix.decompose(o.position, o.quaternion, o.scale);
    }
  }
  if (S.sel.some((o) => o.userData.keys)) showPoseNote(true);
  updateFields();
}
function onGizmoUp() { if (drag) { drag = null; commit(); } }

function setMode(m) {
  S.mode = m;
  tc.setMode(m);
  $$('#modeBtns [data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
}
function setSnap(v) {
  S.snap = v;
  tc.setTranslationSnap(v ? 0.25 : null);
  tc.setRotationSnap(v ? THREE.MathUtils.degToRad(15) : null);
  tc.setScaleSnap(v ? 0.1 : null);
  $('#bSnap').classList.toggle('on', v);
  toast(v ? 'Snap on: moves in small steps.' : 'Snap off.', 1500);
}

// ---------------------------------------------------------------- add / delete / copy / group
function place(o, lift = 0) {
  world.add(o);
  dropToFloor(o);
  o.position.y += lift;
  S.sel = [o];
  showTab('pObj');
  syncSelection();
  commit();
}

function addShape(id) {
  if (id === 'text') return askText();
  place(makeShape(id), id === 'cloud' ? 1.4 : 0);
}

function askText() {
  const d = $('#textDlg');
  d.returnValue = '';
  $('#textIn').value = '';
  d.showModal();
  $('#textIn').focus();
}
async function onTextDialogClose() {
  const d = $('#textDlg');
  const str = $('#textIn').value.trim();
  if (d.returnValue !== 'ok' || !str) return;
  toast('Making letters…', 1200);
  try { place(await makeText(str)); } catch (e) { console.error(e); toast('Could not load the letters. Check the internet and try again.', 4000); }
}

async function importThing(kind) {
  const file = await io.pickFile(kind === 'model' ? '.glb,.gltf' : 'image/*');
  if (!file) return;
  const name = file.name.replace(/\.[^.]+$/, '').slice(0, 30) || 'Picture';
  try {
    if (kind === 'model') {
      toast('Opening the 3D file…', 1500);
      const root = await io.importModel(file);
      const box = new THREE.Box3().setFromObject(root);
      if (!box.isEmpty()) {
        const c = box.getCenter(new THREE.Vector3());
        root.position.x -= c.x; root.position.z -= c.z; root.position.y -= box.min.y;
      }
      const g = new THREE.Group();
      g.name = name;
      g.userData.shape = 'model';
      g.add(root);
      const size = box.isEmpty() ? 0 : box.getSize(new THREE.Vector3()).length();
      if (size > 6 || (size > 0 && size < 0.3)) g.scale.setScalar(3 / size);
      g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      place(g);
    } else {
      const img = await loadPicture(file);
      const back = kind === 'backdrop';
      const m = pictureMesh(img, name, back ? 6 : 2);
      world.add(m);
      dropToFloor(m);
      if (back) { m.position.z = -4; m.castShadow = false; }
      S.sel = [m];
      showTab('pObj');
      syncSelection();
      commit();
    }
  } catch (e) {
    console.error(e);
    toast(kind === 'model' ? 'Could not open that 3D file. A single .glb file works best.' : 'Could not open that picture.', 4000);
  }
}

function disposeObject(o) {
  o.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) [].concat(n.material).forEach(disposeMaterial);
  });
}

function deleteSel() {
  if (!S.sel.length) return;
  tc.detach();
  for (const o of S.sel) { world.remove(o); disposeObject(o); }
  S.sel = [];
  syncSelection();
  commit();
}

function duplicateSel() {
  if (!S.sel.length) return;
  const copies = S.sel.map((o) => {
    const c = o.clone();
    c.traverse((n) => {
      if (n.isMesh) n.material = Array.isArray(n.material) ? n.material.map((m) => m.clone()) : n.material.clone();
    });
    c.name = o.name.replace(/( copy)+$/, '') + ' copy';
    c.position.x += 0.8;
    if (c.userData.keys) c.userData.keys.forEach((k) => { k.p[0] += 0.8; });
    world.add(c);
    return c;
  });
  S.sel = copies;
  syncSelection();
  commit();
}

// Keys are stored in the parent's space; re-express them when the parent changes.
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
function rebaseKeys(o, matrix) {
  if (!o.userData.keys) return;
  for (const k of o.userData.keys) {
    _m.compose(_p.fromArray(k.p), _q.fromArray(k.q), _s.fromArray(k.s)).premultiply(matrix);
    _m.decompose(_p, _q, _s);
    k.p = _p.toArray(); k.q = _q.toArray(); k.s = _s.toArray();
  }
}

function groupSel() {
  if (S.sel.length < 2) return toast('Shift+click 2 or more things first.');
  world.updateMatrixWorld(true);
  const box = new THREE.Box3();
  S.sel.forEach((o) => box.expandByObject(o));
  const c = box.getCenter(new THREE.Vector3());
  const g = new THREE.Group();
  g.name = 'Group';
  g.userData.shape = 'group';
  g.position.set(c.x, box.min.y, c.z);
  world.add(g);
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert();
  for (const o of S.sel) { g.attach(o); rebaseKeys(o, inv); }
  S.sel = [g];
  syncSelection();
  commit();
}

function ungroupSel() {
  world.updateMatrixWorld(true);
  const out = [];
  let did = false;
  for (const o of [...S.sel]) {
    if (!isGroupish(o)) { out.push(o); continue; }
    did = true;
    const m = o.matrix.clone();
    for (const c of [...o.children]) { world.attach(c); rebaseKeys(c, m); out.push(c); }
    world.remove(o);
  }
  if (!did) return toast('Pick a group first.');
  S.sel = out;
  syncSelection();
  commit();
}

function toggleHide(objs = S.sel) {
  if (!objs.length) return;
  const v = !objs[0].visible;
  objs.forEach((o) => { o.visible = v; });
  syncSelection();
  commit();
}

function floorSel() {
  S.sel.forEach((o) => dropToFloor(o, true));
  syncSelection();
  commit();
}

// ---------------------------------------------------------------- look (materials)
function forSelMeshes(fn) {
  for (const o of S.sel) o.traverse((n) => { if (n.isMesh && n.material && !Array.isArray(n.material)) fn(n); });
}
function setPreset(p) {
  if (!S.sel.length) return;
  forSelMeshes((n) => {
    const old = n.material;
    const map = old.map || null;
    old.map = null;
    const color = old.color ? '#' + old.color.getHexString() : '#ffffff';
    n.material = makeMaterial(p, color, old.opacity, map);
    disposeMaterial(old);
  });
  renderPanel();
  req();
  commit();
}
function paint(hex, done) {
  forSelMeshes((n) => setColor(n.material, hex));
  if (S.sel.some((o) => o.userData.keys)) showPoseNote(true);
  req();
  if (done) { renderPanel(); commit(); }
}

// ---------------------------------------------------------------- scene settings
function applySettings(s, replace = false) {
  const cur = envApi.apply(replace ? { ...DEFAULT_SETTINGS, ...s } : { ...envApi.settings, ...s });
  chipOn('#bgChips', cur.bg);
  $('#bgColor').value = cur.bgColor;
  $('#sGround').checked = cur.ground;
  $('#groundColor').value = cur.groundColor;
  $('#sGrid').checked = cur.grid;
  chipOn('#lightChips', cur.light);
  $('#sAmb').value = cur.ambient;
  $('#sShadows').checked = cur.shadows;
  req();
  scheduleAutosave();
}

// ---------------------------------------------------------------- camera views
function flyTo(pos, target, ms = 380) {
  const p0 = camera.position.clone(), t0 = orbit.target.clone();
  const start = performance.now();
  if (reduceMotion) ms = 1;
  const step = (now) => {
    const k = Math.min(1, (now - start) / ms);
    const e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(p0, pos, e);
    orbit.target.lerpVectors(t0, target, e);
    orbit.update();
    req();
    if (k < 1) requestAnimationFrame(step); else scheduleAutosave();
  };
  requestAnimationFrame(step);
}
function setView(v) {
  const t = orbit.target.clone();
  const d = Math.max(4, camera.position.distanceTo(t));
  const dirs = { front: [0, 0.12, 1], side: [1, 0.12, 0], top: [0, 1, 0.001], persp: [0.6, 0.45, 0.75] };
  const dir = new THREE.Vector3(...(dirs[v] || dirs.persp)).normalize();
  flyTo(t.clone().addScaledVector(dir, d), t);
}
function frameSelection() {
  const list = S.sel.length ? S.sel : world.children.filter((o) => o.visible);
  if (!list.length) return;
  world.updateMatrixWorld(true);
  const box = new THREE.Box3();
  list.forEach((o) => box.expandByObject(o));
  if (box.isEmpty()) return;
  const sph = box.getBoundingSphere(new THREE.Sphere());
  const r = Math.max(sph.radius, 0.3);
  const dist = (r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.1;
  const dir = camera.position.clone().sub(orbit.target).normalize();
  flyTo(sph.center.clone().addScaledVector(dir, dist), sph.center.clone());
}

// ---------------------------------------------------------------- timeline
function setFrame(f, quiet = false) {
  S.frame = clamp(f, 0, S.duration * FPS);
  world.traverse((o) => { if (o.userData.keys) anim.applyKeys(o, S.frame); });
  updateTimeUI();
  if (!quiet) { updateFields(); showPoseNote(false); }
  req();
}
function updateTimeUI() {
  const end = S.duration * FPS;
  $('#head').style.left = (S.frame / end) * 100 + '%';
  $('#tTime').textContent = (S.frame / FPS).toFixed(1) + ' s';
  $$('#keys button').forEach((b) => b.classList.toggle('here', Math.abs(+b.dataset.f - S.frame) < 0.5));
}
function drawTicks() {
  const el = $('#ticks');
  el.innerHTML = '';
  const d = S.duration;
  const step = d > 30 ? 10 : d > 12 ? 2 : 1;
  for (let s = 0; s < d; s += step) {
    const sp = document.createElement('span');
    sp.style.left = (s / d) * 100 + '%';
    sp.textContent = s + 's';
    el.append(sp);
    if (step === 1 && d <= 12) {
      const mi = document.createElement('span');
      mi.className = 'minor';
      mi.style.left = ((s + 0.5) / d) * 100 + '%';
      el.append(mi);
    }
  }
  renderMarkers();
}
function renderMarkers() {
  const el = $('#keys');
  el.innerHTML = '';
  const o = primary();
  const end = S.duration * FPS;
  if (!o || !o.userData.keys) { updateTimeUI(); return; }
  for (const k of o.userData.keys) {
    if (k.f > end) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.f = k.f;
    b.style.left = (k.f / end) * 100 + '%';
    b.title = `Key at ${(k.f / FPS).toFixed(1)} s. Double-click to remove.`;
    b.onclick = (e) => { e.stopPropagation(); pause(); setFrame(k.f); };
    b.ondblclick = (e) => { e.stopPropagation(); anim.removeKey(o, k.f); renderMarkers(); commit(); setFrame(S.frame); };
    el.append(b);
  }
  updateTimeUI();
}
function addKeyHere() {
  if (!S.sel.length) return toast('Pick a thing first, then Add key.');
  pause();
  const f = Math.round(S.frame);
  S.frame = f;
  for (const o of S.sel) anim.addKey(o, f);
  showPoseNote(false);
  renderMarkers();
  commit();
  const n = primary().userData.keys.length;
  toast(n === 1 ? 'Key saved. Now move the time, change the pose, and Add key again.' : `Key saved at ${(f / FPS).toFixed(1)} s. Press Play.`, 3500);
}
function removeKeyHere() {
  let any = false;
  for (const o of S.sel) any = anim.removeKey(o, S.frame) || any;
  if (!any) return toast('No key at this time. Click a ◆ on the timeline to jump to one.');
  renderMarkers();
  commit();
}
function showPoseNote(v) { $('#poseNote').hidden = !v; }

function play() {
  if (S.playing) return;
  if (S.frame >= S.duration * FPS - 0.5) S.frame = 0;
  S.playing = true;
  lastT = 0;
  tc.enabled = false;
  $('#tPlay').innerHTML = icon('pause');
  $('#tPlay').setAttribute('aria-label', 'Pause');
  req();
}
function pause() {
  if (!S.playing) return;
  S.playing = false;
  tc.enabled = true;
  $('#tPlay').innerHTML = icon('play');
  $('#tPlay').setAttribute('aria-label', 'Play');
  setFrame(Math.round(S.frame));
}

// ---------------------------------------------------------------- history (undo / redo) + autosave
function snapshot() { return JSON.stringify(world.toJSON()); }

function commit() {
  if (S.restoring) return;
  const s = snapshot();
  if (S.history[S.hIdx] !== s) {
    S.history.length = S.hIdx + 1;
    S.history.push(s);
    let total = S.history.reduce((a, x) => a + x.length, 0);
    while (S.history.length > 2 && (S.history.length > 40 || total > 30e6)) total -= S.history.shift().length;
    S.hIdx = S.history.length - 1;
    scheduleAutosave();
  }
  updateUndo();
  renderOutliner();
}
function resetHistory() {
  S.history = [snapshot()];
  S.hIdx = 0;
  updateUndo();
  renderOutliner();
}
function updateUndo() {
  $('#bUndo').disabled = S.hIdx <= 0;
  $('#bRedo').disabled = S.hIdx >= S.history.length - 1;
}
async function undo() {
  if (S.hIdx <= 0 || S.restoring) return;
  pause();
  S.hIdx--;
  await restoreWorld(S.history[S.hIdx]);
  updateUndo();
  scheduleAutosave();
}
async function redo() {
  if (S.hIdx >= S.history.length - 1 || S.restoring) return;
  pause();
  S.hIdx++;
  await restoreWorld(S.history[S.hIdx]);
  updateUndo();
  scheduleAutosave();
}

async function restoreWorld(data, keepSel = true) {
  S.restoring = true;
  try {
    const ids = keepSel ? S.sel.map((o) => o.uuid) : [];
    const json = typeof data === 'string' ? JSON.parse(data) : data;
    if ((json.geometries || []).some((g) => g.type === 'Text3DGeometry')) {
      try { await loadFont(); } catch { toast('Letters need the internet; showing blocks for now.', 4000); }
    }
    const root = await loader.parseAsync(json);
    clearWorld();
    for (const c of [...root.children]) world.add(c);
    world.traverse((n) => { if (n.isMesh) [].concat(n.material).forEach(relinkMaterial); });
    S.sel = ids.map((id) => world.children.find((c) => c.uuid === id)).filter(Boolean);
    syncSelection();
    setFrame(S.frame);
  } finally {
    S.restoring = false;
  }
}
function clearWorld() {
  tc.detach();
  for (const c of [...world.children]) { world.remove(c); disposeObject(c); }
}

function projectString() {
  const w = S.history[S.hIdx] || snapshot();
  const meta = {
    app: 'tiny-3d-studio', version: 1, settings: envApi.settings, duration: S.duration, aspect: S.aspect,
    camera: { p: camera.position.toArray(), t: orbit.target.toArray() },
  };
  return JSON.stringify(meta).slice(0, -1) + ',"world":' + w + '}';
}
let saveTimer = 0;
function scheduleAutosave() { clearTimeout(saveTimer); saveTimer = setTimeout(autosave, 1200); }
function autosave() {
  if (!S.ready || S.restoring) return;
  try { localStorage.setItem(AUTOSAVE_KEY, projectString()); } catch {
    if (!S.warnedFull) { S.warnedFull = true; toast('This scene is too big to autosave. Use Save to keep it.', 5000); }
  }
}

async function loadProject(data) {
  if (!data || data.app !== 'tiny-3d-studio' || !data.world) throw new Error('This is not a Tiny 3D Studio project file.');
  pause();
  S.sel = [];
  await restoreWorld(data.world, false);
  applySettings(data.settings || {}, true);
  S.duration = clamp(Math.round(data.duration || 5), 1, 60);
  $('#tLen').value = S.duration;
  setAspect(data.aspect || 'reel');
  if (data.camera && data.camera.p && data.camera.t) {
    camera.position.fromArray(data.camera.p);
    orbit.target.fromArray(data.camera.t);
    orbit.update();
  }
  drawTicks();
  resetHistory();
  setFrame(0);
}

function saveProject() {
  io.download(new Blob([projectString()], { type: 'application/json' }), 'my-3d-scene.json');
  toast('Project saved. Use Open to bring it back.');
}
async function openProject() {
  const file = await io.pickFile('.json,application/json');
  if (!file) return;
  try {
    await loadProject(JSON.parse(await file.text()));
    autosave();
    toast('Opened ' + file.name);
  } catch (e) {
    console.error(e);
    toast('Could not open it: ' + e.message, 4000);
  }
}
function newScene() {
  if (world.children.length && !confirm('Start a new empty scene? Save first if you want to keep this one.')) return;
  pause();
  clearWorld();
  S.sel = [];
  applySettings(DEFAULT_SETTINGS, true);
  S.duration = 5;
  $('#tLen').value = 5;
  drawTicks();
  resetHistory();
  setFrame(0);
  syncSelection();
  flyTo(new THREE.Vector3(6, 4.5, 8), new THREE.Vector3(0, 1, 0));
  autosave();
}

// ---------------------------------------------------------------- export
function beginOffscreen(w, h) {
  S.exporting = true;
  const st = {
    pr: renderer.getPixelRatio(), size: renderer.getSize(new THREE.Vector2()),
    grid: envApi.grid.visible, helper: tc.getHelper().visible,
  };
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  envApi.grid.visible = false;
  tc.getHelper().visible = false;
  boxes.forEach((b) => { b.visible = false; });
  return st;
}
function endOffscreen(st) {
  renderer.setPixelRatio(st.pr);
  renderer.setSize(st.size.x, st.size.y, false);
  envApi.grid.visible = st.grid;
  tc.getHelper().visible = st.helper;
  boxes.forEach((b) => { b.visible = true; });
  S.exporting = false;
  resize();
}

function exportPNG() {
  const [w, h] = ASPECTS[S.aspect];
  const cam = exportCamera();
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const st = beginOffscreen(w, h);
  try {
    draw(cam);
    out.getContext('2d').drawImage(renderer.domElement, 0, 0, w, h);
  } finally {
    endOffscreen(st);
  }
  out.toBlob((b) => {
    if (!b) return toast('Could not make the picture.');
    io.download(b, `tiny3d-${S.aspect}.png`);
    toast(`Picture saved (${w}×${h}).`);
  }, 'image/png');
}

let cancelBusy = null;
function showBusy(text, onCancel) {
  $('#busyText').textContent = text;
  $('#busyBar').style.width = '0%';
  cancelBusy = onCancel;
  $('#busy').hidden = false;
}
function hideBusy() { $('#busy').hidden = true; cancelBusy = null; }

async function exportVideo() {
  const [w, h] = ASPECTS[S.aspect];
  const frames = Math.round(S.duration * FPS);
  const cam = exportCamera();
  const keep = S.frame;
  let cancelled = false;
  showBusy(`Making a ${S.duration} s video… keep this tab open.`, () => { cancelled = true; });
  const st = beginOffscreen(w, h);
  try {
    const blob = await io.recordWebM({
      width: w, height: h, fps: FPS, frames,
      renderFrame: (i) => {
        S.frame = i;
        world.traverse((o) => { if (o.userData.keys) anim.applyKeys(o, i); });
        draw(cam);
        return renderer.domElement;
      },
      onProgress: (p) => { $('#busyBar').style.width = Math.round(p * 100) + '%'; },
      isCancelled: () => cancelled,
    });
    if (blob) {
      io.download(blob, `tiny3d-${S.aspect}.webm`);
      toast('Video saved (WebM). If an app wants MP4, convert it first.', 4500);
    }
  } catch (e) {
    console.error(e);
    toast('Video did not work: ' + e.message, 4500);
  } finally {
    endOffscreen(st);
    hideBusy();
    setFrame(keep);
  }
}

async function exportModelFile(kind) {
  if (!world.children.some((o) => o.visible)) return toast('Nothing to export yet.');
  const order = [...world.children];
  const hidden = order.filter((o) => !o.visible);
  hidden.forEach((o) => world.remove(o));
  try {
    await io.exportModel(world, kind);
    toast(kind === 'stl' ? 'STL saved. Open it in your 3D-print slicer.' : 'Model saved.');
  } catch (e) {
    console.error(e);
    toast('Export did not work: ' + e.message, 4000);
  } finally {
    hidden.forEach((o) => world.add(o));
    world.children.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
}

function doExport(kind) {
  closeMenu();
  pause();
  if (kind === 'png') return exportPNG();
  if (kind === 'webm') return exportVideo();
  return exportModelFile(kind);
}

// ---------------------------------------------------------------- panels
function showTab(id) {
  $$('#right .tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === id)));
  $('#pObj').hidden = id !== 'pObj';
  $('#pScene').hidden = id !== 'pScene';
}

function renderOutliner() {
  const ul = $('#outliner');
  ul.innerHTML = '';
  if (!world.children.length) { ul.innerHTML = '<li class="empty">Empty. Add a shape on the left.</li>'; return; }
  for (const o of world.children) {
    const li = document.createElement('li');
    li.className = (S.sel.includes(o) ? 'on ' : '') + (o.visible ? '' : 'off');
    li.innerHTML =
      `<span class="nm"></span>${o.userData.keys ? '<span class="kd" title="Has keys">◆</span>' : ''}` +
      `<button class="vis" title="Hide / show">${icon(o.visible ? 'eye' : 'eyeoff')}</button>` +
      `<button class="lk ${o.userData.locked ? 'lit' : ''}" title="Lock: can't be clicked or moved">${icon(o.userData.locked ? 'lock' : 'unlock')}</button>`;
    const nm = li.querySelector('.nm');
    nm.textContent = o.name || 'Thing';
    nm.title = 'Double-click to rename';
    li.onclick = (e) => { if (!e.target.closest('button,input')) select(o, e.shiftKey); };
    nm.ondblclick = () => renameInline(nm, o);
    li.querySelector('.vis').onclick = () => toggleHide([o]);
    li.querySelector('.lk').onclick = () => { o.userData.locked = !o.userData.locked; syncSelection(); commit(); };
    ul.append(li);
  }
}
function renameInline(span, o) {
  const inp = document.createElement('input');
  inp.value = o.name;
  inp.maxLength = 40;
  span.textContent = '';
  span.append(inp);
  inp.focus();
  inp.select();
  let fin = false;
  const done = (ok) => {
    if (fin) return;
    fin = true;
    if (ok && inp.value.trim()) o.name = inp.value.trim();
    commit();
    renderOutliner();
    renderPanel();
  };
  inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
  inp.onblur = () => done(true);
}

function renderPanel() {
  const o = primary();
  $('#noSel').hidden = !!o;
  $('#objFields').hidden = !o;
  $('#tEase').checked = !!(o && o.userData.ease);
  if (!o) return;
  $('#fName').value = o.name;
  $$('.xyz input').forEach((i) => { i.disabled = !!o.userData.locked; });
  updateFields();
  const m = firstMesh(o);
  chipOn('#matChips', m ? presetOf(m.material) : '');
  $('#fColor').value = m && m.material.color ? '#' + m.material.color.getHexString() : '#ffffff';
  $('#fOpacity').value = m ? m.material.opacity : 1;
  const isText = o.userData.shape === 'text';
  $('#textRow').hidden = !isText;
  if (isText) $('#fText').value = o.userData.text || '';
  chipOn('#autoChips', o.userData.auto || 'none');
  $('#aUngroup').disabled = !S.sel.some(isGroupish);
  $('#aGroup').disabled = S.sel.length < 2;
}
function updateFields() {
  const o = primary();
  if (!o) return;
  const active = document.activeElement;
  $$('.xyz').forEach((row) => {
    const prop = row.dataset.prop;
    const v = o[prop];
    const vals = prop === 'rotation' ? [v.x, v.y, v.z].map((r) => THREE.MathUtils.radToDeg(r)) : [v.x, v.y, v.z];
    row.querySelectorAll('input').forEach((inp, i) => {
      if (inp !== active) inp.value = +vals[i].toFixed(prop === 'rotation' ? 0 : 2);
    });
  });
}

async function setText() {
  const o = primary();
  const str = $('#fText').value.trim();
  if (!o || o.userData.shape !== 'text' || !str) return;
  try {
    const font = await loadFont();
    const g = textGeometry(str, font);
    o.geometry.dispose();
    o.geometry = g;
    o.userData.text = str;
    o.name = 'Text: ' + str.slice(0, 16);
    syncSelection();
    commit();
  } catch (e) {
    toast('Could not load the letters. Check the internet.', 4000);
  }
}

// ---------------------------------------------------------------- menu
function closeMenu() { $('#exportMenu').hidden = true; $('#bExport').setAttribute('aria-expanded', 'false'); }
function toggleMenu() {
  const m = $('#exportMenu');
  if (!m.hidden) return closeMenu();
  const r = $('#bExport').getBoundingClientRect();
  m.style.top = r.bottom + 6 + 'px';
  m.style.right = Math.max(8, innerWidth - r.right) + 'px';
  m.hidden = false;
  $('#bExport').setAttribute('aria-expanded', 'true');
}

// ---------------------------------------------------------------- build UI + events
function buildUI() {
  const addBtn = (box, id, label) => {
    const b = document.createElement('button');
    b.className = 'add';
    b.type = 'button';
    b.title = 'Add ' + label.toLowerCase();
    b.innerHTML = icon(id) + `<span>${label}</span>`;
    b.onclick = () => addShape(id);
    box.append(b);
  };
  BASIC.forEach(([id, label]) => addBtn($('#addBasic'), id, label));
  CUTE.forEach(([id, label]) => addBtn($('#addCute'), id, label));
  $$('[data-import]').forEach((b) => { b.onclick = () => importThing(b.dataset.import); });

  // top bar
  $('#bUndo').onclick = undo;
  $('#bRedo').onclick = redo;
  $$('#modeBtns [data-mode]').forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
  $('#bSnap').onclick = () => setSnap(!S.snap);
  $$('#viewBtns [data-view]').forEach((b) => { b.onclick = () => setView(b.dataset.view); });
  $('#bFrameSel').onclick = frameSelection;
  $('#aspect').onchange = (e) => setAspect(e.target.value);
  $('#bNew').onclick = newScene;
  $('#bOpen').onclick = openProject;
  $('#bSave').onclick = saveProject;
  $('#bExport').onclick = (e) => { e.stopPropagation(); toggleMenu(); };
  $$('#exportMenu [data-export]').forEach((b) => { b.onclick = () => doExport(b.dataset.export); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) closeMenu(); });
  $('#bHelp').onclick = () => $('#help').showModal();
  $('#hintOff').onclick = () => { $('#hint').hidden = true; try { localStorage.setItem(HINT_KEY, '1'); } catch { /* fine */ } };
  $('#textDlg').addEventListener('close', onTextDialogClose);
  $('#textCancel').onclick = () => $('#textDlg').close();
  $('#busyCancel').onclick = () => { if (cancelBusy) cancelBusy(); };

  // right panel
  $$('#right .tab').forEach((t) => { t.onclick = () => showTab(t.dataset.tab); });
  $('#fName').addEventListener('input', (e) => { const o = primary(); if (o) o.name = e.target.value || 'Thing'; });
  $('#fName').addEventListener('change', () => commit());
  $$('.xyz').forEach((row) => {
    row.querySelectorAll('input').forEach((inp, i) => {
      inp.addEventListener('input', () => {
        const o = primary();
        const v = parseFloat(inp.value);
        if (!o || !Number.isFinite(v)) return;
        const axis = 'xyz'[i];
        if (row.dataset.prop === 'rotation') o.rotation[axis] = THREE.MathUtils.degToRad(v);
        else if (row.dataset.prop === 'scale') o.scale[axis] = Math.max(0.01, v);
        else o.position[axis] = v;
        if (o.userData.keys) showPoseNote(true);
        req();
      });
      inp.addEventListener('change', () => commit());
    });
  });
  chips('#matChips', PRESETS, setPreset);
  const sw = $('#swatches');
  for (const c of PASTELS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = c;
    b.title = c;
    b.onclick = () => { if (S.sel.length) paint(c, true); };
    sw.append(b);
  }
  $('#fColor').addEventListener('input', (e) => paint(e.target.value, false));
  $('#fColor').addEventListener('change', (e) => paint(e.target.value, true));
  $('#fOpacity').addEventListener('input', (e) => { forSelMeshes((n) => setOpacity(n.material, +e.target.value)); req(); });
  $('#fOpacity').addEventListener('change', () => commit());
  $('#fTextGo').onclick = setText;
  $('#fText').addEventListener('keydown', (e) => { if (e.key === 'Enter') setText(); });
  chips('#autoChips', anim.AUTOS, (id) => {
    if (!S.sel.length) return;
    S.sel.forEach((o) => { if (id === 'none') delete o.userData.auto; else o.userData.auto = id; });
    renderPanel();
    commit();
    req();
    if (id !== 'none' && !S.playing) toast('Press Play to see it move.');
  });
  $('#aDup').onclick = duplicateSel;
  $('#aDel').onclick = deleteSel;
  $('#aFloor').onclick = floorSel;
  $('#aGroup').onclick = groupSel;
  $('#aUngroup').onclick = ungroupSel;

  // scene panel
  chips('#bgChips', BACKGROUNDS.map((b) => [b[0], b[1]]), (id) => applySettings({ bg: id }));
  $('#bgColor').addEventListener('input', (e) => applySettings({ bg: 'plain', bgColor: e.target.value }));
  $('#sGround').onchange = (e) => applySettings({ ground: e.target.checked });
  $('#groundColor').addEventListener('input', (e) => applySettings({ groundColor: e.target.value }));
  $('#sGrid').onchange = (e) => applySettings({ grid: e.target.checked });
  chips('#lightChips', LIGHTS, (id) => applySettings({ light: id }));
  $('#sAmb').addEventListener('input', (e) => applySettings({ ambient: +e.target.value }));
  $('#sShadows').onchange = (e) => applySettings({ shadows: e.target.checked });

  // timeline
  $('#tPlay').onclick = () => (S.playing ? pause() : play());
  $('#tLoop').onclick = () => { S.loop = !S.loop; $('#tLoop').classList.toggle('on', S.loop); };
  $('#tKey').onclick = addKeyHere;
  $('#tDelKey').onclick = removeKeyHere;
  $('#tEase').onchange = (e) => {
    if (!S.sel.length) { e.target.checked = false; return toast('Pick a thing first.'); }
    S.sel.forEach((o) => { o.userData.ease = e.target.checked; });
    setFrame(S.frame);
    commit();
  };
  $('#tLen').onchange = (e) => {
    S.duration = clamp(Math.round(+e.target.value || 5), 1, 60);
    e.target.value = S.duration;
    drawTicks();
    setFrame(Math.min(S.frame, S.duration * FPS));
    scheduleAutosave();
  };
  const track = $('#track');
  track.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#keys button')) return;
    pause();
    track.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = track.getBoundingClientRect();
      setFrame(Math.round(clamp((ev.clientX - r.left) / r.width, 0, 1) * S.duration * FPS));
    };
    const up = () => {
      track.removeEventListener('pointermove', move);
      track.removeEventListener('pointerup', up);
      track.removeEventListener('pointercancel', up);
    };
    move(e);
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', up);
    track.addEventListener('pointercancel', up);
  });

  // After a mouse click, give focus back to the page so Space plays instead of re-clicking.
  document.addEventListener('pointerup', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (b && e.pointerType === 'mouse') setTimeout(() => b.blur(), 0);
  });

  setMode('translate');
  setAspect('reel');
  drawTicks();
  updateUndo();
}

function wireKeys() {
  addEventListener('keydown', (e) => {
    if (S.exporting || document.querySelector('dialog[open]')) return;
    const t = e.target;
    if (t.closest && t.closest('input, textarea, select, [contenteditable]')) {
      if (e.key === 'Escape') t.blur();
      return;
    }
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl) {
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (k === 'y') { e.preventDefault(); redo(); }
      else if (k === 'd') { e.preventDefault(); duplicateSel(); }
      else if (k === 's') { e.preventDefault(); saveProject(); }
      else if (k === 'g') { e.preventDefault(); if (e.shiftKey) ungroupSel(); else groupSel(); }
      return;
    }
    if (e.altKey) return;
    switch (e.key === '?' ? '?' : k) {
      case 'g': case 'w': setMode('translate'); break;
      case 'r': case 'e': setMode('rotate'); break;
      case 's': setMode('scale'); break;
      case 'n': setSnap(!S.snap); break;
      case 'f': frameSelection(); break;
      case 'h': toggleHide(); break;
      case 'k': addKeyHere(); break;
      case 'delete': case 'backspace': case 'x': deleteSel(); break;
      case ' ': e.preventDefault(); if (S.playing) pause(); else play(); break;
      case 'arrowleft': pause(); setFrame(Math.round(S.frame) - (e.shiftKey ? 10 : 1)); break;
      case 'arrowright': pause(); setFrame(Math.round(S.frame) + (e.shiftKey ? 10 : 1)); break;
      case '1': setView('front'); break;
      case '3': setView('side'); break;
      case '7': setView('top'); break;
      case '0': case '5': setView('persp'); break;
      case '?': $('#help').showModal(); break;
      case 'escape': closeMenu(); select(null); break;
      default: return;
    }
  });
}

// ---------------------------------------------------------------- start
function hasWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

if (!hasWebGL2()) {
  window.__t3dReady = true;
  fatal('<b>3D is not available here.</b><br>This browser or graphics card has WebGL 2 turned off.<br>Try a recent Chrome or Firefox, and switch on "Use graphics acceleration" in its settings.');
} else {
  try {
    main();
  } catch (e) {
    console.error(e);
    window.__t3dReady = true;
    fatal('<b>Tiny 3D Studio could not start.</b><br>' + String(e && e.message || e).replace(/</g, '&lt;') + '<br>Try reloading the page.');
  }
}
