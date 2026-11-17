// Material presets: Clay, Toon, Plastic, Glossy, Metal, Glass, Glow.
import * as THREE from 'three';

export const PRESETS = [
  ['clay', 'Clay'], ['toon', 'Toon'], ['plastic', 'Plastic'], ['glossy', 'Glossy'],
  ['metal', 'Metal'], ['glass', 'Glass'], ['glow', 'Glow'],
];

export const PASTELS = [
  '#ffb3c1', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff',
  '#bdb2ff', '#ffc6ff', '#ffffff', '#f4e1c1', '#8d6e63', '#3a3a48',
];

let gradient = null;
// One shared 4-step gradient for every Toon material (cel shading).
export function toonGradient() {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([80, 150, 215, 255]), 4, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.name = 'toon-gradient';
  gradient.needsUpdate = true;
  return gradient;
}

export function makeMaterial(preset, color = '#ffb3c1', opacity = 1, map = null) {
  const c = new THREE.Color(color);
  let m;
  switch (preset) {
    case 'toon': m = new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient() }); break;
    case 'plastic': m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0 }); break;
    case 'glossy': m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }); break;
    case 'metal': m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 1 }); break;
    case 'glass':
      m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.05, metalness: 0, clearcoat: 1 });
      opacity = Math.min(opacity, 0.45);
      break;
    case 'glow': m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.1, roughness: 0.6 }); break;
    default: preset = 'clay'; m = new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0 });
  }
  m.userData.preset = preset;
  if (map) { m.map = map; m.alphaTest = 0.02; m.side = THREE.DoubleSide; }
  setOpacity(m, opacity);
  return m;
}

export function setOpacity(m, o) {
  m.opacity = o;
  m.transparent = o < 0.99 || !!m.map;
  m.depthWrite = !(o < 0.99 && !m.map);
  m.needsUpdate = true;
}

export function setColor(m, hex) {
  if (!m.color) return;
  m.color.set(hex);
  if (m.userData.preset === 'glow' && m.emissive) m.emissive.set(hex);
}

export function presetOf(m) { return (m && m.userData && m.userData.preset) || 'clay'; }

// After loading JSON, point Toon materials back at the shared gradient.
export function relinkMaterial(m) {
  if (m && m.isMeshToonMaterial) { m.gradientMap = toonGradient(); m.needsUpdate = true; }
}

export function disposeMaterial(m) {
  if (!m) return;
  for (const v of Object.values(m)) if (v && v.isTexture && v !== gradient) v.dispose();
  m.dispose();
}
