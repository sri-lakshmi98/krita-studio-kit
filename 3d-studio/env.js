// Sky (background), floor, grid and light presets.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const BACKGROUNDS = [
  ['sky', 'Sky', ['#8ec5ff', '#cfe8ff', '#f1f8ff']],
  ['sunset', 'Sunset', ['#b07cd8', '#ff9f8a', '#ffe2b8']],
  ['night', 'Night', ['#0b1330', '#1c2350', '#3a3f72']],
  ['studio', 'Studio', ['#e9e4da', '#f4f1ea', '#d6d0c4']],
  ['plain', 'Plain', null],
];

export const LIGHTS = [
  ['day', 'Soft day'], ['golden', 'Golden hour'], ['night', 'Night + moon'], ['studio', 'Studio'],
];

// sky / ground colours, hemi strength, key light, fill, rim, env strength
const LIGHT_DATA = {
  day: { hemi: ['#e3f2ff', '#d8cbb0', 1.1], key: ['#fff4e6', 2.4, [5, 9, 6]], fill: ['#cfe3ff', 0.45, [-6, 4, -4]], rim: ['#ffffff', 0, [0, 4, -8]], env: 0.45 },
  golden: { hemi: ['#ffd9a8', '#6d5a7a', 0.75], key: ['#ffad66', 2.8, [-8, 3.5, 5]], fill: ['#8fa8ff', 0.35, [6, 3, -5]], rim: ['#ff9a6b', 0.8, [0, 4, -8]], env: 0.3 },
  night: { hemi: ['#3a4a7a', '#101018', 0.5], key: ['#b9c8ff', 1.2, [-6, 9, -8]], fill: ['#4b5aa0', 0.25, [6, 3, 5]], rim: ['#7f8cff', 0.4, [0, 4, 8]], env: 0.12 },
  studio: { hemi: ['#ffffff', '#bbbbbb', 0.55], key: ['#ffffff', 2.3, [5, 6, 5]], fill: ['#ffffff', 0.85, [-6, 3, 3]], rim: ['#ffffff', 1.5, [-2, 5, -7]], env: 0.6 },
};

export const DEFAULT_SETTINGS = {
  bg: 'sky', bgColor: '#f7f6f2', ground: true, groundColor: '#f3e7d7', grid: true,
  light: 'day', ambient: 1, shadows: true,
};

function gradientTexture(stops, stars) {
  const c = document.createElement('canvas');
  c.width = stars ? 256 : 4; c.height = 256;
  const g = c.getContext('2d');
  const lg = g.createLinearGradient(0, 0, 0, 256);
  stops.forEach((s, i) => lg.addColorStop(i / (stops.length - 1), s));
  g.fillStyle = lg;
  g.fillRect(0, 0, c.width, 256);
  if (stars) {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 90; i++) {
      g.globalAlpha = 0.4 + rnd() * 0.6;
      g.fillRect(rnd() * 256, rnd() * 170, rnd() < 0.15 ? 1.6 : 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createEnv(scene, renderer) {
  const env = new THREE.Group();
  env.name = '__env';
  scene.add(env);

  // Soft studio reflections so Metal / Glossy look right (small, made in code).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  if (room.dispose) room.dispose();
  pmrem.dispose();

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(30, 64),
    new THREE.MeshStandardMaterial({ color: DEFAULT_SETTINGS.groundColor, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'Floor';
  env.add(ground);

  const grid = new THREE.GridHelper(20, 20, 0x888888, 0x888888);
  grid.material.transparent = true;
  grid.material.opacity = 0.25;
  grid.position.y = 0.003;
  env.add(grid);

  const hemi = new THREE.HemisphereLight();
  const key = new THREE.DirectionalLight();
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 50 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  const fill = new THREE.DirectionalLight();
  const rim = new THREE.DirectionalLight();
  env.add(hemi, key, fill, rim);

  const moon = new THREE.Mesh(new THREE.SphereGeometry(1.1, 32, 16), new THREE.MeshBasicMaterial({ color: '#fff6d8', fog: false }));
  moon.visible = false;
  env.add(moon);

  const bgCache = {};
  let current = { ...DEFAULT_SETTINGS };

  function apply(s) {
    current = { ...DEFAULT_SETTINGS, ...s };
    // sky
    const bg = BACKGROUNDS.find((b) => b[0] === current.bg) || BACKGROUNDS[0];
    if (bg[2]) {
      bgCache[bg[0]] ||= gradientTexture(bg[2], bg[0] === 'night');
      scene.background = bgCache[bg[0]];
    } else {
      scene.background = new THREE.Color(current.bgColor);
    }
    // floor + grid
    ground.visible = current.ground;
    ground.material.color.set(current.groundColor);
    grid.visible = current.grid;
    // lights
    const L = LIGHT_DATA[current.light] || LIGHT_DATA.day;
    hemi.color.set(L.hemi[0]); hemi.groundColor.set(L.hemi[1]);
    hemi.intensity = L.hemi[2] * current.ambient;
    for (const [light, d] of [[key, L.key], [fill, L.fill], [rim, L.rim]]) {
      light.color.set(d[0]); light.intensity = d[1]; light.position.set(...d[2]);
      light.visible = d[1] > 0;
    }
    scene.environmentIntensity = L.env * (0.5 + current.ambient * 0.5);
    moon.visible = current.light === 'night';
    moon.position.copy(key.position).normalize().multiplyScalar(26);
    // shadows
    if (renderer.shadowMap.enabled !== current.shadows) {
      renderer.shadowMap.enabled = current.shadows;
      scene.traverse((o) => {
        if (!o.material) return;
        for (const m of [].concat(o.material)) m.needsUpdate = true;
      });
    }
    key.castShadow = current.shadows;
    return current;
  }

  return { env, ground, grid, apply, get settings() { return current; } };
}
