# ONE BAD DECISION

A minimalist psychological logic game where the player's choices permanently change the rules governing later decisions.

## Run locally

No build step or dependencies are required.

Open `index.html` directly in a browser, or serve the folder with any simple static server.

For example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Files

- `index.html` — game structure and screens
- `styles.css` — visual system and responsive layout
- `game.js` — game state, rule engine, 20-round progression, keyboard/touch behavior

## Deploy

This project is compatible with GitHub Pages as-is. Upload the files to the root of a repository and enable Pages from the repository's deployment settings.

## V1 scope

V1 intentionally excludes procedural generation, leaderboards, accounts, audio, achievements, Web3, social sharing, Daily Challenge, and additional modes. The goal is to test whether the core "you built the system that killed you" loop is fun before expanding it.
