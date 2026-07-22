# StarHermit Football — Design & Implementation Spec

A realtime, 3D, multiplayer football (soccer) game for the browser, built on
three.js and hosted on the StarHermit platform at
`<slug>.starhermit.com`. Up to 22 players (11 per side), minimum 1 vs 1
against an AI opponent. Desktop and mobile browsers.

- Repo layout: this repository is the **game** (a static, no-build site with a
  `starhermit.txt` manifest, following the starhermit-chess reference shape).
- Backend work lives in the sibling repository
  `../starhermit` (`Platform.Backend.sln`): a new, generalized **Realtime
  Rooms** API that any game on the platform can use (see §8).

---

## 1. Requirements (from the brief)

| # | Requirement | Where addressed |
|---|-------------|-----------------|
| 1 | Web-based, three.js, 3D animated characters, realistic movement animation | §5 |
| 2 | Multiplayer football, up to 22 players (11v11) | §6, §8 |
| 3 | Minimum 1 vs 1 AI opponent | §4.1, §7 |
| 4 | Art style: "football club professional" | §5.1 |
| 5 | Hosted on StarHermit, using platform features | §3, §8 |
| 6 | Lobby with up to 10 pre-invited friends (11 total per side); remaining spots filled by best-effort matchmaking | §4.2, §8.2 |
| 7 | After 30 s, unfilled spots become AI players with random names | §4.3, §8.4 |
| 8 | Nicknames float above players' heads | §5.4 |
| 9 | Camera follows your character; arrow indicates off-screen ball | §5.5 |
| 10 | SFX: ball contact, contextual crowd cheers/gasps, high variety | §9 |
| 11 | Match intro: players walk out, crowd cheers, coin flip for kickoff | §4.4 |
| 12 | Realtime gameplay | §6 |
| 13 | Missing platform features implemented backend-side, secure + generalized | §8 |
| 14 | Desktop + mobile browser, controls that feel good on both | §5.6 |

## 2. Platform reality check (from wiki.starhermit.com)

The platform offers two multiplayer substrates today:

- **Scripted games** (`server.js` in a Jint sandbox): server-authoritative but
  turn-based — `onTick` fires at best every 15 s, stateless ~250 ms
  invocations, 16 KB text frames. Reference game is correspondence chess.
  **Not viable for realtime football.**
- **Peer relay** (`ws/v1/relay`): binary fan-out, but disabled by default,
  `maxParticipants` defaults to 8, 4 KB frames, 10 msgs/s/user, max 5 sessions
  per title, no host/authority concept, no invites/matchmaking/backfill.
  **Insufficient for 22-player football.**

Nothing in the current API supports: lobbies, >2-player sessions, party
matchmaking, team assignment, AI backfill, or realtime tick rates. Therefore
this project adds a new **Realtime Rooms** subsystem to the StarHermit backend
(§8), designed generically so any fast-paced game can use it, and builds the
football client on top of it.

What we reuse as-is from the platform:

- Launch tokens (`POST /api/v1/games/{slug}/launch-token`, `#game_token=`
  fragment, game-scope fencing) for authentication.
- `GET /api/v1/me/friends` (allowed for launch tokens) for the invite picker.
- GitHub-games hosting: `starhermit.txt` manifest, static site served at
  `<slug>.starhermit.com`, `/api` + `/ws` proxied same-origin (client uses
  relative URLs only — no base URL, no CORS config).
- Publisher-defined leaderboard for results reporting (client-submitted,
  min/max validated) — no script-owned elo since we have no game script.

## 3. High-level architecture

```
┌────────────────────────────┐        ┌──────────────────────────────┐
│  Browser client (this repo)│        │  StarHermit backend          │
│  - three.js renderer       │  WS+   │  (../starhermit)             │
│  - local input → host      │  REST  │  - Realtime Rooms REST + WS  │
│  - host client = authority │◀──────▶│  - launch tokens / friends   │
│    simulation + AI         │        │  - leaderboard               │
└────────────────────────────┘        └──────────────────────────────┘
```

**Host-authoritative model.** The platform server is a smart transport, not a
simulator: the room creator's browser runs the authoritative simulation
(physics, AI, score) at 30 Hz and broadcasts snapshots; other clients send
only their *inputs* (move vector, sprint, action buttons) to the host. This is
the standard listen-server pattern and is the only model compatible with a
server that cannot run a realtime simulation. The server enforces routing,
roles, capacity, rate limits, and identity (§8.5) — clients cannot spoof each
other, and only the server-assigned host can broadcast snapshots.

Trade-offs (accepted): the host client could theoretically cheat its own
simulation; mitigations are out of scope for v1 (competitive integrity on this
platform is already trust-based for non-scripted games). Resilience — AI
takeover on leave, disconnect stand-ins, host migration, and host rejoin
state recovery — is covered in §4.5.

## 4. Game flow

### 4.1 Modes

- **Quick Play** — instant matchmaking: join (or create) an open room, 30 s
  fill window, AI backfill, play. Team size default 5v5, scales down to 1v1
  if chosen.
- **Lobby with friends** — create a lobby, invite up to 10 friends from your
  StarHermit friends list (they accept in-game or via the platform invite
  push). Then **Find Match**: the lobby's empty seats open to best-effort
  matchmaking. After 30 s, remaining seats become AI. Team size selectable
  1–11 per side; lobby party is pinned to the same team.
- **Practice (1 vs AI)** — offline-capable path: no room needed, local
  simulation, you + AI opponent(s). Uses the same code with a loopback "host".

### 4.2 Lobby & matchmaking sequence

1. Creator opens lobby → `POST /api/v1/realtime/rooms` (config: team size N,
   `openMatchmaking=false`). Server returns room + join code.
2. Creator invites friends (`POST .../rooms/{id}/invites`); invitees accept
   (`POST .../invites/{inviteId}/accept` → join). Friends list via
   `GET /api/v1/me/friends`.
3. Creator presses **Find Match** → `POST .../rooms/{id}/open`. Room becomes
   discoverable; solo queuers (`POST .../rooms/quick-join`) are placed into
   open rooms with free seats, best effort (first-come, prefer rooms closest
   to full so matches start sooner).
4. A 30-second countdown starts when the room opens. Room UI shows seats
   filling in realtime (WS presence events).

### 4.3 AI backfill

When the 30 s window expires (or the host force-starts early), the host calls
`POST .../rooms/{id}/start`. The server atomically fills every empty seat
with an **AI seat**: a participant record flagged `ai: true` with a
server-generated random nickname (name pool: plausible footballer handles,
e.g. "Rafa Vento", "Moss Kante", seeded by the server so all clients agree).
The room is locked (`status=playing`) and the frozen roster is the match
roster. AI seats are simulated on the host client with position-appropriate
personalities (§7). Practice mode skips the server entirely.

### 4.4 Match sequence

1. **Walkout** (~8 s): camera on tunnel, both teams walk out side by side,
   crowd cheer swells, players take formation positions.
2. **Coin flip**: center-circle close-up; referee flips a coin; winner chooses
   and kicks off (server/host RNG decides; animation shows the result).
3. **Play**: 2 halves × configurable length (default 3 min). Kickoff after
   each goal, teams swap sides at half time.
4. **Full time**: final whistle, crowd reaction by result, celebration
   animation for winners, stats screen (score, possession, shots), then
   back to lobby / report result to leaderboard.

### 4.5 Leaving, rejoining, and host migration

- **Rejoin**: the menu checks `GET /rooms/mine` on load and shows a
  **REJOIN MATCH** (Playing) or **RETURN TO LOBBY** button. Starting anything
  else (Quick Play / Create Lobby / Practice) while in a room prompts for
  confirmation first.
- **AI takeover on leave**: explicitly leaving a Playing room converts the
  leaver's seat into an AI seat (new server-generated nickname, roster push) —
  the match continues and the user is free to join something else.
- **Disconnect stand-in**: if a guest's socket drops, the host zeroes their
  input and an AI stand-in takes over their footballer after a 5 s grace
  period; reconnecting restores control. A Playing room whose host has no
  connection for > 60 s is closed by a server sweep.
- **Host migration**: if the host leaves with other humans present, the server
  transfers `IsHost` to the longest-joined human; that client takes over the
  simulation by rehydrating from the last snapshot it received.
- **Host rejoin recovery**: a rejoining host broadcasts `state-request`; any
  still-connected guest answers with its latest snapshot
  (`state-response`, guest→host routing), and the host rehydrates its sim
  (score, clock, positions). With no guests left to answer, the match
  restarts from kickoff.

## 5. Client: rendering & presentation

Static ES-module site, no build step (same pattern as starhermit-chess).
three.js vendored under `vendor/three/`. All art is generated in code
(geometry + procedural textures + WebAudio synthesis) — zero binary assets,
so the repo stays clone-and-serve.

### 5.1 Art direction — "football club professional"

- Night match under floodlights: dark sky, 4 floodlight towers with volumetric-style
  light cones (transparent additive geometry) and real shadow-casting spotlights.
- Pitch: striped mow pattern (alternating light/dark green bands via canvas
  texture), crisp white line markings (canvas texture), grass-grain noise.
- Stadium: two-tier seated bowl (instanced crowd: ~8–12k `InstancedMesh`
  spectators with per-instance color, animated sway/bounce on excitement),
  LED advertising boards with scrolling club-style sponsor strips, tunnel,
  dugouts, corner flags, goal nets (transparent grid texture).
- Kits: home/away strip per team (distinct shirt/shorts/sock colors, auto-
  derived from team identity), shirt numbers on backs, skin-tone variety.

### 5.2 Character model

Characters are procedural, jointed figures built from primitives — stylized-
realistic proportions (~1.8 m), composed of: pelvis, torso, head (+hair),
upper/lower arms with elbow joints, upper/lower legs with knee joints, boots.
Each limb is a `Group` pivot so the whole figure is a small skeleton driven
entirely in code (no external rigs). Kits drawn via canvas textures
(shirt color, shorts, socks, number).

### 5.3 Animation (procedural, phase-driven)

A reusable `Animator` drives every character from its locomotion state:

- **Idle**: subtle weight shift, breathing, head look-at-ball.
- **Walk / jog / sprint**: phase-locked leg swings with knee flexion, counter-
  swinging arms, torso lean & bob scaled to speed; foot-plant cadence matches
  ground speed (no sliding).
- **Kick**: wind-up → strike → follow-through, blended over locomotion when
  kicking while running.
- **Header, slide tackle, goalkeeper dive** (lateral leap with arm extension).
- **Celebrations** (knee slide, arm pump), **dejection**, **walkout wave**.
- Blending: simple cross-fade between pose layers; lower/upper body split so a
  player can run and point/shout simultaneously.

### 5.4 Name tags

Nicknames float above heads as camera-facing `Sprite`s with canvas-rendered
text (team-colored plate, white text). Your own player shows "You". AI names
come from the server-assigned roster. Tags fade beyond ~40 m.

### 5.5 Camera & ball indicator

- Third-person follow camera: positioned behind/above your player, damped
  spring follow, gentle look-ahead toward the ball, FOV widens slightly at
  sprint. Camera collision-free (stadium is open above pitch).
- **Off-screen ball arrow**: when the ball projects outside the viewport, an
  edge-clamped arrow (HUD div) points toward it, colored by possession team;
  distance readout in meters.

### 5.6 Controls

Desktop:
- **WASD / arrows** move (camera-relative), **Shift** sprint, **Space**
  pass / **J** shoot (hold to charge, release to strike; power bar),
  **K** slide tackle / pressure, **E** switch... (call for ball as AI teammate
  passes to you automatically — no switching: you always control your own
  footballer).

Mobile:
- Left virtual **joystick** (dynamic origin, analog move + sprint at full
  deflection), right-side **Pass** and **Shoot** buttons (shoot is
  press-and-hold charge), **Tackle** button. Haptic `navigator.vibrate` ticks
  on kick contact where supported.
- Touch UI auto-activates on `pointer: coarse`; big tap targets, HUD scales
  with `rem`/`dvh`, game renders at capped devicePixelRatio for perf.

### 5.7 Performance budget

60 fps on a mid laptop, 30+ fps on a mid phone: ≤ ~120 draw calls (instancing
for crowd/seats/floodlight cones), one shadow-casting light, capped pixel
ratio, crowd LOD, no post-processing on mobile.

## 6. Netcode (client side)

- Transport: `ws/v1/realtime?roomId=…` (new, §8). Binary frames
  (`ArrayBuffer`) for gameplay; small JSON control frames for lobby chat
  presence/ready flags.
- **Guests → host**: input packets at 20 Hz: `{seq, moveX, moveZ, sprint,
  buttons}` bit-packed (~12 B). Guests run client-side prediction for their
  own footballer and reconcile on snapshots (position blend, error < 0.3 m
  is rubber-banded smoothly).
- **Host → room**: snapshot at 15 Hz: full ball state + per-player
  `{pos, vel, animState, facing}` quantized (22 × ~14 B + ball ≈ 320 B — well
  under frame limits). Events (kick contact, goal, whistle, card) sent as
  reliable JSON control frames.
- **Guests** interpolate remote entities 100 ms behind the newest snapshot
  (snapshot interpolation buffer), extrapolate ball on kicks.
- Clock: host stamps snapshots; guests estimate offset from arrival jitter.
- Match results: host POSTs final score to the room (`.../rooms/{id}/result`)
  which the server validates against the roster and records; clients then
  show stats. Leaderboard submit (goals/wins) is per-player, min/max clamped
  server-side — acknowledged weak integrity (documented platform-wide for
  non-scripted games).

## 7. AI

AI runs on the host for every AI seat (and for *all* seats in Practice mode).
Each AI footballer has a **personality**: `{ aggression, positioning,
dribbling, passing, workRate }` sampled at roster creation plus a random
nickname from the server.

Behavior model (utility scoring, re-evaluated ~5 Hz, steering executed per
tick):

- **Roles by formation slot** (4-4-2 / scaled variants for smaller teams):
  GK, DF, MF, FW. Formation anchor points shift with ball position
  (attack/defense bias by personality `positioning`).
- **On ball**: dribble toward goal, pass when pressed (choose teammate by
  forward-ness + openness), shoot in range (power/accuracy from personality).
- **Off ball**: nearest pressers chase ball (count from `aggression`), others
  hold shape, make runs, mark space.
- **GK**: hold line, come for through balls, dive at shots (reach check),
  distribute after save.
- 1v1 practice: single AI opponent with scaled-down pitch and goal.

## 8. Backend: Realtime Rooms API (work in `../starhermit`)

New generalized subsystem for realtime multiplayer games. Deliberately not
football-specific: rooms, seats, invites, quick-join matchmaking, AI-seat
backfill, host-authoritative frame routing.

### 8.1 Data model (Platform.Domain / Persistence)

- `RealtimeRoom` — `Id, GameSlug, HostUserId, Status (Lobby|Open|Playing|
  Closed), ConfigJson { teamCount, seatsPerTeam, backfillAfterSeconds,
  metadata }, CreatedAt, OpenedAt, StartedAt, ClosedAt`.
- `RealtimeParticipant` — `Id, RoomId, UserId (null for AI), Username, IsAi,
  IsHost, Team, Slot, JoinedAt, LeftAt`.
- `RealtimeInvite` — `Id, RoomId, FromUserId, ToUserId, Status, CreatedAt`.
- EF Core migration + `StarhermitDbContext.Realtime.cs` partial, mirroring the
  existing Relay persistence style.

### 8.2 REST (`/api/v1/realtime`, JWT or game-scoped launch token)

| Method | Path | Purpose |
|---|---|---|
| POST | `/rooms` | Create lobby; caller becomes host. Body: `{ teamCount, seatsPerTeam, backfillAfterSeconds=30, metadata }`. Caps: teamCount ≤ 2 (v1), seatsPerTeam ≤ 11, total seats ≤ 32. |
| GET | `/rooms/{id}` | Room + roster (participants or invitees only). |
| POST | `/rooms/{id}/invites` | Invite friend (`{ toUserId }`); friends-only check, 409 dup. |
| GET | `/rooms/invites` | Caller's pending room invites (cross-game). |
| POST | `/rooms/invites/{inviteId}/accept` | Join that room (seat assigned). |
| POST | `/rooms/invites/{inviteId}/decline` | 204. |
| POST | `/rooms/{id}/open` | Host: open to matchmaking; starts backfill timer. |
| POST | `/rooms/quick-join` | Body `{ gameSlug (implied by token), seats: 1 }` → placed in oldest open room with free seats for this game, else 404 (client then creates its own open room). |
| POST | `/rooms/{id}/start` | Host: AI-backfill empty seats, status→Playing, returns frozen roster. Idempotent; auto-invoked by a worker at backfill deadline. |
| POST | `/rooms/{id}/leave` | Leave. In Lobby/Open the seat is removed (host leaving transfers host to the longest-serving human; none left → Closed). In Playing the seat converts to an AI participant (fresh server nickname, roster pushed) so the match continues; host leaving transfers `IsHost` to the longest-serving remaining human, or closes the room if none remain. |
| POST | `/rooms/{id}/result` | Host: submit result JSON (validated vs roster, score sanity-clamped); stored on room, fan-out over WS. |
| GET | `/rooms/mine` | Caller's active room, if any (reconnect). |

Seat assignment: humans take seats in join order, host may re-balance teams
pre-start via `POST /rooms/{id}/seats` (host only, Lobby/Open status).
Party pinning: invite-joins are seated on the host's team while space lasts.

### 8.3 WebSocket (`/ws/v1/realtime?roomId=…`)

- Auth: JWT header or `?access_token=`; participants only; launch-token
  `game_scope` must equal the room's `GameSlug` (reuse `GameScopeMiddleware`
  pattern). Newest connection supersedes old (same semantics as
  `ws/v1/games`).
- **Binary frames** (≤ 8 KB) are routed by role, enforced server-side:
  host → fanned out to every other participant; guest → delivered to host
  only. Frame is prefixed by the server with sender participant id, so
  impersonation is impossible.
- **JSON text control frames** (≤ 4 KB): `{ "type": "event"|"chat"|"ready",
  ... }` — host may broadcast events; guests may only send `ready`/lobby
  chat (rate-limited like chat, 10/min).
- **Presence**: server pushes `{ "type": "presence", userId, online }` and
  `{ "type": "roster", participants: [...] }` on joins/leaves/start.
- **Rate limits**: host binary 30 msgs/s, guest binary 30 msgs/s (burst 2× for
  1 s), enforced per connection with a token bucket; violation →
  `PolicyViolation` close (same enforcement style as `RelayWebSocketHandler`).

### 8.4 Backfill & stale-room workers

`Platform.Workers` jobs (modeled on `CleanupStaleRelaySessionsJob`): one sweeps
`Open` rooms whose `OpenedAt + backfillAfterSeconds` has passed and performs
the same atomic start/backfill as `POST .../start` (AI nicknames drawn from a
server-side pool, unique per room). Another closes stale rooms: `Playing`
rooms whose host has had no live socket for > 60 s, and `Lobby`/`Open` rooms
idle for > 60 min with no connected participants.

### 8.5 Security & generalization notes

- Every endpoint works with a full JWT **or** a game-scoped launch token
  (scope fencing via existing middleware; rooms are per-`GameSlug`, so two
  games can never see each other's rooms).
- Authorization: participant-only reads; host-only mutations (open, seats,
  start, result); friends-only invites (reuse friendship check used by game
  invites).
- Validation: seat/team bounds, one active room per user (409 otherwise),
  idempotent start, result-score clamp (0–50 per side), invite expiry with
  room close.
- Transport security: server-tagged sender ids, role-based routing, frame
  size caps, per-connection rate limits, no server-side parsing of binary
  payloads (host authority is the game's contract, documented).
- Generic: nothing references football; `metadata` is an opaque per-game JSON
  blob; teamCount is a parameter (1 = free-for-all games).

### 8.6 Backend tests

xUnit suite in `tests/` mirroring existing patterns: room lifecycle
(create→invite→accept→open→quick-join→backfill→result), auth fencing (403s),
seat caps, host transfer, WS routing/rate-limit behavior via handler-level
tests.

## 9. Audio (client, WebAudio — all synthesized, no assets)

- **Ball contact**: layered thump (filtered noise burst + sine thud), pitch/
  gain randomized per kick power; footstep scuffs at sprint.
- **Crowd**: pink-noise bed through band-pass filters (looping, gain follows
  excitement level). Reactions are granular: ~200 instanced "crowd voices"
  panned across the stadium; cheers = rising filtered-noise swell + whistling
  partials; gasps = sharp inhale-like band sweep; oohs on near misses; goal =
  full swell + air-horn-ish partials for home/away bias. Randomized timing,
  filter, and pan per event → non-repetitive.
- **Whistle** (referee): two detuned square oscillators with vibrato.
- **Kickoff ambience**: tunnel murmur → swell as teams walk out.
- Mute + volume in settings; `AudioContext` resumed on first user gesture.

## 10. Client code layout

```
starhermit.txt          # manifest (slug=football, launch=index.html)
index.html              # shell: canvas, HUD, lobby screens, touch UI
css/style.css
js/main.js              # boot, screens state machine (menu→lobby→match)
js/api.js               # REST client (launch token, friends, rooms, leaderboard)
js/net.js               # realtime WS client, snapshot buffer, prediction
js/lobby.js             # lobby UI: invites, seats, countdown, quick play
js/match.js             # match controller: walkout→coin flip→halves→fulltime
js/world/stadium.js     # pitch, stands, floodlights, boards, crowd instancing
js/world/player.js      # character factory (kits, numbers)
js/world/animator.js    # procedural animation state machine
js/world/nametags.js    # floating nickname sprites
js/game/sim.js          # shared simulation core (physics, ball, rules) — runs on host & offline
js/game/ai.js           # personalities, roles, utility AI
js/game/input.js        # keyboard + touch joystick/buttons
js/game/camera.js       # follow cam + off-screen ball arrow
js/game/audio.js        # WebAudio SFX + crowd engine
vendor/three/           # three.module.js (+ addons actually used)
```

`sim.js` is dependency-free (no three imports) so the host simulation and
guest prediction share exactly one code path; rendering consumes sim state.

## 11. Phased implementation plan

1. **Spec + scaffolding** — this file; repo skeleton; vendored three.js;
   manifest; local dev server script.
2. **Backend Realtime Rooms** — domain, persistence + migration, REST,
   WS handler, backfill worker, tests; run backend test suite. (Also update
   the wiki docs repo `../starhermit-developer-wiki` with a `realtime.md`
   page — the platform's convention is that features ship documented.)
3. **World rendering** — stadium, pitch, lighting, crowd; static scene perf
   check.
4. **Characters & animation** — factory, kits, animator, name tags.
5. **Core gameplay (offline)** — sim (ball physics, movement, kicking,
   goals), desktop + touch controls, camera + arrow, 1v1 practice vs AI
   playable end-to-end.
6. **AI** — personalities, formations, full 11v11 behaviors.
7. **Audio** — SFX + crowd engine wired to match events.
8. **Match presentation** — walkout, coin flip, kickoffs, half time, full
   time, stats.
9. **Networking** — net client, host/guest sync, prediction/interpolation,
   lobby screens wired to Realtime Rooms API, invites, quick-join, backfill.
10. **Polish & verification** — mobile QA pass, perf caps, README, final
    manual test matrix (desktop Chrome/Firefox, mobile Safari/Chrome).

## 12. Out of scope (v1)

- Fouls/cards/offside (kick-and-rush rules: out-of-bounds → throw-in style
  restart only, goals + kickoffs; keeps the sim and AI tractable).
- Script-owned elo/leaderboards (requires the turn-based script subsystem);
  we use a publisher leaderboard with client-submitted results.
- Replays, voice, in-game chat beyond lobby ready/chat (platform per-session
  chat requires scripted sessions).

(Host migration and rejoin are IN scope — see §4.5.)
