# StarHermit Football

Realtime 3D multiplayer football (soccer) for the browser, built on three.js
and hosted on the StarHermit platform. Up to **22 players (11v11)**, minimum
**1 vs 1** against an AI opponent. Desktop and mobile browsers.

Night match under floodlights in a full stadium: procedurally animated
footballers with floating nicknames, a follow camera with an off-screen ball
arrow, synthesized crowd that cheers, gasps and roars, walkout + coin-flip
match presentation, and AI teammates/opponents with personalities and random
names that fill any seat a human doesn't take.

## Playing

The game is served as a static site — there is no build step.

- **On StarHermit**: add the repo as a game (Add game → paste repo URL), then
  Deploy to StarHermit. The platform serves it at `<slug>.starhermit.com`,
  mints a launch token, and opens `index.html#game_token=<jwt>`. Multiplayer
  (lobbies, friend invites, quick-play matchmaking, AI backfill) runs over the
  platform's **Realtime Rooms API** (`/api/v1/realtime`, `/ws/v1/realtime` —
  see the platform wiki's realtime page).
- **Locally**: any static server, e.g. `python3 -m http.server`, then open
  `http://localhost:8000`. Without a launch token the game runs in offline
  mode — **Practice vs AI** is fully playable; multiplayer requires the
  platform.

## Modes

- **Practice vs AI** — instant offline match, team size 1–11 per side.
- **Quick Play** — joins (or creates) an open room; a 30-second window fills
  with other players, then empty seats become AI with random names.
- **Create Lobby** — invite up to 10 StarHermit friends, then Find Match:
  best-effort matchmaking fills the rest, AI backfills after 30 s.

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrows | left joystick (full tilt = sprint) |
| Camera | Click pitch, then move mouse | automatic ball-follow camera |
| Sprint | Shift (hold, or enable Toggle sprint) | joystick to the edge |
| Pass | Space / right mouse | PASS button |
| Shoot | J / left mouse (hold to charge) | SHOOT (hold to charge) |
| Tackle / GK dive | K / middle mouse | TACKLE button |

Desktop movement is smoothed and keeps its initial camera-relative heading for
as long as the movement keys remain held. Press Escape once to release the
mouse and again to open the leave-match prompt.

## Architecture

- **Client** (this repo): no-build ES modules, three.js vendored in
  `vendor/three/`. `js/game/sim.js` is a dependency-free simulation core
  shared by the authoritative host, guest prediction, and offline practice;
  `js/game/ai.js` drives AI seats; `js/world/*` renders stadium, characters
  and name tags (all art generated in code — zero binary assets);
  `js/game/audio.js` synthesizes every sound with WebAudio.
- **Netcode**: host-authoritative. The room creator's browser simulates at
  60 Hz and broadcasts 15 Hz snapshots over `ws/v1/realtime`; guests send
  20 Hz inputs, predict their own footballer, and interpolate everyone else.
  The server enforces roles, routing, identity and rate limits.
- **Backend**: the Realtime Rooms subsystem (rooms, seats, friend invites,
  quick-join matchmaking, AI backfill, results) lives in the StarHermit
  platform repository and is generic — any realtime game can use it. See
  `spec.md` §8 for the design.

## Files

- `starhermit.txt` — platform manifest (`slug=football`, no `server=` script:
  authority lives on the room host, not in the turn-based script sandbox).
- `spec.md` — full design & implementation spec.
- `js/`, `css/`, `vendor/three/` — the game.
