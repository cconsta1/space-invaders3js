# Breakout 3D — Neon Prototype

A modern, synthwave-inspired Breakout remake built with Three.js and Vite. Pilot a glowing paddle, shatter neon bricks, and chase multipliers in a 3D arena with bloom-heavy visuals.

## Features

- **Neon Visuals:** Unreal Bloom post-processing for a glowing cyberpunk look.
- **Particle Effects:** Explosive particle systems when bricks are destroyed.
- **Dynamic Camera:** Subtle camera sway and follow mechanics.
- **Modern UI:** Minimalist interface with holographic styling.

## Quick start

1. Install dependencies:

```bash
cd /Users/cconstantinou/Downloads/breakout3js
npm install
```

2. Run the Vite dev server:

```bash
npm run dev
```

Open the URL printed by Vite (usually http://localhost:5173) and click **Start** to launch the first ball.

## Controls

- **Arrow Left / Arrow Right** — Move the paddle horizontally.
- **Start / Continue button** — Launch the active ball after losing a life or clearing a level.

> Tip: catch the ball slightly off-center to add spin and curve the rebound.

## Tech Stack

- **Three.js** for rendering, simple AABB collision checks, and math helpers.
- **EffectComposer + UnrealBloomPass** for neon glow and post FX.
- **Vite** for development server, hot reload, and bundling.

## Audio roadmap

This build intentionally ships without audio so you can tailor the mood. Suggested layers:

- **UI** — soft clicks for menu focus, airy swoosh on Start/Continue.
- **Paddle hits** — short percussive blip that pitches up with impact speed.
- **Brick breaks** — glassy tick with extra sparkle when a row clears.
- **Power-ups** — sci-fi shimmer when spawning plus distinct stingers when collected (wide paddle, extra life, multi-ball).
- **Life lost** — low-frequency whoosh with a quick decay to keep pacing tight.
- **Music** — looping synthwave track around 110–120 BPM; optionally side-chain/duck when few bricks remain or during multi-ball.

Hook into the game loop via the event bus exposed in `src/main.js` / `src/game.js` (`Game.on('score'| 'lives' | 'gameover' | 'pause')`) or directly inside `handleCollisions` for instant feedback. A lightweight approach is to preload samples with `AudioContext` during `Game.init` and reuse them to avoid latency.

