// Files in and out: downloads, model export (GLB / OBJ / STL), model import, WebM recording.
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

export async function exportModel(root, kind) {
  if (kind === 'glb') {
    const data = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
    download(new Blob([data], { type: 'model/gltf-binary' }), 'tiny3d-model.glb');
  } else if (kind === 'obj') {
    download(new Blob([new OBJExporter().parse(root)], { type: 'text/plain' }), 'tiny3d-model.obj');
  } else if (kind === 'stl') {
    const view = new STLExporter().parse(root, { binary: true });
    download(new Blob([view], { type: 'model/stl' }), 'tiny3d-model.stl');
  }
}

export async function importModel(file) {
  const buf = await file.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  return gltf.scene;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Records frames one by one: renderFrame(i) must return a canvas holding frame i.
// Frames are made deterministically, then paced to real time so the WebM plays at fps.
export async function recordWebM({ width, height, fps, frames, renderFrame, onProgress, isCancelled }) {
  if (typeof MediaRecorder === 'undefined') throw new Error('This browser cannot record video.');
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('This browser cannot record WebM video.');
  const out = document.createElement('canvas');
  out.width = width; out.height = height;
  const ctx = out.getContext('2d');
  const stream = out.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const push = () => (track.requestFrame ? track.requestFrame() : stream.requestFrame && stream.requestFrame());
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });
  rec.start(1000);
  const step = 1000 / fps;
  const t0 = performance.now();
  try {
    for (let i = 0; i < frames; i++) {
      if (isCancelled && isCancelled()) break;
      ctx.drawImage(renderFrame(i), 0, 0, width, height);
      push();
      if (onProgress) onProgress((i + 1) / frames);
      const wait = t0 + (i + 1) * step - performance.now();
      await sleep(Math.max(0, wait));
    }
  } finally {
    rec.stop();
    await stopped;
    track.stop();
  }
  if (isCancelled && isCancelled()) return null;
  return new Blob(chunks, { type: 'video/webm' });
}
