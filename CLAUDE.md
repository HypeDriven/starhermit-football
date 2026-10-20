# CLAUDE.md

Guidance for Claude Code in this repository.

## What this is

**StarHermit Football** — realtime 3D football, 1v1 to 11v11, humans and AI. The game is a
StarHermit runtime script game in TypeScript (`engine/`); `server.js` is the authoritative match
simulation the platform runs at 30 Hz and the simulation the game loads for practice, prediction
and the menu backdrop. (The browser client was removed after commit 80b94ff.)

`spec.md` is the running game design document: present tense, the game as it ships; design intent
the code does not yet meet goes once under "Design intent not yet implemented". Section 16 is the
client on the runtime.

## Working rules

- **Every behaviour change updates `spec.md` in the same change**, and `README.md` and
  `starhermit.txt` (its `control.*` and `engine.*` keys) stay in step with it.
- **`server.js` is the single simulation.** `engine/src/sim.ts` only types
  `globalThis.FootballSim`; never fork sim logic into the client. Its sandbox rules hold: no
  imports, `Date` or `Math.random`; state round-trips as JSON.
- **No client authority**: the client sends inputs; the script owns score, clock, ratings,
  achievements and leaderboard scores.
- **The host API is the only platform.** The client uses only the `starhermit:*` modules in
  `engine/starhermit.d.ts` (no DOM or browser APIs). Host-API shortfalls go in
  `engine/HOST-API-GAPS.md`, not in runtime-specific workarounds. Refresh `engine/starhermit.d.ts`
  from the runtime when its contract changes (keep the header note).
- **Per-entity work belongs in kernels.** The crowd, haze and poses run as `starhermit:world`
  kernels with bindings; `world/rigMath.ts` is `logic/pose.ts`'s math as kernels, and the Node
  tests hold the two equal — change both together.
- **Strings**: player-facing text uses the English keys of `engine/src/logic/strings.ts` through
  `T` (`engine/src/i18n.ts`); a new key needs all nine locales, and a row the client no longer
  shows goes (the i18n test checks both).
- **Assets**: stadium and character art stay generated in code; the authored assets are the cover
  art, key art, two crests and the `sfx/` clips listed in spec.md section 15.

## Checks

- `npm test` — the match script's rules regression.
- `tsc -p engine` (TypeScript 5.9, strict, no emit) and `TSC="node …/typescript/bin/tsc" npm run
  test:engine` (`engine/tests/run.sh`) for the client; `engine/src/logic` must not import
  `starhermit:*`.
- `starhermit <repo> --check` validates the package for the runtime and plays 120 frames headless;
  `--render-check --quality <tier>` draws it offscreen; the engine's football probe
  (`STARHERMIT_FOOTBALL_DIR=<repo> cargo test --release -p starhermit-runtime --lib -- --exact
  script::football_probe::football_match --ignored --nocapture`) plays a whole practice match.
