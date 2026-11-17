// Keyframes (stored in object.userData.keys so they save with the scene)
// and one-click "auto" motions (spin, bounce, float, pulse, wobble).
import * as THREE from 'three';

export const FPS = 30;
export const AUTOS = [['none', 'None'], ['spin', 'Spin'], ['bounce', 'Bounce'], ['float', 'Float'], ['pulse', 'Pulse'], ['wobble', 'Wobble']];

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _c = new THREE.Color();

export function meshesOf(obj) {
  const out = [];
  obj.traverse((o) => { if (o.isMesh && o.material && o.material.color) out.push(o); });
  return out;
}

function capture(obj, f) {
  return {
    f,
    p: obj.position.toArray(),
    q: obj.quaternion.toArray(),
    s: obj.scale.toArray(),
    c: meshesOf(obj).map((m) => m.material.color.getHex()),
  };
}

export function addKey(obj, f) {
  const keys = (obj.userData.keys ||= []);
  const k = capture(obj, f);
  const i = keys.findIndex((x) => x.f === f);
  if (i >= 0) keys[i] = k; else keys.push(k);
  keys.sort((a, b) => a.f - b.f);
}

export function removeKey(obj, f) {
  const keys = obj.userData.keys;
  if (!keys) return false;
  const i = keys.findIndex((x) => Math.abs(x.f - f) < 0.5);
  if (i < 0) return false;
  keys.splice(i, 1);
  if (!keys.length) delete obj.userData.keys;
  return true;
}

export function hasKeyAt(obj, f) {
  return !!(obj.userData.keys && obj.userData.keys.some((x) => Math.abs(x.f - f) < 0.5));
}

// Pose an object for frame f from its keys (linear, or smooth with ease).
export function applyKeys(obj, f) {
  const keys = obj.userData.keys;
  if (!keys || !keys.length) return false;
  let a = keys[0], b = keys[keys.length - 1];
  if (f <= a.f) b = a;
  else if (f >= b.f) a = b;
  else {
    for (let i = 0; i < keys.length - 1; i++) {
      if (f >= keys[i].f && f <= keys[i + 1].f) { a = keys[i]; b = keys[i + 1]; break; }
    }
  }
  let t = a === b ? 0 : (f - a.f) / (b.f - a.f);
  if (obj.userData.ease) t = t * t * (3 - 2 * t);
  obj.position.fromArray(a.p).lerp(_v.fromArray(b.p), t);
  obj.scale.fromArray(a.s).lerp(_v.fromArray(b.s), t);
  obj.quaternion.fromArray(a.q).slerp(_q.fromArray(b.q), t);
  meshesOf(obj).forEach((m, i) => {
    if (a.c[i] === undefined || b.c[i] === undefined) return;
    m.material.color.setHex(a.c[i]).lerp(_c.setHex(b.c[i]), t);
    if (m.material.userData.preset === 'glow' && m.material.emissive) m.material.emissive.copy(m.material.color);
  });
  return true;
}

// Auto motions are added on top of the pose only while drawing, so they never
// change the saved position. They loop cleanly over the timeline length.
export function applyAuto(obj, type, t, duration) {
  const n = Math.max(1, Math.round(duration / 2));
  const ph = (t / duration) * n * Math.PI * 2;
  switch (type) {
    case 'spin': obj.rotateY(ph); break;
    case 'bounce': {
      const h = Math.abs(Math.sin(ph));
      obj.position.y += h * 0.6;
      obj.scale.y *= 1 + 0.08 * h; // a little stretch in the air
      break;
    }
    case 'float': obj.position.y += 0.1 * (1 - Math.cos(ph)); obj.rotateZ(0.05 * Math.sin(ph)); break;
    case 'pulse': obj.scale.multiplyScalar(1 + 0.06 * (1 - Math.cos(ph * 2))); break;
    case 'wobble': obj.rotateZ(0.22 * Math.sin(ph * 2)); break;
  }
}
