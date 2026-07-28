// =============================================================================
// starhermit-football/server.js — the single authoritative match-server script
// for StarHermit Football, AND the shared simulation core for the browser
// client.
//
// The StarHermit platform uploads this file as the game's server script and
// executes it inside a sandboxed JS engine (Jint): a FRESH engine per
// invocation (the parsed script may be cached, but no JS state survives), no
// imports/modules, no Date / Math.random / setInterval. All persistent state
// round-trips through `sessionState` and must stay JSON-serializable (no
// functions, no class instances, no Infinity/NaN). The match RNG is stored as
// data ({seed, counter}) and rehydrated into a function on every invocation —
// rngNext(seed, counter) reproduces the mulberry32 stream exactly.
//
// The browser loads this SAME file as a classic <script> before the ES module
// graph; js/game/sim.js and js/game/ai.js are thin wrappers that re-export
// `globalThis.FootballSim`, so client and server run one code path.
//
// ── Host contract ───────────────────────────────────────────────────────────
// `globalThis.game` entry points; every one returns `sessionState` on success:
//
//   game.createSession(ctx)      -> { ok, sessionState, broadcast }
//   game.onPlayerMessage(ctx)    -> { ok, sessionState, broadcast }
//   game.onTick(ctx)             -> { ok, sessionState, broadcast, result? }
//
// Static declarations read once at publish time: `game.tickRateHz` (30) and
// `game.achievements` (the achievement catalog). A full-time return also
// carries `achievements: { "<userId>": [key, ...] }` for eligible humans.
//
// ctx = {
//   now:          ms since epoch (host clock)
//   random:       float in [0,1) supplied by the host per invocation
//   sessionId:    string
//   players:      [{ id, name, ai /*bool, present on the platform AI seat*/ }]
//   room:         { roomId, metadata,
//                   roster: [{ userId /*string|null*/, name, team /*0|1*/,
//                              slot, ai /*bool*/ }] }   // both teams, all seats
//   presence:     { "<userId>": { online: bool, left: bool } }
//   sessionState: object|null        // this script's session doc
//   playerStates: { [playerId]: object|null }
//   message:      { from, data } | undefined   // onPlayerMessage only
//   inputs:       [{ from, data }] | undefined // onTick only; realtime batch
// }
// room and presence are present on EVERY invocation of a room-bound session,
// createSession included; a standalone session (matchmaking, invite-accept,
// AI practice) has neither — createSession then seats ctx.players instead.
//
// Returning `result` ends the session:
//   full time:        { score: [a, b], winner: -1|0|1, draw: bool }
//   abandoned (all humans gone): { draw: true, score: [a, b] }
// A full-time return also carries ratings (skipped when either team has no
// humans, and never for an abandoned draw):
//   playerStates: { "<userId>": { elo, wins, losses, draws } }  // full docs
//   eloUpdates:   { "<userId>": newAbsoluteElo }  // platform leaderboard
// Ratings are standard Elo, K=32, on team averages over each team's humans;
// the same delta applies to every human on a team (min elo 100).
//
// sessionState = {
//   v: 1,
//   match:  <createMatch state; plus ceremony, aiPlans, rngState — see below>,
//   inputs: { "<playerId>": { seq, mx, mz, sprint, pass, shoot, tackle, at } },
//   seats:  { "<playerId>": { userId, name, standin, gone } },
//   lastTickNow, lastSnapAt, serverNow, // ms
//   tick,                               // authoritative simulation tick
//   offlineSince: { "<userId>": now },  // ms, offline-grace tracking
//   pendingCeremonies: [{ kind, playerId, inName }],
//   ended: bool,
//   goals: { "<playerId>": count },   // per-seat tally for achievements
//   playerDocs: { "<userId>": { elo, wins, losses, draws } },  // human seats
//   summary: { status: 'active'|'finished', moveCount },  // sessions/mine
//   replay: {                            // archived with the session as replay
//     v: 1, every: 15,                   // frame cadence (ticks; 2 fps @30 Hz)
//     teamSize, halfLength,
//     roster: [{ pid, team, name, ai }], // one entry per seat, pid order
//     frames: [{ t, sc, ph, b, pl }],    // b/pl mirror the snap layout exactly
//     evs: [{ t, ev }],                  // goal/halftime/kickoff/fulltime only
//     truncated: bool,                   // true once frames hit the 900 cap
//   },
// }
//
// ── Client -> server messages ───────────────────────────────────────────────
// { type:'input', realtime:true, seq, mx, mz, sprint, pass, shoot, tackle }
//   — send ~30 Hz; realtime:true opts into platform tick batching.
//   mx/mz: desired move direction, normalized (|m| <= 1), world space.
//   sprint: bool. pass/tackle: true on the triggering frame only.
//   shoot: 0, or release power in (0,1]. Inputs older than 1 s are zeroed.
// { type:'sync' } — a full snapshot is broadcast back to the sender only.
//
// ── Server -> client broadcasts ─────────────────────────────────────────────
// { type:'snap', ... } — full state snapshot, up to 30 Hz (>= 30 ms apart):
//   ts  server epoch ms       tick authoritative tick   ack input seqs by seat
//   t   match clock (s)       h   half (1|2)
//   ph  phase: 'play' | 'goal' | 'halftime' | 'injury' | 'end'
//   sc  [score0, score1]      kt  kickoffTeam
//   b   [x, y, z, vx, vy, vz, owner]       owner -1 = loose ball
//   pl  one entry per player, in id order:
//       [id, team, x, z, vx, vz, facing, anim, animSpeed, phase,
//        kickT, tackleT, stunT, diveT, diveDir, celebrateT, isAi(0|1), name, y]
//       (floats rounded to 2 decimals; anim is the animator's state string:
//        'idle'|'walk'|'run'|'sprint'|'kick'|'slide'|'dive'|'fallen'|
//        'celebrate'|'dejected')
//   cer null | ceremony serialization (see below)
//
// { type:'ev', ev } — one broadcast per sim event, in order. Physics/flow
//   events from the sim: kick {player,power,kind}, control {player},
//   steal {player,from}, tackle {player}, dive {player}, bounce {power},
//   woodwork {}, goal {team,scorer,score}, halftime {}, kickoff {team,half?},
//   restart {kind:'sideline'|'goalline',team,player}, fulltime {score,winner}.
//   Ceremony/session events:
//     { type:'injury-start',    player, name, kind:'leave'|'rejoin' }
//     { type:'referee-whistle', player }
//     { type:'stretcher-load',  player }
//     { type:'stretcher-off',   player, name }
//     { type:'substitution',    player, outName, inName, kind }
//     { type:'restart', kind:'drop-ball', x, z }
//     { type:'abandoned-draw' }   (all humans gone; result follows, session
//                                  ends and the platform closes the room)
//
// ── Ceremony model (sim phase 'injury') ─────────────────────────────────────
// When a human seat goes away (presence.left === true, or online === false
// for more than 5 s) the AI immediately takes over the seat and a ~10 s
// stretcher ceremony plays. When the human comes back (online && !left) the
// same ceremony runs with kind 'rejoin' and the human retakes the seat.
// Seats lost via explicit left:true are PERMANENTLY AI — no rejoin. While
// one ceremony runs, further triggers queue (pendingCeremonies) and play one
// at a time; triggers during 'goal'/'halftime' start when play resumes.
//
// There is exactly ONE player entity per seat: the entity itself is carried
// off on the stretcher, then the SAME entity runs back on from the tunnel as
// the replacement. Its `name` in the snapshot switches to the replacement
// identity when the stretcher reaches the tunnel (t≈7); `isAi` flips at
// trigger time (the AI must steer the seat immediately). Announce name
// changes from the 'substitution' event (outName/inName), not the snapshot.
//
// snap.cer = {
//   k: 'leave'|'rejoin', t: seconds, v: victimId, vn: victimName,
//   rn: replacementName, sp: [x, z] (injury spot),
//   ref: [x, z, facing, anim, animSpeed, phase],      // virtual referee
//   ca:  [[...], [...]],                              // two carriers, same layout
//   st:  [x, z, angle, bedHeight],                    // stretcher
// }
// Virtual entities use the same anim conventions as players (walk/run with
// animSpeed + accumulating phase so legs animate). Carriers additionally use
// 'carryB'/'carryF' (rear/front rail grip) and 'crouch' (set-down / lift).
//
// Timeline (t in seconds; the referee runs at 5.4 m/s, the crew hustles at
// 6.0 m/s with an empty stretcher and 5.5 m/s loaded — carry deadlines scale
// with the actual distance so the crew never sprints absurdly):
//   0           victim falls at the spot ('injury-start'), ball owner cleared
//   0.5–2.5     referee runs in from the +z touchline -> 'referee-whistle'
//   2.5–…       carriers walk in from the near touchline carrying the
//               stretcher (arrival = distance / 6.0)
//   +1.4        crouch + set down, 'stretcher-load' (victim slaves to the
//               stretcher at bed height), crouch + lift back to carry height
//   …           stretcher carried to the west tunnel (x = -L/2 - 6, z = 0,
//               the walkout tunnel) at 5.5 m/s
//   +2.1        crouch + set down -> 'stretcher-off'; victim entity teleports
//               to the tunnel mouth and takes the replacement identity (name);
//               crew lifts the empty stretcher and carries it into the tunnel
//   meanwhile   replacement runs from the tunnel to its formation anchor;
//               'substitution' fires when it crosses onto the pitch; the
//               referee jogs back off from t=8.5
//   end         ceremony ends: dropped-ball restart at the spot (ball
//               stationary, no owner, both teams may play it), phase 'play'.
// During the ceremony the match clock is paused, the ball decelerates to a
// stop (no pickups), and all other players ease to idle — nobody chases.
// =============================================================================
'use strict';

// ---------------------------------------------------------------------------
// Part 1 — simulation core (ported from js/game/sim.js; keep behavior in sync)
// Units: meters, seconds. Pitch centered on origin: x in [-L/2, L/2] (goals at
// each end), z in [-W/2, W/2]. Team 0 attacks +x in half 1; sides swap at half
// time.
// ---------------------------------------------------------------------------

var WALK_SPEED = 2.1;
var RUN_SPEED = 5.4;
var SPRINT_SPEED = 7.4;
var BALL_SLOWDOWN = 0.88;      // dribbling pace factor
var CONTROL_RADIUS = 0.95;     // gain possession distance
var STEAL_RADIUS = 0.62;       // proximity poke distance
var TACKLE_RANGE = 1.5;
var GRAVITY = -21;             // arcade gravity (snappier arcs)
var BALL_R = 0.11;
var RESTITUTION = 0.55;
var AI_NAME_POOL = [
  'Rafa Vento', 'Moss Kante', 'Theo Brandt', 'Iko Sarr', 'Dario Pell',
  'Nico Falke', 'Bram Okafor', 'Luca Reyes', 'Jori Lindqvist', 'Emre Kaya',
  'Silas Mota', 'Anton Weiss', 'Kofi Mensah', 'Pavel Drozd', 'Marco Ruiz',
  'Elias Nord', 'Tariq Aziz', 'Owen Clarke', 'Yuto Sana', 'Gabriel Fonseca',
  'Viktor Halme', 'Sacha Diallo', 'Rory Quinn', 'Mateo Vidal', 'Jonas Berg',
  'Cole Ashford', 'Ilya Sorin', 'Tomás Rocha', 'Felix Grau', 'Andi Prata',
];

var nextAiNameIdx = 0;
function takeAiName(rng) {
  var i = Math.floor((rng ? rng() : Math.random()) * AI_NAME_POOL.length);
  nextAiNameIdx = (i + 1) % AI_NAME_POOL.length;
  return AI_NAME_POOL[i];
}

// ── Pitch / formation helpers ────────────────────────────────────────────────

function pitchFor(teamSize) {
  var L = 40 + (teamSize - 1) * 7.2;            // 40 m (1v1) … 112 m (11v11)
  var W = L * 0.62;
  // Goals scale with pitch width but never below futsal size (3 x 2 m) so a
  // ~1.85 m player always fits under the bar; full-size pitches get the
  // regulation 7.32 x 2.44 m frame.
  var goalW = Math.min(7.32, Math.max(3.0, 7.32 * (W / 68)));
  var goalH = Math.min(2.44, Math.max(2.0, goalW / 3));
  var boxD = L * 0.14, boxW = W * 0.55;         // penalty box depth/width
  return { L: L, W: W, goalW: goalW, goalH: goalH, boxD: boxD, boxW: boxW };
}

// Role for a formation slot: slot 0 is GK, then defenders, midfield, forwards.
function roleForSlot(slot, teamSize) {
  if (teamSize === 1) return 'FW';
  if (slot === 0) return 'GK';
  var f = slot / (teamSize - 1);
  if (f < 0.45) return 'DF';
  if (f < 0.8) return 'MF';
  return 'FW';
}

// Base formation anchor (normalized: u in [-0.5,0.5] along length toward own
// goal = -, v in [-0.5,0.5] across width), in the team's own attacking frame.
function formationAnchor(slot, teamSize) {
  if (teamSize === 1) return { u: -0.05, v: 0 };
  var role = roleForSlot(slot, teamSize);
  if (role === 'GK') return { u: -0.47, v: 0 };
  // Spread players within their line.
  var lineMates = [];
  for (var i = 0; i < teamSize; i++) if (roleForSlot(i, teamSize) === role) lineMates.push(i);
  var idx = lineMates.indexOf(slot);
  var n = lineMates.length;
  var v = n === 1 ? 0 : -0.38 + (0.76 * idx) / (n - 1);
  var u = role === 'DF' ? -0.28 : role === 'MF' ? -0.05 : 0.22;
  return { u: u, v: v };
}

// Deterministic per-match RNG (mulberry32), stored as {seed, counter} so the
// stream can be rehydrated in O(1) after a JSON round-trip: call n uses
// a = seed + n*0x6D2B79F5 (mod 2^32), exactly like the running-a formulation.
function rngNext(rs) {
  rs.counter = (rs.counter + 1) >>> 0;
  var a = (rs.seed + Math.imul(rs.counter, 0x6D2B79F5)) | 0;
  var t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function makeRng(seed) {
  var rs = { seed: seed >>> 0, counter: 0 };
  return function () { return rngNext(rs); };
}

// Reattach the rng function to a match state that survived a JSON round-trip.
function attachRng(state) {
  var rs = state.rngState;
  state.rng = function () { return rngNext(rs); };
}

// ── Match creation ───────────────────────────────────────────────────────────

// roster: [{ userId|null, name, isAi, personality? }] length = teamSize*2,
// first teamSize entries are team 0 (home), rest team 1 (away).
function createMatch(opts) {
  var teamSize = opts.teamSize, roster = opts.roster;
  var seed = opts.seed == null ? 1234 : opts.seed;
  var halfLength = opts.halfLength == null ? 180 : opts.halfLength;
  var rngState = { seed: seed >>> 0, counter: 0 };
  var rng = function () { return rngNext(rngState); };
  var pitch = pitchFor(teamSize);
  var players = [];
  for (var t = 0; t < 2; t++) {
    for (var s = 0; s < teamSize; s++) {
      var i = t * teamSize + s;
      var r = roster[i] || { name: takeAiName(rng), isAi: true, userId: null };
      players.push({
        id: i, team: t, slot: s, role: roleForSlot(s, teamSize),
        userId: r.userId != null ? r.userId : null, name: r.name, isAi: !!r.isAi,
        personality: r.personality || makePersonality(rng),
        x: 0, z: 0, vx: 0, vz: 0, facing: t === 0 ? 0 : Math.PI,
        anim: 'idle', animSpeed: 0, phase: rng() * 6.28,
        kickT: 0, tackleT: 0, stunT: 0, diveT: 0, diveDir: 0,
        celebrateT: 0, dejectedT: 0,
      });
    }
  }
  var state = {
    teamSize: teamSize, pitch: pitch, halfLength: halfLength,
    rngState: rngState, rng: null,
    aiPlans: {},               // per-player AI decision cache (JSON-safe)
    players: players,
    ball: { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTouch: null },
    phase: 'play',           // 'play' | 'goal' | 'halftime' | 'injury' | 'end'
    phaseT: 0,
    half: 1, time: 0,
    score: [0, 0],
    kickoffTeam: 0,
    ceremony: null,          // active injury/substitution ceremony (JSON-safe)
    events: [],
    stats: { shots: [0, 0], possession: [0, 0] },
  };
  attachRng(state); // state.rng continues the same stream used above
  resetKickoff(state, 0);
  return state;
}

function makePersonality(rng) {
  var r = rng || Math.random;
  return {
    aggression: 0.3 + r() * 0.7,
    positioning: 0.3 + r() * 0.7,
    dribbling: 0.3 + r() * 0.7,
    passing: 0.3 + r() * 0.7,
    workRate: 0.4 + r() * 0.6,
  };
}

// Place both teams at formation anchors; ball at center with kickoff team.
function resetKickoff(state, kickoffTeam) {
  var pitch = state.pitch, teamSize = state.teamSize;
  state.kickoffTeam = kickoffTeam;
  for (var pi = 0; pi < state.players.length; pi++) {
    var p = state.players[pi];
    var a = formationAnchor(p.slot, teamSize);
    p.x = a.u * pitch.L * -attackSign(state, p.team);
    p.z = a.v * pitch.W;
    if (p.team === kickoffTeam && p.role === 'FW') {
      // two forwards near the center spot
      p.x = -attackSign(state, p.team) * (p.slot % 2 === 0 ? 0.5 : 1.6);
      p.z = p.slot % 2 === 0 ? 0.3 : -0.9;
    }
    p.vx = p.vz = 0; p.stunT = 0; p.tackleT = 0; p.kickT = 0; p.diveT = 0;
    p.facing = attackSign(state, p.team) > 0 ? 0 : Math.PI;
    p.anim = 'idle'; p.celebrateT = 0; p.dejectedT = 0;
  }
  state.ball.x = 0; state.ball.y = BALL_R; state.ball.z = 0;
  state.ball.vx = 0; state.ball.vy = 0; state.ball.vz = 0;
  state.ball.owner = null; state.ball.lastTouch = null;
}

// +1 if the team attacks toward +x this half.
function attackSign(state, team) {
  var base = team === 0 ? 1 : -1;
  return state.half === 1 ? base : -base;
}

// ── Input shape ──────────────────────────────────────────────────────────────
// { mx, mz }  desired move direction, normalized, world space (≤ 1 magnitude)
//             — legacy mode (AI, touch joystick)
// turn, fwd   steering mode (desktop): turn ∈ [-1,1] rotates the player,
//             fwd ∈ [-1,1] runs forward/back along the facing; both null in
//             legacy mode
// sprint      bool
// pass        true on the frame a pass is triggered
// shoot       0, or release power in (0,1]
// tackle      true on the frame a tackle/dive is triggered

var EMPTY_INPUT = { mx: 0, mz: 0, sprint: false, pass: false, shoot: 0, tackle: false };
function emptyInput() { return { mx: 0, mz: 0, sprint: false, pass: false, shoot: 0, tackle: false }; }

// ── Main step ────────────────────────────────────────────────────────────────

function stepMatch(state, inputs, dt) {
  state.events.length = 0;
  dt = Math.min(dt, 0.05);

  if (state.phase === 'goal' || state.phase === 'halftime') {
    state.phaseT -= dt;
    // players celebrate (or hang their head after an own goal) / walk back
    for (var gi = 0; gi < state.players.length; gi++) {
      var gp = state.players[gi];
      if (gp.dejectedT > 0) { gp.dejectedT -= dt; gp.anim = 'dejected'; }
      else if (gp.celebrateT > 0) { gp.celebrateT -= dt; gp.anim = 'celebrate'; }
      else gp.anim = Math.abs(gp.vx) + Math.abs(gp.vz) > 0.5 ? 'walk' : 'idle';
    }
    if (state.phase === 'goal' && state.phaseT <= 0) {
      if (state.time >= state.halfLength && state.half === 1) {
        state.phase = 'halftime'; state.phaseT = 4;
        push(state, { type: 'halftime' });
      } else if (state.time >= state.halfLength * 2 && state.half === 2) {
        endMatch(state);
      } else {
        state.phase = 'play';
        // The team that conceded kicks off.
        resetKickoff(state, 1 - state.lastScoredTeam);
        push(state, { type: 'kickoff', team: state.kickoffTeam });
      }
    } else if (state.phase === 'halftime' && state.phaseT <= 0) {
      state.half = 2;
      state.phase = 'play';
      resetKickoff(state, 1 - state.kickoffTeam);
      push(state, { type: 'kickoff', team: state.kickoffTeam, half: 2 });
    }
    return state.events;
  }

  if (state.phase === 'end') return state.events;

  // Injury/substitution ceremony: play frozen, clock paused, driven below.
  if (state.phase === 'injury') {
    if (state.ceremony) stepCeremony(state, dt);
    else state.phase = 'play'; // corrupt-state guard: never get stuck
    return state.events;
  }

  state.time += dt;

  // match clock
  if (state.half === 1 && state.time >= state.halfLength && !ballInPlayDanger(state)) {
    state.phase = 'halftime'; state.phaseT = 4;
    push(state, { type: 'halftime' });
    return state.events;
  }
  if (state.half === 2 && state.time >= state.halfLength * 2 && !ballInPlayDanger(state)) {
    endMatch(state);
    return state.events;
  }

  for (var i = 0; i < state.players.length; i++) {
    var p = state.players[i];
    var input = inputs.get(p.id) || EMPTY_INPUT;
    stepPlayer(state, p, input, dt);
  }
  stepBall(state, dt);

  // possession stat
  if (state.ball.owner != null) state.stats.possession[state.players[state.ball.owner].team] += dt;

  return state.events;
}

function ballInPlayDanger(state) {
  // don't blow the whistle while a shot is flying at goal
  var b = state.ball;
  var spd = Math.hypot(b.vx, b.vz);
  return b.owner == null && spd > 9;
}

function endMatch(state) {
  state.phase = 'end';
  var winner = state.score[0] === state.score[1] ? -1 : (state.score[0] > state.score[1] ? 0 : 1);
  for (var i = 0; i < state.players.length; i++) {
    var p = state.players[i];
    p.anim = winner === -1 ? 'idle' : (p.team === winner ? 'celebrate' : 'dejected');
    if (p.team === winner) p.celebrateT = 5;
  }
  push(state, { type: 'fulltime', score: [state.score[0], state.score[1]], winner: winner });
}

function push(state, ev) { state.events.push(ev); }

// ── Players ──────────────────────────────────────────────────────────────────

var TURN_RATE = 3.2; // rad/s for steering-mode inputs (turn/fwd)

function stepPlayer(state, p, input, dt) {
  var b = state.ball;
  var hasBall = b.owner === p.id;

  if (p.stunT > 0) {
    p.stunT -= dt;
    p.vx *= 0.86; p.vz *= 0.86;
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.anim = p.diveT > 0 ? 'dive' : 'fallen';
    p.animSpeed = 0;
    if (p.diveT > 0) p.diveT -= dt;
    clampToPitch(state, p);
    return;
  }

  // Two input modes: legacy { mx, mz } world-space direction (AI, touch), and
  // steering { turn, fwd } (desktop keyboard) where left/right rotate the
  // player in place and up/down run forward/back along the facing.
  var steer = input.turn != null;
  var mag, nx, nz;
  if (steer) {
    var nf = p.facing + clamp(input.turn, -1, 1) * TURN_RATE * dt;
    p.facing = Math.atan2(Math.sin(nf), Math.cos(nf));
    var f = clamp(Number(input.fwd) || 0, -1, 1);
    mag = Math.abs(f);
    nx = Math.cos(p.facing) * (f < 0 ? -1 : 1);
    nz = Math.sin(p.facing) * (f < 0 ? -1 : 1);
  } else {
    mag = Math.hypot(input.mx, input.mz);
    nx = mag > 0.01 ? input.mx / mag : 0;
    nz = mag > 0.01 ? input.mz / mag : 0;
  }

  // target speed
  var speed = 0;
  if (mag > 0.01) {
    speed = input.sprint ? SPRINT_SPEED : (mag > 0.45 ? RUN_SPEED : WALK_SPEED);
    if (steer && input.fwd < 0) speed = WALK_SPEED * 0.9; // backpedal
    speed *= Math.min(1, mag * 1.6);
    if (hasBall) speed *= BALL_SLOWDOWN;
  }

  // acceleration
  var accel = 22;
  var tx = nx * speed, tz = nz * speed;
  p.vx += clamp(tx - p.vx, -accel * dt, accel * dt);
  p.vz += clamp(tz - p.vz, -accel * dt, accel * dt);

  // tackle lunge
  if (input.tackle && p.tackleT <= 0 && p.kickT <= 0) {
    p.tackleT = 0.45;
    var face = steer ? p.facing : (mag > 0.01 ? Math.atan2(nz, nx) : p.facing);
    if (p.role === 'GK' && nearOwnGoal(state, p)) {
      p.diveT = 0.6; p.diveDir = face;
      p.stunT = 0.6;
      p.vx = Math.cos(face) * 7; p.vz = Math.sin(face) * 7;
      push(state, { type: 'dive', player: p.id });
    } else {
      p.vx += Math.cos(face) * 4.5; p.vz += Math.sin(face) * 4.5;
      push(state, { type: 'tackle', player: p.id });
    }
  }
  if (p.tackleT > 0) {
    p.tackleT -= dt;
    // tackle connect: dispossess owner in range
    var owner = b.owner != null ? state.players[b.owner] : null;
    if (owner && owner.team !== p.team && dist(p, owner) < TACKLE_RANGE) {
      looseBall(state, p, 3.2);
      push(state, { type: 'steal', player: p.id, from: owner.id });
      p.tackleT = 0;
      p.stunT = 0.35; // slide recovery
    } else if (p.tackleT <= 0 && !nearBall(state, p, 2)) {
      p.stunT = 0.55; // whiffed
    }
  }

  p.x += p.vx * dt;
  p.z += p.vz * dt;
  clampToPitch(state, p);

  // facing: steering inputs own the facing directly; legacy inputs face
  // toward movement, else toward the ball
  var spd = Math.hypot(p.vx, p.vz);
  if (!steer) {
    if (spd > 0.4) p.facing = Math.atan2(p.vz, p.vx);
    else p.facing = turnToward(p.facing, Math.atan2(b.z - p.z, b.x - p.x), 6 * dt);
  }

  // kicking
  if (hasBall && p.kickT <= 0) {
    if (input.shoot > 0) { doShoot(state, p, input.shoot); }
    else if (input.pass) { doPass(state, p); }
  }
  if (p.kickT > 0) p.kickT -= dt;

  // anim state
  if (p.tackleT > 0) p.anim = 'slide';
  else if (p.kickT > 0.18) p.anim = 'kick';
  else if (spd > SPRINT_SPEED * 0.75) p.anim = 'sprint';
  else if (spd > WALK_SPEED + 0.4) p.anim = 'run';
  else if (spd > 0.4) p.anim = 'walk';
  else p.anim = 'idle';
  p.animSpeed = spd;
  p.phase += dt * (2.2 + spd * 1.55);
}

function clampToPitch(state, p) {
  var L = state.pitch.L, W = state.pitch.W;
  var m = 1.5; // may step just off the pitch
  p.x = clamp(p.x, -L / 2 - m, L / 2 + m);
  p.z = clamp(p.z, -W / 2 - m, W / 2 + m);
}

function nearOwnGoal(state, p) {
  var gx = -attackSign(state, p.team) * state.pitch.L / 2;
  return Math.abs(p.x - gx) < state.pitch.L * 0.2;
}

function nearBall(state, p, r) {
  var b = state.ball;
  return Math.hypot(b.x - p.x, b.z - p.z) < r;
}

// ── Ball actions ─────────────────────────────────────────────────────────────

function doShoot(state, p, power) {
  var b = state.ball;
  var gx = attackSign(state, p.team) * state.pitch.L / 2;

  // A shot primarily follows the footballer's facing. Add only a 10% assist
  // toward a random point inside the goal, so players must actually line up
  // their body instead of every release being magnetised onto the goal mouth.
  var aimZ = (state.rng() - 0.5) * state.pitch.goalW * 0.9;
  var aimY = BALL_R + state.rng() * Math.max(0, state.pitch.goalH - BALL_R) * 0.9;
  var goalDx = gx - p.x, goalDz = aimZ - p.z;
  var goalDist = Math.hypot(goalDx, goalDz) || 1;
  var dx = Math.cos(p.facing) * 0.9 + (goalDx / goalDist) * 0.1;
  var dz = Math.sin(p.facing) * 0.9 + (goalDz / goalDist) * 0.1;
  var d = Math.hypot(dx, dz) || 1;
  dx /= d; dz /= d;

  var spd = 15 + power * 11;
  var naturalElev = 0.12 + power * 0.3 * state.rng() + (goalDist / state.pitch.L) * 0.3;
  var goalElev = clamp((aimY - b.y) / goalDist, -0.2, 0.65);
  var elev = naturalElev * 0.9 + goalElev * 0.1;
  b.owner = null; b.lastTouch = p.id;
  b.vx = dx * spd; b.vz = dz * spd;
  b.vy = spd * elev * 0.55;
  b.x = p.x + dx * 0.6; b.z = p.z + dz * 0.6; b.y = Math.max(b.y, 0.15);
  p.kickT = 0.4;
  state.stats.shots[p.team]++;
  push(state, { type: 'kick', player: p.id, power: 0.4 + power * 0.6, kind: 'shoot' });
}

// No opponent within `lane` meters of the pass segment from p to q.
function laneClear(state, p, q, lane) {
  var vx = q.x - p.x, vz = q.z - p.z;
  var len2 = vx * vx + vz * vz;
  for (var i = 0; i < state.players.length; i++) {
    var o = state.players[i];
    if (o.team === p.team || o.id === q.id) continue;
    var t = len2 > 0 ? clamp(((o.x - p.x) * vx + (o.z - p.z) * vz) / len2, 0, 1) : 0;
    var cx = p.x + vx * t, cz = p.z + vz * t;
    if (Math.hypot(o.x - cx, o.z - cz) < lane) return false;
  }
  return true;
}

function doPass(state, p) {
  var b = state.ball;
  var gx = attackSign(state, p.team) * state.pitch.L / 2;
  // Best option: a teammate in the facing cone with a clear line to the ball;
  // among those, the one nearest the opponent's goal.
  var best = null, bestGoalDist = Infinity;
  for (var qi = 0; qi < state.players.length; qi++) {
    var q = state.players[qi];
    if (q.team !== p.team || q.id === p.id) continue;
    var dx = q.x - p.x, dz = q.z - p.z;
    var d = Math.hypot(dx, dz);
    if (d < 2 || d > 45) continue;
    var da = Math.abs(angDiff(Math.atan2(dz, dx), p.facing));
    if (da > 1.25) continue;                          // must be roughly ahead
    if (!laneClear(state, p, q, 1.1)) continue;       // must have line of sight
    var gd = Math.hypot(q.x - gx, q.z);               // nearest to their goal
    if (gd < bestGoalDist) { bestGoalDist = gd; best = q; }
  }
  b.owner = null; b.lastTouch = p.id;
  p.kickT = 0.35;
  if (!best) {
    // No good option: knock it into space ahead and burst after it — a
    // self-pass to beat a pressing defender.
    var fx = Math.cos(p.facing), fz = Math.sin(p.facing);
    b.vx = fx * 7.5; b.vz = fz * 7.5; b.vy = 0;
    b.x = p.x + fx * 0.7; b.z = p.z + fz * 0.7;
    b.y = Math.max(b.y, 0.15);
    p.vx += fx * 3.4; p.vz += fz * 3.4;
    push(state, { type: 'kick', player: p.id, power: 0.4, kind: 'pass' });
    return;
  }
  var dir = Math.atan2(best.z - p.z, best.x - p.x);
  var dd = Math.hypot(best.x - p.x, best.z - p.z);
  var spd = clamp(9 + dd * 0.42, 10, 24);
  // lead the receiver slightly
  var lead = 0.35;
  var tx2 = best.x + best.vx * lead;
  var tz2 = best.z + best.vz * lead;
  var tdx = tx2 - p.x, tdz = tz2 - p.z;
  var td = Math.hypot(tdx, tdz) || 1;
  b.vx = (tdx / td) * spd; b.vz = (tdz / td) * spd;
  b.vy = dd > 18 ? spd * 0.16 : 0;   // lofted only for long balls
  b.x = p.x + Math.cos(dir) * 0.6; b.z = p.z + Math.sin(dir) * 0.6;
  b.y = Math.max(b.y, 0.15);
  push(state, { type: 'kick', player: p.id, power: 0.45, kind: 'pass' });
}

// Ball pops loose (tackle, heavy touch).
function looseBall(state, fromPlayer, spd) {
  var b = state.ball;
  var a = state.rng() * Math.PI * 2;
  b.owner = null; b.lastTouch = fromPlayer.id;
  b.vx = Math.cos(a) * spd; b.vz = Math.sin(a) * spd; b.vy = 1.2;
  b.x = fromPlayer.x + Math.cos(a) * 0.5; b.z = fromPlayer.z + Math.sin(a) * 0.5;
  push(state, { type: 'kick', player: fromPlayer.id, power: 0.25, kind: 'loose' });
}

// ── Ball physics ─────────────────────────────────────────────────────────────

function stepBall(state, dt) {
  var b = state.ball;
  var L = state.pitch.L, W = state.pitch.W, goalW = state.pitch.goalW, goalH = state.pitch.goalH;

  if (b.owner != null) {
    var p = state.players[b.owner];
    // dribble: ball held ahead of owner, small knock-on at speed
    var lead = 0.5 + Math.hypot(p.vx, p.vz) * 0.045;
    var tx = p.x + Math.cos(p.facing) * lead;
    var tz = p.z + Math.sin(p.facing) * lead;
    b.vx = (tx - b.x) / Math.max(dt, 1e-3);
    b.vz = (tz - b.z) / Math.max(dt, 1e-3);
    b.x = tx; b.z = tz; b.y = BALL_R; b.vy = 0;
    b.lastTouch = p.id;

    // proximity steal: opponent close enough on the ball side pokes it loose;
    // sprinting carriers take heavier touches and are easier to dispossess
    var ownerSpd = Math.hypot(p.vx, p.vz);
    var stealRate = 1.2 * (ownerSpd > 6 ? 1.8 : 1);
    for (var qi = 0; qi < state.players.length; qi++) {
      var q = state.players[qi];
      if (q.team === p.team || q.stunT > 0 || q.tackleT > 0) continue;
      if (dist(p, q) < STEAL_RADIUS && state.rng() < dt * (stealRate + q.personality.aggression)) {
        looseBall(state, q, 2.6);
        push(state, { type: 'steal', player: q.id, from: p.id });
        break;
      }
    }
    return;
  }

  // free ball
  b.vy += GRAVITY * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;

  // ground
  if (b.y < BALL_R) {
    b.y = BALL_R;
    if (Math.abs(b.vy) > 1.2) {
      b.vy = -b.vy * RESTITUTION;
      push(state, { type: 'bounce', power: Math.min(1, Math.abs(b.vy) / 12) });
    } else b.vy = 0;
    // roll friction
    var f = Math.max(0, 1 - 2.1 * dt);
    b.vx *= f; b.vz *= f;
  } else {
    // air drag
    var f2 = Math.max(0, 1 - 0.28 * dt);
    b.vx *= f2; b.vz *= f2;
  }

  // goals & out of bounds
  var inMouth = Math.abs(b.z) < goalW / 2 && b.y < goalH;
  if (Math.abs(b.x) > L / 2 + BALL_R) {
    if (inMouth) { goalScored(state); return; }
    // goal-frame bounce (posts/bar approximated as ring around the mouth)
    var overBar = b.y >= goalH && b.y < goalH + 0.25 && Math.abs(b.z) < goalW / 2 + 0.3;
    var nearPost = Math.abs(Math.abs(b.z) - goalW / 2) < 0.25 && b.y < goalH + 0.3;
    if (overBar || nearPost) {
      b.vx = -b.vx * 0.6; b.vz = b.vz * 0.6 + (b.z > 0 ? 1 : -1) * 1.5;
      b.x = Math.sign(b.x) * (L / 2 - 0.05);
      push(state, { type: 'woodwork' });
    } else if (Math.abs(b.x) > L / 2 + 1.2) {
      restart(state, 'goalline');
      return;
    }
  }
  if (Math.abs(b.z) > W / 2 + 0.8) {
    restart(state, 'sideline');
    return;
  }

  // pickup
  for (var pi = 0; pi < state.players.length; pi++) {
    var pl = state.players[pi];
    if (pl.stunT > 0 || pl.kickT > 0.15) continue;
    var d = dist(pl, b);
    var reach = pl.role === 'GK' && nearOwnGoal(state, pl) ? CONTROL_RADIUS * 1.7 : CONTROL_RADIUS;
    if (d < reach && b.y < 1.25) {
      // slow enough, or GK claim
      var spd = Math.hypot(b.vx, b.vz);
      if (spd < 9 || (pl.role === 'GK' && spd < 16)) {
        b.owner = pl.id; b.lastTouch = pl.id;
        push(state, { type: 'control', player: pl.id });
        break;
      }
    }
  }
}

function goalScored(state) {
  var b = state.ball;
  // scoring team: the team attacking the goal the ball crossed
  var crossedSign = Math.sign(b.x);
  var scoringTeam = state.players.find(function (p) { return attackSign(state, p.team) === crossedSign; }).team;
  var scorer = b.lastTouch != null ? state.players[b.lastTouch] : null;
  var ownGoal = !!(scorer && scorer.team !== scoringTeam);
  state.score[scoringTeam]++;
  state.lastScoredTeam = scoringTeam;
  state.phase = 'goal';
  state.phaseT = 3.2;
  b.owner = null;
  b.vx *= 0.15; b.vz *= 0.15;
  // pin ball into the net
  b.x = crossedSign * (state.pitch.L / 2 + 0.7);
  for (var i = 0; i < state.players.length; i++) {
    var p = state.players[i];
    if (p.team === scoringTeam) p.celebrateT = 3;
  }
  // putting it in your own net is no cause for a knees-up
  if (ownGoal) scorer.dejectedT = 3;
  push(state, { type: 'goal', team: scoringTeam, scorer: b.lastTouch, ownGoal: ownGoal, score: [state.score[0], state.score[1]] });
}

// Simplified restarts: throw-in / goal-kick / corner all become "nearest
// eligible player gains the ball at the boundary point".
function restart(state, kind) {
  var b = state.ball;
  var L = state.pitch.L, W = state.pitch.W;
  b.x = clamp(b.x, -L / 2 + 0.4, L / 2 - 0.4);
  b.z = clamp(b.z, -W / 2 + 0.4, W / 2 - 0.4);
  b.y = BALL_R; b.vx = 0; b.vy = 0; b.vz = 0;
  var lastTeam = b.lastTouch != null ? state.players[b.lastTouch].team : 1 - state.kickoffTeam;
  var giveTeam = 1 - lastTeam;
  // nearest player of the team awarded the restart
  var best = null, bd = 1e9;
  for (var i = 0; i < state.players.length; i++) {
    var p = state.players[i];
    if (p.team !== giveTeam) continue;
    var d = dist(p, b);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) {
    b.owner = best.id; b.lastTouch = best.id;
    push(state, { type: 'restart', kind: kind, team: giveTeam, player: best.id });
  }
}

// ── Small utilities ──────────────────────────────────────────────────────────

function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function angDiff(a, b) {
  var d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function turnToward(cur, target, maxStep) {
  var d = angDiff(target, cur);
  return cur + clamp(d, -maxStep, maxStep);
}

// How unmarked is this player (0..1).
function openness(state, p) {
  var nearest = 1e9;
  for (var i = 0; i < state.players.length; i++) {
    var q = state.players[i];
    if (q.team === p.team) continue;
    nearest = Math.min(nearest, dist(p, q));
  }
  return clamp(nearest / 12, 0, 1);
}

// ---------------------------------------------------------------------------
// Part 2 — AI brains (ported from js/game/ai.js; keep behavior in sync).
// Utility scoring re-evaluated at ~6 Hz per player; steering runs every tick
// through the same input shape human clients send, so AI footballers obey
// exactly the same physics as humans. The decision cache lives in
// state.aiPlans (JSON-safe) and all randomness comes from state.rng.
// ---------------------------------------------------------------------------

function computeAiInput(state, p, dt, difficulty) {
  if (difficulty == null) difficulty = 1;
  var input = emptyInput();
  var b = state.ball;
  var hasBall = b.owner === p.id;

  var plans = state.aiPlans || (state.aiPlans = {});
  var plan = plans[p.id];
  var replanEvery = 0.16 / Math.max(0.4, difficulty * p.personality.workRate);
  if (!plan || plan.t <= 0) {
    plan = decide(state, p, hasBall, difficulty);
    plan.t = replanEvery;
    plans[p.id] = plan;
  } else {
    plan.t -= dt;
  }

  // steering toward current target
  var dx = plan.x - p.x, dz = plan.z - p.z;
  var d = Math.hypot(dx, dz);
  if (d > 0.15) {
    input.mx = dx / d; input.mz = dz / d;
    input.sprint = plan.sprint && d > 2.5;
  } else if (hasBall) {
    // face upfield while dribbling on the spot
    input.mx = 0; input.mz = 0;
  }

  // actions trigger the moment they're valid, not only on replans
  if (hasBall) {
    var gx = attackSign(state, p.team) * state.pitch.L / 2;
    var distGoal = Math.hypot(gx - p.x, p.z);
    var shootRange = state.pitch.L * 0.3;
    var pressed = nearestOpponent(state, p) < 2.2;
    if (distGoal < shootRange && plan.wantShoot && state.rng() < dt * (2 + difficulty * 4)) {
      input.shoot = clamp(0.45 + (1 - distGoal / shootRange) * 0.5 + state.rng() * 0.1, 0.3, 1);
    } else if ((pressed || plan.wantPass) && state.rng() < dt * (1.5 + p.personality.passing * 3)) {
      input.pass = true;
    } else if (p.role === 'GK' && d < 1) {
      input.pass = true; // distribute
    }
  } else if (b.owner != null && state.players[b.owner].team !== p.team) {
    var owner = state.players[b.owner];
    if (dist(p, owner) < 1.7 && plan.wantTackle && state.rng() < dt * (1 + p.personality.aggression * 4)) {
      input.tackle = true;
    }
    // GK dive at close-range shots
    if (p.role === 'GK' && b.owner == null) {
      var spd = Math.hypot(b.vx, b.vz);
      if (spd > 10 && dist(p, b) < 3.2 && ballHeadingAt(state, p)) input.tackle = true;
    }
  }

  return input;
}

function decide(state, p, hasBall, difficulty) {
  var b = state.ball;
  var L = state.pitch.L, W = state.pitch.W;
  var atk = attackSign(state, p.team);
  var anchor = formationAnchor(p.slot, state.teamSize);
  var personality = p.personality;

  // Formation anchor shifts with the ball: attack when we have it, fall back
  // when we don't; more "positioning" = holds shape, less = chases.
  var ballBiasU = clamp(b.x / (L / 2), -1, 1) * 0.16 * (b.owner != null && state.players[b.owner].team === p.team ? 1 : -0.7);
  var ax = (anchor.u + ballBiasU) * L * -atk * -1;
  var az = anchor.v * W + clamp(b.z / (W / 2), -1, 1) * W * 0.08;

  var plan = { x: ax, z: az, sprint: false, wantShoot: false, wantPass: false, wantTackle: false };
  var weHaveBall = b.owner != null && state.players[b.owner].team === p.team;
  var theyHaveBall = b.owner != null && state.players[b.owner].team !== p.team;

  if (p.role === 'GK') {
    // hold the line, track ball laterally, come for loose through balls
    var gx = -atk * L / 2;
    plan.x = gx + atk * clamp(Math.abs(b.x - gx) * 0.06, 0.6, L * 0.06);
    plan.z = clamp(b.z * 0.35, -state.pitch.goalW / 2 - 1, state.pitch.goalW / 2 + 1);
    if (b.owner == null) {
      var toGoal = Math.abs(b.x - gx);
      if (toGoal < L * 0.12 && Math.hypot(b.vx, b.vz) < 6) { plan.x = b.x; plan.z = b.z; plan.sprint = true; }
    }
    if (hasBall) { plan.wantPass = true; }
    return plan;
  }

  if (hasBall) {
    // dribble toward goal; pass when pressed or a clearly better option exists
    var gx2 = atk * L / 2;
    var distGoal = Math.hypot(gx2 - p.x, p.z);
    var pressed = nearestOpponent(state, p) < 2.5;
    plan.wantShoot = distGoal < L * (0.22 + personality.aggression * 0.14);
    plan.wantPass = pressed && personality.passing > 0.35;
    if (plan.wantPass && state.rng() < personality.passing) {
      plan.x = p.x; plan.z = p.z; // hold and pass (action triggers in computeAiInput)
    } else {
      // carry toward goal with slight lane drift to open space
      var lane = p.z > 0 ? -1 : 1;
      plan.x = gx2;
      plan.z = clamp(p.z + lane * 3 * (1 - openness(state, p)), -W * 0.4, W * 0.4);
      plan.sprint = !pressed && personality.workRate > 0.55;
    }
    return plan;
  }

  if (theyHaveBall) {
    // press: nearest N (by aggression) chase, everyone else holds shape
    var owner = state.players[b.owner];
    var chasers = state.players
      .filter(function (q) { return q.team === p.team && q.role !== 'GK'; })
      .sort(function (a, c) { return dist(a, owner) - dist(c, owner); });
    var chaserCount = 1 + Math.round(personality.aggression * 1.5);
    var myRank = chasers.findIndex(function (q) { return q.id === p.id; });
    if (myRank >= 0 && myRank < chaserCount) {
      plan.x = owner.x; plan.z = owner.z;
      plan.sprint = true;
      plan.wantTackle = true;
    }
    return plan;
  }

  if (weHaveBall) {
    // support run: get open ahead of the ball
    var owner2 = state.players[b.owner];
    if (owner2.id !== p.id) {
      var ahead = atk * (4 + personality.workRate * 6);
      plan.x = clamp(owner2.x + ahead, -L / 2 + 2, L / 2 - 2);
      plan.z = clamp(az + (p.z > owner2.z ? 2 : -2), -W / 2 + 2, W / 2 - 2);
      plan.sprint = personality.workRate > 0.6;
    }
    return plan;
  }

  // loose ball: nearest couple of players go win it
  if (b.owner == null) {
    var distMe = dist(p, b);
    var rank = state.players
      .filter(function (q) { return q.team === p.team && q.role !== 'GK'; })
      .sort(function (a, c) { return dist(a, b) - dist(c, b); })
      .findIndex(function (q) { return q.id === p.id; });
    if (rank >= 0 && rank < 2 && distMe < L * 0.3) {
      plan.x = b.x; plan.z = b.z;
      plan.sprint = difficulty > 0.5;
    }
  }
  return plan;
}

function nearestOpponent(state, p) {
  var d = 1e9;
  for (var i = 0; i < state.players.length; i++) {
    var q = state.players[i];
    if (q.team !== p.team) d = Math.min(d, dist(p, q));
  }
  return d;
}

function ballHeadingAt(state, p) {
  var b = state.ball;
  // will the ball pass near p within ~0.5 s?
  var t = 0.5;
  var fx = b.x + b.vx * t, fz = b.z + b.vz * t;
  // distance from p to segment b->f
  var dx = fx - b.x, dz = fz - b.z;
  var len2 = dx * dx + dz * dz || 1e-6;
  var tt = clamp(((p.x - b.x) * dx + (p.z - b.z) * dz) / len2, 0, 1);
  var px = b.x + dx * tt, pz = b.z + dz * tt;
  return Math.hypot(p.x - px, p.z - pz) < 2.4;
}

// Plans are per-match now (state.aiPlans), so a fresh match starts clean and
// this is only needed to reset plans mid-match. Accepts the match state; a
// no-arg call (legacy client usage) is a safe no-op.
function clearAiPlans(state) {
  if (state && state.aiPlans) state.aiPlans = {};
}

// ---------------------------------------------------------------------------
// Part 3 — injury / substitution ceremony (sim phase 'injury')
// ---------------------------------------------------------------------------

var CER = {
  REF_IN: 0.5,     // referee starts running in
  REF_BY: 2.5,     // referee arrives / whistles
  CREW_IN: 2.5,    // carriers + stretcher start walking in
  REF_OUT: 8.5,    // referee jogs back off
  SPEED_IN: 6.0,   // crew hustle with an empty stretcher (m/s)
  SPEED_OUT: 5.5,  // crew hustle with a loaded stretcher (m/s)
};
var ST_GROUND = 0.34;  // stretcher bed height resting on its legs
var ST_CARRY = 0.72;   // bed height while carried (medic hip/hand level)
var CREW_HALF = 1.0;   // carrier offset from the stretcher center along its axis

function ease01(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }

// rec: { kind:'leave'|'rejoin', playerId, outName, inName }
function startCeremony(state, rec) {
  var p = state.players[rec.playerId];
  var L = state.pitch.L, W = state.pitch.W;
  var side = p.z >= 0 ? 1 : -1;
  var entryZ = side * (W / 2 + 1.0);
  var faceIn = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  state.ball.owner = null; // or the ball glues to the victim
  state.ceremony = {
    kind: rec.kind, t: 0,
    victimId: p.id, victimName: rec.outName, replacementName: rec.inName,
    spot: { x: p.x, z: p.z },
    ref: { x: 0, z: W / 2 + 1.2, facing: -Math.PI / 2, anim: 'idle', animSpeed: 0, phase: 0 },
    refHome: { x: 0, z: W / 2 + 1.2 },
    carriers: [
      { x: p.x, z: entryZ, facing: faceIn, anim: 'idle', animSpeed: 0, phase: 0 },
      { x: p.x, z: entryZ, facing: faceIn, anim: 'idle', animSpeed: 0, phase: 0 },
    ],
    // The crew center is the single source of truth for crew motion: both
    // carriers and the stretcher are placed relative to it every frame, so
    // they can never drift apart or move at different speeds.
    crew: { x: p.x, z: entryZ, angle: faceIn },
    stretcher: { x: p.x, z: entryZ, angle: faceIn, y: ST_CARRY },
    // Distance-scaled deadlines so the crew moves at a constant plausible
    // speed instead of teleport-fast sprinting to hit fixed times.
    tCrewBy: CER.CREW_IN + Math.max(1.2, Math.abs(entryZ - p.z) / CER.SPEED_IN),
    tLoadBy: 0, tCarryBy: 0, tAwayBy: 0, tSubBy: 0, tEnd: 0,
    subPushed: false,
    stage: 0, // 0 ref inbound · 1 whistled · 2 loaded/carrying · 3 off · 5 sub done
  };
  {
    var c0 = state.ceremony;
    var tunnelX0 = -L / 2 - 6;
    var dOut = Math.hypot(p.x - tunnelX0, p.z);
    c0.tLoadBy = c0.tCrewBy + 1.4;                       // set down + load + lift
    c0.tCarryBy = c0.tLoadBy + Math.max(1.5, dOut / CER.SPEED_OUT);
    c0.tAwayBy = c0.tCarryBy + 2.1;                      // set down + unload + lift empty
    c0.tSubBy = c0.tCarryBy + 1.8;
    c0.tEnd = c0.tAwayBy + 1.0;
  }
  p.vx = 0; p.vz = 0; p.stunT = 0; p.tackleT = 0; p.kickT = 0; p.diveT = 0;
  p.anim = 'fallen'; p.animSpeed = 0;
  state.phase = 'injury';
  push(state, { type: 'injury-start', player: p.id, name: rec.outName, kind: rec.kind });
}

// Move an entity (player or virtual ref/carrier/stretcher) toward a target at
// at least baseSpeed, fast enough to arrive within tLeft seconds. Updates
// x/z, facing|angle, and walk/run anim fields. Returns remaining distance.
function approach(ent, tx, tz, baseSpeed, tLeft, dt) {
  var dx = tx - ent.x, dz = tz - ent.z;
  var d = Math.hypot(dx, dz);
  if (d < 1e-4) {
    if ('anim' in ent) { ent.anim = 'idle'; ent.animSpeed = 0; }
    return 0;
  }
  var speed = Math.max(baseSpeed, d / Math.max(tLeft, dt));
  var step = Math.min(d, speed * dt);
  ent.x += (dx / d) * step;
  ent.z += (dz / d) * step;
  var dir = Math.atan2(dz, dx);
  if ('facing' in ent) ent.facing = dir;
  if ('angle' in ent) ent.angle = dir;
  if ('anim' in ent) {
    var actual = step / Math.max(dt, 1e-4);
    ent.anim = actual > WALK_SPEED + 0.4 ? 'run' : (actual > 0.3 ? 'walk' : 'idle');
    ent.animSpeed = actual;
    ent.phase += dt * (2.2 + actual * 1.55);
  }
  return d - step;
}

function stepCeremony(state, dt) {
  var c = state.ceremony;
  var L = state.pitch.L, W = state.pitch.W;
  var p = state.players[c.victimId];
  var b = state.ball;
  var tunnelX = -L / 2 - 6; // walkout tunnel
  c.t += dt;

  // freeze: everyone but the victim eases to idle, nobody chases the ball
  for (var i = 0; i < state.players.length; i++) {
    var q = state.players[i];
    if (q.id === c.victimId) continue;
    var f = Math.max(0, 1 - 8 * dt);
    q.vx *= f; q.vz *= f;
    q.x += q.vx * dt; q.z += q.vz * dt;
    clampToPitch(state, q);
    var spd = Math.hypot(q.vx, q.vz);
    q.anim = spd > 0.5 ? 'walk' : 'idle';
    q.animSpeed = spd;
    q.phase += dt * (2.2 + spd * 1.55);
  }

  // ball: owner stays cleared, decelerates to a stop, no pickups/goals
  b.owner = null;
  b.vy += GRAVITY * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  if (b.y < BALL_R) {
    b.y = BALL_R;
    if (b.vy < -1.2) b.vy = -b.vy * RESTITUTION; else b.vy = 0;
    var bf = Math.max(0, 1 - 2.1 * dt); b.vx *= bf; b.vz *= bf;
  } else {
    var af = Math.max(0, 1 - 0.28 * dt); b.vx *= af; b.vz *= af;
  }

  // victim: fallen at the spot until loaded, then slaved to the stretcher
  // (riding at bed height, body aligned with the stretcher's long axis)
  if (c.stage < 2) {
    p.x = c.spot.x; p.z = c.spot.z; p.y = 0;
    p.vx = 0; p.vz = 0; p.anim = 'fallen'; p.animSpeed = 0;
  } else if (c.stage === 2) {
    p.x = c.stretcher.x; p.z = c.stretcher.z;
    p.y = c.stretcher.y + 0.06;
    p.facing = c.stretcher.angle - Math.PI / 2;
    p.vx = 0; p.vz = 0; p.anim = 'fallen'; p.animSpeed = 0;
  }

  // ── referee ──
  var ref = c.ref;
  if (c.stage === 0 && c.t >= CER.REF_IN) {
    var rem = approach(ref, c.spot.x + 0.9, c.spot.z, RUN_SPEED, CER.REF_BY - c.t, dt);
    if (rem < 0.2 || c.t >= CER.REF_BY) {
      c.stage = 1;
      ref.anim = 'idle'; ref.animSpeed = 0;
      push(state, { type: 'referee-whistle', player: c.victimId });
    }
  }
  if (c.t >= CER.REF_OUT) {
    approach(ref, c.refHome.x, c.refHome.z, WALK_SPEED * 1.4, c.tEnd - c.t, dt);
  }

  // ── carriers + stretcher ──
  // The crew moves as one unit. The stretcher rides at the crew center and
  // the carriers stand at its two ends (rear/front along the direction of
  // travel), so stretcher speed always matches the carriers' speed. Carriers
  // hold the rails ('carryB' arms forward / 'carryF' arms back) and crouch
  // for the set-down / lift windows.
  var crew = c.crew;
  var st = c.stretcher;
  var prevX = crew.x, prevZ = crew.z;

  if (c.t >= CER.CREW_IN && c.t < c.tCrewBy) {
    approach(crew, c.spot.x, c.spot.z, WALK_SPEED, c.tCrewBy - c.t, dt);
  } else if (c.stage === 2 && c.t >= c.tLoadBy && c.t < c.tCarryBy) {
    approach(crew, tunnelX, 0, WALK_SPEED, c.tCarryBy - c.t, dt);
  } else if (c.stage >= 3 && c.t >= c.tAwayBy) {
    approach(crew, tunnelX - 2, 0, WALK_SPEED, 1e9, dt);
  }
  var crewSpeed = Math.hypot(crew.x - prevX, crew.z - prevZ) / Math.max(dt, 1e-4);

  // victim loaded once the stretcher is on the ground beside them
  if (c.stage < 2 && c.t >= c.tCrewBy + 0.6) {
    c.stage = 2;
    push(state, { type: 'stretcher-load', player: c.victimId });
  }
  // victim taken off at the tunnel; the same entity re-enters as the
  // replacement — swap the visible identity now
  if (c.stage === 2 && c.t >= c.tCarryBy + 0.6) {
    c.stage = 3;
    push(state, { type: 'stretcher-off', player: c.victimId, name: c.victimName });
    p.name = c.replacementName;
    p.x = tunnelX; p.z = 0; p.y = 0;
  }

  // stretcher height + carrier poses over the load / unload windows
  var stY = ST_CARRY, pose = 'carry';
  if (c.t >= c.tCrewBy && c.t < c.tLoadBy) {
    var lt = c.t - c.tCrewBy;
    if (lt < 0.6)      { pose = 'crouch'; stY = ST_CARRY + (ST_GROUND - ST_CARRY) * ease01(lt / 0.6); }
    else if (lt < 0.9) { pose = 'crouch'; stY = ST_GROUND; }
    else               { stY = ST_GROUND + (ST_CARRY - ST_GROUND) * ease01((lt - 0.9) / 0.5); }
  } else if (c.t >= c.tCarryBy && c.t < c.tEnd) {
    var ot = c.t - c.tCarryBy;
    if (ot < 0.6)      { pose = 'crouch'; stY = ST_CARRY + (ST_GROUND - ST_CARRY) * ease01(ot / 0.6); }
    else if (ot < 1.6) { pose = 'crouch'; stY = ST_GROUND; }
    else               { stY = ST_GROUND + (ST_CARRY - ST_GROUND) * ease01((ot - 1.6) / 0.5); }
  }

  st.x = crew.x; st.z = crew.z; st.angle = crew.angle; st.y = stY;
  var ux = Math.cos(crew.angle), uz = Math.sin(crew.angle);
  for (var ci = 0; ci < 2; ci++) {
    var car = c.carriers[ci];
    var sgn = ci === 0 ? -1 : 1; // carrier 0 = rear (arms fwd), 1 = front (arms back)
    car.x = crew.x + ux * CREW_HALF * sgn;
    car.z = crew.z + uz * CREW_HALF * sgn;
    car.facing = crew.angle;
    car.animSpeed = crewSpeed;
    car.phase += dt * (2.2 + crewSpeed * 1.55);
    car.anim = pose === 'crouch' ? 'crouch' : (ci === 0 ? 'carryB' : 'carryF');
  }

  // ── replacement runs on to its formation anchor ──
  if (c.stage >= 3 && c.stage < 5) {
    var a = formationAnchor(p.slot, state.teamSize);
    var ax = a.u * L * -attackSign(state, p.team);
    var az = a.v * W;
    approach(p, ax, az, RUN_SPEED, c.tSubBy - c.t, dt);
    if (!c.subPushed && (p.x > -L / 2 || c.t >= c.tSubBy)) {
      c.subPushed = true;
      push(state, { type: 'substitution', player: p.id, outName: c.victimName, inName: c.replacementName, kind: c.kind });
    }
    if (c.t >= c.tSubBy) {
      p.x = ax; p.z = az; p.vx = 0; p.vz = 0; p.anim = 'idle'; p.animSpeed = 0;
      c.stage = 5;
    }
  }

  // ── done: dropped-ball restart ──
  if (c.t >= c.tEnd) {
    state.ceremony = null;
    state.phase = 'play';
    b.x = clamp(c.spot.x, -L / 2 + 1, L / 2 - 1);
    b.z = clamp(c.spot.z, -W / 2 + 1, W / 2 - 1);
    b.y = BALL_R; b.vx = 0; b.vy = 0; b.vz = 0; b.owner = null; b.lastTouch = null;
    push(state, { type: 'restart', kind: 'drop-ball', x: Math.round(b.x * 100) / 100, z: Math.round(b.z * 100) / 100 });
  }
}

// ---------------------------------------------------------------------------
// Part 4 — session glue (the platform-facing game object)
// ---------------------------------------------------------------------------

var INPUT_STALE_MS = 1000;    // zero inputs older than this
var OFFLINE_GRACE_MS = 5000;  // offline this long -> seat goes away
var SNAP_INTERVAL_MS = 30;    // one snapshot per 30 Hz tick when on schedule
var MAX_TICK_DT = 0.25;       // clamp tick delta (seconds)

function r2(v) { return Math.round(v * 100) / 100; }

function playerIdForUser(state, userId) {
  for (var pid in state.seats) if (state.seats[pid].userId === userId) return +pid;
  return -1;
}

function rosterNameFor(ctx, userId) {
  var roster = (ctx.room && ctx.room.roster) || [];
  for (var i = 0; i < roster.length; i++) {
    if (roster[i].userId === userId) return roster[i].name;
  }
  var ps = ctx.players || [];
  for (var j = 0; j < ps.length; j++) if (ps[j].id === userId) return ps[j].name;
  return null;
}

function drainEvents(match, out, state) {
  for (var i = 0; i < match.events.length; i++) {
    out.push({ to: 'all', data: { type: 'ev', ev: match.events[i] } });
    if (state) { recordReplayEv(state, match.events[i]); trackGoal(state, match.events[i]); }
  }
  match.events.length = 0;
}

// Per-seat goal tally (sessionState.goals, pid -> count) for achievements.
function trackGoal(state, ev) {
  if (!ev || ev.type !== 'goal' || ev.ownGoal || ev.scorer == null) return;
  var goals = state.goals || (state.goals = {});
  goals[ev.scorer] = (goals[ev.scorer] | 0) + 1;
}

// ── Replay recording (stored in sessionState, never broadcast) ──────────────

var REPLAY_FRAME_EVERY = 15;   // 2 frames/sec at 30 Hz
var REPLAY_MAX_FRAMES = 900;   // ~2x3 min match at 2 fps is ~720 frames
var REPLAY_EV_TYPES = { goal: 1, halftime: 1, kickoff: 1, fulltime: 1 };

function recordReplayEv(state, ev) {
  var r = state.replay;
  if (!r || !ev || !REPLAY_EV_TYPES[ev.type]) return;
  r.evs.push({ t: state.tick, ev: ev });
}

function recordReplayFrame(state) {
  var r = state.replay;
  if (!r || state.tick % r.every !== 0) return;
  if (r.frames.length >= REPLAY_MAX_FRAMES) { r.truncated = true; return; }
  var m = state.match;
  // b/pl mirror buildSnapshot's layout (and r2 rounding) exactly, so the
  // replay viewer can reuse the client's snapshot parsing.
  var pl = [];
  for (var i = 0; i < m.players.length; i++) {
    var p = m.players[i];
    pl.push([p.id, p.team, r2(p.x), r2(p.z), r2(p.vx), r2(p.vz), r2(p.facing),
      p.anim, r2(p.animSpeed), r2(p.phase), r2(p.kickT), r2(p.tackleT), r2(p.stunT),
      r2(p.diveT), r2(p.diveDir), r2(p.celebrateT), p.isAi ? 1 : 0, p.name,
      r2(p.y || 0)]);
  }
  var b = m.ball;
  r.frames.push({
    t: state.tick,
    sc: [m.score[0], m.score[1]],
    ph: m.phase,
    b: [r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vy), r2(b.vz), b.owner == null ? -1 : b.owner],
    pl: pl,
  });
}

// ── Elo ratings ─────────────────────────────────────────────────────────────

var ELO_DEFAULT = 1200;
var ELO_K = 32;
var ELO_MIN = 100;

// Standard Elo on team averages over each team's HUMANS; the same delta
// applies to every human on a team. Returns null when either team has no
// humans (match is unrated).
function computeRatings(state, winner) {
  var docs = state.playerDocs;
  if (!docs) return null;
  var teamSize = state.match.teamSize;
  var sums = [0, 0], counts = [0, 0], uids = [[], []];
  for (var pid in state.seats) {
    var uid = state.seats[pid].userId;
    if (!uid || !docs[uid]) continue;
    var team = (+pid) < teamSize ? 0 : 1;
    sums[team] += docs[uid].elo;
    counts[team]++;
    uids[team].push(uid);
  }
  if (!counts[0] || !counts[1]) return null;
  var avg = [sums[0] / counts[0], sums[1] / counts[1]];
  var e0 = 1 / (1 + Math.pow(10, (avg[1] - avg[0]) / 400));
  var s0 = winner === -1 ? 0.5 : (winner === 0 ? 1 : 0);
  var deltas = [Math.round(ELO_K * (s0 - e0)), Math.round(ELO_K * ((1 - s0) - (1 - e0)))];
  var eloUpdates = {};
  for (var t = 0; t < 2; t++) {
    for (var i = 0; i < uids[t].length; i++) {
      var d = docs[uids[t][i]];
      d.elo = Math.max(ELO_MIN, d.elo + deltas[t]);
      if (winner === -1) d.draws++;
      else if (winner === t) d.wins++;
      else d.losses++;
      eloUpdates[uids[t][i]] = d.elo;
    }
  }
  return { playerStates: docs, eloUpdates: eloUpdates };
}

// Achievement grants at full time, keyed by userId (the platform's
// `achievements` return field; unlocks are idempotent server-side). Only
// humans who finished the match (still seated, not gone/standin) are eligible.
function computeAchievements(state, winner) {
  var teamSize = state.match.teamSize;
  var score = state.match.score;
  var goals = state.goals || {};
  var grants = {};
  for (var pid in state.seats) {
    var seat = state.seats[pid];
    if (!seat.userId || seat.gone || seat.standin) continue;
    var keys = ['debut'];
    var team = (+pid) < teamSize ? 0 : 1;
    if ((goals[pid] | 0) >= 1) keys.push('goalscorer');
    if ((goals[pid] | 0) >= 3) keys.push('hat-trick');
    if (winner === team) {
      keys.push('first-win');
      if (score[1 - team] === 0) keys.push('clean-sheet');
    }
    grants[seat.userId] = keys;
  }
  for (var uid in grants) return grants; // at least one eligible human
  return null;
}

function pendingForSeat(state, pid, kind) {
  for (var i = 0; i < state.pendingCeremonies.length; i++) {
    var r = state.pendingCeremonies[i];
    if (r.playerId === pid && (!kind || r.kind === kind)) return r;
  }
  return null;
}

function removePendingForSeat(state, pid, kind) {
  var kept = [];
  var removed = false;
  for (var i = 0; i < state.pendingCeremonies.length; i++) {
    var r = state.pendingCeremonies[i];
    if (r.playerId === pid && (!kind || r.kind === kind)) removed = true;
    else kept.push(r);
  }
  state.pendingCeremonies = kept;
  return removed;
}

// Start the next queued ceremony when the match is in open play.
function maybeStartCeremony(state) {
  var match = state.match;
  if (match.phase !== 'play' || match.ceremony || state.pendingCeremonies.length === 0) return;
  var rec = state.pendingCeremonies.shift();
  var p = match.players[rec.playerId];
  // names resolve at start time: the outgoing name is whatever the entity
  // currently wears; a rejoin restores the human's current roster name
  var seat = state.seats[rec.playerId];
  var inName = rec.kind === 'rejoin' ? ((seat && seat.name) || p.name) : rec.inName;
  startCeremony(match, { kind: rec.kind, playerId: rec.playerId, outName: p.name, inName: inName });
}

// Seat goes away: AI takes over immediately, leave ceremony queued.
// permanent (presence.left) seats can never be rejoined.
function triggerLeave(ctx, state, pid, seat, permanent) {
  if (seat.gone) return;
  var p = state.match.players[pid];
  if (permanent) {
    var wasAway = seat.standin;
    seat.gone = true; seat.standin = false;
    p.isAi = true;
    // a permanently-gone seat never rejoins
    removePendingForSeat(state, pid, 'rejoin');
    var c = state.match.ceremony;
    if (c && c.victimId === pid && c.kind === 'rejoin') {
      // mid-rejoin: the human is gone for good — bring back a fresh AI instead
      c.kind = 'leave';
      c.replacementName = takeAiName(state.match.rng);
    }
    if (wasAway) return; // leave ceremony already queued/ran for this departure
  } else {
    if (seat.standin) return; // already away; don't re-trigger every tick
    seat.standin = true;
    p.isAi = true;
  }
  if (!pendingForSeat(state, pid) &&
      !(state.match.ceremony && state.match.ceremony.victimId === pid)) {
    state.pendingCeremonies.push({
      kind: 'leave', playerId: pid, inName: takeAiName(state.match.rng),
    });
  }
}

// Seat is back: human retakes it, rejoin ceremony queued (unless nothing
// visible ever happened — a queued leave that never started is just cancelled).
function triggerRejoin(ctx, state, pid, seat) {
  seat.standin = false;
  var p = state.match.players[pid];
  p.isAi = false;
  removePendingForSeat(state, pid, 'leave'); // cancel unstarted leave ceremonies
  var inName = seat.name || p.name;
  var activeOnSeat = state.match.ceremony && state.match.ceremony.victimId === pid;
  if (!activeOnSeat && p.name === inName) return; // nothing to undo
  if (pendingForSeat(state, pid, 'rejoin')) return;
  state.pendingCeremonies.push({ kind: 'rejoin', playerId: pid });
}

function reconcilePresence(ctx, state) {
  var match = state.match;
  if (match.phase === 'end' || state.ended) return;
  // Presence is only supplied to room-bound sessions; a standalone session
  // (matchmaking / AI practice) has no roster to reconcile against, and
  // treating everyone as missing would AI-take-over every human seat.
  if (!ctx.room) return;
  var presence = ctx.presence || {};
  for (var pid in state.seats) {
    var seat = state.seats[pid];
    if (!seat.userId || seat.gone) continue;
    var rn = rosterNameFor(ctx, seat.userId);
    if (rn) seat.name = rn;
    var pr = presence[seat.userId];
    if (pr && pr.left === true) {
      triggerLeave(ctx, state, +pid, seat, true);
    } else if (!pr || pr.online === false) {
      // missing presence entries are treated as offline (grace applies)
      if (!state.offlineSince[seat.userId]) state.offlineSince[seat.userId] = ctx.now;
      if (ctx.now - state.offlineSince[seat.userId] > OFFLINE_GRACE_MS) {
        triggerLeave(ctx, state, +pid, seat, false);
      }
    } else {
      delete state.offlineSince[seat.userId];
      if (seat.standin) triggerRejoin(ctx, state, +pid, seat);
    }
  }
}

// Every human seat is left:true or offline beyond the grace period.
function allHumansGone(ctx, state) {
  var humans = 0, gone = 0;
  for (var pid in state.seats) {
    var seat = state.seats[pid];
    if (!seat.userId) continue;
    humans++;
    if (seat.gone || seat.standin) { gone++; continue; }
    var off = state.offlineSince[seat.userId];
    if (off && ctx.now - off > OFFLINE_GRACE_MS) gone++;
  }
  return humans > 0 && humans === gone;
}

function buildSnapshot(state) {
  var m = state.match;
  var pl = [];
  for (var i = 0; i < m.players.length; i++) {
    var p = m.players[i];
    pl.push([p.id, p.team, r2(p.x), r2(p.z), r2(p.vx), r2(p.vz), r2(p.facing),
      p.anim, r2(p.animSpeed), r2(p.phase), r2(p.kickT), r2(p.tackleT), r2(p.stunT),
      r2(p.diveT), r2(p.diveDir), r2(p.celebrateT), p.isAi ? 1 : 0, p.name,
      r2(p.y || 0)]);
  }
  var b = m.ball;
  var ack = [];
  for (var ai = 0; ai < m.players.length; ai++)
    ack.push(state.inputs[ai] ? state.inputs[ai].seq : -1);
  return {
    type: 'snap',
    ts: state.serverNow || 0, tick: state.tick || 0, ack: ack,
    t: r2(m.time), h: m.half, ph: m.phase,
    sc: [m.score[0], m.score[1]], kt: m.kickoffTeam,
    b: [r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vy), r2(b.vz), b.owner == null ? -1 : b.owner],
    pl: pl,
    cer: serializeCeremony(m.ceremony),
  };
}

function serializeCeremony(c) {
  if (!c) return null;
  function ent(e) { return [r2(e.x), r2(e.z), r2(e.facing), e.anim, r2(e.animSpeed || 0), r2(e.phase || 0)]; }
  return {
    k: c.kind, t: r2(c.t), v: c.victimId, vn: c.victimName, rn: c.replacementName,
    sp: [r2(c.spot.x), r2(c.spot.z)],
    ref: ent(c.ref),
    ca: [ent(c.carriers[0]), ent(c.carriers[1])],
    st: [r2(c.stretcher.x), r2(c.stretcher.z), r2(c.stretcher.angle), r2(c.stretcher.y)],
  };
}

function rehydrate(state) {
  attachRng(state.match);
  if (!state.match.aiPlans) state.match.aiPlans = {};
  if (state.tick == null) state.tick = 0;
  if (state.serverNow == null) state.serverNow = 0;
  if (!state.summary) state.summary = { status: state.ended ? 'finished' : 'active', moveCount: state.tick };
}

function storeRealtimeInput(state, from, data, now) {
  var pid = state.ended ? -1 : playerIdForUser(state, from);
  if (pid < 0) return;
  var seat = state.seats[pid];
  if (seat.gone || seat.standin) return;
  state.inputs[pid] = {
    seq: data.seq | 0,
    mx: clamp(Number(data.mx) || 0, -1, 1),
    mz: clamp(Number(data.mz) || 0, -1, 1),
    turn: data.turn == null ? null : clamp(Number(data.turn) || 0, -1, 1),
    fwd: data.fwd == null ? null : clamp(Number(data.fwd) || 0, -1, 1),
    sprint: !!data.sprint,
    pass: !!data.pass,
    shoot: clamp(Number(data.shoot) || 0, 0, 1),
    tackle: !!data.tackle,
    at: now,
  };
}

// Standalone sessions (matchmaking, invite-accept, AI practice) carry no
// ctx.room — synthesize a roster from ctx.players, alternating teams in ctx
// order (the platform AI seat arrives flagged ai: true with no userId seat).
function synthRoster(players) {
  var roster = [];
  for (var i = 0; players && i < players.length; i++) {
    roster.push({
      userId: players[i].ai ? null : players[i].id,
      name: players[i].name,
      team: i % 2,
      slot: Math.floor(i / 2),
      ai: !!players[i].ai,
    });
  }
  return roster;
}

globalThis.game = {

  // Static declarations, read by the platform once at publish time (not per
  // invocation): the sim tick rate and the achievement catalog.
  tickRateHz: 30,
  achievements: [
    { key: 'debut', name: 'Debut', description: 'Finish your first match.', points: 10 },
    { key: 'first-win', name: 'First Win', description: 'Win a match.', points: 25 },
    { key: 'goalscorer', name: 'Goalscorer', description: 'Score a goal.', points: 15 },
    { key: 'hat-trick', name: 'Hat-Trick', description: 'Score three goals in one match.', points: 50 },
    { key: 'clean-sheet', name: 'Clean Sheet', description: 'Win without conceding a goal.', points: 40 },
  ],

  // New session. Roster seats come from ctx.room.roster (team/slot) for
  // room-bound matches, or from ctx.players for standalone ones; missing
  // seats are filled with AI. The match seed derives from ctx.random.
  createSession: function (ctx) {
    var roster = (ctx.room && ctx.room.roster && ctx.room.roster.length)
      ? ctx.room.roster : synthRoster(ctx.players);
    var teamSize = Math.max(1, Math.ceil(roster.length / 2));
    var seed = Math.floor((ctx.random || 0) * 2147483647);
    var fillRng = makeRng(seed ^ 0x9e3779b9);
    var simRoster = [];
    var seats = {};
    for (var t = 0; t < 2; t++) {
      for (var s = 0; s < teamSize; s++) {
        var pid = t * teamSize + s;
        var entry = null;
        for (var i = 0; i < roster.length; i++) {
          if (roster[i].team === t && roster[i].slot === s) { entry = roster[i]; break; }
        }
        if (entry) {
          simRoster[pid] = { userId: entry.userId || null, name: entry.name, isAi: !!entry.ai || !entry.userId };
        } else {
          simRoster[pid] = { userId: null, name: takeAiName(fillRng), isAi: true };
        }
        seats[pid] = {
          userId: simRoster[pid].userId, name: simRoster[pid].name,
          standin: false, gone: false,
        };
      }
    }
    var match = createMatch({ teamSize: teamSize, roster: simRoster, seed: seed });
    var stored = ctx.playerStates || {};
    var playerDocs = {};
    var replayRoster = [];
    for (var rp = 0; rp < teamSize * 2; rp++) {
      replayRoster.push({
        pid: rp, team: rp < teamSize ? 0 : 1,
        name: simRoster[rp].name, ai: simRoster[rp].isAi,
      });
      var uid = simRoster[rp].userId;
      if (uid && !simRoster[rp].isAi) {
        var src = stored[uid] || {};
        playerDocs[uid] = {
          elo: typeof src.elo === 'number' ? src.elo : ELO_DEFAULT,
          wins: src.wins | 0, losses: src.losses | 0, draws: src.draws | 0,
        };
      }
    }
    var state = {
      v: 1,
      match: match,
      inputs: {},
      seats: seats,
      lastTickNow: null,
      lastSnapAt: 0,
      serverNow: ctx.now,
      tick: 0,
      offlineSince: {},
      pendingCeremonies: [],
      ended: false,
      goals: {},
      playerDocs: playerDocs,
      summary: { status: 'active', moveCount: 0 },
      replay: {
        v: 1, every: REPLAY_FRAME_EVERY,
        teamSize: teamSize, halfLength: match.halfLength,
        roster: replayRoster, frames: [], evs: [], truncated: false,
      },
    };
    return { ok: true, sessionState: state, broadcast: [{ to: 'all', data: buildSnapshot(state) }] };
  },

  // Client commands: 'input' (latest-wins per seat) and 'sync' (snapshot back
  // to the sender). Everything else is ignored.
  onPlayerMessage: function (ctx) {
    var state = ctx.sessionState;
    if (!state || !state.match) return { ok: false, error: 'No session state.' };
    rehydrate(state);
    var msg = ctx.message || {};
    var data = msg.data || {};

    if (data.type === 'input') {
      // Compatibility path for hosts that do not batch realtime input into
      // ctx.inputs. The StarHermit realtime runtime normally applies it onTick.
      storeRealtimeInput(state, msg.from, data, ctx.now);
      return { ok: true, sessionState: state, broadcast: [] };
    }

    if (data.type === 'sync') {
      return { ok: true, sessionState: state, broadcast: [{ to: [msg.from], data: buildSnapshot(state) }] };
    }

    return { ok: true, sessionState: state, broadcast: [] };
  },

  // One simulation step (~30 Hz), presence reconciliation, ceremony timeline,
  // event fan-out, throttled snapshots, end-of-session detection.
  onTick: function (ctx) {
    var state = ctx.sessionState;
    if (!state || !state.match) return { ok: false, error: 'No session state.' };
    rehydrate(state);
    var match = state.match;
    var bc = [];

    var dt;
    if (state.lastTickNow == null) dt = 1 / 30;
    else dt = clamp((ctx.now - state.lastTickNow) / 1000, 0, MAX_TICK_DT);
    state.lastTickNow = ctx.now;
    state.serverNow = ctx.now;
    state.tick++;
    state.summary.moveCount = state.tick;

    // The platform mailbox supplies at most one latest input per authenticated
    // sender each tick, avoiding a complete script/DB transaction per frame.
    var realtimeInputs = ctx.inputs || [];
    for (var ri = 0; ri < realtimeInputs.length; ri++) {
      var frame = realtimeInputs[ri];
      if (frame && frame.data && frame.data.type === 'input')
        storeRealtimeInput(state, frame.from, frame.data, ctx.now);
    }

    if (!state.ended) {
      reconcilePresence(ctx, state);
      maybeStartCeremony(state);
      drainEvents(match, bc, state);

      // inputs: fresh human input for human seats, AI for the rest; only
      // open play consumes inputs (other phases ignore them — save the CPU)
      var inputs = new Map();
      if (match.phase === 'play') {
        for (var key in state.inputs) {
          if (ctx.now - state.inputs[key].at > INPUT_STALE_MS) delete state.inputs[key];
        }
        for (var i = 0; i < match.players.length; i++) {
          var p = match.players[i];
          var seat = state.seats[p.id];
          if (seat && seat.userId && !p.isAi) {
            var stored = state.inputs[p.id];
            inputs.set(p.id, stored ? {
              mx: stored.mx, mz: stored.mz, turn: stored.turn, fwd: stored.fwd,
              sprint: stored.sprint,
              pass: stored.pass, shoot: stored.shoot, tackle: stored.tackle,
            } : emptyInput());
            // Movement remains latest-wins; action edges are consumed exactly
            // once even if no newer movement frame arrives before another tick.
            if (stored) { stored.pass = false; stored.shoot = 0; stored.tackle = false; }
          } else {
            inputs.set(p.id, computeAiInput(match, p, dt, 1));
          }
        }
      }
      stepMatch(match, inputs, dt);
      drainEvents(match, bc, state);
      maybeStartCeremony(state); // e.g. a goal celebration just ended
      drainEvents(match, bc, state);

      recordReplayFrame(state);

      // all humans gone -> abandon as a draw, platform closes the room
      if (match.phase !== 'end' && allHumansGone(ctx, state)) {
        state.ended = true;
        state.summary.status = 'finished';
        bc.push({ to: 'all', data: { type: 'ev', ev: { type: 'abandoned-draw' } } });
        if (ctx.now - state.lastSnapAt >= SNAP_INTERVAL_MS) {
          state.lastSnapAt = ctx.now;
          bc.push({ to: 'all', data: buildSnapshot(state) });
        }
        return {
          ok: true, sessionState: state, broadcast: bc,
          result: { draw: true, score: [match.score[0], match.score[1]] },
        };
      }

      // full time (the 'fulltime' event went out in the drained events above)
      if (match.phase === 'end') {
        state.ended = true;
        state.summary.status = 'finished';
        var winner = match.score[0] === match.score[1] ? -1 : (match.score[0] > match.score[1] ? 0 : 1);
        if (ctx.now - state.lastSnapAt >= SNAP_INTERVAL_MS) {
          state.lastSnapAt = ctx.now;
          bc.push({ to: 'all', data: buildSnapshot(state) });
        }
        var ratings = computeRatings(state, winner);
        var done = {
          ok: true, sessionState: state, broadcast: bc,
          result: { score: [match.score[0], match.score[1]], winner: winner, draw: winner === -1 },
        };
        if (ratings) {
          done.playerStates = ratings.playerStates;
          done.eloUpdates = ratings.eloUpdates;
        }
        var grants = computeAchievements(state, winner);
        if (grants) done.achievements = grants;
        return done;
      }
    }

    if (ctx.now - state.lastSnapAt >= SNAP_INTERVAL_MS) {
      state.lastSnapAt = ctx.now;
      bc.push({ to: 'all', data: buildSnapshot(state) });
    }
    return { ok: true, sessionState: state, broadcast: bc };
  },
};

// ---------------------------------------------------------------------------
// Client-side reuse. The browser loads this same file as a classic <script>;
// js/game/sim.js and js/game/ai.js re-export everything below so the client
// shares exactly one code path with the server.
// ---------------------------------------------------------------------------
globalThis.FootballSim = {
  WALK_SPEED: WALK_SPEED,
  RUN_SPEED: RUN_SPEED,
  SPRINT_SPEED: SPRINT_SPEED,
  TURN_RATE: TURN_RATE,
  BALL_SLOWDOWN: BALL_SLOWDOWN,
  CONTROL_RADIUS: CONTROL_RADIUS,
  STEAL_RADIUS: STEAL_RADIUS,
  TACKLE_RANGE: TACKLE_RANGE,
  GRAVITY: GRAVITY,
  BALL_R: BALL_R,
  RESTITUTION: RESTITUTION,
  AI_NAME_POOL: AI_NAME_POOL,
  takeAiName: takeAiName,
  pitchFor: pitchFor,
  roleForSlot: roleForSlot,
  formationAnchor: formationAnchor,
  rngNext: rngNext,
  makeRng: makeRng,
  attachRng: attachRng,
  createMatch: createMatch,
  makePersonality: makePersonality,
  resetKickoff: resetKickoff,
  attackSign: attackSign,
  emptyInput: emptyInput,
  stepMatch: stepMatch,
  startCeremony: startCeremony,
  dist: dist,
  clamp: clamp,
  openness: openness,
  computeAiInput: computeAiInput,
  clearAiPlans: clearAiPlans,
};
