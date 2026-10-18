# Maybe Real City

A tiny low-poly 3D internet town where every visitor gets a house with their name on it.
Demo version — no backend, everything is stored in the browser's localStorage.

## Run it

No build step. Serve the folder statically (any static host works) and open `index.html`:

```sh
npx serve .
# or
python3 -m http.server 8000
```

Note: ES modules + the import map require `http(s)` — opening `index.html` via `file://` will not work.

## Files

- `index.html` — page shell, HUD, dialogs, import map (Three.js 0.160.0 from unpkg)
- `styles.css` — all styles (cream cards, navy ink, Nunito)
- `js/main.js` — boot, loader, render loop, click-vs-drag picking
- `js/build.mjs` — Three.js town construction (instanced houses/towers/trees, landmarks, cars, fountain, confetti)
- `js/layout.mjs` — pure deterministic city generator (seeded RNG, no DOM/three — unit-testable)
- `js/camera.mjs` — custom orbit controls + fly-to (no addons)
- `js/ui.mjs` — HUD, Town Hall hub, house panel, quests, hash routing
- `js/routes.mjs` — hash route parsing + handle validation (pure)
- `js/store.mjs` — localStorage persistence with in-memory fallback
- `js/rng.mjs` — mulberry32 seeded RNG
- `js/labels.mjs` — canvas-sprite name labels
- `test/run.mjs` — Node test suite (`node test/run.mjs`)

## Routes

`#/` town · `#/townhall` · `#/find/<handle>` · `#/about` · `#/privacy`

Made by MeowSamOP DZN
