// Shapes, cute combo presets, 3D text and picture planes.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { makeMaterial } from './materials.js';

const FONT_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/helvetiker_bold.typeface.json';
const PI = Math.PI;

// Addon geometries (rounded box, text) are unknown to ObjectLoader. These two
// small classes save only their recipe ({} or the words), so project files and
// undo steps stay tiny, and StudioLoader rebuilds them on load.
let loadedFont = null;

export class SoftBoxGeometry extends THREE.BufferGeometry {
  constructor() {
    super();
    const g = new RoundedBoxGeometry(1, 1, 1, 3, 0.14);
    super.copy(g);
    g.dispose();
    this.type = 'SoftBoxGeometry';
    this.parameters = {};
  }
}

export class Text3DGeometry extends THREE.BufferGeometry {
  constructor(text = ' ', font = loadedFont) {
    super();
    let g;
    if (font) {
      g = new TextGeometry(text || ' ', {
        font, size: 0.5, depth: 0.16, curveSegments: 5,
        bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2,
      });
      g.center();
    } else {
      g = new THREE.BoxGeometry(Math.max(0.4, text.length * 0.35), 0.5, 0.16); // font offline: a stand-in block
    }
    super.copy(g);
    g.dispose();
    this.type = 'Text3DGeometry';
    this.parameters = { text };
  }
  copy(src) { super.copy(src); this.parameters = { ...src.parameters }; return this; }
}

export class StudioLoader extends THREE.ObjectLoader {
  parseGeometries(json, shapes) {
    const list = json || [];
    const mine = list.filter((d) => d.type === 'SoftBoxGeometry' || d.type === 'Text3DGeometry');
    const out = super.parseGeometries(list.filter((d) => !mine.includes(d)), shapes);
    for (const d of mine) {
      const g = d.type === 'SoftBoxGeometry' ? new SoftBoxGeometry() : new Text3DGeometry(d.text || ' ');
      g.uuid = d.uuid;
      if (d.name) g.name = d.name;
      out[d.uuid] = g;
    }
    return out;
  }
}

export function mesh(geo, color, preset = 'clay') {
  const m = new THREE.Mesh(geo, makeMaterial(preset, color));
  m.castShadow = m.receiveShadow = true;
  return m;
}

function part(group, geo, color, pos, opts = {}) {
  const m = mesh(geo, color, opts.preset);
  m.position.set(...pos);
  if (opts.rot) m.rotation.set(...opts.rot);
  if (opts.scale) m.scale.set(...opts.scale);
  if (opts.name) m.name = opts.name;
  group.add(m);
  return m;
}

function group(name, shape) {
  const g = new THREE.Group();
  g.name = name;
  g.userData.shape = shape;
  return g;
}

const sph = (r, w = 32, h = 22) => new THREE.SphereGeometry(r, w, h);

// --- basic shapes -----------------------------------------------------------
export const BASIC = [
  ['cube', 'Cube'], ['softcube', 'Soft cube'], ['ball', 'Ball'], ['tube', 'Tube'], ['cone', 'Cone'],
  ['donut', 'Donut'], ['tile', 'Tile'], ['pill', 'Pill'], ['text', 'Text'],
];
export const CUTE = [
  ['snowman', 'Snowman'], ['tree', 'Tree'], ['house', 'House'],
  ['cloud', 'Cloud'], ['mushroom', 'Mushroom'], ['buddy', 'Buddy'],
];

const BASIC_MAKERS = {
  cube: () => new THREE.BoxGeometry(1, 1, 1),
  softcube: () => new SoftBoxGeometry(),
  ball: () => sph(0.6, 40, 28),
  tube: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 40),
  cone: () => new THREE.ConeGeometry(0.55, 1.1, 40),
  donut: () => new THREE.TorusGeometry(0.45, 0.2, 24, 48),
  tile: () => new THREE.PlaneGeometry(2, 2),
  pill: () => new THREE.CapsuleGeometry(0.35, 0.6, 8, 24),
};
const BASIC_COLORS = {
  cube: '#a0c4ff', softcube: '#ffc6ff', ball: '#ffb3c1', tube: '#caffbf', cone: '#ffd6a5',
  donut: '#ffadad', tile: '#bdb2ff', pill: '#9bf6ff',
};

// --- cute combos ------------------------------------------------------------
const CUTE_MAKERS = {
  snowman() {
    const g = group('Snowman', 'snowman');
    part(g, sph(0.6), '#ffffff', [0, 0.6, 0], { name: 'Bottom' });
    part(g, sph(0.43), '#ffffff', [0, 1.42, 0], { name: 'Middle' });
    part(g, sph(0.3), '#ffffff', [0, 2.05, 0], { name: 'Head' });
    for (const x of [-0.1, 0.1]) part(g, sph(0.045, 12, 8), '#2b2b33', [x, 2.13, 0.26], { name: 'Eye' });
    part(g, new THREE.ConeGeometry(0.05, 0.3, 16), '#ff8a3d', [0, 2.05, 0.42], { rot: [PI / 2, 0, 0], name: 'Nose' });
    for (const y of [1.52, 1.32]) part(g, sph(0.05, 12, 8), '#2b2b33', [0, y, 0.42], { name: 'Button' });
    part(g, new THREE.TorusGeometry(0.29, 0.07, 12, 32), '#ff8fa3', [0, 1.8, 0], { rot: [PI / 2, 0, 0], name: 'Scarf' });
    part(g, new THREE.CylinderGeometry(0.34, 0.34, 0.04, 32), '#3a3a48', [0, 2.3, 0], { name: 'Hat brim' });
    part(g, new THREE.CylinderGeometry(0.2, 0.2, 0.32, 32), '#3a3a48', [0, 2.48, 0], { name: 'Hat' });
    return g;
  },
  tree() {
    const g = group('Tree', 'tree');
    part(g, new THREE.CylinderGeometry(0.15, 0.2, 0.6, 16), '#8d6e63', [0, 0.3, 0], { name: 'Trunk' });
    part(g, new THREE.ConeGeometry(0.8, 1.1, 32), '#7bc47f', [0, 1.05, 0], { name: 'Leaves' });
    part(g, new THREE.ConeGeometry(0.62, 0.95, 32), '#8fd694', [0, 1.55, 0], { name: 'Leaves' });
    part(g, new THREE.ConeGeometry(0.42, 0.8, 32), '#a5e3a8', [0, 2.0, 0], { name: 'Leaves' });
    part(g, sph(0.11, 16, 12), '#ffd166', [0, 2.45, 0], { name: 'Star', preset: 'glow' });
    return g;
  },
  house() {
    const g = group('House', 'house');
    part(g, new THREE.BoxGeometry(1.6, 1.2, 1.4), '#ffd6a5', [0, 0.6, 0], { name: 'Walls' });
    part(g, new THREE.ConeGeometry(1.35, 0.9, 4), '#ff8fa3', [0, 1.65, 0], { rot: [0, PI / 4, 0], name: 'Roof' });
    part(g, new THREE.BoxGeometry(0.4, 0.65, 0.06), '#8d6e63', [0, 0.33, 0.71], { name: 'Door' });
    for (const x of [-0.5, 0.5]) part(g, new THREE.BoxGeometry(0.32, 0.32, 0.05), '#9bf6ff', [x, 0.78, 0.71], { name: 'Window' });
    part(g, new THREE.BoxGeometry(0.22, 0.45, 0.22), '#c9a690', [0.45, 1.85, -0.2], { name: 'Chimney' });
    return g;
  },
  cloud() {
    const g = group('Cloud', 'cloud');
    const puffs = [[0, 0, 0, 0.5], [0.5, -0.08, 0, 0.38], [-0.5, -0.08, 0, 0.38], [0.22, 0.25, 0, 0.38], [-0.2, 0.2, 0.1, 0.35]];
    for (const [x, y, z, r] of puffs) part(g, sph(r), '#ffffff', [x, y, z], { name: 'Puff' });
    return g;
  },
  mushroom() {
    const g = group('Mushroom', 'mushroom');
    part(g, new THREE.CylinderGeometry(0.22, 0.28, 0.7, 24), '#f4e1c1', [0, 0.35, 0], { name: 'Stem' });
    part(g, new THREE.SphereGeometry(0.6, 40, 20, 0, PI * 2, 0, PI / 2), '#ff6b6b', [0, 0.62, 0], { scale: [1, 0.8, 1], name: 'Cap' });
    part(g, new THREE.CircleGeometry(0.6, 40), '#f4e1c1', [0, 0.62, 0], { rot: [PI / 2, 0, 0], name: 'Under' });
    const dots = [[0.5, 0.3], [0.7, 2.2], [0.9, 4.1], [0.55, 5.2], [1.0, 1.1], [0.25, 3.3]];
    for (const [phi, th] of dots) {
      const p = [Math.sin(phi) * Math.cos(th) * 0.6, 0.62 + Math.cos(phi) * 0.6 * 0.8, Math.sin(phi) * Math.sin(th) * 0.6];
      part(g, sph(0.07, 12, 8), '#ffffff', p, { scale: [1, 0.6, 1], name: 'Dot' });
    }
    return g;
  },
  buddy() {
    const g = group('Buddy', 'buddy');
    part(g, sph(0.7, 40, 28), '#a0c4ff', [0, 0.63, 0], { scale: [1, 0.9, 0.95], name: 'Body' });
    for (const s of [-1, 1]) {
      part(g, sph(0.14, 20, 14), '#ffffff', [s * 0.22, 0.78, 0.56], { name: 'Eye' });
      part(g, sph(0.075, 16, 12), '#2b2b33', [s * 0.22, 0.79, 0.67], { name: 'Pupil' });
      part(g, sph(0.09, 16, 12), '#ff9fb2', [s * 0.4, 0.58, 0.52], { scale: [1, 0.55, 0.4], name: 'Blush' });
      part(g, sph(0.18, 20, 14), '#7fa6e6', [s * 0.28, 0.06, 0.18], { scale: [1, 0.5, 1.3], name: 'Foot' });
    }
    part(g, new THREE.TorusGeometry(0.08, 0.022, 8, 20, PI), '#2b2b33', [0, 0.6, 0.64], { rot: [0, 0, PI], name: 'Smile' });
    part(g, new THREE.CylinderGeometry(0.02, 0.02, 0.25, 8), '#7bc47f', [0, 1.33, 0], { name: 'Sprout' });
    part(g, sph(0.08, 16, 12), '#7bc47f', [0.06, 1.46, 0], { scale: [1.4, 0.6, 0.8], name: 'Leaf' });
    return g;
  },
};

export function makeShape(id) {
  if (CUTE_MAKERS[id]) return CUTE_MAKERS[id]();
  const make = BASIC_MAKERS[id];
  if (!make) throw new Error('Unknown shape ' + id);
  const m = mesh(make(), BASIC_COLORS[id] || '#ffb3c1');
  m.name = (BASIC.find((b) => b[0] === id) || [, id])[1];
  m.userData.shape = id;
  if (id === 'tile') m.rotation.x = -PI / 2;
  return m;
}

// --- 3D text ----------------------------------------------------------------
let fontPromise = null;
export function loadFont() {
  if (!fontPromise) {
    fontPromise = new FontLoader().loadAsync(FONT_URL)
      .then((f) => { loadedFont = f; return f; })
      .catch((e) => { fontPromise = null; throw e; });
  }
  return fontPromise;
}

export function textGeometry(str, font) { return new Text3DGeometry(str, font); }

export async function makeText(str) {
  const font = await loadFont();
  const m = mesh(textGeometry(str, font), '#ff8fa3');
  m.name = 'Text: ' + str.slice(0, 16);
  m.userData.shape = 'text';
  m.userData.text = str;
  return m;
}

// --- pictures (Krita drawings) ----------------------------------------------
// Reads an image file, shrinks it to max 1024 px (keeps memory low) and returns
// a data-URL image, so it also saves inside the project file.
export async function loadPicture(file, max = 1024) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    const out = new Image();
    out.src = c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9);
    await out.decode();
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function pictureMesh(img, name, height = 2) {
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  const w = height * (img.width / img.height);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, height), makeMaterial('clay', '#ffffff', 1, tex));
  m.castShadow = m.receiveShadow = true;
  m.name = name;
  m.userData.shape = 'picture';
  return m;
}

// Put an object at the centre, resting on the floor.
export function dropToFloor(obj, keepXZ = false) {
  if (!keepXZ) obj.position.set(0, 0, 0);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  obj.position.y += -box.min.y + (box.max.y - box.min.y < 0.02 ? 0.006 : 0);
}
