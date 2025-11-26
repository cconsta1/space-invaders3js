# Neon 3D Breakout

Simple, neon-styled Breakout built with Three.js and Vite. Move the paddle, bounce the ball, break bricks — easy to run and hack on.

Quick start

Install and run:

```bash
npm install
npm run dev
```

Open the Vite URL (usually http://localhost:5173) and press **Start**.

Controls

- Arrow Left / Arrow Right — move the paddle
- Start / Continue — launch the ball

Credits & Audio

All sound effects bundled in `src/assets/` are from Kenney ("Sci‑Fi Sounds" and UI packs) and released under Creative Commons Zero (CC0). You can find the original pack at https://kenney.nl/assets/sci-fi-sounds — credit appreciated but not required.

What changed between levels

- Levels now clear transient objects (falling powerups and particles) when the last brick is destroyed so nothing from the previous level keeps falling.
- Each level applies a small surprise: paddle tint/size or a slight speed bump. These are visual/behavioral changes made with Three.js primitives only.

How audio is used

- UI clicks, paddle hits, brick breaks, powerup spawns/collects and life-lost cues are played from the bundled Kenney files. The loader is in `src/audio.js` and triggers are wired in `src/game.js` and `src/main.js`.

If you want a cleaner attribution file added to the repo (`assets/audio/ATTRIBUTION.md`) or different Kenney files used for specific cues, tell me which sounds you prefer and I’ll swap them.
## Tech Stack


