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
// ctx = {
//   now:          ms since epoch (host clock)
//   random:       float in [0,1) supplied by the host per invocation
//   sessionId:    string
//   players:      [{ id, name }]
//   room:         { roomId, metadata,
//                   roster: [{ userId /*string|null*/, name, team /*0|1*/,
//                              slot, ai /*bool*/ }] }   // both teams, all seats
//   presence:     { "<userId>": { online: bool, left: bool } }  // tick/message
//   sessionState: object|null        // this script's session doc
//   playerStates: { [playerId]: object|null }
//   message:      { from, data } | undefined   // onPlayerMessage only
// }
//
// Returning `result` ends the session:
//   full time:        { score: [a, b], winner: -1|0|1, draw: bool }
//   abandoned (all humans gone): { draw: true, score: [a, b] }
//
// sessionState = {
//   v: 1,
//   match:  <createMatch state; plus ceremony, aiPlans, rngState — see below>,
//   inputs: { "<playerId>": { seq, mx, mz, sprint, pass, shoot, tackle, at } },
//   seats:  { "<playerId>": { userId, name, standin, gone } },
//   lastTickNow, lastSnapAt,            // ms
//   offlineSince: { "<userId>": now },  // ms, offline-grace tracking
//   pendingCeremonies: [{ kind, playerId, inName }],
//   ended: bool,
// }
//
// ── Client -> server messages ───────────────────────────────────────────────
// { type:'input', seq, mx, mz, sprint, pass, shoot, tackle }  — send ~30 Hz.
//   mx/mz: desired move direction, normalized (|m| <= 1), world space.
//   sprint: bool. pass/tackle: true on the triggering frame only.
//   shoot: 0, or release power in (0,1]. Inputs older than 1 s are zeroed.
// { type:'sync' } — a full snapshot is broadcast back to the sender only.
//
// ── Server -> client broadcasts ─────────────────────────────────────────────
// { type:'snap', ... } — full state snapshot, ~15 Hz (>= 66 ms apart):
//   ts  teamSize              t   match clock (s)      h   half (1|2)
//   ph  phase: 'play' | 'goal' | 'halftime' | 'injury' | 'end'
//   sc  [score0, score1]      kt  kickoffTeam
//   b   [x, y, z, vx, vy, vz, owner]       owner -1 = loose ball
//   pl  one entry per player, in id order:
//       [id, team, x, z, vx, vz, facing, anim, animSpeed, phase,
//        kickT, tackleT, stunT, diveT, diveDir, celebrateT, isAi(0|1), name]
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
//   st:  [x, z, angle, carrying(0|1)],                // stretcher
// }
// Virtual entities use the same anim conventions as players (walk/run with
// animSpeed + accumulating phase so legs animate).
//
// Timeline (t in seconds; entities move at walk 2.1 / run 5.4 m/s, sped up
// as needed to hit their deadline on large pitches):
//   0        victim falls at the spot ('injury-start'), ball owner cleared
//   0.5–2.5  referee runs in from the +z touchline -> 'referee-whistle'
//   2.5–4    carriers + stretcher walk in from the near touchline ->
//            'stretcher-load' (victim slaves to the stretcher)
//   4–7      stretcher carried to the west tunnel (x = -L/2 - 6, z = 0,
//            the walkout tunnel) -> 'stretcher-off'; victim entity teleports
//            to the tunnel mouth and takes the replacement identity (name)
//   7–9.5    replacement runs from the tunnel to its formation anchor;
//            'substitution' fires when it crosses onto the pitch
//   8.5–10   referee jogs back off
//   10       ceremony ends: dropped-ball restart at the spot (ball
//            stationary, no owner, both teams may play it), phase 'play'.
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

  // target speed
  var mag = Math.hypot(input.mx, input.mz);
  var speed = 0;
  if (mag > 0.01) {
    speed = input.sprint ? SPRINT_SPEED : (mag > 0.45 ? RUN_SPEED : WALK_SPEED);
    speed *= Math.min(1, mag * 1.6);
    if (hasBall) speed *= BALL_SLOWDOWN;
  }
  var nx = mag > 0.01 ? input.mx / mag : 0;
  var nz = mag > 0.01 ? input.mz / mag : 0;

  // acceleration
  var accel = 22;
  var tx = nx * speed, tz = nz * speed;
  p.vx += clamp(tx - p.vx, -accel * dt, accel * dt);
  p.vz += clamp(tz - p.vz, -accel * dt, accel * dt);

  // tackle lunge
  if (input.tackle && p.tackleT <= 0 && p.kickT <= 0) {
    p.tackleT = 0.45;
    var face = mag > 0.01 ? Math.atan2(nz, nx) : p.facing;
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

  // facing: toward movement, else toward ball
  var spd = Math.hypot(p.vx, p.vz);
  if (spd > 0.4) p.facing = Math.atan2(p.vz, p.vx);
  else p.facing = turnToward(p.facing, Math.atan2(b.z - p.z, b.x - p.x), 6 * dt);

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

function doPass(state, p) {
  var b = state.ball;
  // best teammate: within a forward cone, prefer open + forward
  var best = null, bestScore = -1;
  for (var qi = 0; qi < state.players.length; qi++) {
    var q = state.players[qi];
    if (q.team !== p.team || q.id === p.id) continue;
    var dx = q.x - p.x, dz = q.z - p.z;
    var d = Math.hypot(dx, dz);
    if (d < 2 || d > 45) continue;
    var angTo = Math.atan2(dz, dx);
    var da = Math.abs(angDiff(angTo, p.facing));
    if (da > 1.9) continue;
    var fwd = attackSign(state, p.team) * dx / d;      // forward-ness
    var open = openness(state, q);
    var score = fwd * 0.9 + open * 0.8 - da * 0.25 + (state.rng() * 0.15);
    if (score > bestScore) { bestScore = score; best = q; }
  }
  var dir = best ? Math.atan2(best.z - p.z, best.x - p.x) : p.facing;
  var dd = best ? Math.hypot(best.x - p.x, best.z - p.z) : 10;
  var spd = clamp(9 + dd * 0.42, 10, 24);
  b.owner = null; b.lastTouch = p.id;
  // lead the receiver slightly
  var lead = best ? 0.35 : 0;
  var tx2 = best ? best.x + best.vx * lead : p.x + Math.cos(dir) * 12;
  var tz2 = best ? best.z + best.vz * lead : p.z + Math.sin(dir) * 12;
  var tdx = tx2 - p.x, tdz = tz2 - p.z;
  var td = Math.hypot(tdx, tdz) || 1;
  b.vx = (tdx / td) * spd; b.vz = (tdz / td) * spd;
  b.vy = dd > 18 ? spd * 0.16 : 0;   // lofted only for long balls
  b.x = p.x + Math.cos(dir) * 0.6; b.z = p.z + Math.sin(dir) * 0.6;
  b.y = Math.max(b.y, 0.15);
  p.kickT = 0.35;
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
  CREW_BY: 4,      // victim loaded
  CARRY_BY: 7,     // stretcher reaches the tunnel
  SUB_BY: 9.5,     // replacement reaches its formation anchor
  REF_OUT: 8.5,    // referee jogs back off
  END: 10,         // drop-ball restart, phase back to 'play'
};

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
      { x: p.x - 0.6, z: entryZ, facing: faceIn, anim: 'idle', animSpeed: 0, phase: 0 },
      { x: p.x + 0.6, z: entryZ, facing: faceIn, anim: 'idle', animSpeed: 0, phase: 0 },
    ],
    stretcher: { x: p.x, z: entryZ + side * 0.7, angle: faceIn, carrying: false },
    subPushed: false,
    stage: 0, // 0 ref inbound · 1 whistled · 2 loaded/carrying · 3 off · 5 sub done
  };
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
  if (c.stage < 2) {
    p.x = c.spot.x; p.z = c.spot.z;
    p.vx = 0; p.vz = 0; p.anim = 'fallen'; p.animSpeed = 0;
  } else if (c.stage === 2) {
    p.x = c.stretcher.x; p.z = c.stretcher.z;
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
    approach(ref, c.refHome.x, c.refHome.z, WALK_SPEED * 1.4, CER.END - c.t, dt);
  }

  // ── carriers + stretcher ──
  var st = c.stretcher;
  if (c.t >= CER.CREW_IN && c.stage < 2) {
    approach(st, c.spot.x, c.spot.z, WALK_SPEED, CER.CREW_BY - c.t, dt);
    approach(c.carriers[0], c.spot.x - 0.95, c.spot.z, WALK_SPEED, CER.CREW_BY - c.t, dt);
    approach(c.carriers[1], c.spot.x + 0.95, c.spot.z, WALK_SPEED, CER.CREW_BY - c.t, dt);
    if (c.t >= CER.CREW_BY) {
      c.stage = 2; st.carrying = true;
      push(state, { type: 'stretcher-load', player: c.victimId });
    }
  } else if (c.stage === 2) {
    approach(st, tunnelX, 0, WALK_SPEED, CER.CARRY_BY - c.t, dt);
    approach(c.carriers[0], st.x - 0.95, st.z, WALK_SPEED * 1.2, CER.CARRY_BY - c.t, dt);
    approach(c.carriers[1], st.x + 0.95, st.z, WALK_SPEED * 1.2, CER.CARRY_BY - c.t, dt);
    if (c.t >= CER.CARRY_BY) {
      c.stage = 3; st.carrying = false;
      push(state, { type: 'stretcher-off', player: c.victimId, name: c.victimName });
      // one entity per seat: the carried-off player re-enters from the tunnel
      // as the replacement — swap the visible identity now
      p.name = c.replacementName;
      p.x = tunnelX; p.z = 0;
    }
  } else if (c.stage >= 3) {
    // crew drifts off into the tunnel
    approach(st, tunnelX - 2, 0, WALK_SPEED, 1e9, dt);
    approach(c.carriers[0], st.x - 0.95, st.z, WALK_SPEED, 1e9, dt);
    approach(c.carriers[1], st.x + 0.95, st.z, WALK_SPEED, 1e9, dt);
  }

  // ── replacement runs on to its formation anchor ──
  if (c.stage >= 3 && c.stage < 5) {
    var a = formationAnchor(p.slot, state.teamSize);
    var ax = a.u * L * -attackSign(state, p.team);
    var az = a.v * W;
    approach(p, ax, az, RUN_SPEED, CER.SUB_BY - c.t, dt);
    if (!c.subPushed && (p.x > -L / 2 || c.t >= CER.SUB_BY)) {
      c.subPushed = true;
      push(state, { type: 'substitution', player: p.id, outName: c.victimName, inName: c.replacementName, kind: c.kind });
    }
    if (c.t >= CER.SUB_BY) {
      p.x = ax; p.z = az; p.vx = 0; p.vz = 0; p.anim = 'idle'; p.animSpeed = 0;
      c.stage = 5;
    }
  }

  // ── done: dropped-ball restart ──
  if (c.t >= CER.END) {
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
var SNAP_INTERVAL_MS = 66;    // ~15 Hz snapshots (every other 30 Hz tick)
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

function drainEvents(match, out) {
  for (var i = 0; i < match.events.length; i++) {
    out.push({ to: 'all', data: { type: 'ev', ev: match.events[i] } });
  }
  match.events.length = 0;
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
      r2(p.diveT), r2(p.diveDir), r2(p.celebrateT), p.isAi ? 1 : 0, p.name]);
  }
  var b = m.ball;
  return {
    type: 'snap',
    ts: m.teamSize,
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
    st: [r2(c.stretcher.x), r2(c.stretcher.z), r2(c.stretcher.angle), c.stretcher.carrying ? 1 : 0],
  };
}

function rehydrate(state) {
  attachRng(state.match);
  if (!state.match.aiPlans) state.match.aiPlans = {};
}

globalThis.game = {

  // New session. Roster seats come from ctx.room.roster (team/slot); missing
  // seats are filled with AI. The match seed derives from ctx.random.
  createSession: function (ctx) {
    var roster = (ctx.room && ctx.room.roster) || [];
    var teamSize = Math.max(1, Math.floor(roster.length / 2));
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
    var state = {
      v: 1,
      match: match,
      inputs: {},
      seats: seats,
      lastTickNow: null,
      lastSnapAt: 0,
      offlineSince: {},
      pendingCeremonies: [],
      ended: false,
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
      var pid = state.ended ? -1 : playerIdForUser(state, msg.from);
      if (pid >= 0) {
        var seat = state.seats[pid];
        if (!seat.gone && !seat.standin) {
          state.inputs[pid] = {
            seq: data.seq | 0,
            mx: clamp(Number(data.mx) || 0, -1, 1),
            mz: clamp(Number(data.mz) || 0, -1, 1),
            sprint: !!data.sprint,
            pass: !!data.pass,
            shoot: clamp(Number(data.shoot) || 0, 0, 1),
            tackle: !!data.tackle,
            at: ctx.now,
          };
        }
      }
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

    if (!state.ended) {
      reconcilePresence(ctx, state);
      maybeStartCeremony(state);
      drainEvents(match, bc);

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
              mx: stored.mx, mz: stored.mz, sprint: stored.sprint,
              pass: stored.pass, shoot: stored.shoot, tackle: stored.tackle,
            } : emptyInput());
          } else {
            inputs.set(p.id, computeAiInput(match, p, dt, 1));
          }
        }
      }
      stepMatch(match, inputs, dt);
      drainEvents(match, bc);
      maybeStartCeremony(state); // e.g. a goal celebration just ended
      drainEvents(match, bc);

      // all humans gone -> abandon as a draw, platform closes the room
      if (match.phase !== 'end' && allHumansGone(ctx, state)) {
        state.ended = true;
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
        var winner = match.score[0] === match.score[1] ? -1 : (match.score[0] > match.score[1] ? 0 : 1);
        if (ctx.now - state.lastSnapAt >= SNAP_INTERVAL_MS) {
          state.lastSnapAt = ctx.now;
          bc.push({ to: 'all', data: buildSnapshot(state) });
        }
        return {
          ok: true, sessionState: state, broadcast: bc,
          result: { score: [match.score[0], match.score[1]], winner: winner, draw: winner === -1 },
        };
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
