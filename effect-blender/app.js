/* Effect Blender: effects for Krita drawings and animations.
   Plain Canvas 2D, no dependencies. Every effect is deterministic from its seed and the frame time. */
(() => {
'use strict';

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const md = (a, b) => ((a % b) + b) % b;
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const TAU = Math.PI * 2;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const fit = (c, w, h) => { if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } };
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.filter((k) => k != null && k !== false));
  return e;
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Seeded random numbers: same seed + same frame = same picture, every time.
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rng(...n) {
  let h = 2166136261;
  for (const x of n) { h ^= x | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return mulberry32(h >>> 0);
}

// Does this browser support ctx.filter? (Safari may not.) If not, pixel maths take over.
const FILTER = (() => {
  try {
    const c = mk(2, 2).getContext('2d', { willReadFrequently: true });
    c.filter = 'invert(1)'; c.fillStyle = '#f00'; c.fillRect(0, 0, 2, 2);
    return c.getImageData(0, 0, 1, 1).data[0] < 128;
  } catch (_) { return false; }
})();

// ---------- settings ----------
const SIZES = { reel: [1080, 1920, 'Reel'], square: [1080, 1080, 'Square'], youtube: [1920, 1080, 'YouTube'] };
const BLENDS = [['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'],
  ['soft-light', 'Soft light'], ['lighten', 'Lighten'], ['color-dodge', 'Colour dodge']];
const FONTS = {
  story: 'Georgia, "Times New Roman", serif',
  hand: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive',
  clean: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  round: '"Trebuchet MS", "Avenir Next", sans-serif',
  type: '"Courier New", ui-monospace, monospace',
};
const STORE = 'effect-blender:project';
const FFMPEG = 'ffmpeg -i in.webm -c:v libx264 -pix_fmt yuv420p -c:a aac out.mp4';

const P = { size: 'reel', fit: 'fill', bg: '#ffffff', fps: 12, still: 5, stack: [] }; // saved with the project
const S = { kind: 'sample', name: 'sample', cur: null, files: [], video: null, url: '', t: 0, playing: false,
  sharp: false, exporting: false, tok: 0, hasAudio: null, undo: null, lastUrl: '' };

// ---------- effect parameters ----------
const R = (k, label, min, max, step, def, unit = '') => ({ k, label, type: 'range', min, max, step, def, unit });
const C = (k, label, def) => ({ k, label, type: 'color', def });
const O = (k, label, opts, def) => ({ k, label, type: 'select', opts, def });
const T = (k, label, def) => ({ k, label, type: 'text', def });
const B = (k, label, def) => ({ k, label, type: 'check', def });
const SEED = (def) => R('seed', 'Variation', 1, 99, 1, def);

// Reusable work canvases
const G1 = mk(8, 8), g1 = G1.getContext('2d', { willReadFrequently: true });
const G2 = mk(8, 8), g2 = G2.getContext('2d');
const grain = { key: '', c: mk(256, 256) };
const paper = { key: '', c: null };

function paperTex(W, H, p, u) {
  const key = [W, H, p.grain, p.fibers, p.blotch, p.tint, p.seed].join();
  if (paper.key === key) return paper.c;
  const c = mk(W, H), x = c.getContext('2d', { willReadFrequently: true }), r = rng(p.seed, 1);
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  // soft blotches: tiny random grids stretched smooth
  x.globalCompositeOperation = 'multiply';
  for (const [div, a] of [[5, 1], [18, 0.6], [60, 0.35]]) {
    const gw = div, gh = Math.max(2, Math.round((div * H) / W)), n = mk(gw, gh), nx = n.getContext('2d');
    const d = nx.createImageData(gw, gh);
    for (let i = 0; i < d.data.length; i += 4) { const v = 255 - r() * 70; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    nx.putImageData(d, 0, 0);
    x.globalAlpha = p.blotch * a; x.imageSmoothingQuality = 'high'; x.drawImage(n, 0, 0, W, H);
  }
  // fibers
  x.globalAlpha = 1; x.lineWidth = Math.max(0.6, u * 1.2); x.strokeStyle = 'rgba(110,90,60,0.09)';
  const fibers = Math.round(1800 * p.fibers * (W * H) / (1080 * 1920));
  for (let i = 0; i < fibers; i++) {
    const fx = r() * W, fy = r() * H, len = (10 + r() * 50) * u, a = r() * TAU;
    x.beginPath(); x.moveTo(fx, fy);
    x.quadraticCurveTo(fx + Math.cos(a + 0.6) * len * 0.5, fy + Math.sin(a + 0.6) * len * 0.5, fx + Math.cos(a) * len, fy + Math.sin(a) * len);
    x.stroke();
  }
  // fine grain, pixel by pixel
  if (p.grain > 0) {
    const d = x.getImageData(0, 0, W, H), a = d.data, k = p.grain * 46;
    for (let i = 0; i < a.length; i += 4) { const v = (r() - 0.5) * k; a[i] += v; a[i + 1] += v; a[i + 2] += v; }
    x.putImageData(d, 0, 0);
  }
  x.globalAlpha = 1; x.fillStyle = p.tint; x.fillRect(0, 0, W, H);
  paper.key = key; paper.c = c;
  return c;
}

function grainTile(seed, f, amt) {
  const key = seed + ':' + f + ':' + amt;
  if (grain.key === key) return grain.c;
  const x = grain.c.getContext('2d'), d = x.createImageData(256, 256), a = d.data, r = rng(seed, f, 77);
  for (let i = 0; i < a.length; i += 4) { const v = 128 + (r() - 0.5) * 255 * amt; a[i] = a[i + 1] = a[i + 2] = v; a[i + 3] = 255; }
  x.putImageData(d, 0, 0); grain.key = key;
  return grain.c;
}

function pixelGrade(l, W, H, p) {
  const d = l.getImageData(0, 0, W, H), a = d.data;
  const b = 1 + p.bright / 100, c = 1 + p.contrast / 100, s = 1 + p.sat / 100;
  for (let i = 0; i < a.length; i += 4) {
    let r = a[i] * b, g = a[i + 1] * b, bl = a[i + 2] * b;
    r = (r - 128) * c + 128; g = (g - 128) * c + 128; bl = (bl - 128) * c + 128;
    const y = 0.299 * r + 0.587 * g + 0.114 * bl;
    a[i] = y + (r - y) * s; a[i + 1] = y + (g - y) * s; a[i + 2] = y + (bl - y) * s;
  }
  l.putImageData(d, 0, 0);
}

function wrapText(l, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/)) {
      const test = line ? line + ' ' + w : w;
      if (line && l.measureText(test).width > maxW) { out.push(line); line = w; } else line = test;
    }
    out.push(line);
  }
  return out;
}

function heart(l, x, y, s) {
  l.beginPath(); l.moveTo(x, y + s);
  l.bezierCurveTo(x - s * 1.3, y + s * 0.1, x - s, y - s * 0.95, x, y - s * 0.35);
  l.bezierCurveTo(x + s, y - s * 0.95, x + s * 1.3, y + s * 0.1, x, y + s);
  l.fill();
}
function star(l, x, y, s) {
  l.beginPath(); l.moveTo(x, y - s);
  l.quadraticCurveTo(x, y, x + s, y); l.quadraticCurveTo(x, y, x, y + s);
  l.quadraticCurveTo(x, y, x - s, y); l.quadraticCurveTo(x, y, x, y - s);
  l.fill();
}
const LEAVES = ['#d9822b', '#c0492b', '#e0a526', '#9a5b2b', '#b8732e'];
const HEARTS = ['#ff6fa5', '#ff8fb8', '#ff4f7b', '#ffb3c9'];

// ---------- effects ----------
// draw(env, params, layerCtx) paints into an empty layer; the layer is then blended onto the picture.
// "replace" effects (camera) swap the whole picture instead.
const FX = {
  paper: {
    name: 'Paper texture', icon: '▤', blend: 'multiply', opacity: 0.6,
    params: [R('grain', 'Grain', 0, 1, 0.01, 0.5), R('fibers', 'Fibers', 0, 1, 0.01, 0.5), R('blotch', 'Blotches', 0, 1, 0.01, 0.5),
      C('tint', 'Paper colour', '#f4e9d2'), SEED(7)],
    draw(env, p, l) { l.drawImage(paperTex(env.W, env.H, p, env.u), 0, 0); },
  },
  grain: {
    name: 'Film grain', icon: '░', blend: 'overlay', opacity: 0.35,
    params: [R('amount', 'Amount', 0, 1, 0.01, 0.6), R('size', 'Size', 1, 4, 0.1, 1.5), SEED(3)],
    draw(env, p, l) {
      const tile = grainTile(p.seed, env.f, p.amount), r = rng(p.seed, env.f, 5), s = p.size * Math.max(env.u, 0.25);
      l.translate(-r() * 256 * s, -r() * 256 * s); l.scale(s, s);
      l.fillStyle = l.createPattern(tile, 'repeat'); l.fillRect(0, 0, env.W / s + 256, env.H / s + 256);
    },
  },
  vignette: {
    name: 'Vignette', icon: '◉', blend: 'source-over', opacity: 0.6,
    params: [R('size', 'Size', 0, 1, 0.01, 0.45), R('soft', 'Softness', 0, 1, 0.01, 0.7), C('color', 'Colour', '#000000')],
    draw(env, p, l) {
      const inner = 1.45 * (1 - p.size), outer = inner + 0.15 + p.soft * 1.1;
      l.translate(env.W / 2, env.H / 2); l.scale(env.W / 2, env.H / 2);
      const g = l.createRadialGradient(0, 0, inner, 0, 0, outer);
      g.addColorStop(0, hexA(p.color, 0)); g.addColorStop(1, hexA(p.color, 1));
      l.fillStyle = g; l.fillRect(-1, -1, 2, 2);
    },
  },
  glow: {
    name: 'Glow', icon: '✺', blend: 'screen', opacity: 0.7,
    params: [R('radius', 'Spread', 2, 80, 1, 28), R('threshold', 'Only bright parts', 0, 0.9, 0.01, 0.45), R('strength', 'Strength', 0, 2, 0.05, 1)],
    draw(env, p, l) {
      const { W, H } = env, sw = Math.max(32, Math.round(W / 4)), sh = Math.max(32, Math.round(H / 4));
      fit(G1, sw, sh); fit(G2, sw, sh);
      g1.drawImage(env.c.canvas, 0, 0, sw, sh);
      if (p.threshold > 0) {
        const d = g1.getImageData(0, 0, sw, sh), a = d.data, th = p.threshold * 255, k = 1 / (255 - th);
        for (let i = 0; i < a.length; i += 4) {
          const y = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2], m = y <= th ? 0 : (y - th) * k;
          a[i] *= m; a[i + 1] *= m; a[i + 2] *= m;
        }
        g1.putImageData(d, 0, 0);
      }
      const r = (p.radius * env.u * sw) / W;
      g2.clearRect(0, 0, sw, sh);
      let tw = sw, th2 = sh;
      if (FILTER) { g2.filter = `blur(${r.toFixed(2)}px)`; g2.drawImage(G1, 0, 0); g2.filter = 'none'; }
      else { tw = Math.max(4, Math.round(sw / Math.max(1, r))); th2 = Math.max(4, Math.round(sh / Math.max(1, r))); g2.drawImage(G1, 0, 0, tw, th2); }
      l.imageSmoothingQuality = 'high';
      l.globalAlpha = Math.min(1, p.strength); l.drawImage(G2, 0, 0, tw, th2, 0, 0, W, H);
      if (p.strength > 1) { l.globalCompositeOperation = 'lighter'; l.globalAlpha = p.strength - 1; l.drawImage(G2, 0, 0, tw, th2, 0, 0, W, H); }
    },
  },
  grade: {
    name: 'Colour', icon: '◐', blend: 'source-over', opacity: 1,
    params: [R('bright', 'Brightness', -50, 50, 1, 0), R('contrast', 'Contrast', -50, 50, 1, 0), R('sat', 'Saturation', -100, 100, 1, 0),
      R('warm', 'Warm ↔ cool', -60, 60, 1, 0)],
    draw(env, p, l) {
      const { W, H } = env;
      if (FILTER) { l.filter = `brightness(${1 + p.bright / 100}) contrast(${1 + p.contrast / 100}) saturate(${1 + p.sat / 100})`; l.drawImage(env.c.canvas, 0, 0); l.filter = 'none'; }
      else { l.drawImage(env.c.canvas, 0, 0); if (p.bright || p.contrast || p.sat) pixelGrade(l, W, H, p); }
      if (p.warm) {
        l.globalCompositeOperation = 'soft-light'; l.globalAlpha = Math.abs(p.warm) / 60 * 0.85;
        l.fillStyle = p.warm > 0 ? '#ff9a3c' : '#3c7dff'; l.fillRect(0, 0, W, H);
      }
    },
  },
  particles: {
    name: 'Particles', icon: '❄', blend: 'source-over', opacity: 1,
    params: [O('kind', 'Kind', [['snow', 'Snow'], ['rain', 'Rain'], ['sparkle', 'Sparkles'], ['hearts', 'Hearts'], ['leaves', 'Falling leaves']], 'snow'),
      R('count', 'How many', 0, 400, 1, 120), R('speed', 'Speed', 0, 3, 0.05, 1), R('size', 'Size', 0.3, 3, 0.05, 1),
      R('wind', 'Wind', -1, 1, 0.05, 0), SEED(11)],
    draw(env, p, l) {
      const { W, H, t, u } = env, m = 80 * u, kind = p.kind;
      const n = Math.round(p.count);
      if (kind === 'rain') { l.strokeStyle = 'rgba(205,222,255,0.6)'; l.lineWidth = Math.max(0.7, 1.6 * u * p.size); l.lineCap = 'round'; l.beginPath(); }
      for (let i = 0; i < n; i++) {
        const r = rng(p.seed, i, 11), x0 = r(), y0 = r(), sp = 0.5 + r(), sz = 0.5 + r(), ph = r() * TAU;
        if (kind === 'snow') {
          const v = 90 * u * p.speed * sp, y = md(y0 * (H + 2 * m) + t * v, H + 2 * m) - m;
          const x = md(x0 * W + Math.sin(t * 0.8 * sp + ph) * 30 * u + p.wind * t * v * 0.8, W + 2 * m) - m;
          l.globalAlpha = 0.55 + 0.45 * sz / 1.5; l.fillStyle = '#fff';
          l.beginPath(); l.arc(x, y, 4.5 * u * p.size * sz, 0, TAU); l.fill();
        } else if (kind === 'rain') {
          const v = 1500 * u * p.speed * sp, len = 46 * u * p.size * sz, dx = (p.wind + 0.08) * len;
          const y = md(y0 * (H + 2 * m) + t * v, H + 2 * m) - m, x = md(x0 * W + p.wind * t * v * 0.3, W + 2 * m) - m;
          l.moveTo(x, y); l.lineTo(x + dx, y + len);
        } else if (kind === 'sparkle') {
          const tw = Math.max(0, Math.sin(t * 2.6 * Math.max(0.1, p.speed) * sp + ph));
          if (tw <= 0.02) continue;
          const y = md(y0 * H - t * 18 * u * p.speed * sp, H), x = md(x0 * W + p.wind * t * 30 * u, W), s = 14 * u * p.size * sz * tw;
          l.globalAlpha = 0.35 * tw; l.fillStyle = '#fff3c4'; l.beginPath(); l.arc(x, y, s * 0.55, 0, TAU); l.fill();
          l.globalAlpha = tw; l.fillStyle = '#fffbea'; star(l, x, y, s);
        } else if (kind === 'hearts') {
          const v = 70 * u * p.speed * sp, y = H + m - md(y0 * (H + 2 * m) + t * v, H + 2 * m);
          const x = md(x0 * W + Math.sin(t * 1.1 * sp + ph) * 40 * u + p.wind * t * v, W + 2 * m) - m;
          l.setTransform(1, 0, 0, 1, x, y); l.rotate(Math.sin(t * 1.3 + ph) * 0.25);
          l.globalAlpha = 0.85; l.fillStyle = HEARTS[i % HEARTS.length]; heart(l, 0, 0, 14 * u * p.size * sz);
          l.setTransform(1, 0, 0, 1, 0, 0);
        } else {
          const v = 110 * u * p.speed * sp, y = md(y0 * (H + 2 * m) + t * v, H + 2 * m) - m;
          const x = md(x0 * W + Math.sin(t * 0.9 * sp + ph) * 70 * u + p.wind * t * v, W + 2 * m) - m, s = 16 * u * p.size * sz;
          l.setTransform(1, 0, 0, 1, x, y); l.rotate(t * 1.6 * sp * (i % 2 ? 1 : -1) + ph); l.scale(1, 0.55 + 0.45 * Math.cos(t * 2 * sp + ph));
          l.globalAlpha = 0.95; l.fillStyle = LEAVES[i % LEAVES.length];
          l.beginPath(); l.ellipse(0, 0, s, s * 0.45, 0, 0, TAU); l.fill();
          l.strokeStyle = 'rgba(80,40,10,0.45)'; l.lineWidth = Math.max(0.5, u); l.beginPath(); l.moveTo(-s, 0); l.lineTo(s, 0); l.stroke();
          l.setTransform(1, 0, 0, 1, 0, 0);
        }
      }
      if (kind === 'rain') l.stroke();
    },
  },
  leak: {
    name: 'Light leak', icon: '☀', blend: 'screen', opacity: 0.5,
    params: [C('a', 'Colour 1', '#ff8a3d'), C('b', 'Colour 2', '#ff3d7f'), R('speed', 'Speed', 0, 2, 0.05, 0.4), R('size', 'Size', 0.3, 2, 0.05, 1), SEED(5)],
    draw(env, p, l) {
      const { W, H, t } = env, r = rng(p.seed, 21), big = Math.max(W, H);
      for (let k = 0; k < 3; k++) {
        const fa = 0.25 + r() * 0.4, fb = 0.2 + r() * 0.4, pa = r() * TAU, pb = r() * TAU, rr = 0.3 + r() * 0.3;
        const cx = W * (0.5 + 0.65 * Math.sin(t * p.speed * fa + pa)), cy = H * (0.5 + 0.65 * Math.cos(t * p.speed * fb + pb));
        const rad = big * rr * p.size, col = k === 1 ? p.b : p.a, pulse = 0.65 + 0.35 * Math.sin(t * p.speed * 1.7 + pa);
        const g = l.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, hexA(col, 0.95 * pulse)); g.addColorStop(0.5, hexA(col, 0.35 * pulse)); g.addColorStop(1, hexA(col, 0));
        l.fillStyle = g; l.fillRect(0, 0, W, H);
      }
    },
  },
  text: {
    name: 'Title / poem line', icon: 'T', blend: 'source-over', opacity: 1,
    params: [T('text', 'Words', 'A little poem\nfor a quiet night'), O('font', 'Font', [['story', 'Storybook'], ['hand', 'Handwritten'], ['clean', 'Clean'], ['round', 'Rounded'], ['type', 'Typewriter']], 'story'),
      R('size', 'Size', 20, 220, 1, 76), C('color', 'Colour', '#ffffff'),
      O('place', 'Place', [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], 'bottom'), R('nudge', 'Move up/down', -0.3, 0.3, 0.005, 0),
      R('start', 'Shows at', 0, 60, 0.1, 0.5, ' s'), R('end', 'Hides at', 0, 60, 0.1, 4.5, ' s'), R('fade', 'Fade', 0, 3, 0.05, 0.8, ' s'),
      B('shadow', 'Soft shadow', true), B('outline', 'Outline', false)],
    draw(env, p, l) {
      const { W, H, t, u } = env;
      if (t < p.start || t > p.end) return false;
      const a = p.fade > 0 ? clamp(Math.min((t - p.start) / p.fade, (p.end - t) / p.fade)) : 1;
      if (a <= 0) return false;
      const fs = p.size * u, lh = fs * 1.25;
      l.font = `${fs}px ${FONTS[p.font] || FONTS.story}`; l.textAlign = 'center'; l.textBaseline = 'middle';
      const lines = wrapText(l, p.text, W * 0.86), block = lines.length * lh;
      const cy = H * ({ top: 0.14, middle: 0.5, bottom: 0.82 }[p.place] - p.nudge);
      let y = clamp(cy, block / 2 + 10 * u, H - block / 2 - 10 * u) - block / 2 + lh / 2;
      l.globalAlpha = a; l.fillStyle = p.color; l.lineJoin = 'round';
      if (p.shadow) { l.shadowColor = 'rgba(0,0,0,0.5)'; l.shadowBlur = 14 * u; l.shadowOffsetY = 3 * u; }
      for (const line of lines) {
        if (p.outline) { l.strokeStyle = 'rgba(20,20,20,0.85)'; l.lineWidth = fs * 0.09; l.strokeText(line, W / 2, y); }
        l.fillText(line, W / 2, y); y += lh;
      }
      l.shadowColor = 'transparent';
    },
  },
  fade: {
    name: 'Fade in / out', icon: '◑', blend: 'source-over', opacity: 1,
    params: [O('mode', 'When', [['both', 'Start and end'], ['in', 'Start only'], ['out', 'End only']], 'both'),
      O('color', 'To', [['#000000', 'Black'], ['#ffffff', 'White']], '#000000'), R('len', 'Length', 0.1, 5, 0.05, 1, ' s')],
    draw(env, p, l) {
      const { t, end } = env;
      let a = 0;
      if (p.mode !== 'out' && t < p.len) a = Math.max(a, 1 - t / p.len);
      if (p.mode !== 'in' && t > end - p.len) a = Math.max(a, 1 - (end - t) / p.len);
      if (a <= 0) return false;
      l.globalAlpha = clamp(a); l.fillStyle = p.color; l.fillRect(0, 0, env.W, env.H);
    },
  },
  camera: {
    name: 'Camera: zoom + shake', icon: '⤢', replace: true,
    params: [R('zoom', 'Slow zoom', 0, 40, 1, 10, '%'), O('dir', 'Zoom', [['in', 'In'], ['out', 'Out']], 'in'), R('pan', 'Drift left ↔ right', -1, 1, 0.05, 0),
      R('shake', 'Shake', 0, 40, 1, 0), R('speed', 'Shake speed', 0.1, 4, 0.05, 1), SEED(9)],
    draw(env, p, l) {
      const { W, H, t, u, end } = env, prog = end > 0 ? clamp(t / end) : 0, r = rng(p.seed, 31);
      const wob = () => { const f = [0.9 + r(), 1.7 + r() * 2, 3.1 + r() * 3], ph = [r() * TAU, r() * TAU, r() * TAU];
        return (Math.sin(t * p.speed * f[0] * 2 + ph[0]) * 0.55 + Math.sin(t * p.speed * f[1] * 2 + ph[1]) * 0.3 + Math.sin(t * p.speed * f[2] * 2 + ph[2]) * 0.15); };
      const dx = p.shake * u * wob(), dy = p.shake * u * wob(), rot = p.shake * 0.0012 * wob();
      let z = 1 + (p.zoom / 100) * (p.dir === 'in' ? prog : 1 - prog);
      z *= 1 + (2.2 * p.shake * u) / Math.min(W, H) + Math.abs(rot) * 1.4;
      const px = p.pan * ((z - 1) * W / 2) * (prog * 2 - 1);
      l.translate(W / 2 + dx + px, H / 2 + dy); l.rotate(rot); l.scale(z, z);
      l.drawImage(env.c.canvas, -W / 2, -H / 2);
    },
  },
};
const ORDER = ['paper', 'grain', 'vignette', 'glow', 'grade', 'particles', 'leak', 'text', 'fade', 'camera'];

const PRESETS = {
  cozy: { name: 'Cozy storybook', note: 'paper · warm · vignette', sw: 'linear-gradient(135deg,#f4e3c3,#d9a35f)',
    stack: [['paper', {}, { opacity: 0.55 }], ['grade', { bright: 3, contrast: 6, sat: -8, warm: 28 }], ['vignette', { size: 0.42, soft: 0.75 }, { opacity: 0.45 }]] },
  dreamy: { name: 'Dreamy poem', note: 'glow · sparkles · light · fade', sw: 'linear-gradient(135deg,#ffd6e8,#b9a7ff)',
    stack: [['glow', { radius: 30, threshold: 0.4, strength: 1.2 }, { opacity: 0.7 }], ['particles', { kind: 'sparkle', count: 70, speed: 0.6, size: 1.2 }],
      ['leak', {}, { opacity: 0.45 }], ['fade', { mode: 'both', color: '#ffffff', len: 1.2 }]] },
  rainy: { name: 'Rainy night', note: 'cool · rain · grain', sw: 'linear-gradient(135deg,#2c3e66,#6c86b5)',
    stack: [['grade', { bright: -18, contrast: 12, sat: -30, warm: -40 }], ['particles', { kind: 'rain', count: 240, speed: 1.2, size: 1, wind: 0.25 }],
      ['vignette', { size: 0.55 }, { opacity: 0.65 }], ['grain', { amount: 0.7 }, { opacity: 0.4 }]] },
  snow: { name: 'Snow day', note: 'zoom · cool · snow', sw: 'linear-gradient(135deg,#ffffff,#a9c8ea)',
    stack: [['camera', { zoom: 8, dir: 'in' }], ['grade', { bright: 6, contrast: -4, sat: -15, warm: -15 }],
      ['particles', { kind: 'snow', count: 170, speed: 0.8, size: 1.1, wind: 0.15 }], ['vignette', { size: 0.35, color: '#dfe9f5' }, { opacity: 0.6 }]] },
};

// ---------- effect instances, project save / load ----------
let uid = 0;
const open = new Set(); // effect cards with settings shown
function validParam(q, v) {
  switch (q.type) {
    case 'range': return Number.isFinite(+v) && v !== '' && v != null ? clamp(+v, q.min, q.max) : q.def;
    case 'color': return /^#[0-9a-f]{6}$/i.test(v) ? v : q.def;
    case 'select': return q.opts.some((o) => o[0] === v) ? v : q.def;
    case 'text': return typeof v === 'string' ? v.slice(0, 600) : q.def;
    case 'check': return typeof v === 'boolean' ? v : q.def;
  }
}
function makeFx(type, p = {}, o = {}) {
  const d = FX[type], blend = o.blend === 'normal' ? 'source-over' : o.blend;
  const e = { id: ++uid, type, on: o.on !== false, blend: BLENDS.some((b) => b[0] === blend) ? blend : d.blend || 'source-over',
    opacity: Number.isFinite(+o.opacity) && o.opacity != null ? clamp(+o.opacity) : d.opacity ?? 1, p: {} };
  for (const q of d.params) e.p[q.k] = validParam(q, p ? p[q.k] : undefined);
  return e;
}
function snapshot() {
  return { app: 'effect-blender', version: 1, size: P.size, fit: P.fit, bg: P.bg, fps: P.fps, still: P.still,
    stack: P.stack.map((e) => ({ type: e.type, on: e.on, blend: e.blend === 'source-over' ? 'normal' : e.blend, opacity: e.opacity, p: { ...e.p } })) };
}
function restore(o) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.stack)) throw new Error('not a project');
  if (SIZES[o.size]) P.size = o.size;
  if (o.fit === 'fit' || o.fit === 'fill') P.fit = o.fit;
  if (/^#[0-9a-f]{6}$/i.test(o.bg)) P.bg = o.bg;
  if (Number.isFinite(+o.fps)) P.fps = clamp(Math.round(+o.fps), 1, 60);
  if (Number.isFinite(+o.still)) P.still = clamp(+o.still, 1, 60);
  P.stack = o.stack.filter((e) => e && FX[e.type]).slice(0, 40).map((e) => makeFx(e.type, e.p, e));
}
let saveTimer = 0;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(snapshot())); } catch (_) { /* storage off */ } }, 300);
}

// ---------- source clip ----------
const cv = $('#view'), cx = cv.getContext('2d', { alpha: false });
const L = mk(8, 8), lx = L.getContext('2d', { willReadFrequently: !FILTER });
const cache = new Map(), pending = new Map();

function duration() {
  if (S.kind === 'video') return Number.isFinite(S.video.duration) ? S.video.duration : 0;
  if (S.kind === 'seq') return S.files.length / P.fps;
  return P.still;
}
const frameCount = () => (S.kind === 'seq' ? S.files.length : Math.max(1, Math.round(duration() * P.fps)));
const lastT = () => Math.max(0, (frameCount() - 1) / P.fps);
const frameOf = (t) => clamp(Math.floor(t * P.fps + 1e-6), 0, frameCount() - 1);

function loadFrame(i) {
  if (cache.has(i)) return Promise.resolve(cache.get(i));
  if (pending.has(i)) return pending.get(i);
  const files = S.files;
  const pr = createImageBitmap(files[i]).then((b) => {
    pending.delete(i);
    if (files !== S.files) return b;
    cache.set(i, b);
    if (cache.size > 48) { // keep memory low: drop the frame farthest away
      let far = -1, fd = -1;
      for (const k of cache.keys()) { const d = Math.abs(k - i); if (d > fd) { fd = d; far = k; } }
      cache.delete(far);
    }
    return b;
  });
  pending.set(i, pr);
  return pr;
}
function seek(t) {
  const v = S.video;
  if (Math.abs(v.currentTime - t) < 0.0005 && v.readyState >= 2) return Promise.resolve();
  return new Promise((res) => {
    const done = () => { clearTimeout(to); v.removeEventListener('seeked', done); res(); };
    const to = setTimeout(done, 2000);
    v.addEventListener('seeked', done);
    v.currentTime = t;
  });
}
async function prepare(t) {
  if (S.kind === 'seq') S.cur = await loadFrame(frameOf(t));
  else if (S.kind === 'video') await seek(Math.min(t + 0.0005, Math.max(0, duration() - 0.001)));
}

function sample() {
  const c = mk(1080, 1920), x = c.getContext('2d');
  let g = x.createLinearGradient(0, 0, 0, 1920); g.addColorStop(0, '#9fd3f0'); g.addColorStop(0.55, '#fde7c6'); g.addColorStop(1, '#fde7c6');
  x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);
  x.fillStyle = '#ffd36b'; x.beginPath(); x.arc(790, 520, 120, 0, TAU); x.fill();
  x.fillStyle = 'rgba(255,255,255,.9)';
  for (const [cx0, cy0, s] of [[250, 420, 1], [640, 300, 0.7], [880, 760, 0.8]]) {
    x.beginPath(); x.ellipse(cx0, cy0, 120 * s, 46 * s, 0, 0, TAU); x.ellipse(cx0 + 70 * s, cy0 - 30 * s, 70 * s, 50 * s, 0, 0, TAU); x.fill();
  }
  x.fillStyle = '#9ccc8a'; x.beginPath(); x.moveTo(0, 1250); x.quadraticCurveTo(400, 1060, 1080, 1220); x.lineTo(1080, 1920); x.lineTo(0, 1920); x.fill();
  x.fillStyle = '#6fae74'; x.beginPath(); x.moveTo(0, 1480); x.quadraticCurveTo(620, 1300, 1080, 1460); x.lineTo(1080, 1920); x.lineTo(0, 1920); x.fill();
  x.fillStyle = '#f2b880'; x.fillRect(300, 1150, 300, 230);
  x.fillStyle = '#c8553d'; x.beginPath(); x.moveTo(270, 1160); x.lineTo(450, 1020); x.lineTo(630, 1160); x.fill();
  x.fillStyle = '#7a4b35'; x.fillRect(420, 1260, 64, 120);
  x.fillStyle = '#fff4c2'; x.fillRect(330, 1200, 60, 54); x.fillRect(512, 1200, 60, 54);
  x.fillStyle = '#7a4b35'; x.fillRect(800, 1150, 34, 200);
  x.fillStyle = '#4f8f5a'; x.beginPath(); x.arc(817, 1100, 110, 0, TAU); x.fill();
  x.strokeStyle = '#e9d6a9'; x.lineWidth = 22; x.lineCap = 'round'; x.setLineDash([2, 40]);
  x.beginPath(); x.moveTo(452, 1400); x.quadraticCurveTo(380, 1650, 560, 1920); x.stroke();
  return c;
}
const SAMPLE = sample();

function releaseSource() {
  pause();
  if (S.video) { S.video.pause(); S.video.remove(); S.video = null; }
  if (S.url) URL.revokeObjectURL(S.url);
  S.url = ''; S.files = []; S.cur = null; S.hasAudio = null;
  if (audio.src) { try { audio.src.disconnect(); } catch (_) { /* already gone */ } audio.src = null; }
  cache.clear(); pending.clear();
}
function useSample() { releaseSource(); S.kind = 'sample'; S.name = 'sample'; S.cur = SAMPLE; afterLoad(); }

async function loadFiles(list) {
  const files = [...list];
  const json = files.find((f) => /\.json$/i.test(f.name));
  if (json) return openProject(json);
  const vids = files.filter((f) => f.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|m4v|ogv)$/i.test(f.name));
  const imgs = files.filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name));
  try {
    if (vids.length) await loadVideo(vids[0]);
    else if (imgs.length > 1) await loadSeq(imgs);
    else if (imgs.length === 1) await loadStill(imgs[0]);
    else toast('That file type is not supported. Use MP4, WebM, PNG or JPG.');
  } catch (err) {
    console.error(err);
    toast('Could not open that file. ' + (vids.length ? 'Export it from Krita as MP4 (H.264) or WebM.' : 'Try PNG.'));
    useSample();
  }
}
const base = (n) => n.replace(/\.[^.]+$/, '').replace(/[_\-. ]*\d+$/, '') || 'clip';

async function loadVideo(f) {
  releaseSource();
  const v = el('video', { class: 'hidden-video', playsinline: true, preload: 'auto' });
  S.url = URL.createObjectURL(f); v.src = S.url; document.body.append(v);
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video')); });
  if (!Number.isFinite(v.duration)) { // MediaRecorder WebM files may not know their length yet
    await new Promise((res) => { v.ondurationchange = () => Number.isFinite(v.duration) && res(); v.currentTime = 1e9; setTimeout(res, 3000); });
  }
  S.video = v; S.kind = 'video'; S.name = base(f.name);
  await seek(0);
  S.hasAudio = v.mozHasAudio === true ? true : v.mozHasAudio === false ? false : v.audioTracks ? v.audioTracks.length > 0 : null;
  if (P.fps < 24) P.fps = 30;
  v.addEventListener('pause', checkAudio);
  afterLoad();
}
async function loadSeq(imgs) {
  releaseSource();
  const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  S.files = imgs.sort((a, b) => coll.compare(a.name, b.name));
  S.kind = 'seq'; S.name = base(S.files[0].name);
  if (P.fps === 30) P.fps = 12;
  S.cur = await loadFrame(0);
  for (let i = 1; i < Math.min(12, S.files.length); i++) loadFrame(i).catch(() => {});
  afterLoad();
}
async function loadStill(f) {
  releaseSource();
  S.cur = await createImageBitmap(f); S.kind = 'image'; S.name = base(f.name);
  afterLoad();
}
function afterLoad() {
  S.t = 0;
  syncClipUI(); syncExportUI(); requestRender();
}

// ---------- audio: route the video's sound through Web Audio so it can be recorded ----------
const audio = { ctx: null, src: null, dest: null, err: '' };
function audioOn() {
  if (S.kind !== 'video') return false;
  if (audio.src && audio.src.mediaElement === S.video) return true;
  try {
    audio.ctx = audio.ctx || new (window.AudioContext || window.webkitAudioContext)();
    audio.src = audio.ctx.createMediaElementSource(S.video);
    audio.dest = audio.dest || audio.ctx.createMediaStreamDestination();
    audio.src.connect(audio.ctx.destination); audio.src.connect(audio.dest);
    return true;
  } catch (e) { audio.err = e.message || 'blocked'; return false; }
}
function checkAudio() {
  const v = S.video;
  if (v && S.hasAudio == null && v.webkitAudioDecodedByteCount != null && v.currentTime > 0.3) {
    S.hasAudio = v.webkitAudioDecodedByteCount > 0; syncExportUI();
  }
}

// ---------- rendering ----------
function outSize() {
  const [w, h] = SIZES[P.size], q = S.exporting || S.sharp ? 1 : 0.5;
  return [Math.round(w * q), Math.round(h * q)];
}
function render(t) {
  const [W, H] = outSize();
  fit(cv, W, H); fit(L, W, H);
  const c = cx;
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
  const src = S.kind === 'video' ? S.video : S.cur;
  const sw = S.kind === 'video' ? src.videoWidth : src && src.width, sh = S.kind === 'video' ? src.videoHeight : src && src.height;
  if (sw && sh) {
    const k = P.fit === 'fit' ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh), dw = sw * k, dh = sh * k;
    c.imageSmoothingQuality = 'high'; c.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  const env = { t, f: Math.round(t * P.fps), W, H, u: Math.min(W, H) / 1080, end: lastT(), c };
  for (const e of P.stack) {
    if (!e.on) continue;
    const d = FX[e.type];
    lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalCompositeOperation = 'source-over'; lx.globalAlpha = 1; lx.shadowColor = 'transparent';
    if (FILTER) lx.filter = 'none';
    lx.clearRect(0, 0, W, H);
    try { if (d.draw(env, e.p, lx) === false) continue; } catch (err) { console.error(e.type, err); continue; }
    lx.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = d.replace ? 'copy' : e.blend;
    c.globalAlpha = d.replace ? 1 : e.opacity;
    c.drawImage(L, 0, 0);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  }
}
let rq = 0;
function requestRender() {
  if (S.playing || S.exporting || rq) return;
  rq = requestAnimationFrame(async () => {
    rq = 0;
    const tok = ++S.tok;
    await prepare(S.t).catch(() => {});
    if (tok !== S.tok || S.exporting) return;
    render(S.t); syncTime();
  });
}

// ---------- playback ----------
function play() {
  if (S.playing || S.exporting) return;
  S.playing = true; S.tok++;
  if (S.t >= lastT() - 1e-3) S.t = 0;
  if (S.kind === 'video') {
    if (audioOn() && audio.ctx.state !== 'running') audio.ctx.resume();
    S.video.loop = true; S.video.currentTime = S.t; S.video.play().catch(() => pause());
  }
  S.t0 = performance.now() - S.t * 1000;
  syncPlay(); requestAnimationFrame(tick);
}
function pause() {
  if (!S.playing) return;
  S.playing = false;
  if (S.video) S.video.pause();
  syncPlay(); requestRender();
}
function tick() {
  if (!S.playing) return;
  const end = duration();
  if (S.kind === 'video') S.t = S.video.currentTime;
  else {
    S.t = (performance.now() - S.t0) / 1000;
    if (S.t >= end) { S.t0 = performance.now(); S.t = 0; }
  }
  if (S.kind === 'seq') {
    const i = frameOf(S.t), n = S.files.length;
    if (cache.has(i)) S.cur = cache.get(i); else loadFrame(i).catch(() => {});
    for (let k = 1; k <= 6; k++) loadFrame((i + k) % n).catch(() => {});
  }
  render(S.t); syncTime();
  requestAnimationFrame(tick);
}
function stepFrame(d) {
  pause();
  S.t = clamp((frameOf(S.t) + d) / P.fps, 0, lastT());
  requestRender();
}

// ---------- export ----------
function pickMime() {
  if (!window.MediaRecorder) return '';
  return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
    .find((m) => MediaRecorder.isTypeSupported(m)) || '';
}
function download(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  return a.href;
}
const canKeepSound = () => !!(window.AudioContext || window.webkitAudioContext) && /opus|mp4/.test(pickMime());

let cancelExport = false;
async function exportVideo() {
  const mime = pickMime();
  if (!mime || !cv.captureStream) return toast('This browser cannot record video. Please use Chrome, Edge or Firefox.');
  pause(); cancelExport = false;
  let withSound = S.kind === 'video' && $('#keepSound').checked && S.hasAudio !== false;
  if (withSound && !(canKeepSound() && audioOn())) { withSound = false; toast('Sound could not be kept in this browser. The video is recorded without it.'); }
  S.exporting = true; syncExportUI();
  const fps = P.fps, N = frameCount(), ms = 1000 / fps;
  const vstream = cv.captureStream(withSound ? fps : 0);
  const vt = vstream.getVideoTracks()[0];
  const tracks = [vt];
  if (withSound) { await audio.ctx.resume(); tracks.push(...audio.dest.stream.getAudioTracks()); }
  const [W, H] = SIZES[P.size];
  const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: Math.round(W * H * fps * 0.25) + 4e6 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => { rec.onstop = r; });
  let late = 0;
  try {
    if (withSound) {
      // Real time: the clip plays once while the canvas and its sound are recorded together.
      const v = S.video; v.loop = false;
      await seek(0); render(0);
      rec.start(250);
      await v.play();
      await new Promise((res) => {
        const step = () => {
          if (cancelExport || v.ended || v.paused) return res();
          render(v.currentTime); progress(v.currentTime / duration());
          requestAnimationFrame(step);
        };
        v.onended = res; step();
      });
      v.pause(); v.onended = null;
    } else {
      // Frame by frame: each frame is drawn exactly at n / fps, then held for one frame of real time.
      await prepare(0); render(0);
      rec.start(250);
      let due = performance.now();
      for (let n = 0; n < N && !cancelExport; n++) {
        if (n > 0) render(n / fps);
        if (vt.requestFrame) vt.requestFrame(); else if (vstream.requestFrame) vstream.requestFrame();
        progress((n + 1) / N);
        due += ms;
        await Promise.all([n + 1 < N ? prepare((n + 1) / fps) : null, sleep(due - performance.now())]);
        if (performance.now() - due > ms) late++;
      }
      await sleep(ms);
    }
  } catch (err) { console.error(err); toast('Recording stopped: ' + err.message); }
  rec.stop(); await stopped;
  tracks.forEach((t) => t !== vt || t.stop());
  S.exporting = false; progress(0);
  if (!cancelExport && chunks.length) {
    const ext = mime.includes('mp4') ? 'mp4' : 'webm', blob = new Blob(chunks, { type: mime.split(';')[0] });
    if (S.lastUrl) URL.revokeObjectURL(S.lastUrl);
    S.lastUrl = download(blob, `${S.name}-effects.${ext}`);
    const mb = (blob.size / 1048576).toFixed(1);
    $('#lastFile').hidden = false; $('#lastLink').href = S.lastUrl; $('#lastLink').download = `${S.name}-effects.${ext}`;
    $('#lastInfo').textContent = `${mb} MB · ${W}×${H} · ${fps} fps` + (withSound ? ' · with sound' : '');
    toast(late > N * 0.1 ? 'Saved. Your computer was busy, so the video may run a little long. Try fewer effects.' : 'Video saved to your downloads.');
  } else if (cancelExport) toast('Recording cancelled.');
  syncExportUI(); requestRender();
}
function progress(x) { $('#prog').value = x; $('#progText').textContent = x ? Math.round(x * 100) + '%' : ''; }

async function exportPNG() {
  pause(); S.exporting = true;
  await prepare(S.t).catch(() => {}); render(S.t);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  S.exporting = false; requestRender();
  if (blob) { const url = download(blob, `${S.name}-frame-${String(frameOf(S.t) + 1).padStart(3, '0')}.png`); setTimeout(() => URL.revokeObjectURL(url), 60000); }
}
function saveProject() {
  const url = download(new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' }), `${S.name}-effects-project.json`);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function openProject(f) {
  try { keepUndo(); restore(JSON.parse(await f.text())); applied('Project opened.'); }
  catch (_) { toast('That file is not an Effect Blender project.'); }
}

// ---------- UI ----------
let toastTimer = 0;
function toast(msg, action) {
  const t = $('#toast');
  t.replaceChildren(el('span', { text: msg }), action ? el('button', { class: 'btn', text: action[0], onclick: () => { action[1](); t.hidden = true; } }) : null);
  t.hidden = false; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 7000 : 4500);
}
function keepUndo() { S.undo = JSON.stringify(snapshot()); }
function undo() { if (S.undo) { restore(JSON.parse(S.undo)); S.undo = null; applied(); } }
function applied(msg) {
  P.stack.forEach((e) => open.delete(e.id));
  drawStack(); syncClipUI(); changed();
  if (msg) toast(msg, S.undo ? ['Undo', undo] : null);
}
function changed() { autosave(); requestRender(); $('#fxCount').textContent = P.stack.length; }

function fmt(q, v) {
  const dec = q.step >= 1 ? 0 : q.step >= 0.1 ? 1 : 2;
  return v.toFixed(dec) + q.unit;
}
function paramRow(e, q) {
  const id = `p${e.id}-${q.k}`, set = (v) => { e.p[q.k] = v; changed(); };
  let input, out = null;
  if (q.type === 'range') {
    input = el('input', { type: 'range', min: q.min, max: q.max, step: q.step, id, title: 'Double-click to reset' });
    out = el('output', { class: 'num', for: id });
    const show = () => { out.textContent = fmt(q, +input.value); };
    input.value = e.p[q.k]; show();
    input.oninput = () => { show(); set(+input.value); };
    input.ondblclick = () => { input.value = q.def; show(); set(q.def); };
  } else if (q.type === 'color') {
    input = el('input', { type: 'color', id }); input.value = e.p[q.k]; input.oninput = () => set(input.value);
  } else if (q.type === 'select') {
    input = el('select', { id }, ...q.opts.map(([v, t]) => el('option', { value: v, text: t })));
    input.value = e.p[q.k]; input.onchange = () => set(input.value);
  } else if (q.type === 'text') {
    input = el('textarea', { id, rows: 2 }); input.value = e.p[q.k]; input.oninput = () => set(input.value);
  } else {
    input = el('input', { type: 'checkbox', id }); input.checked = e.p[q.k]; input.onchange = () => set(input.checked);
  }
  return el('div', { class: 'row' + (q.type === 'text' ? ' wide' : '') }, el('label', { for: id, text: q.label }), input, out || el('span'));
}
function drawStack() {
  const list = $('#stack');
  list.replaceChildren(...P.stack.map((e, i) => {
    const d = FX[e.type], isOpen = open.has(e.id);
    const body = el('div', { class: 'fx-body', hidden: !isOpen }, ...d.params.map((q) => paramRow(e, q)));
    if (!d.replace) {
      const bid = `b${e.id}`, oid = `o${e.id}`;
      const bsel = el('select', { id: bid }, ...BLENDS.map(([v, t]) => el('option', { value: v, text: t })));
      bsel.value = e.blend; bsel.onchange = () => { e.blend = bsel.value; changed(); };
      const op = el('input', { type: 'range', min: 0, max: 1, step: 0.01, id: oid, title: 'Double-click to reset' }), out = el('output', { class: 'num' });
      const show = () => { out.textContent = Math.round(op.value * 100) + '%'; };
      op.value = e.opacity; show();
      op.oninput = () => { show(); e.opacity = +op.value; changed(); };
      op.ondblclick = () => { op.value = d.opacity ?? 1; op.oninput(); };
      body.append(el('div', { class: 'mix' }, el('div', { class: 'row' }, el('label', { for: bid, text: 'Blend' }), bsel, el('span')),
        el('div', { class: 'row' }, el('label', { for: oid, text: 'Strength' }), op, out)));
    }
    const sw = el('input', { type: 'checkbox', 'aria-label': 'Effect on' }); sw.checked = e.on;
    sw.onchange = () => { e.on = sw.checked; card.classList.toggle('off', !e.on); changed(); };
    const move = (k) => { const j = i + k; if (j < 0 || j >= P.stack.length) return; [P.stack[i], P.stack[j]] = [P.stack[j], P.stack[i]]; drawStack(); changed(); };
    const card = el('li', { class: 'fx' + (e.on ? '' : ' off') },
      el('div', { class: 'fx-head' },
        el('label', { class: 'switch' }, sw, el('span')),
        el('button', { class: 'fx-name', 'aria-expanded': String(isOpen), onclick: (ev) => {
          const o = body.hidden; body.hidden = !o; ev.currentTarget.setAttribute('aria-expanded', String(o));
          if (o) open.add(e.id); else open.delete(e.id);
        } }, el('span', { class: 'fx-ic', text: d.icon }), el('span', { text: d.name })),
        el('button', { class: 'ib', 'aria-label': 'Move up', title: 'Move up', disabled: i === 0, onclick: () => move(-1), text: '↑' }),
        el('button', { class: 'ib', 'aria-label': 'Move down', title: 'Move down', disabled: i === P.stack.length - 1, onclick: () => move(1), text: '↓' }),
        el('button', { class: 'ib', 'aria-label': 'Remove', title: 'Remove', onclick: () => {
          keepUndo(); P.stack.splice(i, 1); drawStack(); changed(); toast(d.name + ' removed.', ['Undo', undo]);
        }, text: '✕' })),
      body);
    return card;
  }));
  $('#stackEmpty').hidden = P.stack.length > 0;
  $('#fxCount').textContent = P.stack.length;
}

function seg(sel, val, onPick) {
  const box = $(sel);
  box.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === val);
    b.setAttribute('aria-pressed', String(b.dataset.v === val));
    b.onclick = () => onPick(b.dataset.v);
  });
}
function syncClipUI() {
  seg('#sizeSeg', P.size, (v) => { P.size = v; syncClipUI(); syncExportUI(); changed(); });
  seg('#fitSeg', P.fit, (v) => { P.fit = v; syncClipUI(); changed(); });
  const fpsSel = $('#fps');
  if (![...fpsSel.options].some((o) => +o.value === P.fps)) fpsSel.append(new Option(P.fps));
  $('#bg').value = P.bg; fpsSel.value = P.fps; $('#still').value = P.still; $('#stillOut').textContent = P.still + ' s';
  const k = S.kind, d = duration();
  $('#clipInfo').textContent =
    k === 'sample' ? 'Sample picture. Drop your own to replace it.'
    : k === 'video' ? `${S.name} · ${S.video.videoWidth}×${S.video.videoHeight} · ${d.toFixed(1)} s`
    : k === 'seq' ? `${S.files.length} frames · ${d.toFixed(1)} s at ${P.fps} fps`
    : `${S.name} · still picture · ${d} s`;
  $('#stillRow').hidden = !(k === 'image' || k === 'sample');
  $('#fpsLabel').textContent = k === 'seq' ? 'Frames per second' : 'Video fps';
  $('#clearClip').hidden = k === 'sample';
  syncTime();
}
function syncExportUI() {
  const [W, H] = SIZES[P.size], mime = pickMime(), N = frameCount();
  $('#outInfo').textContent = mime
    ? `${W}×${H} · ${P.fps} fps · ${duration().toFixed(1)} s · ${mime.includes('mp4') ? 'MP4' : 'WebM ' + (mime.match(/vp\d/) || [''])[0].toUpperCase()}`
    : 'This browser cannot record video. Use Chrome or Edge.';
  const isV = S.kind === 'video';
  $('#soundRow').hidden = !isV;
  if (isV) {
    const ok = canKeepSound();
    $('#keepSound').disabled = !ok || S.hasAudio === false;
    $('#soundNote').textContent = S.hasAudio === false ? 'This clip has no sound.'
      : !ok ? 'This browser cannot keep the sound. Add it back with ffmpeg (see below).'
      : 'Sound on: the clip plays once in real time while it records. Sound off: frame by frame.';
  }
  $('#soundFix').hidden = !(isV && !canKeepSound());
  $('#makeVideo').disabled = S.exporting || !mime;
  $('#makePng').disabled = S.exporting;
  $('#cancelVideo').hidden = !S.exporting;
  $('#progRow').hidden = !S.exporting;
  $('#exportHint').textContent = S.exporting ? `Recording ${N} frames. Keep this tab open and visible.` : '';
}
function syncPlay() {
  const b = $('#playBtn');
  b.textContent = S.playing ? '❚❚' : '▶'; b.setAttribute('aria-label', S.playing ? 'Pause' : 'Play');
}
function syncTime() {
  const sc = $('#scrub'), end = lastT();
  sc.max = end || 0.001; sc.step = 1 / P.fps; sc.value = S.t;
  $('#time').textContent = `${S.t.toFixed(1)} / ${duration().toFixed(1)} s · frame ${frameOf(S.t) + 1}/${frameCount()}`;
}

function buildStatic() {
  $('#presets').replaceChildren(...Object.entries(PRESETS).map(([k, pr]) => el('button', { class: 'preset', onclick: () => {
    keepUndo();
    P.stack = pr.stack.map(([type, p, o]) => makeFx(type, p, o || {}));
    applied(pr.name + ' applied.');
  } }, el('span', { class: 'sw', style: `background:${pr.sw}` }), el('b', { text: pr.name }), el('small', { text: pr.note }))));
  const add = $('#addFx');
  add.append(...ORDER.map((k) => el('option', { value: k, text: `${FX[k].icon}  ${FX[k].name}` })));
  add.onchange = () => {
    if (!FX[add.value]) return;
    const e = makeFx(add.value); P.stack.push(e); open.add(e.id); add.value = '';
    drawStack(); changed();
  };
  $('#ffmpeg').textContent = FFMPEG;
}

function wire() {
  // tabs
  $$('.tabs .tab').forEach((b) => (b.onclick = () => {
    $$('.tabs .tab').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $$('.pane').forEach((p) => { p.hidden = p.id !== 'pane-' + b.dataset.tab; });
  }));
  // input
  const pick = $('#pick');
  $('#pickBtn').onclick = () => pick.click();
  $('#dropzone').onclick = (e) => { if (!e.target.closest('button')) pick.click(); };
  pick.onchange = () => { if (pick.files.length) loadFiles(pick.files); pick.value = ''; };
  let depth = 0;
  const ov = $('#dropOverlay');
  addEventListener('dragenter', (e) => { if ([...e.dataTransfer.types].includes('Files')) { depth++; ov.hidden = false; } });
  addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; ov.hidden = true; } });
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', (e) => { e.preventDefault(); depth = 0; ov.hidden = true; if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files); });
  $('#clearClip').onclick = useSample;
  // clip settings
  $('#bg').oninput = (e) => { P.bg = e.target.value; changed(); };
  $('#fps').onchange = (e) => { P.fps = clamp(Math.round(+e.target.value) || 12, 1, 60); S.t = Math.min(S.t, lastT()); syncClipUI(); syncExportUI(); changed(); };
  $('#still').oninput = (e) => { P.still = +e.target.value; $('#stillOut').textContent = P.still + ' s'; syncTime(); syncExportUI(); changed(); };
  $('#sharp').onchange = (e) => { S.sharp = e.target.checked; paper.key = ''; requestRender(); };
  // transport
  $('#playBtn').onclick = () => (S.playing ? pause() : play());
  $('#prevBtn').onclick = () => stepFrame(-1);
  $('#nextBtn').onclick = () => stepFrame(1);
  $('#scrub').oninput = (e) => { pause(); S.t = Math.round(+e.target.value * P.fps) / P.fps; requestRender(); syncTime(); };
  addEventListener('keydown', (e) => {
    if (e.target.closest('input,textarea,select,button') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ') { e.preventDefault(); S.playing ? pause() : play(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepFrame(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepFrame(1); }
  });
  // export
  $('#makeVideo').onclick = exportVideo;
  $('#cancelVideo').onclick = () => { cancelExport = true; };
  $('#makePng').onclick = exportPNG;
  $('#copyFf').onclick = () => navigator.clipboard?.writeText(FFMPEG).then(() => toast('Copied.'), () => toast('Select the line and copy it.'));
  $('#saveProj').onclick = saveProject;
  const pj = $('#projFile');
  $('#openProj').onclick = () => pj.click();
  pj.onchange = () => { if (pj.files[0]) openProject(pj.files[0]); pj.value = ''; };
  $('#clearFx').onclick = () => { if (!P.stack.length) return; keepUndo(); P.stack = []; applied('All effects removed.'); };
}

// ---------- start ----------
function start() {
  buildStatic(); wire();
  let loaded = false;
  try { const s = localStorage.getItem(STORE); if (s) { restore(JSON.parse(s)); loaded = true; } } catch (_) { /* fresh start */ }
  if (!loaded) P.stack = PRESETS.cozy.stack.map(([type, p, o]) => makeFx(type, p, o || {}));
  if (!FILTER) $('#filterNote').hidden = false;
  S.cur = SAMPLE;
  drawStack(); syncClipUI(); syncExportUI(); syncPlay(); requestRender();
}
start();
})();
