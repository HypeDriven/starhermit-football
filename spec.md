# StarHermit Football — Game Design Document (running spec)

Realtime 3D football (soccer) in the browser: 1v1 up to 11v11, humans and AI on the
same pitch, a night match under floodlights, played on desktop and mobile and hosted on
the StarHermit platform. This document describes the game as it ships today, in present
tense. Anything the design wants that the code does not yet do is listed once, at the end,
under "Design intent not yet implemented".

## 1. Overview

| | |
|---|---|
| Pitch | Arcade football with real physics: dribble, pass, charge a shot, slide tackle, dive. No fouls, no offside — just goals. |
| Genre | Realtime sports, server-authoritative multiplayer with offline practice. |
| Players | 2–22 seats (1–11 per side). Any seat a human does not take is an AI footballer with a name and a personality. |
| Session | One match = two halves of 3:00 match time (`halfLength` 180 s), plus ~12.5 s of walkout and coin flip and ~4.5 s of full-time celebration: about 7 minutes. |
| Platforms | Desktop browsers (keyboard + mouse), phones and tablets (touch). Both orientations. Natively, the same game runs as a script game of the StarHermit runtime (section 16). |
| Rendering | three.js r176 (vendored `vendor/three/`, with the matching r176 post-processing addons under `vendor/three/addons/`, mapped as `three/addons/`), WebGL, one `<canvas>` behind a DOM HUD and DOM screens, ACES filmic tone mapping, optional post-processing (section 8, Graphics). All stadium and character art is generated in code; authored assets are the cover art, the loading key art, two club crests and the SFX clips. |
| Authority | `server.js` is both the platform-side match script (Jint sandbox, 30 Hz) and, loaded as a classic `<script>`, the client's simulation core for practice and prediction. |

File map (everything shipped or run from this repository):

| Path | Responsibility |
|---|---|
| `index.html` | Shell: canvas, HUD, replay bar, touch controls, every DOM screen and dialog. Loads `server.js` then `js/main.js`. |
| `starhermit.txt` | Platform manifest: `name`, `launch=index.html`, `owner`, `server=server.js`, `control.*` default key bindings, `cover=coverart.png`; plus the native client's `engine.*` keys, which the platform ignores. |
| `server.js` | Simulation core (`FootballSim`: pitch, players, ball, AI, injury ceremony) and the platform script (`game.createSession / onPlayerMessage / onTick`, Elo, achievements, match-goals scores, replay recording). |
| `leaderboards.json` | The game's own leaderboard (`match-goals`), created by the owner tooling. |
| `js/main.js` | Boot, renderer, screen state machine, match lifecycle, rejoin/leave prompts, token refresh, render loop. |
| `js/gfx.js` | Pure graphics quality model: presets, categories, per-preset budgets (`BUDGETS`, `budget`), hardware level → preset (`LEVELS`, `detectLevel`, `presetForLevel`, `detectPreset`), `resolve`, `choosePreset`, `presetTier`, `describe`. |
| `js/gpu-level.js` | Shared StarHermit hardware-level detector (`window.StarHermitGpu`; copy of the canonical tools file, not edited here). |
| `js/graphics.js` | Renderer wiring for the graphics settings: pixel ratio, shadow maps, post chain, adaptive resolution, frame-rate readout, floodlit environment map, persistence; `onGraphics()` subscription for world builders. |
| `js/settings.js` | Settings panel (Graphics section) and its localized strings. |
| `sh-language.js`, `js/i18n/` | Game language: the shared StarHermit language resolver (unmodified copy of `tools/sh-language.js`); `strings.js` translation tables; `i18n.js` engine (`window.FBI18N`, DOM observer, `fb-language` event); `t.js` module helpers `T` / `N`. |
| `js/match.js` | Match controller: world build, walkout → coin flip → play → done, practice stepping, online prediction/interpolation, events → audio/HUD. |
| `js/game/sim.js`, `js/game/ai.js` | Thin ES-module re-exports of `globalThis.FootballSim`. No logic. |
| `js/game/input.js` | Keyboard tank steering, contextual shoot/pass key, pointer-lock mouse, touch joystick and buttons, platform key remapping. |
| `js/game/camera.js` | Third-person follow camera, cinematic framing helper, off-screen ball arrow. |
| `js/game/audio.js` | WebAudio engine: buses, synthesised crowd bed and reverb, authored clips from `sfx/manifest.json` with a synthesiser fallback per event. |
| `js/hud.js` | Score bar, match clock, shot power bar, event banners. |
| `js/world/stadium.js` | Pitch, markings, two-tier bowl, instanced seats and crowd, floodlights and cones, LED boards, tunnel, dugouts, flags, goals, sky and fog. |
| `js/world/player.js`, `js/world/animator.js` | Procedural jointed footballer (kits, numbers, skin and hair variety) and its phase-driven animation. |
| `js/world/nametags.js` | Camera-facing nickname plates. |
| `js/world/officials.js` | Referee, two stretcher carriers and the stretcher for the injury ceremony. |
| `js/net.js` | WebSocket clients: rooms socket (roster/presence), games socket over `StarHermit.connect` (inputs up, snapshots down, reconnect), voice relay socket. |
| `js/api.js`, `starhermit-sdk.js` | Platform client over the shared StarHermit SDK: launch token, sign-in, invite link, profiles, settings KV, rooms, controls, sessions, achievements, leaderboards, replays, chat, voice. |
| `js/achievements.js`, `js/platform-i18n.js` | ACHIEVEMENTS screen; localized account-surface strings. |
| `js/lobby.js` | Lobby screen: create, quick play, ranked vs AI, invites, seat moves, backfill countdown, invite links. |
| `js/controls.js`, `js/leaderboard.js`, `js/replays.js` | The Controls, Leaderboard and Replays screens. |
| `js/replayview.js` | Render-only 3D playback of an archived match. |
| `js/chat.js`, `js/voice.js` | In-match text chat (REST polling) and positional WebRTC voice chat. |
| `js/menuScene.js` | AI-vs-AI exhibition match with a drifting camera behind the menu. |
| `js/snapformat.js` | Shared parser for the snapshot/replay row layout. |
| `css/style.css` | All styling, safe-area insets, responsive sizes. |
| `assets/` | `keyart-night-stadium.webp` (loading screen), `crest-blue.webp`, `crest-red.webp` (score bar and lobby). |
| `coverart.png`, `icon.png`, `favicon.svg` | Platform listing art and icons. |
| `sfx/` | 18 Opus clips, `manifest.txt` (canonical table), `manifest.json` (binding + generation prompts), `manifest.md` (generator output). |
| `tests/server-regression.cjs`, `tests/gfx.test.mjs`, `tests/platform.test.mjs`, `tests/e2e.mjs` | `npm test` rules regression + graphics-model + platform-client unit tests; `npm run test:e2e` Playwright playthrough. |
| `engine/` | The native client (section 16): `src/**.ts` on the StarHermit runtime's host API (`starhermit.d.ts`, a copy of the runtime's contract), `src/logic/` (pure, Node-tested), `tests/` (`run.sh`), `tsconfig.json`, `HOST-API-GAPS.md`. |

## 2. Vision and design pillars

**Every seat is a footballer.** Whether a seat holds a human, a matchmade stranger or an AI,
it is one entity with one name plate, one kit number and the same physics. Rules in: AI seats
with names from a 30-name pool, personalities and formation roles; AI takeover of a
disconnected human within 5 s; a stretcher ceremony that visibly substitutes a leaver.
Rules out: invisible bots, empty positions, "AI difficulty" toggles that would make AI seats
play by different physics than humans.

**One code path decides the match.** The sim in `server.js` is the only place a ball moves.
The platform runs it at 30 Hz for online matches; the browser runs the same file for practice
and for the menu backdrop. Rules in: quantised snapshots, render-only prediction of your own
footballer, rules bugs fixed once. Rules out: client-submitted scores, host-migration logic,
any client-side authority.

**Body before ball.** Shots follow your facing (90 % facing, 10 % goal assist), passes go to
teammates in your facing cone, sprinting carriers get dispossessed more easily. Rules in: tank
steering on desktop, hold-to-charge shots, a follow camera that swings behind your heading.
Rules out: auto-aim to goal, lock-on passing, a top-down tactical camera.

**A night at the ground.** Floodlit stadium, two tiers of swaying crowd, LED boards, a walkout
and a coin flip before kick-off, a crowd that gasps, oohs, boos and roars. Rules in: crowd
excitement that follows how close the ball is to a goal; authored crowd clips with synthesised
depth under them; kit-coloured name plates. Rules out: daytime, empty stands, silent goals.

**Best-effort platform features never block the ball.** Chat, voice, invites, leaderboard,
replays and remappable keys all degrade to a quiet status line. Rules in: offline practice
without a token; reconnect with backoff; AI stand-ins. Rules out: a match that waits for a
microphone permission or a failed REST call.

## 3. Player experience

Target player: someone who wants a quick pick-up football match with friends or strangers in a
browser tab, with enough physical feel to make a good goal feel earned, and who is happy to
play a full 5v5 with AI teammates when nobody else is around.

First 60 seconds (offline or online): the menu opens over a live AI-vs-AI match in the stadium,
so the game explains its own look before a button is pressed. Team size defaults to 5 per side.
PRACTICE vs AI starts a match immediately. The walkout (8 s) frames both teams leaving the
tunnel; the coin flip (4.5 s) shows the kick-off decision and the banner "BLUE KICKS OFF" /
"RED KICKS OFF". On desktop the bottom hint reads "CLICK THE PITCH FOR MOUSE CAMERA · LEFT
SHOOT · RIGHT PASS · MIDDLE TACKLE" until the mouse is captured; the CONTROLS screen (online)
lists every key. On touch, the joystick and three labelled buttons (TACKLE, PASS, SHOOT) are
on screen from the first frame of the match. The off-screen ball arrow with a metre readout
appears the moment the ball leaves the view, and the shot power bar appears while SHOOT is held,
so the two mechanics a newcomer most needs are taught by their own feedback.

Typical session: one 7-minute match, then the result card (VICTORY / DEFEAT / DRAW, score,
possession, shots), back to the menu, another match or a look at the leaderboard. Online, the
lobby's 30-second fill window and AI backfill guarantee the match starts.

Emotional beat: the charged shot. Holding SHOOT fills the bar, the camera and crowd bed are
already rising because the ball is in the danger zone, the release thumps, and either the net
pins the ball with a stadium roar or the woodwork sends a gasp and an "ooh".

## 4. Core loop and rules contract

All rules below are implemented in `server.js`; the client never re-derives an outcome.

**Pitch** (`pitchFor`): length `L = 40 + (teamSize − 1) × 7.2` m (40 m at 1v1, 112 m at
11v11), width `W = 0.62 L`. Goals: `goalW = clamp(7.32 × W/68, 3.0, 7.32)`,
`goalH = clamp(goalW/3, 2.0, 2.44)`. Team 0 (BLUE) attacks +x in the first half; sides swap
at half time (`attackSign`). Players may step 1.5 m outside the lines (`clampToPitch`).

**Seats and roles** (`roleForSlot`, `formationAnchor`): slot 0 is GK (except at 1v1, where the
single player is FW), then DF (< 45 % of slots), MF (< 80 %), FW. Anchors sit at u = −0.47
(GK), −0.28 (DF), −0.05 (MF), +0.22 (FW) of the length, spread across ±0.38 of the width.
Kick-off (`resetKickoff`): everyone at their anchor; the kicking team's forwards at the
centre spot.

**Movement** (`stepPlayer`): walk 2.1, run 5.4, sprint 7.4 m/s; acceleration 22 m/s²;
carrying the ball multiplies speed by 0.88; backpedal is 0.9 × walk. Steering input
(desktop) rotates at 3.2 rad/s and runs along the facing; direction input (touch, AI) faces
the movement, or turns toward the ball at 6 rad/s when still.

**Possession** (`stepBall`): a loose ball is claimed within 0.95 m (GK inside 20 % of the
length from its own goal line: 1.62 m) when it is below 1.25 m and slower than 9 m/s (GK:
16 m/s), never while stunned or within 0.15 s of a kick. An owned ball rides
`0.5 + 0.045 × speed` m ahead of the carrier. An opponent within 0.62 m pokes it loose
with probability `dt × (1.2 × [1.8 if carrier > 6 m/s] + aggression)` per tick.

**Actions** (owner only, none while `kickT > 0`):
- Shoot (`doShoot`, power p ∈ (0, 1]): speed `15 + 11p`, direction 90 % facing + 10 %
  toward a random point in the goal mouth, elevation from power, distance and the aim point;
  `kickT` 0.4 s; counts as a shot in `stats.shots`.
- Pass (`doPass`): best teammate 2–45 m away, within 1.25 rad of the facing, with no
  opponent within 1.1 m of the pass line, preferring the one nearest the opponents' goal;
  speed `clamp(9 + 0.42 d, 10, 24)`, lofted when d > 18 m, led by 0.35 s of the receiver's
  velocity. With no option: a 7.5 m/s knock-on into space and a 3.4 m/s burst after it.
- Tackle (`tackle` input): a 0.45 s lunge at +4.5 m/s. Connecting with an opposing carrier
  within 1.5 m pops the ball loose at 3.2 m/s (`steal`) and stuns the tackler 0.35 s; a
  lunge that ends more than 2 m from the ball stuns 0.55 s. A GK within 20 % of the length
  of its own goal line dives instead: 0.6 s at 7 m/s, stunned 0.6 s (`dive` event).

**Ball** (`stepBall`): gravity −21 m/s², radius 0.11 m, ground bounce with restitution 0.55
when `|vy| > 1.2`, rolling friction `1 − 2.1 dt`, air drag `1 − 0.28 dt`. Crossing the goal
line inside the mouth scores; hitting the frame ring (bar ±0.25 m, posts ±0.25 m) bounces
back (`woodwork`). Beyond 1.2 m past the goal line or 0.8 m past a touchline the ball is
placed 0.4 m inside the pitch and given to the nearest player of the team that did not touch
it last (`restart`, kinds `goalline` / `sideline`). Own goals are credited to the team whose
goal it is not; the last toucher hangs their head for 3 s (`dejectedT`).

**Clock and phases** (`stepMatch`): the clock runs only in `play`. `goal` pauses 3.2 s
(scoring team celebrates), then the conceding team kicks off. At 180 s the first half ends
(`halftime`, 4 s) unless a loose ball is travelling faster than 9 m/s; the second half is
kicked off by the team that did not kick off the first. At 360 s the match ends
(`fulltime`); the winner celebrates for 5 s. During `injury` (see 4.1) the clock is paused.

**Scoring and result**: goals only. Winner = higher score, `−1` on equal scores (draw).
Worked example: BLUE 2–1 RED at full time, 41 % / 59 % possession (possession is seconds of
ownership per team, `stats.possession`), shots 6–9 → `result { score: [2, 1], winner: 0,
draw: false }`; BLUE humans' Elo rises by the same delta each.

**Elo** (`computeRatings`): K = 32, default 1200, floor 100, expected score from each
team's average rating over its humans; every human on a team gets the same rounded delta and
a win/loss/draw increment. Unrated: a team with no humans (Practice, Ranked vs AI) or an
abandoned match. Example from the regression test: 1400 vs 1200 draw → 1392 / 1208.

**Achievements** (`computeAchievements`): `debut` (finish a match, 10), `first-win` (25),
`goalscorer` (15), `hat-trick` (three goals, 50), `clean-sheet` (win conceding 0, 40).
Granted at full time to humans still seated.

**Match-goals leaderboard** (`computeGoalScores`, declared in `leaderboards.json`: `match-goals`,
"Most goals in a match", integer, higher is better, 0–99): at full time every human still seated
posts the goals their team scored through the returned `scores`; the board keeps each player's best
match. Abandoned matches and offline Practice post nothing, so a solo player earns it with
**Ranked vs AI**. After an online match the result card shows "Leaderboard rank: #N" under the stats
(read from `StarHermit.leaderboard('match-goals')`), or "Score not posted to the leaderboard."

**RNG**: mulberry32 stored as `{ seed, counter }` so a JSON round-trip continues the stream.
Practice seeds from `Math.random()`; online from `floor(ctx.random × 2^31 − 1)`. AI names are
drawn from `AI_NAME_POOL` with the same stream. There is no undo and no hint system; the only
assists are the 10 % shot aim and the pass-lane selection.

### 4.1 Presence, injuries and abandonment (online only)

`reconcilePresence` runs every tick of a room-bound session. A human whose sockets drop is
taken over by AI immediately and, after 5 s (`OFFLINE_GRACE_MS`), a `leave` ceremony is
queued; reconnecting inside the grace restores control silently. An explicit leave
(`presence.left`) is permanent. The ceremony (`startCeremony`, `stepCeremony`): the victim
falls; the referee runs in from the far touchline and whistles at 2.5 s; two carriers hustle in
with the stretcher at 6 m/s, crouch, load at +1.4 s, carry the player to the west tunnel at
5.5 m/s, set down; the same entity takes the replacement's name and runs from the tunnel to its
anchor (`substitution`); play restarts with a dropped ball at the spot. A returning human gets
the mirror `rejoin` ceremony. When every human seat is gone the match ends as
`{ draw: true }` (`abandoned-draw`) with no ratings.

## 5. Modes and progression

| Mode (menu button) | Requires | What happens |
|---|---|---|
| PRACTICE vs AI | nothing | Local sim at 60 Hz fixed step (`match.js updateAuthoritative`), you in seat 0 of BLUE, AI everywhere else. Unrated, no replay. Works without a launch token. |
| QUICK PLAY | launch token | `POST /realtime/rooms/quick-join`; on 404 creates and opens a room. 30 s fill window, AI backfill, then the platform starts the scripted session. |
| CREATE LOBBY | launch token | Creates a closed room; INVITE FRIENDS (friends list), COPY INVITE LINK (`dashboard.starhermit.com/game-invite/<user>/<slug>`), host clicks empty seats to move themself, FIND MATCH opens the room and starts the 30 s countdown. |
| RANKED vs AI | launch token | A room with `aiPlayers = 2 × teamSize − 1` started at once: server-authoritative, rated only if both teams have humans (so in practice unrated), archived as a replay. |
| REJOIN MATCH / RETURN TO LOBBY | an active room on the server | Shown when `GET /rooms/joined` lists a non-Closed room; rejoin skips the intro and resyncs from snapshots. |
| LEADERBOARD | launch token | My rating and W/L/D from `GET /games/{slug}`; ranked entries, 20 per page, friends-only filter. |
| REPLAYS | launch token | Last 20 finished online matches; WATCH plays the archived 2 fps log with play/pause, seek and an orbiting ball camera. |
| CONTROLS | launch token, non-touch | Rebind the seven actions; saved per user on the platform. |

Team size (1–11 per side, default 5) applies to every mode. Difficulty does not scale: AI
plays at `difficulty = 1` everywhere (`computeAiInput`), and the real curve is team size
(a 1v1 on a 40 m pitch is a duel; 11v11 on 112 m is positional). There are no unlocks; the
long-term progression is Elo, W/L/D and the five achievements.

## 6. Controls and interaction

Desktop defaults (`starhermit.txt`, `input.js DEFAULT_KEYMAP`), remappable per user:

| Action | Keys | Behaviour |
|---|---|---|
| Run forward / backpedal | W / S, ↑ / ↓ | Forward ramps to sprint automatically after 0.2 s held. |
| Turn left / right | A / D, ← / → | Rotates the footballer (tank steering), 3.2 rad/s. |
| Shoot / pass | Space, J | Tap (< 0.22 s) passes; hold charges the power bar at 1.4/s to full in ~0.7 s; release shoots (minimum power 0.15). |
| Pass | L | Dedicated pass. |
| Tackle / dive | K | Slide tackle; GK dive near own goal. |
| Mouse camera | click the pitch | Pointer lock: mouse turns the camera (0.0025 rad/px, height offset −2.2..5.5 m); left button shoots (hold to charge), right passes, middle tackles. Esc releases; a second Esc opens LEAVE MATCH? (online only). |
| Chat / mic | T / M | T focuses the chat input (Enter sends, Esc closes); M toggles the mic (online, voice enabled). |

Touch (`pointer: coarse`): a 132 px joystick bottom-left, camera-relative, full tilt
(> 92 %) sprints; TACKLE and PASS (74 px) and SHOOT (92 px, hold to charge) bottom-right.
Sprinting vibrates 4 ms per stride where `navigator.vibrate` exists.

Input locking: gameplay keys are only tracked while a match is live (`showTouchUi(true)`);
a focused input/select drops all held keys; window blur and tab hide clear input; the
capture click for pointer lock never fires a shot; the Controls screen swallows the captured
key before the gameplay listener sees it. Online, movement is sent at 30 Hz and pass/shoot/
tackle edges are sent immediately; local kick feedback (thump, kick pose) plays on release
and the server's own `kick` event for that touch is suppressed for 1 s to avoid an echo.

## 7. Screens and UI flow

`main.js showScreen` shows exactly one of: `screen-menu`, `screen-lobby`, `screen-invite`
(stacked on the lobby), `screen-controls`, `screen-leaderboard`, `screen-replays`,
`screen-result`, or none (match / replay). Overlays: `#loading` (until the username
resolves), `#leave-confirm` (the in-match menu: Esc or ☰), `#screen-settings` (SETTINGS
from the main menu or the in-match menu; it stacks above both and Esc or BACK closes it),
`#confirm-dialog` (starting anything while the server still has you in a room), `#hud`,
`#touch-ui`, `#replay-ui`. On a short landscape phone (height ≤ 520 px) the main menu lays its buttons out in three columns with a compact logo so they all show on the first screen.

```
loading → menu ─┬─ practice ──────────────→ match ─→ result ─→ menu
                ├─ quick / lobby / ranked → lobby ─→ match ─→ result ─→ menu
                ├─ rejoin ────────────────→ lobby | match
                ├─ controls / leaderboard → back → menu
                ├─ settings (also from the in-match menu) → back
                └─ replays ─→ replay viewer ─→ replays
```

Layout: every screen is a centred flex column (`justify-content: safe center`, so a menu
taller than the viewport scrolls from its top instead of clipping it) with `overflow-y: auto`, buttons
`min(320px, 80vw)` wide, lists `min(440–560px, 92vw)` with `max-height` 44–52 vh so long
rosters and leaderboards scroll inside the panel. The score bar is top-centre at
`max(10px, env(safe-area-inset-top))`; joystick, touch buttons, power bar, mouse hint, chat
and the replay bar all offset by `env(safe-area-inset-bottom)`; the mic button sits at the
top-right inset. Portrait phones: the lobby roster is a two-column grid (BLUE | RED) that
stays legible at 390 px; the result score uses `clamp(2.4rem, 9vw, 4.5rem)`. Landscape
phones: the joystick and buttons keep 5–6 % margins so thumbs do not cover the pitch centre.
Must never be cut off: the score bar and clock, the ball arrow (clamped to 86 % / 80 % of
the viewport), the power bar, the three touch buttons and the joystick, the result title and
score, and the primary button of every screen.
Below 480 px wide the score bar shrinks slightly and centres in the space left of the menu
button. Large screens: `ui-scale.js` sets `--ui-scale` (1 up to a 1600×1000 viewport, then
`min(w/1600, h/1000)`, max 2.5) and every DOM UI layer (screens, HUD, touch UI, replay bar,
menus, settings, dialogs, FPS meter) is CSS-zoomed by it with vw/vh lengths divided by it;
the full-viewport WebGL canvas is not zoomed and the ball arrow / joystick maths convert
between visual and zoomed px. Secondary screen text carries a dark text shadow for legibility
over the live stadium.

## 8. Art direction

"Football club professional" at night. The hero of every screen is the floodlit pitch:
the menu, the lobby and the result card are translucent panels over the live stadium.

Palette (from `css/style.css`, `stadium.js`, `match.js`):

| Use | Value |
|---|---|
| Page / sky base | `#05070c`; sky gradient `#010208 → #040914 → #0a1524 → #122036`; fog `0x070d18` |
| Panels | `rgba(10,14,20,0.82)` with `#2c3e50` borders, 8–10 px radius |
| Text | `#eef2f5`; muted `#93a1b0`; secondary `#9fb0c0`, `#c7d2dc` |
| Accent (pitch green) | `#27ae60` — primary buttons, logo glow, Elo, seek bar |
| Accent 2 (gold) | `#f1c40f` — clock, own seat, invite buttons; name plate for "You" `#ffd54a` |
| Danger | `#c0392b` / `#e74c3c` — leave buttons, key conflicts, mic muted |
| Pitch | stripes `#2f6d31` / `#2a602c`, lines `#f5f8f5`, apron `0x0c100d` |
| Floodlights | spot `0xf2f6ff`, fills `0xe8f0ff`, cones `0xaac8ff`, hemisphere `0x8fb4e8` |
| BLUE kit | shirt/socks `#1f5fb4`, shorts `#f2f2f2`, GK `#e67e22`; crest: royal blue shield, silver heron |
| RED kit | shirt/socks `#c0392b`, shorts `#232323`, GK `#8e44ad`; crest: crimson shield, gold wolf |
| Skin range | `#f2c79b` → `#4a2c17`; hair `#1a1a1a … #8a3b12`; boots `#1b1b1f` |
| Crowd | jackets `0x22242c … 0x2a2320`, splashes `0xc23b3b 0x2f5fd0 0xe6e2d8 0xd8a02c 0x3f9e4d`; away section `0x7e2233` |

Shape language: capsule-and-sphere footballers (~1.8 m, pelvis at 0.98 m) with boxy boots
and a flat number plane, crisp canvas kits; a rectangular two-tier bowl; cylinder floodlight
masts with additive light cones; rounded-rectangle name plates. Typography: "Segoe UI",
system-ui; the logo is 800 weight with 0.12 em tracking and a green glow; screen titles and
buttons are uppercase with 0.08–0.15 em tracking; the clock uses tabular numerals.

Motion: the follow camera is a critically damped lerp (`1 − e^(−6 dt)`), 13 m back and 7 m up
(when it backs up over the west tunnel the tunnel fades to 15 % opacity so its roof never hides
the player), 15 m / 7.5 m and +4° FOV when sprinting; cinematic framing for walkout (crane from the
tunnel), coin flip (centre-circle close-up), ceremonies (touchline view) and full time
(slow orbit). Banners pop in with a 0.35 s scale-up. The crowd sways continuously and
pulses on goals, boos in place after a leaver. Floodlights flicker ±3 %. With
`prefers-reduced-motion` the flicker, camera flashes and haze drift stop; the remaining
motion is listed in Known limitations.

**Graphics.** Lighting is one shadow-casting floodlight spot, three fill spots, a
hemisphere fill and a flat ambient term, rendered with ACES filmic tone mapping into sRGB.
The spot's shadow frustum is fitted to the pitch plus a margin (focus, near and far computed
from the pitch corners), so every texel lands on the play area. Surfaces: the match ball is a
clearcoated physical material; lamp banks carry HDR glow sprites; LED boards and the tunnel
sign are slightly over-driven so they still read as lit after tone mapping. Optional
effects: floodlight shadows (1024²–4096²; at the top tier the opposite tower casts too, for
the floodlit double shadow), GTAO ambient occlusion (the sky dome, cones, nets and sprites
are excluded from its pre-pass), bloom limited to lamps, camera flashes and hot highlights
(threshold 1.3 in linear HDR, above the lit pitch lines), a colour grade with vignette, FXAA/SMAA/MSAA, reflections from a
floodlit-stadium environment map (PMREM of a small HDR scene: four lamp banks, the LED
ring, turf and night sky), a detailed pitch (turf variation, worn goalmouths and spots, a
normal map whose mow bands lean opposite ways so the stripes shift with the view angle, and
blade grain), crowd density (full, or an evenly spread half) and particles (camera flashes in
the stands that burst on goals, dust drifting in the beams). The Settings panel's
**Graphics** section offers a quality preset (Auto, chosen from the StarHermit hardware level
below; Low; Balanced; High; Ultra),
a render scale (50–200 % of the preset's), a per-effect override for every category ("From
preset (…)" by default; choosing a preset clears overrides), adaptive resolution (averages
90 frames, steps the resolution down by 10 % to 60 % when frames take over 26 ms and back up
by 5 % under 14 ms) and a frame-rate readout (top-left, never over HUD controls), plus a
summary line "GPU · Level N · cost summary · W×H px" (the level label localized). Presets:

| Preset | Pixel-ratio cap | Shadows | AO | Bloom | Grade | AA | Reflections | Detail | Crowd | Particles |
|---|---|---|---|---|---|---|---|---|---|---|
| Low | 1 | off | off | off | off | MSAA (canvas) | off | plain | sparse | off |
| Balanced | 1.5 | 1024² | off | on | on | FXAA | on | detailed | full | on |
| High | 2 | 2048² | on | on | on | SMAA | on | detailed | full | on |
| Ultra | 2 | 4096² ×2 | high | on | on | MSAA ×4 | on | detailed | full | on |

Pixel ratio = min(devicePixelRatio, cap) × preset scale (Low 0.85, Balanced 0.9, else 1) × render scale × adaptive scale. The post chain
(RenderPass → GTAO → UnrealBloom → grade → OutputPass → SMAA/FXAA) is built only when an
effect needs it and rebuilt when its key changes; Low renders straight to the canvas. Changes
apply immediately (shadow toggles recompile materials) and persist in `localStorage`
(`starhermit-football-graphics`). If the post chain cannot be built, the game renders
without it and the panel says so. The resolved preset and main categories are mirrored on
`<body>` as `data-gfx-preset`, `data-gfx-bloom`, `data-gfx-shadows`, … for tests.

**Hardware level and Auto.** `js/gpu-level.js` (the shared StarHermit detector, `window.StarHermitGpu`,
loaded as a classic script before `js/main.js`) rates the GPU 0–20 (0 = Galaxy S20 / Intel UHD or
weaker, 20 = RTX 5090, each level ≈ 1.23× the one below; laptop parts two levels lower; phones, tablets
and ≤ 4 GB machines capped at 9; software renderers 0). Auto picks **Low from 0, Balanced from 4, High
from 10, Ultra from 17**, so strong desktop GPUs get Ultra; adaptive resolution still steps down when
frames are slow. On phones and tablets the shared frame-rate option paces Auto at half the display
refresh rate and starts at 16 simultaneous sounds.

**Per-preset budgets** (`BUDGETS` in `js/gfx.js`; each tuned to hold 60 FPS on the weakest GPU Auto
gives it — Low: level 0 phones / Intel UHD, Balanced: level 4 Iris Xe, High: level 10 GTX 1070, Ultra:
level 17 RTX 4080). Gameplay is identical on every preset.

| Preset | Crowd, seats, stands | Grass texture | Line texture | Spectators drawn (× Crowd tier) | Spectator capsule LOD | Camera flashes / haze | Bloom / GTAO resolution |
|---|---|---|---|---|---|---|---|
| Low | Lambert | 512 px | 1024 px | 60 % | 1 × 5 segments | 80 / 160 | ½ / ½ |
| Balanced | Standard | 1024 px | 2048 px | 80 % | 2 × 6 | 140 / 300 | ½ / ½ |
| High | Standard | 1024 px | 2048 px | 100 % | 3 × 8 | 220 / 480 | ½ / ½ |
| Ultra | Standard | 2048 px | 4096 px | 100 % | 4 × 12 | 300 / 700 | full / full |

Flashes and haze scale within the preset by the hardware level (`StarHermitGpu.scaleBudget`, ≤ 2×,
capped by the 600 / 1400 pools; fewer below the floor). Textures, capsule geometry, particle draw
ranges and the Lambert twins of the stands, seats and crowd are swapped live when the preset changes.
Bloom and GTAO run at a fraction of the frame through a wrapped pass `setSize`. Static files are
cache-busted with `?v=11`.

**60 FPS benchmark** (`node tools/gfx-bench.mjs football [--mobile --presets low,balanced]`, dev-only,
real GPUs; hook `tests/gfx-bench.mjs` picks the preset in Settings → Graphics, starts Practice with the
largest team size and plays with the real keyboard controls). Measured 2026-10-17 (an AMD Radeon iGPU at level 2 projected to each preset's floor level, the same page with draws skipped subtracted; typical p50 ≤ 12 ms and slow p90 ≤ 14 ms, CPU p90 ≤ 6 ms on the NVIDIA run):

- Desktop 1920×1080 (Low and Balanced re-measured after their budgets were lowered — Low scale 0.85 without shadows, Balanced scale 0.9 with 1024² shadows; with the earlier 1.0 scale and shadow maps they measured FAIL low typical 19.33 / slow 17.46 ms and FAIL balanced typical 14.05 ms): PASS low (typical 11.23, slow 8.86 ms at level 0; CPU 1.30 ms); PASS balanced (typical 9.45, slow 9.38 ms at level 4; CPU 1.80 ms); PASS high (typical 6.24, slow 6.70 ms at level 10; CPU 2.40 ms); PASS ultra (typical 3.90, slow 4.30 ms at level 17; CPU 3.50 ms).
- Mobile 390×844 @3×: PASS low (typical 3.73, slow 4.64 ms at level 0; CPU 1.30 ms); PASS balanced (typical 7.14, slow 2.79 ms at level 4; CPU 1.90 ms).

Visual assets the design calls for: cover art (16:9 night stadium, no text), loading key
art (the same image), one crest per team, the procedural stadium and rig. No 3D model or
humanoid animation asset is called for: the rig is code-generated and phase-driven, so a
Kimodo humanoid clip would be out of distribution for kicks, slides and dives, and a TRELLIS
hero prop has no home in a sport whose only prop is a sphere.

## 9. Audio direction

Mix: `master` → destination, with `sfxBus` (0.9, dry: ball, body, whistle, UI) and
`crowdBus` (0.8, also feeding a two-tap feedback-delay stadium reverb at 0.35 wet). The
crowd bed is six looped band-passed noise voices with slow LFOs whose level follows
`excitement^1.4 × 0.5`; excitement eases toward `0.3 + 0.55 × danger`, where danger is how
deep the ball is in either final 30 % of the pitch (`match.js updateAudio`). There is no
music: the crowd is the score. Mute state is stored in `localStorage`
`starhermit-football-muted` (no menu toggle yet). The AudioContext is built on the first
pointer or key gesture.

Authored clips (`sfx/*.opus`, 48 kHz mono Opus, −20 LUFS, MOSS-SoundEffect v2) are decoded
at build time from `sfx/manifest.json`; each event plays its clip with per-call pitch (±4–10 %)
and pan variation, and falls back to the synthesiser when the clip is absent. The looping bed,
reverb and excitement are always synthesised. This table is the source of `sfx/manifest.txt`.

| Event id | File | Sound | Used when |
|---|---|---|---|
| `kick.pass` | `kick-pass.opus` | soft boot-on-ball thump | `kick` events with power < 0.5 (passes, knock-ons, loose balls), local pass feedback |
| `kick.shot` | `kick-shot.opus` | hard strike with leather slap | `kick` events with power ≥ 0.5 (shots), local charged-shot feedback |
| `bounce` | `ball-bounce.opus` | one hollow bounce on turf | `bounce` events with power > 0.25 |
| `tackle` | `tackle-slide.opus` | grass scuff, body thud, grunt | `tackle`, `steal` |
| `dive` | `gk-dive.opus` | rush then heavy landing | `dive` (goalkeeper) |
| `whistle.short` | `whistle-short.opus` | one sharp peep | kick-off after the coin flip, `goal`, `kickoff`, `restart`, `referee-whistle` |
| `whistle.long` | `whistle-long.opus` | three blasts | `halftime`, `fulltime`, `abandoned-draw` |
| `crowd.cheer` | `crowd-cheer.opus` | swell of voices and applause | walkout start (0.9), coin flip (0.5), own goal (0.5), full time (1 win / 0.5 draw / 0.3 loss), `substitution` (0.8) |
| `crowd.goal` | `crowd-goal.opus` | roar with horns and whistles | `goal` (home a touch louder) |
| `crowd.gasp` | `crowd-gasp.opus` | sharp collective intake | `woodwork`, own goal, `injury-start` |
| `crowd.ooh` | `crowd-ooh.opus` | falling groan | `woodwork` |
| `crowd.boo` | `crowd-boo.opus` | jeering and whistling | 1 s after an `injury-start` of kind `leave` |
| `crowd.anticipation` | `crowd-anticipation.opus` | rising murmur | `dive` |
| `crowd.matchStart` | `crowd-matchstart.opus` | wall of cheering, drums | lobby flips to match (`onStarting`) |
| `injury` | `injury-cry.opus` | yelp and fall | `injury-start` |
| `footstep` | `footstep-grass.opus` | one boot on grass | own footballer, once per stride at run/sprint |
| `coin` | `coin-flip.opus` | flicked coin ringing and landing | coin-flip phase begins |
| `ui` | `ui-click.opus` | soft click | every menu/lobby/dialog button |

Voice chat (`voice.js`): opt-out (`starhermit-football-voice`), WebRTC mesh signalled over
`ws/v1/voice`, each peer through `GainNode → StereoPanner`; gain recomputed at 10 Hz from
the distance between footballers (full within 4 m, silent beyond 55 m, squared falloff), pan
from direction relative to my facing; M or the HUD button mutes locally and publishes the flag.

## 10. Localization

Every player-facing string of the client ships in nine locales: **en-US, en-GB, es-419, es-ES,
de-DE, fr-FR, fr-CA, pt-BR, it-IT**.

- **Tables.** English source strings are the keys (menu buttons keep the UPPERCASE style in every
  language). `js/i18n/strings.js` holds rows of [English, es-419, de-DE, fr-FR, pt-BR, it-IT]; en-GB,
  es-ES and fr-CA list only their differences and otherwise fall back to en-US, es-419 and fr-FR.
  The Settings panel keeps its own table in `js/settings.js` and the account strings theirs in
  `js/platform-i18n.js` (sign-in, invite, session-expired and updated-terms prompts, achievements
  screen, leaderboard line); both read the game language. "StarHermit Football", player names,
  key names and the achievement names the server script declares stay as they are.
- **How it is applied.** `js/i18n/i18n.js` runs a MutationObserver over `<body>` that translates
  every text node and every `aria-label` / `title` / `placeholder` / `alt` whose whole English text
  is a key, remembers the key and re-translates it in place on a language change (`data-i18n-skip`
  marks the logo). Modules write fixed text through `N('…')` (left to the observer) and assembled
  text through `T('…', vars)` (banners such as "{team} KICKS OFF", the match clock "1st {time}",
  status lines, lobby countdown and player counts), re-rendered on the `fb-language` event. The local
  player's canvas name tag ("You") is redrawn in the new language.
- **Settings → Language → Game language** (rendered by the shared `game-options.js` from the
  `sh-language.js` instance inside the Settings panel's Graphics rows) offers **Automatic —
  <resolved language>** plus the nine locales by native name, with a status line (Saved to account /
  Saved on this device / Account sync unavailable). It is reachable from the menu's SETTINGS and from
  the in-match ☰ menu's SETTINGS.
- **Resolution** (`sh-language.js`): explicit game choice → for Automatic, the StarHermit account's
  `preferredLanguage` (`GET /api/v1/me/language`, signed in only) → `navigator.languages` → en-US.
  Tags map to the nearest shipped locale (`es-MX → es-419`, `en-AU → en-GB`, `fr → fr-FR`,
  `pt-PT → pt-BR`). The choice (`auto` or a locale) is stored per player in
  `localStorage['football.language.<user|guest>']` and, when signed in, in the per-player settings
  key `ui.language` as `{ choice }`; a failed settings read never overwrites it and the game never
  writes the platform preference. Offline play makes no language request. `?lang=<tag>` forces a
  locale for the page load (QA links) and hides the selector.
- **Live switching.** A change applies immediately without touching the match, lobby or sockets:
  static text re-translates in place, the menu's sign-in line and buttons, the in-match menu, the
  result card, the invite rows, the Settings labels and the local name tag re-render; banners
  already on screen finish in the language they were shown in.
- **Expansion.** Buttons wrap inside `min(320px, 80vw)`, banners scale with `clamp()`, list rows
  ellipsise names. German at 390 px is checked by the e2e.

## 11. Accessibility

- Keyboard-only: every screen is built from native `<button>`, `<select>`, `<input>`
  elements in DOM order, so Tab/Enter reaches every action; the match itself is fully
  keyboard playable (mouse is optional). Focus is visible with the browser default ring.
- Captions: match events are shown as text banners (GOAL!, OWN GOAL!, HALF TIME, FULL TIME,
  INJURY — … CAN'T CONTINUE, … COMES ON / IS BACK, MATCH ABANDONED — DRAW) as well as heard.
- Contrast: `#eef2f5` on `rgba(10,14,20,0.82)` panels; muted text `#93a1b0` is used only for
  hints; name plates use white on team colour with a dark rim.
- Target sizes: menu buttons ≥ 48 px tall; touch buttons 74 / 92 px; joystick 132 px;
  list rows ≥ 40 px.
- Screen-reader announcements, a reduced-motion mode and an in-game mute toggle are not
  implemented (Known limitations).

## 12. StarHermit integration

All platform traffic goes through the shared client `starhermit-sdk.js` (loaded by `index.html`
before the module graph; `api.initAuth()` calls `StarHermit.init()` at boot). `js/api.js` keeps the
game's named endpoints on top of `StarHermit.api` (same-origin `/api`, Bearer, one renewal + retry on
401) and `js/net.js` takes its socket URLs from the SDK.

Uses: launch tokens (`#game_token=<jwt>[&session_id=]` library launch or `#access_token=<jwt>` sign-in
return, stripped from the URL; `game_scope` claim = slug; renewed by the SDK via
`POST /games/{slug}/launch-token`); sign-in (**SIGN IN WITH STARHERMIT** on the menu, only on
`<slug>.starhermit.com` without a token); profiles (nickname first with a `Player <id>` fallback,
avatars via `GET /users/{id}/avatar`); the share link (**INVITE A FRIEND** on the menu and **COPY
INVITE LINK** in the lobby copy `https://dashboard.starhermit.com/game-invite/<user>/<slug>`);
friends (`GET /me/friends`); Realtime Rooms (`/api/v1/realtime/rooms` create / get / mine / invites /
accept / decline / open / seats / quick-join / start / leave, and `ws/v1/realtime` for roster
pushes); the scripted-games runtime (`server=server.js`, `game.tickRateHz = 30`, gameplay through
`StarHermit.connect` on `ws/v1/games?sessionId=` with reconnect, `cmd` frames whose input carries
`realtime: true` in the payload and the envelope, `ctx.room`, `ctx.presence`, `ctx.inputs`, `result`,
`eloUpdates`, `playerStates`, `achievements`, `scores`, `game.replays = true`); an invite-accept launch's
`session_id` rejoins that match when its room is playing; leaderboards (`GET /games/{slug}` for
`leaderboardId` and `me`, `GET /leaderboards/{id}/entries`); achievements (`GET
/games/{slug}/achievements` on the **ACHIEVEMENTS** screen — the server-declared catalog with locked /
unlocked rows — plus the HUD banner on `achievement` frames); replays (`GET
/games/{slug}/replays/mine`, `/replays/{sessionId}`); sessions (`GET /games/{slug}/sessions/{id}` for
`chatConversationId`); chat REST (`/chat/conversations/{id}/messages`, polled every 5 s); voice rooms
and relay (`/voice/rooms`, `ws/v1/voice`); per-user control bindings (`GET/PUT/DELETE
/games/{slug}/controls`, applied at launch and edited on the CONTROLS screen); the per-player
settings KV (`graphics` — the Graphics settings object —, `muted`, `voice`; platform values are
applied at launch and every change is patched).

Every socket reconnect renews the launch token first (an expired token is refused before the
upgrade and looks like a plain 1006 drop): the games socket through `StarHermit.connect`, the voice
relay through `StarHermit.renewForReconnect()` before it re-joins and opens a URL built from the
current token; a transient renewal failure backs off without reopening the old URL. When renewal is
refused the SDK signs out: a live match ends back at the menu, voice hangs up, the menu drops to
offline practice, platform buttons hide, the status line says so and sign-in is offered again where
available. When the reason is an expired session a **SESSION EXPIRED** dialog explains that online
play stopped and offers **BACK TO STARHERMIT** (relaunches through the StarHermit launcher, or
sign-in for sign-in launches; if the browser refuses, the status line says to reopen the game from
the library) or **PLAY OFFLINE**. Account-surface strings (sign-in, invite, toasts, session-expired
dialog, achievements screen, the result card's leaderboard line) are localized in the nine locales (`js/platform-i18n.js`).

When StarHermit needs the player to accept updated terms (`StarHermit.connect`'s
`onTermsRequired`, or `renewForReconnect()` resolving `'terms-required'` for the voice relay) the
socket stops like auth loss: a live match ends back at the menu, voice hangs up, and an **UPDATED
TERMS** dialog offers **BACK TO STARHERMIT** (to review them) or **PLAY OFFLINE**. When the games
socket's session is gone, finished or on another build (`onUnavailable`) the reconnect loop ends,
the match closes and the status line says "This match is no longer available."

Settings → **Language** follows the account's preferred language under Automatic and saves an
explicit choice to `ui.language` (section 10). Settings → **Report a problem** (signed in only, from
`game-options.js`) files a bug report through `StarHermit.reportBug` with a small non-personal
`context.json` (language, viewport, pixel ratio, FPS cap, audio limit, path); uncaught errors are
filed as crash reports through `StarHermit.captureCrashes` (SDK-capped).

Does not use: the peer relay (`ws/v1/relay`), chat WebSocket, presence outside rooms,
host-submitted results (`POST /rooms/{id}/result`), platform matchmaking queues (quick play uses
Realtime Rooms quick-join), or cloud saves (the client keeps no progress of its own — ratings and
records live in the script's `playerStates`). Without a token the client is offline: PRACTICE only,
platform buttons disabled or hidden, and no request is made. Conventions follow
https://wiki.starhermit.com/ (relative `/api` and `/ws` paths, launch-token scope fencing, script
return contract).

## 13. Technical architecture

- **Determinism**: the sim is a pure function of `(state, inputs, dt)` with its RNG in
  state; the platform script rehydrates it each stateless invocation (`rehydrate`). The
  regression test round-trips `sessionState` through JSON every tick.
- **Online timeline**: snapshots (`snap`) ≥ 30 ms apart carry `ts`, `tick`, per-seat `ack`
  and 2-decimal arrays; the client stamps them on the server timeline, picks an interpolation
  delay of 55–140 ms from arrival jitter, extrapolates at most 120 ms, keeps 1.5 s of
  buffer, and reconciles a render-only predictor for its own footballer (blend 0.18, 0.06
  with unacknowledged input, snap on > 3 m error). Inputs older than 1 s are zeroed
  server-side. The games socket reconnects with 250 ms → 15 s backoff and re-syncs.
- **Intro hold**: the script freezes formation and clock for 13 s after session creation so
  the walkout and coin flip (12.5 s) cannot be played through by AI.
- **Persistence**: `localStorage` for mute, voice and graphics preferences; everything else lives on
  the platform (rooms, sessions, ratings, replays, control overrides).
- **Performance budget**: set by the graphics preset (section 8). Low — the Auto choice
  on software GL — uses a 1024² shadow map, half the crowd, pixel ratio 1 and no
  post-processing, which is cheaper than the pre-settings renderer (2048² shadows, full
  crowd, pixel ratio up to 2). Instanced seats and crowd (80 % of seat positions filled),
  fixed 60 Hz sim step with a 0.25 s accumulator cap. Snapshot size is
  ~0.5–3 KB; the archived session for a 2×3 min match stays under the 900-frame cap.
- **e2e**: `tests/e2e.mjs` serves the repo from an embedded static server (`PORT` env pins
  the port), launches headless Chrome on SwiftShader, and plays a full 1v1 practice match
  twice — desktop with real key presses, mobile with CDP touch events on the joystick and
  buttons — synchronising on the visible `#match-clock`. CDP exists only in Chromium; in
  other browsers the joystick-drag and held-shot bursts are skipped with a logged note and
  the mobile pass drives the match with taps (pass/tackle) instead.

## 14. Testing and acceptance criteria

`npm test` (`tests/server-regression.cjs`) loads `server.js` in a VM and asserts: the intro
hold keeps the clock at 0 and the formation frozen through stateless ticks; a full rated
match returns `result`, exact Elo values (1400 vs 1200), W/L/D increments, a finished
summary, replay frames every 15 ticks with the snapshot row shape, `kickoff` and `fulltime`
events, and a 4-seat roster; a 2×60 s match rates in the right direction; a forced 0–0 is a
rated draw; an abandoned match carries no ratings.

`tests/gfx.test.mjs` (`node --test`, part of `npm test`) covers the hardware level → preset
mapping (SwiftShader / `Radeon Graphics` / UHD → Low, Iris Xe → Balanced, GTX 1070 → High, RTX 4080 /
5090 → Ultra, phones and tablets Balanced at most), the per-preset budget table and its level scaling, `resolve` with Auto,
explicit presets, overrides, invalid tiers and the 50–200 % scale clamp, and `choosePreset`
clearing overrides. `tests/platform.test.mjs` (also in `npm test`) loads `js/api.js` and the
`js/net.js` game socket on the real SDK with a stubbed fetch / WebSocket: token read and URL
scrub, nickname, settings get / patch, controls, achievements, invite link, the quick-join 404
fallback, `sync` on open with snapshot / event / achievement routing and the realtime input
envelope, sign-out on refused renewal (sign-in offered again on the game's UUID host), the reconnect
renewing first (the mock answers the session check), pending terms consent ending the match socket
(`onTermsRequired`) and the voice relay (`terms` callback), a finished session ending the reconnect
loop (`onUnavailable`, no reopen), and zero requests standalone. `tests/i18n.test.mjs` checks that
every key in `index.html`, the modules' HTML literals and `T` / `N` calls exists in all nine locales
with intact placeholders, that no template text node mixes words with an interpolation, that the
locale follows `sh-language.js` and switches live, and that the Settings and account strings
(including the terms prompt) cover the nine locales.

`npm run test:e2e` asserts, at 1280×800 and 390×844: offline status text, QUICK PLAY /
CREATE LOBBY disabled and platform screens hidden, the voice toggle persists, SETTINGS opens
the Graphics panel with every control on screen, Auto reports Low on SwiftShader with the summary naming Level 0, Low then
High apply (`data-gfx-preset`, SMAA in the summary), a bloom override applies, both survive
a reload, choosing Ultra clears the override and renders cleanly, Low is chosen for the
match, the in-match ☰ menu opens Settings and returns to play, PRACTICE
starts (touch UI visible on mobile), the clock leaves 00:00 after the intro, the match
reaches 2nd 03:00, the result shows VICTORY / DEFEAT / DRAW with a score and possession, and
MAIN MENU returns; the offline passes must make no `/api` request. A signed-in pass (390×844,
`#game_token=` against mocked platform routes) checks the token left the URL, the nickname line,
sign-in hidden, the synced voice preference, INVITE A FRIEND copying the share link, the
ACHIEVEMENTS screen (one unlocked, one locked row), and the settings PATCH after toggling voice.
Two **Language** passes (1280×800 and 390×844 touch) launch signed in with
`GET /api/v1/me/language` answering `fr-CA`: the menu resolves to French and Settings shows
*Automatique — Français (Canada)*; choosing Italian re-renders the Settings title, Graphics heading
and menu in place (the shared select stays mounted) and saves `ui.language`; *Report a problem* posts
a bug report; German must fit the viewport in Settings, on the menu and in the in-match menu; a
1-a-side practice started in German, switched to French from ☰ → SETTINGS, keeps its clock running
and shows the French match menu and clock; Automatic returns to fr-CA. Screenshots go to `$SHOT_DIR`
(default `/tmp`). `E2E_PASSES=signed-in,language,desktop,mobile` (default: all) selects passes, so the
signed-in and Language passes can run without the two long match passes.
Any page error or console error (other than GPU noise) fails the run. On this box (software GL) a full run takes roughly 70 minutes (two
real 2×3 min matches at ≤ 0.1 s of sim per frame), so it is run on demand rather than in
every pass; the last full pass on the current build reached kick-off and played the first
half on desktop with zero page or console errors before it was stopped at the time budget.

QA bar (checkable): every button on every screen does something visible; no console errors
or warnings on load, in a practice match, or on the result screen; at 390×844 portrait and
844×390 landscape the score bar, ball arrow, power bar, joystick, three touch buttons, result
title and score and every primary button are fully visible; the first practice match teaches
shoot, pass, camera and the ball arrow through on-screen feedback without a manual.

The native client (section 16) is checked with `tsc -p engine` (TypeScript 5.9, `strict`,
`noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, no emit) against
`engine/starhermit.d.ts`, and `engine/tests/run.sh` (with `TSC` naming the compiler) compiles
`engine/src/logic` and its tests to a temporary directory and runs them with `node --test`: pose
math, snapshot parsing of `server.js`'s own broadcasts and recorded replays (past the intro hold),
interpolation and prediction, the follow camera and ball arrow, steering and the contextual shoot
control, the quality tiers' content from `js/gfx.js`, HUD and menu text, the lobby seat model, chat
pacing, voice falloff and pan, the built-in font's text fallback, and a 20 s AI practice on the
shared sim. `starhermit <repo> --check` validates the package and manifest and plays 120 frames
headless; the engine's ignored football probe (`STARHERMIT_FOOTBALL_DIR=<repo> cargo test --release
-p starhermit-runtime --features test-game football -- --ignored`, frames saved with
`STARHERMIT_RENDER_CHECK_PNG=<dir>`) boots to the menu, starts a practice match and plays it.

## 15. Asset inventory

| Asset | Path | Purpose | Source | Status |
|---|---|---|---|---|
| Cover art | `coverart.png` (1200×675) | Platform listing (`cover=`) | FLUX.2 klein, seed 4471, 1216×688, 32 steps | generated in this pass (replaced the placeholder) |
| Loading key art | `assets/keyart-night-stadium.webp` | `#loading` backdrop | same render, WebP q82 | generated in this pass, wired in `css/style.css` |
| BLUE crest | `assets/crest-blue.webp` (256²) | Score bar, lobby team head | FLUX.2 klein, seed 9021 | generated in this pass, wired in `index.html`, `lobby.js` |
| RED crest | `assets/crest-red.webp` (256²) | Score bar, lobby team head | FLUX.2 klein, seed 9022 | generated in this pass, wired |
| App icon / favicon | `icon.png`, `favicon.svg` | Platform icon, tab icon | hand-authored | shipped |
| SFX clips (18) | `sfx/*.opus` per section 9 | Event audio | MOSS-SoundEffect v2, 100 steps, seeds from the generator (sha256 of `football___<name>`) | generated in this pass, bound in `audio.js` with synth fallback |
| SFX manifests | `sfx/manifest.txt`, `sfx/manifest.json`, `sfx/manifest.md` | Canonical table, binding + prompts, generator output | this pass | shipped |
| Stadium, rig, ball, coin, stretcher | `js/world/*`, `match.js` | All 3D art | procedural | shipped |
| 3D model (TRELLIS) | — | — | not called for (see section 8) | n/a |
| Humanoid animation (Kimodo) | — | — | not called for: procedural rig; football kicks/dives are out of distribution | n/a |

The native client plays the same SFX clips (the engine decodes Ogg Opus) and shows the same WebP key
art (its loading screen) and crests (score bar, lobby); a shield in each club's colors drawn in code
stands in while a crest decodes or if it cannot be.

## 16. Native client (StarHermit runtime)

The same game runs natively as a **script game**: `starhermit <this directory>` (or a `.zip` of it)
runs it in the signed StarHermit runtime with no browser, and `cargo starhermit package --script`
(from the engine checkout) makes release archives. The client is TypeScript in `engine/src`, written
against host API v1 — `engine/starhermit.d.ts`, a copy of the runtime's
`crates/starhermit-runtime/api/starhermit.d.ts` with its source commit in the header — using only
the `starhermit:*` modules (no DOM, three.js, WebAudio, fetch or WebSocket). The browser client and
`server.js` are untouched; the native client shares the game's own data and logic where it is not
browser code:

- **One simulation, one set of strings, one quality model.** `server.js` loads into the game's
  realm with `starhermit:script`'s `loadClassic` (as the browser's classic script) and `sim.ts`
  only types `globalThis.FootballSim`; practice and the menu backdrop step it in `onFixedUpdate` at
  60 Hz, the browser's practice step (online play is the platform's 30 Hz). `js/i18n/strings.js` and `sh-language.js` load the same way, so every string with an
  English key in the browser's tables is translated natively too, and the language resolves as in
  section 10 (choice in the `ui.language` game setting → the account's language → the player's
  interface language, the device's for a guest → en-US), following preference changes live;
  `js/platform-i18n.js` (account strings) is imported as a module. `js/gfx.js` is imported as a
  module: the runtime's quality tier (its Options menu, `frame().quality`, the same four names)
  selects the game's preset content — shadow-map size and the opposite tower's second caster, grass
  and line texture sizes (the markings are one mirrored corner quarter, so Ultra's 4096 px fit the
  canvas bound), the detailed pitch with its mow-stripe normal map, crowd density and capsule LOD,
  Lambert stands, seats and crowd on Low, camera flashes and haze (points), the floodlit
  environment map (Reflections, intensity 0.35) and the post effects of `js/graphics.js` buildPost
  on the host's renderer: GTAO ambient occlusion on High (blend 0.7) and Ultra (0.85, 16 samples)
  at the budget's `aoRes`, with the sky, nets and light cones left out (`noAO`); bloom (0.55,
  radius 0.45, threshold 1.3) at `bloomRes`; the colour grade with its 0.26 vignette; and FXAA on
  Balanced, SMAA on High, MSAA on Low and Ultra — and changes apply live. The scene renders ACES filmic at exposure 1 with the browser's HDR emissives (lamps, LED
  boards, tunnel sign, flashes), the clearcoat ball and the gold coin. SETTINGS overrides the three
  categories that are the game's own content (pitch detail, crowd, flashes and haze) in the
  `graphics` game setting the browser also keeps. Render scale, adaptive resolution,
  frame-rate limits and the sound volumes and concurrent-sound limit are the runtime's own options
  and are not repeated in the game.
- **World and HUD.** Stadium, footballers, procedural animation (`logic/pose.ts` is
  `animator.js`'s math), name tags, officials, ball and coin are rebuilt on `starhermit:scene` with
  `starhermit:canvas` textures; light intensities are the browser's divided by π (the host's light
  convention); merged static meshes go through the host's geometry transforms. The crowd's sway
  and bounce (the browser's formula, an eighth of the crowd a frame as the browser moves it) and
  the haze's drift are `starhermit:world` kernels the runtime runs natively, and a tracked
  instance binding draws the crowd from its table, composing only the rows that moved; the script
  sets only their uniforms. The footballers' poses are `logic/pose.ts`'s blend and pose as kernels
  too (`world/rigMath.ts`, which the Node tests compare with `logic/pose.ts` number for number):
  each view writes its place and its entity's animation state to a row, the runtime poses every
  footballer, referee and medic and drives their joints through node bindings, and a footballer's
  joints are the meshes of their body parts (18 scene nodes, where the browser's joint groups make
  33). Camera flashes resend their colours only while one is lit, and the HUD keeps its strings and
  text widths until they change.
  The per-pixel grass and the ~20k
  instances are built a slice at a time whenever the running call's fuel runs low (a "Loading…"
  screen covers the first menu and each match; a stadium a mode lets go is kept for the next with the
  same pitch, so the menu's backdrop after full time, a 5-a-side match after the menu and the
  replay viewer show it again within a frame instead of building it again). The player's reduced-motion preference stills the
  floodlight flicker, camera flashes and haze, as `prefers-reduced-motion` does in the browser. The HUD (score bar with crests, clock, ball arrow
  clamped inside the window, power bar, banners, mouse hint, ☰ and mic buttons, chat lines) is
  drawn with `starhermit:draw`; menus, lobby, invites, controls, leaderboard, replays,
  achievements, result card, in-match menu, SETTINGS, confirmations, the replay bar and the chat
  field use the engine's UI (`starhermit:ui`), so they also work with the keyboard and a gamepad.
- **Audio.** `audio.js`'s graph on `starhermit:audio`: the authored clips from
  `sfx/manifest.json` decoded into graph buffers with the synthesiser as fallback per event, the
  synthesised crowd bed and stadium delays, UI clicks on the player's interface volume. The bed's
  level curve is scheduled again when the level moves by 0.002 (the browser reschedules it every
  frame). The game's mute (in-match SOUND, SETTINGS) is its `muted` setting.
- **Online.** `starhermit:platform`, which holds the player's credentials — no launch token,
  renewal or URLs. The flows are the browser's: rooms (create, quick join of any open room, open,
  start, seat, invite, accept, leave, mine) polled every 2 s, REJOIN MATCH / RETURN TO LOBBY, RANKED
  vs AI, the game socket's `sync` and input frames and `snap`/`ev` handling (an action edge a paced
  send drops rides the next one; a resumed socket drops prediction and resyncs), the room socket
  for roster pushes, nicknames and avatars, chat in the session's conversation, leaderboard,
  replays, achievements (read-only) and the result card's match-goals rank. Invite links come from
  the platform (`inviteLink()`) and copy with the press of INVITE A FRIEND or COPY INVITE LINK.
  Signed out, the menu is offline mode (Practice only) and SIGN IN WITH STARHERMIT opens the
  runtime's Account dialog. When the session ends, an online match ends at the menu; an expired or
  revoked session and updated terms show the SESSION EXPIRED / UPDATED TERMS prompt, whose BACK TO
  STARHERMIT opens that dialog, and signing out or playing on another device only says so. Bug
  reports carry the browser's small non-personal context. The game's settings (`ui.language`,
  `muted`, `voice`) are kept by the
  runtime on the device and in the account, the same keys the browser saves.
- **Controls.** The runtime's bindings of the seven actions (`control.*` keys, `engine.gamepad.*`
  pads), rebound in its Options menu: the CONTROLS screen lists every binding and its keycap
  buttons open that rebinding (also offline). Pad defaults: left stick and D-pad steer (tank-style,
  analog), West or the right trigger shoots (tap passes, hold charges), South passes, East tackles,
  the right stick turns the camera, Start opens the match menu. Mouse, T, M and Escape behave as on
  the web; touch uses the runtime's on-screen stick and TACKLE · PASS · SHOOT buttons when the
  player's primary pointer is coarse, and sprint strides vibrate the phone.
- **Voice.** The SDK's voice room for the session's conversation (open mic; the runtime asks for the
  microphone and shows its indicator); each speaker's volume and pan follow the two footballers'
  distance and side at 10 Hz (section 9's falloff).
- **Where it differs.** The floodlit environment is written as a latitude-longitude image of the
  browser's environment scene (`world/environment.ts`, the host has no render-to-texture); the
  detailed pitch keeps one grass texture at a time with its normal map (switching rebuilds it); text
  uses the system's fonts for the generic families, as the browser's CSS does, with the HUD's CSS
  sizes; the tunnel sign's stars are drawn as paths (★ depends on the system's fonts);
  SETTINGS keeps the game language, the game's mute, the quality line with its three content
  overrides and Report a problem; the Settings and
  Report-a-problem labels the browser keeps in `js/settings.js` and `game-options.js`, and text that
  exists only natively, are English; the ball arrow points toward the ball. What the host API
  still lacks is listed in `engine/HOST-API-GAPS.md`.

## 17. Known limitations

- Achievement names and descriptions come from the server script's declarations and stay English.
- Reduced motion only stills the ambient effects (flicker, flashes, haze); camera sway,
  crowd motion and banner pops always play.
- The canvas is created with MSAA, so the Anti-aliasing "Off" tier only removes
  anti-aliasing when the post-processing chain is running.
- `audio.setMuted` exists but no menu control calls it; mute can only be set via
  `localStorage`. Voice has a mic toggle; game sound does not.
- Ranked vs AI is never rated (one team has no humans) despite the button name.
- Online stats: the result card shows possession and shots only for practice; online results
  show the score alone (`stats` is `null`).
- The e2e run needs `/usr/bin/google-chrome` and, on software GL, tens of minutes per pass.
- Replay lists depend on `GET /replays/{sessionId}` per row to split teams correctly.
- Screen-reader users get no live announcements of goals or the clock.
- The native client (section 16) type-checks against the runtime's contract and its logic is
  tested under Node, but it has not run: the StarHermit runtime does not yet ship its script
  engine and host-API bindings.

### Design intent not yet implemented

- A SOUND toggle on the menu (bound to `audio.setMuted`) and `prefers-reduced-motion`
  handling that also stills the crowd sway, camera sprint FOV and banner animation.
- Show the crests on the result card and on the LED boards (a FLUX board strip would replace
  the procedural sponsor names).
- `aria-live` region mirroring HUD banners.
- Send `stats` in the full-time snapshot so online result cards match practice.

## Browser interference

`browser-guard.js` (loaded from `index.html`) suppresses browser UI that gets in the way of play: the right-click context menu, the iOS long-press callout, copy / cut / paste, and page text selection. Text fields (inputs, textareas, selects, contenteditable) keep normal selection, context menu and clipboard behaviour.


## Sound and frame-rate options

The options panel includes Sound controls for master, music, effects and UI volume, a mute that preserves volume levels, and an Auto or manual concurrent-sound limit (1–64). Changes apply immediately with perceptual volume curves. A shared allocator bounds Web Audio and media playback, including loops and scheduled sources. Graphics includes Auto display refresh or a custom maximum frame rate from 1–1000 FPS; rendering is paced independently of simulation and input. Preferences persist locally, with FPS stored per detected GPU, and reconcile with Starhermit settings when signed in. The controls support keyboard and touch input and the supported English, Spanish, German, French, Portuguese and Italian locales.
