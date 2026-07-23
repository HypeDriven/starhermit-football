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

The platform offers three multiplayer substrates:

- **Scripted games** (`server.js` in a Jint sandbox): server-authoritative.
  Fresh stateless invocations (~250 ms CPU budget), 16 KB text frames, all
  state round-tripped through JSON documents. The platform's tick service now
  supports **per-game tick rates** (`GameDefinition.TickRateHz`, 30 Hz default,
  clamped to 1000 Hz), and realtime rooms can be **bound to an N-player
  scripted session** whose ctx carries the room roster (AI seats included) and
  live presence — enough to run a realtime football sim server-side.
  Reference game is correspondence chess (low tick rate, turn-based flow).
- **Peer relay** (`ws/v1/relay`): binary fan-out, but disabled by default,
  `maxParticipants` defaults to 8, 4 KB frames, 10 msgs/s/user, max 5 sessions
  per title, no host/authority concept, no invites/matchmaking/backfill.
  **Insufficient for 22-player football.**
- **Realtime Rooms** (`/api/v1/realtime`, `ws/v1/realtime`): generalized
  lobbies — rooms, seats, invites, quick-join matchmaking, AI-seat backfill —
  added by this project (§8). With the room⇄script bridge they now also create
  the room-bound scripted session that runs the match.

The earlier verdict that scripted games are "not viable for realtime" is
outdated: tick-rate support plus room-bound sessions make the Jint sandbox a
viable authoritative match server at 30 Hz. This project therefore runs the
football simulation as a **scripted game** (`server.js`, §3) and uses Realtime
Rooms for what they are good at: lobby, invites, matchmaking, backfill,
roster, and reconnect.

What we reuse as-is from the platform:

- Launch tokens (`POST /api/v1/games/{slug}/launch-token`, `#game_token=`
  fragment, game-scope fencing) for authentication.
- `GET /api/v1/me/friends` (allowed for launch tokens) for the invite picker.
- GitHub-games hosting: `starhermit.txt` manifest, static site served at
  `<slug>.starhermit.com`, `/api` + `/ws` proxied same-origin (client uses
  relative URLs only — no base URL, no CORS config).
- Scripted-games substrate: tick service (30 Hz for this game), gameplay
  transport `ws/v1/games`, script-owned per-player state/elo via `eloUpdates`.

## 3. High-level architecture

```
┌────────────────────────────┐        ┌──────────────────────────────┐
│  Browser client (this repo)│        │  StarHermit backend          │
│  - three.js renderer       │  WS+   │  (../starhermit)             │
│  - inputs up, snapshots    │  REST  │  - Jint sandbox: server.js   │
│    down (ws/v1/games)      │◀──────▶│    authoritative sim @30 Hz  │
│  - lobby UI (rooms API)    │        │  - Realtime Rooms (lobby)    │
│                            │        │  - launch tokens / friends   │
└────────────────────────────┘        └──────────────────────────────┘
```

**Server-authoritative model.** The platform runs `server.js` — the match
simulation (physics, AI, score, injury/substitution ceremonies) — inside the
Jint sandbox, ticked at the game's configured rate (30 Hz). Clients send only
their *inputs* (move vector, sprint, action buttons; ~20 Hz `cmd` frames over
`ws/v1/games`) and render the script's broadcast snapshots (~15 Hz) with 100 ms
interpolation. No client has any authority: the script validates every input,
owns the score and clock, and ends the match by returning `result`. Realtime
Rooms still handle the pre-match world — lobby, invites, matchmaking, AI-seat
backfill, roster — and the room⇄script bridge (§8) creates the bound session
at room start and closes the room when the script returns `result`.

Trade-offs (accepted): per-invocation statelessness means all sim state
round-trips through the JSON `sessionState` document (the sim keeps this small
— quantized snapshots, RNG stored as data, rehydrated each invocation). The
~250 ms per-invocation CPU budget is comfortable at 30 Hz for a 22-seat sim.
Leaving, rejoining, and the all-humans-gone rule are covered in §4.5.

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
  simulation, you + AI opponent(s). Runs the same `server.js` sim code
  in-browser, looped back locally.

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
The room is locked (`status=playing`), the frozen roster is the match roster,
and the room⇄script bridge creates the bound GameSession (`server.js`'s
`createSession` receives the full roster, AI seats included, as
`ctx.room.roster`). AI seats are simulated by `server.js` server-side with
position-appropriate personalities (§7). Practice mode skips the server
entirely.

### 4.4 Match sequence

1. **Walkout** (~8 s): camera on tunnel, both teams walk out side by side,
   crowd cheer swells, players take formation positions.
2. **Coin flip**: center-circle close-up; referee flips a coin; winner chooses
   and kicks off (server-side RNG inside `server.js` decides; animation shows
   the result).
3. **Play**: 2 halves × configurable length (default 3 min). Kickoff after
   each goal, teams swap sides at half time.
4. **Full time**: final whistle, crowd reaction by result, celebration
   animation for winners, stats screen (score, possession, shots), then
   back to lobby. The script ends the match by returning `result`
   (`{ score, winner, draw }`); the platform stores it and closes the room.

### 4.5 Leaving, rejoining, and the injury ceremony

Mid-match absence is handled **server-side by the script** — the sim watches
`ctx.presence` on every tick/message. There is no host to migrate; the host
migration and host rejoin recovery machinery of the old design is gone.

- **Rejoin**: the menu checks `GET /rooms/mine` on load and shows a
  **REJOIN MATCH** (Playing) or **RETURN TO LOBBY** button. Starting anything
  else (Quick Play / Create Lobby / Practice) while in a room prompts for
  confirmation first. Reconnecting to the match means rejoining the room WS
  plus `ws/v1/games?sessionId=…` and sending a `sync` cmd for a fresh snapshot.
- **Explicit leave**: `POST .../rooms/{id}/leave` converts the leaver's seat
  into an AI seat **permanently** (new server-generated nickname, roster push,
  `presence.left=true`). The match continues and the user is free to join
  something else; there is no rejoin for that seat.
- **Disconnect grace**: if a player's sockets drop (`presence.online=false`),
  the AI immediately takes over their footballer, with a **5 s grace period**
  before the absence becomes official; reconnecting within grace restores
  control silently.
- **Injury ceremony (~10 s)**: once the grace lapses (or a human leaves
  explicitly), the sim enters the `injury` phase and plays a stretcher
  ceremony: the footballer falls → the referee runs over and blows the whistle
  → two carriers bring the stretcher, load the player, and carry them off
  through the tunnel → the AI substitute runs on from the tunnel and takes the
  seat → the crowd boos the departure (or cheers a return) → play restarts
  with a **drop ball** at the injury spot. The same ceremony runs in reverse
  (`kind: 'rejoin'`) when a disconnected human comes back and retakes their
  seat. Ceremony progress is broadcast in snapshots (`snap.cer`) and as `ev`
  events (`injury-start`, `referee-whistle`, `stretcher-load`,
  `stretcher-off`, `substitution`, drop-ball `restart`); triggers during a
  ceremony or during goal/halftime queue and play one at a time.
- **All humans gone**: if no human seat remains occupied (all left or offline
  past grace), the script ends the match as a **draw** — broadcasts
  `abandoned-draw`, returns `result { draw: true, score }`, and the platform
  finishes the session and closes the room.

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

- Gameplay transport: `ws/v1/games?sessionId=…` (the scripted-games socket) —
  JSON **text frames** only, ≤ 16 KB. The realtime-rooms WS
  (`ws/v1/realtime?roomId=…`) remains connected for lobby/roster/presence only.
- **Client → server**: input cmds at ~20–30 Hz inside the platform `cmd`
  envelope: `{type:'input', seq, mx, mz, sprint, pass, shoot, tackle}`
  (`mx`/`mz` normalized world-space move vector, `shoot` = release power,
  one-shot flags on the triggering frame). `{type:'sync'}` requests a full
  snapshot (sent on connect/reconnect).
- **Server → client**: the script broadcasts `{type:'snap', …}` at ~15 Hz —
  full state as compact quantized arrays (floats rounded to 2 decimals): match
  clock/half/phase/score, ball `[x,y,z,vx,vy,vz,owner]`, one flat array per
  player (pos, vel, facing, anim state + speed, kick/tackle/stun/dive timers,
  isAi, name), plus `cer` ceremony state. ~0.5–3 KB per snap depending on
  phase. Discrete moments (kick, goal, whistle, ceremony beats) go out as
  `{type:'ev', ev}` broadcasts, one per sim event, in order.
- **Clients** interpolate all entities 100 ms behind the newest snapshot
  (snapshot interpolation buffer), extrapolate ball on kicks. There is **no
  host prediction authority**: nothing a client computes is authoritative —
  even your own footballer is rendered from server snapshots.
- Clock: the server stamps snapshots (`ts`); clients estimate offset from
  arrival jitter.
- Match results: the script ends the match by returning `result`
  (`{score, winner, draw}`); the platform stores it, finishes the session, and
  closes the room (§8). Clients show stats from the final snapshot/result.
  Script-owned per-player records are updated via `eloUpdates` — no
  client-submitted scores anywhere.

## 7. AI

AI runs inside `server.js` on the platform for every AI seat (and for *all*
seats in Practice mode, where the client runs the same code locally).
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
backfill, roster/presence pushes. For this game the rooms layer handles only
the pre-match world (lobby/roster); gameplay runs in a room-bound scripted
session via the room⇄script bridge (§8.7).

### 8.1 Data model (Platform.Domain / Persistence)

- `RealtimeRoom` — `Id, GameSlug, HostUserId, Status (Lobby|Open|Playing|
  Closed), ConfigJson { teamCount, seatsPerTeam, backfillAfterSeconds,
  metadata }, GameSessionId (bound scripted session, once started), CreatedAt,
  OpenedAt, StartedAt, ClosedAt`.
- `RealtimeParticipant` — `Id, RoomId, UserId (null for AI), Username, IsAi,
  IsHost, Team, Slot, JoinedAt, LeftAt`.
- `RealtimeInvite` — `Id, RoomId, FromUserId, ToUserId, Status, CreatedAt`.
- `GameSession.RealtimeRoomId` links a scripted session back to its room
  (migration `20260722200822_RoomScriptSessions`); `GameDefinition.TickRateHz`
  holds the per-game tick rate (migration `20260722140138_GameTickRates`).
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
| POST | `/rooms/{id}/start` | Host: AI-backfill empty seats, status→Playing, returns frozen roster. Idempotent; auto-invoked by a worker at backfill deadline. Also creates the room-bound scripted session (§8.7). |
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

### 8.7 Realtime rooms ⇄ script bridge

The bridge lets a realtime room run its match as a server-authoritative
scripted session instead of on a host client:

- **Session creation on room start**: when a room enters `Playing` (host
  force-start or backfill worker), the platform creates an N-player
  `GameSession` for the game's `server=` script — one `GameSessionPlayer` per
  human (AI seats are roster-only, not session players) — and links both sides:
  `GameSession.RealtimeRoomId` and `RealtimeRoom.GameSessionId`. The room DTO
  and roster push carry `gameSessionId` so clients know which
  `ws/v1/games?sessionId=…` to connect to.
- **Extended ctx**: every script invocation for a room-bound session
  (`createSession`, `onPlayerMessage`, `onTick`) receives
  `ctx.room = { roomId, metadata, roster }` — the frozen roster, humans and AI
  seats, ordered by team then slot — and
  `ctx.presence = { "<userId>": { online, left } }` for every user who is or
  was a human participant (`online` = a live socket on either WS registry;
  `left` = the seat was explicitly left and converted to AI). The script
  drives AI takeover, the injury ceremony, and the all-humans-gone rule from
  this (§4.5).
- **Result closes the room**: when the script returns `result` (full time, or
  the abandoned-draw), the platform finishes the session, stores the result on
  the room, and closes the room — no host-submitted `POST .../result` for
  room-bound games.
- **Tick rate**: the session ticks at `GameDefinition.TickRateHz` (30 Hz for
  this game; 30 Hz platform default, clamped to 1–1000 Hz).

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
- **Injury ceremony**: referee whistle on stoppage, crowd **boos** (low,
  jeering filtered-noise band with descending pitch) when a player is carried
  off, a warm cheer when a substitute / returning player runs on — all driven
  by the ceremony `ev` events (§4.5).
- **Kickoff ambience**: tunnel murmur → swell as teams walk out.
- Mute + volume in settings; `AudioContext` resumed on first user gesture.

## 10. Client code layout

```
starhermit.txt          # manifest (slug=football, launch=index.html, server=server.js)
server.js               # authoritative match sim — platform Jint sandbox (30 Hz);
                        #   also loaded client-side as the shared sim core
index.html              # shell: canvas, HUD, lobby screens, touch UI
css/style.css
js/main.js              # boot, screens state machine (menu→lobby→match)
js/api.js               # REST client (launch token, friends, rooms, leaderboard)
js/net.js               # ws/v1/games client: cmd inputs up, snapshot buffer, interpolation
js/lobby.js             # lobby UI: invites, seats, countdown, quick play
js/match.js             # match controller: walkout→coin flip→halves→fulltime→ceremonies
js/world/stadium.js     # pitch, stands, floodlights, boards, crowd instancing
js/world/player.js      # character factory (kits, numbers)
js/world/animator.js    # procedural animation state machine
js/world/nametags.js    # floating nickname sprites
js/world/officials.js   # referee + stretcher carriers (injury ceremony actors)
js/game/sim.js          # thin wrapper re-exporting FootballSim from server.js
js/game/ai.js           # thin wrapper re-exporting the AI from server.js
js/game/input.js        # keyboard + touch joystick/buttons
js/game/camera.js       # follow cam + off-screen ball arrow
js/game/audio.js        # WebAudio SFX + crowd engine
vendor/three/           # three.module.js (+ addons actually used)
```

`server.js` is dependency-free (no three imports, no DOM) so the platform's
Jint sandbox and the browser run exactly one simulation code path: the browser
loads it as a classic script before the ES-module graph, and `sim.js`/`ai.js`
re-export `globalThis.FootballSim`. Rendering consumes sim state; online
matches render from server snapshots only.

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
9. **Networking** — `ws/v1/games` net client, snapshot interpolation, lobby
   screens wired to Realtime Rooms API, invites, quick-join, backfill.
10. **Polish & verification** — mobile QA pass, perf caps, README, final
    manual test matrix (desktop Chrome/Firefox, mobile Safari/Chrome).

## 12. Out of scope (v1)

- Fouls/cards/offside (kick-and-rush rules: out-of-bounds → throw-in style
  restart only, goals + kickoffs; keeps the sim and AI tractable).
- Replays, voice, in-game chat beyond lobby ready/chat (the room-bound session
  gets a platform chat conversation, but the client doesn't surface it).
