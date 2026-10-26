# StarHermit Football — Game Design Document (running spec)

Realtime 3D football (soccer): 1v1 up to 11v11, humans and AI on the same pitch, a night match
under floodlights. The game is a script game of the StarHermit runtime: the signed `starhermit`
runtime runs this repository (TypeScript in `engine/src` on its host API) on desktops and the
touch devices it supports, and the StarHermit platform hosts its online play through `server.js`.
This document describes the game as it ships today, in present tense. Anything the design wants
that the code does not yet do is listed once, at the end, under "Design intent not yet
implemented". The game also had a browser client (three.js, DOM screens); it was removed after
commit 80b94ff, where it can be recovered from history.

## 1. Overview

| | |
|---|---|
| Pitch | Arcade football with real physics: dribble, pass, charge a shot, slide tackle, dive. No fouls, no offside — just goals. |
| Genre | Realtime sports, server-authoritative multiplayer with offline practice. |
| Players | 2–22 seats (1–11 per side). Any seat a human does not take is an AI footballer with a name and a personality. |
| Session | One match = two halves of 3:00 match time (`halfLength` 180 s), plus ~12.5 s of walkout and coin flip and ~4.5 s of full-time celebration: about 7 minutes. |
| Platforms | The StarHermit runtime: keyboard and mouse, gamepads, and touch (the runtime's on-screen stick and buttons) where the player's primary pointer is coarse. |
| Rendering | The runtime's renderer through `starhermit:scene` (a three.js r176-model scene and post effects), ACES filmic tone mapping, quality presets (section 8, Graphics); the HUD is drawn with `starhermit:draw` and the screens are the runtime's UI (`starhermit:ui`). All stadium and character art is generated in code; authored assets are the cover art, the loading key art, two club crests and the SFX clips. |
| Authority | `server.js` is both the platform-side match script (Jint sandbox, 30 Hz) and, loaded as a classic script, the client's simulation core for practice, prediction and the menu's backdrop. |

File map (everything shipped or run from this repository):

| Path | Responsibility |
|---|---|
| `starhermit.txt` | Manifest: `name`, `description`, `owner`, `server=server.js`, `control.*` default key bindings, `cover=cover.jpg`, and the runtime's `engine.*` keys (`engine.api`, `engine.entry`, capabilities, gamepad defaults). |
| `server.js` | Simulation core (`FootballSim`: pitch, players, ball, AI, injury ceremony) and the platform script (`game.createSession / onPlayerMessage / onTick`, Elo, achievements, match-goals scores, replay recording). |
| `leaderboards.json` | The game's own leaderboard (`match-goals`), created by the owner tooling. |
| `sh-language.js` | The shared StarHermit language resolver (an unmodified copy of the platform's `tools/sh-language.js`), loaded as a classic script. |
| `engine/src/main.ts` | Boot, the screens state machine, the in-match menu, SETTINGS, the scene camera and the match lifecycle. |
| `engine/src/match.ts` | Match controller: world build, walkout → coin flip → play → done, practice stepping, online prediction and interpolation, events → audio, HUD and crowd. |
| `engine/src/menuScene.ts`, `replayView.ts` | The AI-vs-AI exhibition behind the menu; render-only 3D playback of an archived match. |
| `engine/src/sim.ts` | Types `globalThis.FootballSim` after loading `server.js`. No logic. |
| `engine/src/input.ts`, `logic/steering.ts` | The manifest's actions, tank steering, the contextual shoot control, pointer-lock mouse look, the touch layout and pad camera. |
| `engine/src/hud.ts`, `chat.ts`, `voice.ts`, `audio.ts` | Score bar, clock, ball arrow, power bar, banners and buttons; in-match chat; positional voice; the synthesis graph and authored clips. |
| `engine/src/net.ts`, `platform.ts` | The game and room sockets and the platform calls through `starhermit:platform`. |
| `engine/src/screens/` | Lobby, Controls, Leaderboard, Replays, Achievements and SETTINGS screens. |
| `engine/src/world/` | Stadium, footballer rig (`rig.ts`, `rigMath.ts`: the poses as world kernels), name tags, officials, ball and coin, kits, crests, the environment map. |
| `engine/src/logic/` | Pure, Node-tested parts: quality presets and budgets, translation tables, account strings, pose math, snapshot parsing and interpolation, prediction, camera, lobby model, text formats. |
| `engine/starhermit.d.ts`, `engine/tsconfig.json`, `engine/tests/`, `engine/HOST-API-GAPS.md` | The runtime's host-API contract (a copy), type checking, the Node tests (`run.sh`), what the host API still lacks. |
| `assets/` | `keyart-night-stadium.webp` (loading screen), `crest-blue.webp`, `crest-red.webp` (score bar and lobby). |
| `cover.jpg`, `coverart.png`, `icon.png` | Library cover (`cover=`), platform listing art and icon. |
| `sfx/` | 18 Opus clips, `manifest.txt` (canonical table), `manifest.json` (binding + generation prompts), `manifest.md` (generator output). |
| `tests/server-regression.cjs` | `npm test`: the match script's rules regression. |

## 2. Vision and design pillars

**Every seat is a footballer.** Whether a seat holds a human, a matchmade stranger or an AI,
it is one entity with one name plate, one kit number and the same physics. Rules in: AI seats
with names from a 30-name pool, personalities and formation roles; AI takeover of a
disconnected human within 5 s; a stretcher ceremony that visibly substitutes a leaver.
Rules out: invisible bots, empty positions, "AI difficulty" toggles that would make AI seats
play by different physics than humans.

**One code path decides the match.** The sim in `server.js` is the only place a ball moves.
The platform runs it at 30 Hz for online matches; the client runs the same file for practice
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
signed out; reconnect with backoff; AI stand-ins. Rules out: a match that waits for a
microphone permission or a failed REST call.

## 3. Player experience

Target player: someone who wants a quick pick-up football match with friends or strangers, with
enough physical feel to make a good goal feel earned, and who is happy to play a full 5v5 with AI
teammates when nobody else is around.

First 60 seconds (offline or online): the menu opens over a live AI-vs-AI match in the stadium,
so the game explains its own look before a button is pressed. Team size defaults to 5 per side.
PRACTICE vs AI starts a match immediately. The walkout (8 s) frames both teams leaving the
tunnel; the coin flip (4.5 s) shows the kick-off decision and the banner "BLUE KICKS OFF" /
"RED KICKS OFF". On desktop the bottom hint reads "CLICK THE PITCH FOR MOUSE CAMERA · LEFT
SHOOT · RIGHT PASS · MIDDLE TACKLE" until the mouse is captured; the CONTROLS screen lists every
binding. On touch, the joystick and three labelled buttons (TACKLE, PASS, SHOOT) are
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
(read from the platform's `match-goals` board), or "Score not posted to the leaderboard."

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
| PRACTICE vs AI | nothing | The shared sim stepped locally at a 60 Hz fixed step (`match.ts fixedStep`), you in seat 0 of BLUE, AI everywhere else. Unrated, no replay. Works signed out (offline mode). |
| QUICK PLAY | signed in | Quick-joins any open room of the game; with none, creates and opens one. 30 s fill window, AI backfill, then the platform starts the scripted session. |
| CREATE LOBBY | signed in | Creates a closed room; INVITE FRIENDS (friends list), COPY INVITE LINK (the platform's share link), host clicks empty seats to move themself, FIND MATCH opens the room and starts the 30 s countdown. |
| RANKED vs AI | signed in | A room with `aiPlayers = 2 × teamSize − 1` started at once: server-authoritative, rated only if both teams have humans (so in practice unrated), archived as a replay. |
| REJOIN MATCH / RETURN TO LOBBY | an active room on the server | Shown when the platform lists a room the player is still in; rejoin skips the intro and resyncs from snapshots. |
| LEADERBOARD | signed in | My rating and W/L/D; ranked entries, 20 per page, friends-only filter. |
| REPLAYS | signed in | Last 20 finished online matches; WATCH plays the archived 2 fps log with play/pause, seek and an orbiting ball camera. |
| ACHIEVEMENTS | signed in | The server-declared catalog with locked and unlocked rows. |
| CONTROLS | a keyboard or pad (not touch) | Lists every binding of the seven actions; its keycaps open the runtime's rebinding (offline too). |

Team size (1–11 per side, default 5) applies to every mode. Difficulty does not scale: AI
plays at `difficulty = 1` everywhere (`computeAiInput`), and the real curve is team size
(a 1v1 on a 40 m pitch is a duel; 11v11 on 112 m is positional). There are no unlocks; the
long-term progression is Elo, W/L/D and the five achievements.

## 6. Controls and interaction

The manifest's seven actions (`control.*` keys, `engine.gamepad.*` pads) are the runtime's
bindings; players rebind keys and pads in its Options menu (F1), which the CONTROLS screen opens.
Keyboard defaults:

| Action | Keys | Behaviour |
|---|---|---|
| Run forward / backpedal | W / S, ↑ / ↓ | Forward ramps to sprint automatically after 0.2 s held. |
| Turn left / right | A / D, ← / → | Rotates the footballer (tank steering), 3.2 rad/s. |
| Shoot / pass | Space, J | Tap (< 0.22 s) passes; hold charges the power bar at 1.4/s to full in ~0.7 s; release shoots (minimum power 0.15). |
| Pass | L | Dedicated pass. |
| Tackle / dive | K | Slide tackle; GK dive near own goal. |
| Mouse camera | click the pitch | Pointer lock: mouse turns the camera (0.0025 rad/px, height offset −2.2..5.5 m); left button shoots (hold to charge), right passes, middle tackles. Esc releases; a second Esc opens the match menu. |
| Chat / mic | T / M | T focuses the chat field (Enter sends, Esc closes); M toggles the mic (online, voice enabled). |

Gamepads: left stick and D-pad steer (tank-style, analog), West or the right trigger shoots (tap
passes, hold charges), South passes, East tackles, the right stick turns the camera, Start opens
the match menu. Touch (the player's primary pointer is coarse): the runtime's on-screen stick
bottom-left (camera-relative, full tilt sprints) and SHOOT (hold to charge), PASS and TACKLE
bottom-right; sprinting vibrates the phone once per stride.

Input locking: gameplay actions are only read while a match is live; a focused text field (the
chat) takes the keyboard and drops all held actions; the capture click for pointer lock never fires
a shot. Online, movement is sent at 30 Hz and pass/shoot/tackle edges are sent immediately (an edge
a paced send drops rides the next one); local kick feedback (thump, kick pose) plays on release and
the server's own `kick` event for that touch is suppressed for 1 s to avoid an echo.

## 7. Screens and UI flow

`main.ts` shows exactly one of: the menu, the lobby, Controls, Leaderboard, Replays,
Achievements, the result card, or none (match / replay). Overlays: the loading screen (until the
backdrop is built, and while a match loads), the in-match menu (Esc, ☰ or a pad's Start; it pauses
practice), SETTINGS (from the main menu or the in-match menu; it stacks above both), and the
confirmation dialog (starting anything while the server still has you in a room, the session
prompts).

```
loading → menu ─┬─ practice ──────────────→ match ─→ result ─→ menu
                ├─ quick / lobby / ranked → lobby ─→ match ─→ result ─→ menu
                ├─ rejoin ────────────────→ lobby | match
                ├─ controls / leaderboard / achievements → back → menu
                ├─ settings (also from the in-match menu) → back
                └─ replays ─→ replay viewer ─→ replays
```

Layout: the screens are centred columns of the runtime's UI over a dimmed view of the live stadium,
with 320-logical-pixel buttons, within the window's safe area, reachable with the keyboard, a pad or
touch. The HUD is drawn in logical pixels (16 to the rem) times the runtime's UI scale: the score bar
is top-centre at the safe-area top (10 px at least); the power bar, mouse hint and chat sit above the
safe-area bottom (and above the touch controls on touch); the ☰ and mic buttons sit at the top-right
inset. Must never be cut off: the score bar and clock, the ball arrow (kept inside the window and
above the touch controls), the power bar, the result title and score, and the primary button of
every screen. Below 480 logical pixels wide the score bar centres in the space left of the menu
button.

## 8. Art direction

"Football club professional" at night. The hero of every screen is the floodlit pitch:
the menu, the lobby and the result card are translucent panels over the live stadium.

Palette (from `hud.ts`, `main.ts`'s UI theme, `world/stadium.ts`, `world/kits.ts`):

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
masts with additive light cones; rounded-rectangle name plates. Typography: the system's `system-ui` and `sans-serif` faces; the logo is 800 weight with 0.12 em tracking and a green glow; screen titles and
buttons are uppercase with 0.08–0.15 em tracking; the clock uses tabular numerals.

Motion: the follow camera is a critically damped lerp (`1 − e^(−6 dt)`), 13 m back and 7 m up
(when it backs up over the west tunnel the tunnel fades to 15 % opacity so its roof never hides
the player), 15 m / 7.5 m and +4° FOV when sprinting; cinematic framing for walkout (crane from the
tunnel), coin flip (centre-circle close-up), ceremonies (touchline view) and full time
(slow orbit). Banners pop in with a 0.35 s scale-up. The crowd sways continuously and
pulses on goals, boos in place after a leaver. Floodlights flicker ±3 %. With the player's
reduced-motion preference the flicker, camera flashes and haze drift stop; the remaining
motion is listed in Known limitations.


**Graphics.** Lighting is one shadow-casting floodlight spot, three fill spots, a
hemisphere fill and a flat ambient term (three.js-model intensities divided by π, the host's
light convention), rendered with ACES filmic tone mapping into sRGB. The spot's shadow frustum is
fitted to the pitch plus a margin (focus, near and far computed from the pitch corners), so every
texel lands on the play area. Surfaces: the match ball is a clearcoated physical material; lamp
banks carry HDR glow sprites; LED boards and the tunnel sign are slightly over-driven so they still
read as lit after tone mapping; the gold coin shines with the environment. Effects: floodlight
shadows (1024²–4096²; at the top tier the opposite tower casts too, for the floodlit double shadow),
GTAO ambient occlusion (the sky dome, cones and nets are left out with `noAO`; sprites and points
never take part), bloom limited to lamps, camera flashes and hot highlights (threshold 1.3 in
linear HDR, above the lit pitch lines), a colour grade (a gentle S-curve, 1.12 saturation, cool
shadows and warm highlights) with a 0.26 vignette, FXAA/SMAA/MSAA, reflections from a
floodlit-stadium environment map (a latitude-longitude image of a small HDR scene — four lamp
banks, the LED ring, turf and night sky — prefiltered by the host, intensity 0.35), a detailed
pitch (turf variation, worn goalmouths and spots, a normal map whose mow bands lean opposite ways
so the stripes shift with the view angle, and blade grain; one grass texture at a time with its
normal map, rebuilt when the tier changes), crowd density (full, or an evenly spread half) and
particles (camera flashes in the stands that burst on goals, haze drifting in the beams).

The runtime's quality tier — its Options menu (F1), `frame().quality`, Auto by the runtime's own
GPU detection, which offers Ultra on capable GPUs — is the game's preset (`logic/quality.ts`).
SETTINGS overrides the three categories that are the game's own content (pitch detail, crowd,
flashes and haze) in the `graphics` game setting; render scale, adaptive resolution and frame-rate
limits are the runtime's own options. Changes apply live. Presets:

| Preset | Shadows | AO | Bloom | Grade | AA | Reflections | Detail | Crowd | Particles |
|---|---|---|---|---|---|---|---|---|---|
| Low | off | off | off | off | MSAA | off | plain | sparse | off |
| Balanced | 1024² | off | on | on | FXAA | on | detailed | full | on |
| High | 2048² | on | on | on | SMAA | on | detailed | full | on |
| Ultra | 4096² ×2 | high | on | on | MSAA ×4 | on | detailed | full | on |

The post effects run in three.js r176's `EffectComposer` order on the host's renderer: GTAO
(blend 0.7, radius 1.2, distance exponent 1.6, thickness 1.5, 8 samples on High; blend 0.85 and
16 samples on Ultra; Poisson denoise) at the budget's `aoRes`, bloom (strength 0.55, radius 0.45,
threshold 1.3) at its `bloomRes`, the grade, the output, then SMAA or FXAA; effects that are off
cost nothing.

**Per-preset budgets** (`BUDGETS` in `logic/quality.ts`; each tuned to hold 60 FPS on the weakest
GPU the preset is meant for — Low: phones and Intel UHD, Balanced: Iris Xe, High: a GTX 1070, Ultra:
an RTX 4080). Gameplay is identical on every preset.

| Preset | Crowd, seats, stands | Grass texture | Line texture | Spectators drawn (× Crowd tier) | Spectator capsule LOD | Camera flashes / haze | Bloom / GTAO resolution |
|---|---|---|---|---|---|---|---|
| Low | Lambert | 512 px | 1024 px | 60 % | 1 × 5 segments | 80 / 160 | ½ / ½ |
| Balanced | Standard | 1024 px | 2048 px | 80 % | 2 × 6 | 140 / 300 | ½ / ½ |
| High | Standard | 1024 px | 2048 px | 100 % | 3 × 8 | 220 / 480 | ½ / ½ |
| Ultra | Standard | 2048 px | 4096 px | 100 % | 4 × 12 | 300 / 700 | full / full |

Textures (the markings are one mirrored corner quarter, so Ultra's 4096 px fit the canvas bound),
capsule geometry, particle draw ranges and the Lambert twins of the stands, seats and crowd are
swapped live when the preset changes.

Visual assets the design calls for: cover art (16:9 night stadium, no text), loading key
art (the same image), one crest per team, the procedural stadium and rig. No 3D model or
humanoid animation asset is called for: the rig is code-generated and phase-driven, so a
Kimodo humanoid clip would be out of distribution for kicks, slides and dives, and a TRELLIS
hero prop has no home in a sport whose only prop is a sphere.


## 9. Audio direction

Mix (`audio.ts` on `starhermit:audio`'s graph): `master` → the game's output, with `sfxBus` (0.9,
dry: ball, body, whistle) and `crowdBus` (0.8, also feeding a two-tap feedback-delay stadium reverb
at 0.35 wet); UI clicks play on the player's interface volume. The crowd bed is six looped
band-passed noise voices with slow LFOs whose level follows `excitement^1.4 × 0.5`; excitement
eases toward `0.3 + 0.55 × danger`, where danger is how deep the ball is in either final 30 % of
the pitch (`match.ts updateAudio`), and the bed's level curve is scheduled again when it moves by
0.002. There is no music: the crowd is the score. The game's mute (the in-match menu's SOUND,
SETTINGS) is its `muted` game setting; the volumes and the concurrent-sound limit are the
runtime's Options. The runtime's mixer needs no gesture to start.

Authored clips (`sfx/*.opus`, 48 kHz mono Opus, −20 LUFS, MOSS-SoundEffect v2) are decoded into
graph buffers from `sfx/manifest.json`; each event plays its clip with per-call pitch (±4–10 %)
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

Voice chat (`voice.ts`): opt-out (the per-player game setting `voice`, the menu's checkbox); the
platform's voice room for the session's conversation (open mic; the runtime asks for the microphone
and shows its indicator); each speaker's volume and pan are recomputed at 10 Hz from the distance
between footballers (full within 4 m, silent beyond 55 m, squared falloff) and the direction
relative to my facing; M or the HUD button mutes.

## 10. Localization

Every player-facing string ships in nine locales: **en-US, en-GB, es-419, es-ES, de-DE, fr-FR,
fr-CA, pt-BR, it-IT**.

- **Tables.** English source strings are the keys (menu buttons keep the UPPERCASE style in every
  language). `engine/src/logic/strings.ts` holds rows of [English, es-419, de-DE, fr-FR, pt-BR,
  it-IT]; en-GB, es-ES and fr-CA list only their differences and otherwise fall back to en-US,
  es-419 and fr-FR. The account strings (sign-in, invite, session-expired and updated-terms
  prompts, achievements screen, leaderboard line) are `engine/src/logic/accountStrings.ts`.
  "StarHermit Football", player names, key names and the achievement names the server script
  declares stay as they are; the SETTINGS labels and text without a row stay English.
- **How it is applied.** Text goes through `T('…', vars)` (`engine/src/i18n.ts`) as each frame
  draws it, so a language change re-renders everything in place at once — menus, banners such as
  "{team} KICKS OFF", the match clock "1st {time}", status lines, lobby countdown and player
  counts; the local player's canvas name tag ("You") is redrawn in the new language. Banners already
  on screen finish in the language they were shown in.
- **SETTINGS → Language** (the menu's and the in-match menu's SETTINGS) offers **Automatic —
  <resolved language>** plus the nine locales by native name, with a status line (Saved to account /
  Saved on this device / Account sync unavailable), from the `sh-language.js` resolver's own
  strings.
- **Resolution** (`sh-language.js`): explicit game choice → for Automatic, the signed-in player's
  StarHermit language → the player's interface language (the device's for a guest) → en-US. Tags map
  to the nearest shipped locale (`es-MX → es-419`, `en-AU → en-GB`, `fr → fr-FR`, `pt-PT → pt-BR`).
  The choice (`auto` or a locale) is the per-player game setting `ui.language` (`{ choice }`), which
  the runtime keeps on the device and in the account; the game never writes the platform
  preference, and it follows preference changes live.

## 11. Accessibility

- Keyboard, pad and touch: every screen is the runtime's UI, which the keyboard, a pad and touch
  all drive (focus is visible); the match itself is fully playable on the
  keyboard or a pad (the mouse is optional).
- Captions: match events are shown as text banners (GOAL!, OWN GOAL!, HALF TIME, FULL TIME,
  INJURY — … CAN'T CONTINUE, … COMES ON / IS BACK, MATCH ABANDONED — DRAW) as well as heard.
- Contrast: `#eef2f5` on `rgba(10,14,20,0.82)` panels; muted text `#93a1b0` is used only for
  hints; name plates use white on team colour with a dark rim.
- Target sizes: the runtime's buttons; touch buttons 74 / 92 px; stick 132 px.
- Reduced motion (the player's preference) stills the floodlight flicker, camera flashes and haze.
- Screen-reader announcements of goals and the clock are not implemented (Known limitations).

## 12. StarHermit integration

All platform traffic goes through `starhermit:platform`, which holds the player's credentials: the
game sees no token, renewal or URL. Signed out, the menu is offline mode (Practice only) and **SIGN
IN WITH STARHERMIT** opens the runtime's Account dialog; signing in there brings the online modes. The line under the logo (offline mode, or who is signed in)
wraps at word breaks when it is wider than the window, as on a phone in portrait.

Uses: profiles (nickname first with a `Player <id>` fallback, avatars); the share link (**INVITE A
FRIEND** on the menu and **COPY INVITE LINK** in the lobby copy the platform's `inviteLink()`, which
friends the recipient and invites them back); friends (the lobby's INVITE FRIENDS list); Realtime Rooms (create / get / mine / invites /
accept / open / seats / quick-join / start / leave, polled every 2 s, and the room socket
for roster pushes, nicknames and AI flags); the scripted-games runtime (`server=server.js`,
`game.tickRateHz = 30`, gameplay through the game socket: `sync` on every (re)open, input frames up,
`snap` / `ev` / `achievement` frames down, `ctx.room`, `ctx.presence`, `ctx.inputs`, `result`,
`eloUpdates`, `playerStates`, `achievements`, `scores`, `game.replays = true`); leaderboards (my
rating and the ranked entries; the result card's match-goals rank); achievements (the
**ACHIEVEMENTS** screen and the HUD banner on `achievement` frames); replays (mine, and one
session's archived state); sessions (the session's chat conversation); chat (history and new
messages); voice rooms; the per-player game settings (`ui.language`, `muted`, `voice`, `graphics`),
kept by the runtime on the device and in the account; bug reports (SETTINGS → **Report a problem**,
signed in only, with a small non-personal context: language, window size and scale, quality tier,
entry).

When the session ends, an online match ends at the menu. An expired or revoked session shows the
**SESSION EXPIRED** prompt and pending terms the **UPDATED TERMS** prompt; their **BACK TO
STARHERMIT** opens the runtime's Account dialog and **PLAY OFFLINE** keeps practice; signing out or
playing on another device only says so. When the game socket's session is gone, finished or on
another build the match closes and the status line says "This match is no longer available."

Does not use: the peer relay, presence outside rooms, host-submitted results, platform
matchmaking queues (quick play uses Realtime Rooms quick-join), or cloud saves (the game keeps no
progress of its own — ratings and records live in the script's `playerStates`). Conventions follow
https://wiki.starhermit.com/ (script return contract, scope fencing).

## 13. Technical architecture

- **Determinism**: the sim is a pure function of `(state, inputs, dt)` with its RNG in
  state; the platform script rehydrates it each stateless invocation (`rehydrate`). The
  regression test round-trips `sessionState` through JSON every tick.
- **Online timeline**: snapshots (`snap`) ≥ 30 ms apart carry `ts`, `tick`, per-seat `ack`
  and 2-decimal arrays; the client stamps them on the server timeline, picks an interpolation
  delay of 55–140 ms from arrival jitter, extrapolates at most 120 ms, keeps 1.5 s of
  buffer (refilling dropped snapshots in place), and reconciles a render-only predictor for its own
  footballer (blend 0.18, 0.06 with unacknowledged input, snap on > 3 m error). Inputs older than
  1 s are zeroed server-side. The game socket resumes after outages and re-syncs.
- **Intro hold**: the script freezes formation and clock for 13 s after session creation so
  the walkout and coin flip (12.5 s) cannot be played through by AI.
- **Persistence**: the per-player game settings (`ui.language`, `muted`, `voice`, `graphics`),
  kept by the runtime on the device and in the account; everything else lives on the platform
  (rooms, sessions, ratings, replays).
- **Frame**: the runtime calls `onFixedUpdate` (practice and the backdrop step the sim at 60 Hz),
  `onUpdate` and `onRender`. Per-entity work runs natively as `starhermit:world` kernels after
  `onUpdate`: the crowd's sway and bounce (an eighth of the crowd a frame, through a sliced schedule
  and a tracked instance binding), the haze's drift (its table is the points' position attribute),
  and the footballers', referee's and medics' poses (`world/rigMath.ts`, `logic/pose.ts`'s math over
  a rigs table, driving the 18-node rigs through node bindings). The script's own frame is a few
  uniforms and a dozen numbers a footballer, the HUD (its strings and text widths kept until they
  change) and the camera.
- **Loading**: the stadium's per-pixel grass and the ~20k seat and crowd instances are built a
  slice at a time, an 8 ms share of each frame (`tasks.ts`), behind the "Loading…" screen of the
  first menu and each match; a stadium a mode lets go is kept for the next with the same pitch, so
  the menu's backdrop after full time, a 5-a-side match after the menu and the replay viewer show it
  again within a frame.
- **Performance budget**: set by the quality preset (section 8). Instanced seats and crowd (80 % of
  seat positions filled). Snapshot size is ~0.5–3 KB; the archived session for a 2×3 min match stays
  under the 900-frame cap. On an RTX 5090 desktop the game thread takes about 0.7 ms a frame at the
  median in a 5-a-side practice match (the engine's football probe).

## 14. Testing and acceptance criteria

`npm test` (`tests/server-regression.cjs`) loads `server.js` in a VM and asserts: the intro
hold keeps the clock at 0 and the formation frozen through stateless ticks; a full rated
match returns `result`, exact Elo values (1400 vs 1200), W/L/D increments, a finished
summary, replay frames every 15 ticks with the snapshot row shape, `kickoff` and `fulltime`
events, and a 4-seat roster; a 2×60 s match rates in the right direction; a forced 0–0 is a
rated draw; an abandoned match carries no ratings.

`tsc -p engine` (TypeScript 5.9, `strict`, `noUnusedLocals`, `noUnusedParameters`,
`exactOptionalPropertyTypes`, no emit) checks the client against `engine/starhermit.d.ts`, and
`engine/tests/run.sh` (`npm run test:engine`, with `TSC` naming the compiler) compiles
`engine/src/logic`, `world/rigMath.ts` and the tests to a temporary directory and runs them with
`node --test`: pose math and the pose kernels against it number for number, snapshot parsing of
`server.js`'s own broadcasts and recorded replays (past the intro hold) and their reuse,
interpolation and prediction, the follow camera and ball arrow, steering and the contextual shoot
control, the quality presets (every preset's tiers, budgets growing from Low to Ultra, the post
effects per preset), the translation tables against every key the client translates (all nine
locales, placeholders intact, no row the client does not show), the account strings and the
language resolver, HUD and menu text, the lobby seat model, chat pacing, voice falloff and pan, and
a 20 s AI practice on the shared sim.

`starhermit <repo> --check` validates the package and manifest and plays 120 frames headless;
`starhermit <repo> --render-check [--quality low|balanced|high|ultra] [--script FILE]` draws the game
offscreen (frames saved with `STARHERMIT_RENDER_CHECK_PNG=<dir>`); the engine's ignored football
probe (`STARHERMIT_FOOTBALL_DIR=<repo> cargo test --release -p starhermit-runtime --lib --
--exact script::football_probe::football_match --ignored --nocapture`) plays a whole practice match —
menu, walkout, kickoff, both halves, the result card — and fails on a game error, a warning or a
GPU failure, printing the game thread's frame times by phase.

QA bar (checkable): every button on every screen does something visible; no warnings or errors on
load, in a practice match, or on the result screen; in a portrait phone-sized and a landscape window
the score bar, ball arrow, power bar, touch controls, result title and score and every primary
button are fully visible; the first practice match teaches shoot, pass, camera and the ball arrow
through on-screen feedback without a manual.

## 15. Asset inventory

| Asset | Path | Purpose | Source | Status |
|---|---|---|---|---|
| Cover art | `coverart.png` (1200×675), `cover.jpg` | Platform listing and library cover (`cover=`) | FLUX.2 klein, seed 4471, 1216×688, 32 steps | shipped |
| Loading key art | `assets/keyart-night-stadium.webp` | Loading screen backdrop | same render, WebP q82 | shipped, `main.ts` |
| BLUE crest | `assets/crest-blue.webp` (256²) | Score bar, lobby team head | FLUX.2 klein, seed 9021 | shipped, `world/crest.ts` |
| RED crest | `assets/crest-red.webp` (256²) | Score bar, lobby team head | FLUX.2 klein, seed 9022 | shipped, `world/crest.ts` |
| App icon | `icon.png` | Platform icon | hand-authored | shipped |
| SFX clips (18) | `sfx/*.opus` per section 9 | Event audio | MOSS-SoundEffect v2, 100 steps, seeds from the generator (sha256 of `football___<name>`) | shipped, bound in `audio.ts` with synth fallback |
| SFX manifests | `sfx/manifest.txt`, `sfx/manifest.json`, `sfx/manifest.md` | Canonical table, binding + prompts, generator output | — | shipped |
| Stadium, rig, ball, coin, stretcher | `engine/src/world/*` | All 3D art | procedural | shipped |
| 3D model (TRELLIS) | — | — | not called for (see section 8) | n/a |
| Humanoid animation (Kimodo) | — | — | not called for: procedural rig; football kicks/dives are out of distribution | n/a |

A shield in each club's colors drawn in code stands in while a crest decodes or if it cannot be.

## 16. The client on the StarHermit runtime

`starhermit <this directory>` (or a `.zip` of it) runs the game in the signed StarHermit runtime,
and `cargo starhermit package --script` (from the engine checkout) makes release archives. The
client is TypeScript in `engine/src`, written against the host API — `engine/starhermit.d.ts`, a
copy of the runtime's `crates/starhermit-runtime/api/starhermit.d.ts` with its source commit in the
header — using only the `starhermit:*` modules:

- **One simulation.** `server.js` loads into the game's realm with `starhermit:script`'s
  `loadClassic`, and `sim.ts` only types `globalThis.FootballSim`; practice and the menu backdrop
  step it in `onFixedUpdate` at 60 Hz (online play is the platform's 30 Hz). `sh-language.js` loads
  the same way; the tables and account strings are modules (section 10).
- **World and HUD.** Stadium, footballers, procedural animation, name tags, officials, ball and coin
  are built on `starhermit:scene` with `starhermit:canvas` textures; merged static meshes go through
  the host's geometry transforms; per-entity motion runs as `starhermit:world` kernels with instance
  and node bindings (section 13); each footballer joint is the mesh of its body part (18 scene
  nodes). The HUD (score bar with crests, clock, ball arrow clamped inside the window, power bar,
  banners, mouse hint, ☰ and mic buttons, chat lines) is drawn with `starhermit:draw`; menus, lobby,
  invites, controls, leaderboard, replays, achievements, result card, in-match menu, SETTINGS,
  confirmations, the replay bar and the chat field use the runtime's UI (`starhermit:ui`). Text uses
  the system's fonts through the generic families; the tunnel sign's stars are drawn as paths.
- **SETTINGS** keeps the game language, the game's mute, the quality line with its three content
  overrides and Report a problem; the runtime's Options menu (F1) holds the graphics quality,
  render scale, frame-rate limits, the sound volumes and voice limit, the controls, and the account.
- **What the host API still lacks** is listed in `engine/HOST-API-GAPS.md`.

## 17. Known limitations

- Achievement names and descriptions come from the server script's declarations and stay English;
  so do the SETTINGS labels and text without a row in the tables.
- Reduced motion only stills the ambient effects (flicker, flashes, haze); camera sway,
  crowd motion and banner pops always play.
- Ranked vs AI is never rated (one team has no humans) despite the button name.
- Online stats: the result card shows possession and shots only for practice; online results
  show the score alone (`stats` is `null`).
- Replay lists depend on one replay request per row to split teams correctly.
- Screen-reader users get no live announcements of goals or the clock.

### Design intent not yet implemented

- Reduced motion that also stills the crowd sway, camera sprint FOV and banner animation.
- Show the crests on the result card and on the LED boards (a FLUX board strip would replace
  the procedural sponsor names).
- Live announcements mirroring HUD banners.
- Send `stats` in the full-time snapshot so online result cards match practice.
