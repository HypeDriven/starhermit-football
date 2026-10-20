# StarHermit Football

Realtime 3D multiplayer football (soccer) for the StarHermit runtime, hosted on
the StarHermit platform. Up to **22 players (11v11)**, minimum **1 vs 1**
against an AI opponent; keyboard and mouse, gamepads and touch.

Night match under floodlights in a full stadium: procedurally animated
footballers with floating nicknames, a follow camera with an off-screen ball
arrow, a crowd that cheers, gasps and roars, walkout + coin-flip match
presentation, and AI teammates/opponents with personalities and random names
that fill any seat a human doesn't take.

The game is a script game of the StarHermit engine: TypeScript in `engine/`
on the runtime's host API, with `server.js` as the one match simulation. It
pins engine release 1.1.0 (`engine.version` in `starhermit.txt`): browsers play
it from `index.html`, the loader page that loads that release's web runtime from
wiki.starhermit.com, and the StarHermit Windows client plays the same files
natively. The game holds no engine code. Its old three.js browser client is on
the `deprecated` branch (and in history up to commit 80b94ff).

After any change, run `starhermit package --web .` with the 1.1.0 runtime (or
`cargo starhermit package --web` from the engine checkout) to rewrite
`index.html` and the file index `starhermit-files.json`, then commit them with
the change.

## Playing

- **Run it**: `starhermit /path/to/starhermit-football` runs the game in the
  signed StarHermit runtime. Signed out it is offline mode (Practice vs AI);
  signed in to StarHermit (the runtime's Options, F1) the online modes use the
  platform through the runtime. `starhermit … --check` validates the package
  and plays 120 frames headless.
- **Release archive**: from the engine checkout,
  `cargo starhermit package --script /path/to/starhermit-football` packs the
  signed runtime with this package.
- **On StarHermit**: add the repo as a game (Add game → paste repo URL). The
  platform runs `server.js` as the match script; multiplayer (lobbies, friend
  invites, quick-play matchmaking, AI backfill) runs over its **Realtime Rooms
  API**.

## Modes

- **Practice vs AI** — instant offline match, team size 1–11 per side.
- **Quick Play** — joins (or creates) an open room; a 30-second window fills
  with other players, then empty seats become AI with random names.
- **Create Lobby** — invite StarHermit friends, then Find Match: best-effort
  matchmaking fills the rest, AI backfills after 30 s. Or copy the shareable
  invite link — anyone who opens it can sign in, auto-friend you, and get a
  game invite back.
- **Ranked vs AI** — a server-authoritative match against AI, archived as a
  replay.
- **Leaderboard** — your Elo rating and the ranked list, with paging and a
  friends-only filter.
- **Replays** — your finished online matches; WATCH opens a 3D playback of the
  recorded match (play/pause, seek, ball-follow camera).
- **Achievements** — the five achievements, locked and unlocked.
- **In-match text chat** — press T during an online match; Enter sends, Esc
  closes.

## Controls

| Action | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| Move | WASD / arrows (tank steering) | left stick / D-pad | on-screen stick (full tilt = sprint) |
| Camera | click the pitch, then move the mouse | right stick | automatic ball-follow camera |
| Sprint | automatic after a brief acceleration | automatic | stick to the edge |
| Pass | L / right mouse, or tap shoot | South | PASS |
| Shoot | Space or J / left mouse (hold to charge) | West / right trigger (hold to charge) | SHOOT (hold to charge) |
| Tackle / GK dive | K / middle mouse | East | TACKLE |
| Match menu | Esc (the first press releases the mouse) | Start | ☰ |

Players rebind keys and pads in the runtime's Options menu (F1); the game's
CONTROLS screen lists every binding and opens the rebinding.

## Architecture

- **Client**: `engine/src` — TypeScript on the runtime's host API
  (`engine/starhermit.d.ts`): the stadium, footballers and name tags are
  generated in code on `starhermit:scene`, the crowd's sway, the haze and the
  footballers' poses run natively as `starhermit:world` kernels, the HUD is
  drawn with `starhermit:draw` and the screens are the runtime's UI;
  `audio.ts` plays the authored clips in `sfx/` (bound through
  `sfx/manifest.json`) and synthesizes the crowd bed, reverb and any missing
  clip. `server.js` loads into the game's realm for offline practice,
  prediction and the menu backdrop.
- **Netcode**: server-authoritative. The platform runs `server.js` at 30 Hz;
  the client sends 30 Hz inputs over the game socket, predicts its own
  footballer (render-only) and interpolates everyone else from server-timed
  snapshots. Realtime Rooms handle lobby, invites, matchmaking, AI backfill and
  roster only.
- **Assets**: `assets/` holds the loading key art and the two club crests;
  `coverart.png`, `cover.jpg` and `icon.png` are the platform's listing art.
  See `spec.md` for the full design.

## Files

- `starhermit.txt` — the manifest: `name`, `owner`, `server=server.js`,
  default `control.*` bindings, `cover`, and the runtime's `engine.*` keys.
- `server.js` — the match simulation and the platform's match script.
- `sh-language.js` — the shared StarHermit language resolver.
- `engine/` — the game: `src/` (TypeScript; `src/logic/` holds the pure,
  Node-tested parts), `starhermit.d.ts` (the runtime's host-API contract,
  copied), `tsconfig.json` (`tsc -p engine` type-checks it), `tests/`
  (`TSC="node …/typescript/bin/tsc" npm run test:engine` compiles and runs the
  Node tests) and `HOST-API-GAPS.md`.
- `assets/`, `sfx/`, `leaderboards.json` — the game's art, sounds and its
  leaderboard.
- `tests/` — `npm test` (the match script's rules regression).
- `spec.md` — the running game design document.
