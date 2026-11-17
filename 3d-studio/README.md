# Tiny 3D Studio

An easy 3D maker that runs in the browser. Think "Blender for beginners": add cute shapes, colour them, pose them on a timeline, and save a Reel-size picture or video. It suits children's-book art, cosy scenes and short vertical videos.

Open `index.html` from the GitHub Pages site. There is nothing to install.

## Why it's light

- **It runs in the browser.** There is no download, no install and no build step.
- **The app's own code is about 107 KB** of plain HTML, CSS and JavaScript. The 3D engine ([three.js](https://threejs.org) r170) loads from the jsDelivr CDN and the browser caches it.
- **It draws only when something changes.** When nothing moves, the graphics card stays idle. It draws every frame only while you play, drag, or record.
- **Low memory use:**
  - The pixel ratio is capped at 1.5.
  - Shadow maps are 1024 px, and you can turn shadows off.
  - Deleted things are freed from memory.
  - Pictures you bring in are shrunk to 1024 px or less.
- **No big files.** All shapes are built in code. The only thing it downloads on demand is a small font, and only when you add 3D text.

## Features

| | |
|---|---|
| **Add** | Cube, Soft cube (rounded), Ball, Tube, Cone, Donut, Tile, Pill, 3D Text |
| **Cute** | Snowman, Tree, House, Cloud, Mushroom, Buddy (a blob character with eyes) |
| **Bring in** | Picture (a standing card), Backdrop (a big wall behind everything), 3D file (`.glb`) |
| **Pick** | Click a thing; Shift+click to pick more. The list on the right lets you rename (double-click), hide and lock things. |
| **Move / Turn / Size** | Use the gizmo or type numbers. Snap gives small steps. You also get Copy, Delete, To floor, Group / Ungroup and Undo / Redo. |
| **Look** | Clay, Toon, Plastic, Glossy, Metal, Glass, Glow. Pick any colour or a pastel swatch, and set Solid (opacity). |
| **Scene** | Sky: Sky, Sunset, Night, Studio or a plain colour. Floor and grid can each be turned on or off. Light: Soft day, Golden hour, Night + moon, Studio. There is a soft-light slider and a shadows switch. |
| **Camera** | Left-drag turns, right-drag slides, the wheel zooms. Buttons give Front, Side, Top and 3D views, and Zoom to (F) fits the picked thing. |
| **Frame** | A dashed frame shows the export area: Reel 9:16 (1080×1920), Square (1080×1080) or Wide 16:9 (1920×1080). |
| **Animate** | The timeline is 5 s at 30 fps by default. Pose, then **Add key**, and repeat. Smooth eases in and out. Play, pause and loop. Click a ◆ to jump to it; double-click it to remove it. |
| **Moves by itself** | One click adds Spin, Bounce, Float, Pulse or Wobble. These loop cleanly over the timeline. |
| **Export** | PNG at the chosen size, WebM video (each frame is drawn one by one), and GLB, OBJ or STL (for 3D printing). |
| **Save** | Save writes a `.json` project file and Open brings it back. The app also autosaves in the browser. |

## Keys

| Key | Does |
|---|---|
| W or G / E or R / S | Move / Turn / Size |
| N | Snap on or off |
| F | Zoom to the picked thing |
| Ctrl+D | Copy |
| Delete or X | Delete |
| Ctrl+Z / Ctrl+Shift+Z | Undo / Redo |
| Ctrl+G / Ctrl+Shift+G | Group / Ungroup |
| H | Hide or show |
| K | Add key |
| Space | Play or pause |
| ← → | Step one frame (hold Shift for 10) |
| 1 / 3 / 7 / 0 | Front / Side / Top / 3D view |
| Ctrl+S | Save project |
| Esc | Pick nothing |
| ? | Help |

## Using Krita drawings

1. In Krita, use **File → Export** and save as **PNG**. Keep the background transparent so only your drawing shows.
2. Here, click **Picture** to get a standing card. You can use it for a character, a tree or a sign.
3. Click **Backdrop** instead to get a big wall behind the scene, such as a painted sky or a room.
4. Move it, turn it and size it like any other thing. The **Glow** look makes a drawing shine. You can also give a picture **Moves by itself**, for example a floating paper cloud.
5. Export a Reel PNG or WebM. You can bring the PNG back into Krita, or into the Effect Blender to add grain and titles.

## Good to know

- **Browser:** you need a recent Chrome, Edge or Firefox with WebGL 2.
- **Internet:** the first load needs the internet to fetch three.js. After that, the browser usually keeps it.
- **Video:** it is WebM. Most editors accept it; convert to MP4 if an app asks for it. Keep the tab in front while it records, because recording runs in real time.
- **Moves by itself** shows in pictures and videos only. It is not part of GLB, OBJ or STL exports.
- **Colouring a Cute preset** colours every part of it. To colour one part, use **Ungroup**.
- **Imported `.gltf`:** only files with everything packed inside work. A single `.glb` is best.
- **Autosave** lives in this browser only. Use **Save** for anything you want to keep, especially scenes with big pictures, which may be too big to autosave.

## Files

| File | What it holds |
|---|---|
| `index.html` | The page layout, help and dialogs |
| `style.css` | The layout styles |
| `theme.css` | Shared light and dark colours |
| `theme-toggle.js` | The light / dark switch |
| `app.js` | The viewport, picking, panels, timeline, undo, save and export |
| `shapes.js` | The shapes, Cute presets, 3D text and pictures |
| `materials.js` | The Look presets |
| `env.js` | Sky, floor and lights |
| `anim.js` | Keys and the Moves by itself motions |
| `io.js` | Downloads, model export and import, and WebM recording |
| `icons.js` | The line icons |
