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
  best-effort matchmaking fills the rest, AI backfills after 30 s. Or copy a
  shareable invite link — anyone who opens it can sign in, auto-friend you,
  and get a game invite back.
- **Leaderboard** — your Elo rating and the platform-wide ranked list, with
  paging and a friends-only filter.
- **Replays** — menu → REPLAYS lists your finished online matches; WATCH opens
  a 3D playback of the recorded match (play/pause, seek, ball-follow camera).
- **In-match text chat** — press T during an online match; Enter sends, Esc closes.

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrows | left joystick (full tilt = sprint) |
| Camera | Click pitch, then move mouse | automatic ball-follow camera |
| Sprint | automatic after a brief acceleration | joystick to the edge |
| Pass | Space / right mouse | PASS button |
| Shoot | J / left mouse (hold to charge) | SHOOT (hold to charge) |
| Tackle / GK dive | K / middle mouse | TACKLE button |

Desktop movement is smoothed and keeps its initial camera-relative heading for
as long as the movement keys remain held. Press Escape once to release the
mouse and again to open the leave-match prompt.

## Architecture

- **Client** (this repo): no-build ES modules, three.js vendored in
  `vendor/three/`. `server.js` is the dependency-free simulation core, loaded
  as a classic script and re-exported by `js/game/sim.js` / `js/game/ai.js`
  for offline practice, prediction and the menu backdrop; `js/world/*` renders
  stadium, characters and name tags in code; `js/game/audio.js` plays the
  authored clips in `sfx/` (bound through `sfx/manifest.json`) and synthesizes
  the crowd bed, reverb and any missing clip with WebAudio.
- **Netcode**: server-authoritative. The platform runs `server.js` at 30 Hz;
  clients send 30 Hz inputs over `ws/v1/games`, predict their own footballer
  (render-only) and interpolate everyone else from server-timed snapshots.
  Realtime Rooms (`/api/v1/realtime`, `ws/v1/realtime`) handle lobby, invites,
  matchmaking, AI backfill and roster only.
- **Assets**: `assets/` holds the loading key art and the two club crests;
  `coverart.png` is the platform cover. See `spec.md` for the full design.

## Files

- `starhermit.txt` — platform manifest (`launch`, `owner`, `server=server.js`,
  default `control.*` bindings, `cover`).
- `spec.md` — the running game design document.
- `js/`, `css/`, `assets/`, `sfx/`, `vendor/three/` — the game.
- `tests/` — `npm test` (rules regression) and `npm run test:e2e` (browser playthrough).
