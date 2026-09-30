# ONE BAD DECISION

A minimalist psychological logic game where harmless choices build the rules that later test you.

## Run locally

No build step or dependencies are required. Open `index.html` directly, or serve the folder with any static server (for example `python -m http.server 8000`).

## Files

- `index.html` — screens and accessible controls
- `styles.css` — visual system and responsive layout
- `game.js` — calibration, constrained Decision scheduling, Rules On File / IN FORCE logic, solvable Rule Checks, keyboard/touch behavior
- `assets/gw-logo.png` — gl1tchworks mark

## Deploy

Compatible with GitHub Pages as-is. Put the files at the repository root, keep `assets/gw-logo.png` inside `assets/`, and publish from the `main` branch root.

## V1 scope

Runs are always 20 rounds. Rounds 1–2 are fixed calibration; Rounds 3–19 use constrained Decision placement and curated solvable Rule Checks; Round 20 is always the final Rule Check. V1 intentionally excludes full procedural generation, leaderboards, accounts, audio, achievements, Web3, social sharing, Daily Challenge, and additional modes.
