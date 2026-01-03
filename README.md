# Neon 3D Space Invaders

A compact, Three.js-powered arcade remake — originally a neon Breakout demo, converted into a Space Invaders–style shooter. No external game engines are used; the project runs with Vite for fast development.

Quick start

Install and run:

```bash
npm install
npm run dev
```

Open the Vite URL (usually http://localhost:5173) and press **Start**.

Build & deploy

- Production build: `npm run build` produces a static `dist` folder. The audio loader uses `import.meta.url` (see [src/audio.js](src/audio.js)) so bundled sounds are included in the build. Preview with `npm run preview`.

Controls

- `ArrowLeft` / `ArrowRight` — steer the player ship
- `Space` — fire (or Start/Continue when in menus)
- Pointer / touch — move horizontally on mobile

What changed (high level)

- Gameplay: the project was refactored from Breakout into a Space Invaders–style game: paddle → player ship, bricks → invader formations, ball → bullets. Core mechanics (AABB collision, groups, score, lives) are implemented in `src/game.js`.
- Visuals: bloom/glow was removed for a cleaner, matte look; a pop‑art palette and simplified lighting were applied for better day/night readability.
- Flow: explicit game states were added (`idle`, `playing`, `paused`, `levelCleared`, `gameOver`) so progression and pause-on-death are clearer.

Visual & theme notes

- Matte materials and reduced metalness/roughness give primitives a printed, retro look.
- Two themes: Night (neon) and Day (warm paper background) — toggle in the UI.
- Postprocessing: bloom has been removed; a light film pass (subtle grain) may remain.

Audio & attribution

- UI and SFX use Kenney's sci‑fi and UI packs bundled under `src/assets/`. These files are CC0 — attribution is appreciated but not required. The audio loader is [src/audio.js](src/audio.js).
- If you want an explicit attribution file, I can add `assets/audio/ATTRIBUTION.md` with direct links and file-by-file credits.

Development notes

- Key source files:
	- `src/game.js` — main game logic, entities, and rendering
	- `src/main.js` — UI wiring and event handlers
	- `src/styles.css` — UI styling and theme rules
	- `src/audio.js` — audio loader/manifest

- Run the dev server and open the app at the shown Vite URL to play and iterate quickly.

Credits

- Sound assets: Kenney (Sci‑Fi Sounds, UI packs). See `src/assets/` for the bundled audio and license files.

If you'd like, I can also:
- Add a short screenshot or animated GIF to the README.
- Add the requested `assets/audio/ATTRIBUTION.md` with direct links and file-by-file credits.



