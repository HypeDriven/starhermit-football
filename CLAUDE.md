# CLAUDE.md

Guidance for Claude Code in this repository.

## What this is

**StarHermit Football** — realtime 3D football, 1v1 to 11v11, humans and AI. Two clients play the
same game: the browser client (`index.html`, `js/`, `css/`, `vendor/three/`, the platform's web
deployment) and the native client in `engine/` (a StarHermit runtime script game in TypeScript).
`server.js` is the authoritative match simulation the platform runs at 30 Hz and the simulation both
clients load for practice, prediction and the menu backdrop.

`spec.md` is the running game design document: present tense, the game as it ships; design intent
the code does not yet meet goes once under "Design intent not yet implemented". Section 16 is the
native client.

## Working rules

- **Every behaviour change updates `spec.md` in the same change**, and `README.md` and
  `starhermit.txt` (its `control.*` and `engine.*` keys) stay in step with it.
- **`server.js` is the single simulation.** `js/game/sim.js`, `js/game/ai.js` and
  `engine/src/sim.ts` only re-export or type `globalThis.FootballSim`; never fork sim logic into a
  client. Its sandbox rules hold: no imports, `Date` or `Math.random`; state round-trips as JSON.
- **No client authority**: clients send inputs; the script owns score, clock, ratings,
  achievements and leaderboard scores.
- **Two clients, one game.** A behaviour change lands in `js/` and `engine/src`, or spec.md
  section 16 says where they differ. The native client uses only the host API in
  `engine/starhermit.d.ts` (no DOM, three.js or browser APIs) and reuses the game's own data where
  it is not browser code (`js/i18n/strings.js` and `sh-language.js` via `loadClassic`, `js/gfx.js`
  as a module). Host-API shortfalls go in `engine/HOST-API-GAPS.md`, not in runtime-specific
  workarounds. Refresh `engine/starhermit.d.ts` from the runtime when its contract changes (keep
  the header note).
- **Strings**: player-facing text uses the English keys of `js/i18n/strings.js` (`T` / `N` in the
  browser, `T` in `engine/src/i18n.ts`); a new key needs all nine locales.
- **Assets**: stadium and character art stay generated in code; the authored assets are the cover
  art, key art, two crests and the `sfx/` clips listed in spec.md section 15.
- Bump the shared `?v=N` on browser imports when changing modules.

## Checks

- `npm test` — rules regression, graphics model, platform client and i18n tests.
- `tsc -p engine` (TypeScript 5.9, strict, no emit) and `TSC="node …/typescript/bin/tsc"
  engine/tests/run.sh` for the native client; `engine/src/logic` must not import `starhermit:*`.
- `starhermit <repo> --check` validates the package for the runtime.
