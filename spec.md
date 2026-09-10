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
| Platforms | Desktop browsers (keyboard + mouse), phones and tablets (touch). Both orientations. |
| Rendering | three.js (vendored `vendor/three/`), WebGL, one `<canvas>` behind a DOM HUD and DOM screens. All stadium and character art is generated in code; authored assets are the cover art, the loading key art, two club crests and the SFX clips. |
| Authority | `server.js` is both the platform-side match script (Jint sandbox, 30 Hz) and, loaded as a classic `<script>`, the client's simulation core for practice and prediction. |

File map (everything shipped or run from this repository):

| Path | Responsibility |
|---|---|
| `index.html` | Shell: canvas, HUD, replay bar, touch controls, every DOM screen and dialog. Loads `server.js` then `js/main.js`. |
| `starhermit.txt` | Platform manifest: `name`, `launch=index.html`, `owner`, `server=server.js`, `control.*` default key bindings, `cover=coverart.png`. |
| `server.js` | Simulation core (`FootballSim`: pitch, players, ball, AI, injury ceremony) and the platform script (`game.createSession / onPlayerMessage / onTick`, Elo, achievements, replay recording). |
| `js/main.js` | Boot, renderer, screen state machine, match lifecycle, rejoin/leave prompts, token refresh, render loop. |
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
| `js/net.js` | WebSocket clients: rooms socket (roster/presence), games socket (inputs up, snapshots down, reconnect), voice relay socket. |
| `js/api.js` | Platform REST client: launch token, profiles, rooms, controls, sessions, leaderboards, replays, chat, voice. |
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
| `tests/server-regression.cjs`, `tests/e2e.mjs` | `npm test` rules regression; `npm run test:e2e` Playwright playthrough. |

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
| REJOIN MATCH / RETURN TO LOBBY | an active room on the server | Shown when `GET /rooms/mine` returns a room; rejoin skips the intro and resyncs from snapshots. |
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
resolves), `#leave-confirm` (Esc in an online match), `#confirm-dialog` (starting anything
while the server still has you in a room), `#hud`, `#touch-ui`, `#replay-ui`.

```
loading → menu ─┬─ practice ──────────────→ match ─→ result ─→ menu
                ├─ quick / lobby / ranked → lobby ─→ match ─→ result ─→ menu
                ├─ rejoin ────────────────→ lobby | match
                ├─ controls / leaderboard → back → menu
                └─ replays ─→ replay viewer ─→ replays
```

Layout: every screen is a centred flex column with `overflow-y: auto`, buttons
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

Motion: the follow camera is a critically damped lerp (`1 − e^(−6 dt)`), 13 m back and 7 m up,
15 m / 7.5 m and +4° FOV when sprinting; cinematic framing for walkout (crane from the
tunnel), coin flip (centre-circle close-up), ceremonies (touchline view) and full time
(slow orbit). Banners pop in with a 0.35 s scale-up. The crowd sways continuously and
pulses on goals, boos in place after a leaver. Floodlights flicker ±3 %. Reduced motion is
not currently honoured (see Known limitations).

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

The game ships in English only. Every string is a literal in `index.html`
(labels, buttons, hints) and in the JS modules (banners such as "GOAL!", "HALF TIME",
"BLUE KICKS OFF"; status lines; chat notices; achievement names in `server.js`). There is no
string table, no language detection and no `lang` switch; `<html lang="en">` is fixed. The
required nine locales (en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR, it-IT) are
not present — see Known limitations and Design intent. Layout already tolerates ~30 %
longer strings: buttons wrap inside `min(320px, 80vw)`, banners scale with `clamp()`, and
list rows ellipsise names.

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

Uses: launch tokens (`#game_token=`, `game_scope` claim = slug, reminted every 45 min via
`POST /games/{slug}/launch-token`); profiles (`GET /users/{id}/profile`, nickname first,
avatars via `GET /users/{id}/avatar`); friends (`GET /me/friends`); Realtime Rooms
(`/api/v1/realtime/rooms` create / get / mine / invites / accept / decline / open / seats /
quick-join / start / leave, and `ws/v1/realtime` for roster pushes); the scripted-games
runtime (`server=server.js`, `game.tickRateHz = 30`, `ws/v1/games?sessionId=`, `cmd`
frames with `realtime: true`, `ctx.room`, `ctx.presence`, `ctx.inputs`, `result`,
`eloUpdates`, `playerStates`, `achievements`, `game.replays = true`); leaderboards
(`GET /games/{slug}` for `leaderboardId` and `me`, `GET /leaderboards/{id}/entries`);
replays (`GET /games/{slug}/replays/mine`, `/replays/{sessionId}`); sessions
(`GET /games/{slug}/sessions/{id}` for `chatConversationId`); chat REST
(`/chat/conversations/{id}/messages`, polled every 5 s); voice rooms and relay
(`/voice/rooms`, `ws/v1/voice`); per-user control bindings
(`GET/PUT/DELETE /games/{slug}/controls`). Achievement unlocks arrive as
`{ type: 'achievement' }` frames and show as a HUD banner.

Does not use: the peer relay (`ws/v1/relay`), chat WebSocket, presence outside rooms,
host-submitted results (`POST /rooms/{id}/result`), or any platform storage beyond
`playerStates`. Without a token the client is offline: PRACTICE only, platform buttons
disabled or hidden. Conventions follow https://wiki.starhermit.com/ (relative `/api` and
`/ws` paths, launch-token scope fencing, script return contract).

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
- **Persistence**: `localStorage` for mute and voice preferences; everything else lives on
  the platform (rooms, sessions, ratings, replays, control overrides).
- **Performance budget**: one shadow-casting spot plus fills, instanced seats and crowd
  (80 % of seat positions filled), pixel ratio capped at 2 (desktop) / 1.5 (touch), fixed
  60 Hz sim step with a 0.25 s accumulator cap, no post-processing. Snapshot size is
  ~0.5–3 KB; the archived session for a 2×3 min match stays under the 900-frame cap.
- **e2e**: `tests/e2e.mjs` serves the repo from an embedded static server (`PORT` env pins
  the port), launches headless Chrome on SwiftShader, and plays a full 1v1 practice match
  twice — desktop with real key presses, mobile with CDP touch events on the joystick and
  buttons — synchronising on the visible `#match-clock`.

## 14. Testing and acceptance criteria

`npm test` (`tests/server-regression.cjs`) loads `server.js` in a VM and asserts: the intro
hold keeps the clock at 0 and the formation frozen through stateless ticks; a full rated
match returns `result`, exact Elo values (1400 vs 1200), W/L/D increments, a finished
summary, replay frames every 15 ticks with the snapshot row shape, `kickoff` and `fulltime`
events, and a 4-seat roster; a 2×60 s match rates in the right direction; a forced 0–0 is a
rated draw; an abandoned match carries no ratings.

`npm run test:e2e` asserts, at 1280×800 and 390×844: offline status text, QUICK PLAY /
CREATE LOBBY disabled and platform screens hidden, the voice toggle persists, PRACTICE
starts (touch UI visible on mobile), the clock leaves 00:00 after the intro, the match
reaches 2nd 03:00, the result shows VICTORY / DEFEAT / DRAW with a score and possession, and
MAIN MENU returns. Any page error or console error (other than GPU noise and offline `/api`
404s) fails the run. On this box (software GL) a full run takes roughly 70 minutes (two
real 2×3 min matches at ≤ 0.1 s of sim per frame), so it is run on demand rather than in
every pass; the last full pass on the current build reached kick-off and played the first
half on desktop with zero page or console errors before it was stopped at the time budget.

QA bar (checkable): every button on every screen does something visible; no console errors
or warnings on load, in a practice match, or on the result screen; at 390×844 portrait and
844×390 landscape the score bar, ball arrow, power bar, joystick, three touch buttons, result
title and score and every primary button are fully visible; the first practice match teaches
shoot, pass, camera and the ball arrow through on-screen feedback without a manual.

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

## 16. Known limitations

- No localisation: English-only literals (section 10).
- No reduced-motion mode; camera sway, crowd motion and banner pops always play.
- `audio.setMuted` exists but no menu control calls it; mute can only be set via
  `localStorage`. Voice has a mic toggle; game sound does not.
- Ranked vs AI is never rated (one team has no humans) despite the button name.
- Online stats: the result card shows possession and shots only for practice; online results
  show the score alone (`stats` is `null`).
- The e2e run needs `/usr/bin/google-chrome` and, on software GL, tens of minutes per pass.
- Replay lists depend on `GET /replays/{sessionId}` per row to split teams correctly.
- Screen-reader users get no live announcements of goals or the clock.

### Design intent not yet implemented

- Ship the nine locales through a string table with a locale picked from the launch
  token's profile or `navigator.language`.
- A SOUND toggle on the menu (bound to `audio.setMuted`) and `prefers-reduced-motion`
  handling that stills the crowd sway, camera sprint FOV and banner animation.
- Show the crests on the result card and on the LED boards (a FLUX board strip would replace
  the procedural sponsor names).
- `aria-live` region mirroring HUD banners.
- Send `stats` in the full-time snapshot so online result cards match practice.
