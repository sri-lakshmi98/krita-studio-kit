# Effect Blender

Effect Blender is a small in-browser tool for adding effects to short 2D animations and drawings from Krita. Think of it as a tiny Blender, only for effects. It needs nothing installed and has no build step: it is plain HTML, CSS and JavaScript, so it runs straight from GitHub Pages or from a local folder. Your files stay on your computer.

## Use it with Krita

1. In Krita, open **File > Render Animation**. Choose either
   - **Image sequence** (PNG), which is the sharpest and gives exact frames, or
   - **Video** (MP4 or WebM).

   For a single drawing, use **File > Export** to save a PNG.
2. Open `index.html` and drop the files onto the page, or press **Choose files**. For a PNG sequence, select all the frames at once.
3. On the **Clip** tab, choose a size (Reel, Square or YouTube), Fill or Fit, and the frames per second. Image sequences start at 12 fps.
4. On the **Effects** tab, click a one-click look, or add effects one at a time. Each effect can be switched on and off, moved up or down, and removed, and has its own blend mode and strength.
5. On the **Export** tab, press **Make video** to get a WebM file, or **Save this frame (PNG)**.

To turn the WebM into an MP4 for Instagram, TikTok or YouTube:

```
ffmpeg -i in.webm -c:v libx264 -pix_fmt yuv420p -c:a aac out.mp4
```

## Features

- **Input:** a video (MP4 or WebM), a PNG/JPG sequence (sorted by file name, with an fps setting), or a single picture (turned into a clip of 1–30 s). A built-in sample picture is shown until you load your own.
- **Preview:** play/pause, a scrubber, and step one frame at a time (Space, ← →). The preview renders at half size by default; tick "Sharp preview" to see it at full size.
- **Canvas sizes:** Reel 1080×1920, Square 1080×1080 and YouTube 1920×1080, with Fill (crop) or Fit (borders in a colour you pick).
- **Effects:** each one has its own sliders, a blend mode (normal, multiply, screen, overlay, soft light, lighten, colour dodge) and a strength setting.
  - Paper texture: procedural, seeded grain, fibers and blotches.
  - Film grain: changes every frame, seeded.
  - Vignette.
  - Glow / bloom.
  - Colour: brightness, contrast, saturation, warm ↔ cool.
  - Particles: snow, rain, sparkles, hearts or falling leaves, with count, speed, size and wind.
  - Light leak.
  - Title / poem line: font, size, colour, position, plus show, hide and fade timing.
  - Fade in / out to black or white.
  - Camera: slow zoom (Ken Burns), drift, and a seeded shake.
- **One-click looks:** Cozy storybook, Dreamy poem, Rainy night and Snow day. You can undo a look after applying it.
- **Export:** WebM through MediaRecorder, using VP9 if the browser supports it and VP8 if not.
  - Image sequences and stills are rendered frame by frame, each frame drawn exactly at n / fps.
  - Videos with sound play once in real time, and their audio is mixed into the recording.
  - You can also save the current frame as a PNG.
- **Projects:** save and open the effect stack and settings as a small `.json` file. They are also saved automatically in the browser.
- **Deterministic:** every random effect comes from a seed (the "Variation" slider), so the same project gives the same video every time.

## Browser support

- **Chrome / Edge:** best. Everything works, including keeping the sound.
- **Firefox:** works, and records WebM with sound.
- **Safari:** the preview works. Recording depends on the version (it may save MP4). Colour and glow use a slower fallback when canvas filters are missing.

## Limits

- Export runs in real time, so a 10 s clip takes about 10 s to record. Keep the tab open and visible while it records, because background tabs slow down timers.
- Sound is only kept from a video source. Image sequences have none. If the browser can't keep the sound, add it back with ffmpeg; the command is shown on the Export tab.
- A video exported with its sound plays in real time, so a very slow computer can drop frames. Turn the sound off to render frame by frame instead.
- Image sequences are decoded on demand, and only about 48 frames are kept in memory at once.
- The project file stores your settings, not the clip itself.

## Files

- `index.html`: the page.
- `app.js`: the effects, preview and export.
- `style.css`: the app layout.
- `theme.css` and `theme-toggle.js`: the shared light/dark theme and its switch.
