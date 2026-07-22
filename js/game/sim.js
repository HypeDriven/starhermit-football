// sim.js — dependency-free football simulation core.
// Runs identically on the room host (authoritative), on guests (prediction),
// and offline (practice). No three.js imports — pure math on plain objects.
//
// Units are meters, seconds. Pitch centered on origin: x ∈ [-L/2, L/2] is the
// length (goals at each end), z ∈ [-W/2, W/2] the width. Team 0 attacks +x in
// half 1; teams swap sides at half time.

export const WALK_SPEED = 2.1;
export const RUN_SPEED = 5.4;
export const SPRINT_SPEED = 7.4;
export const BALL_SLOWDOWN = 0.88;      // dribbling pace factor
export const CONTROL_RADIUS = 0.95;     // gain possession distance
export const STEAL_RADIUS = 0.62;       // proximity poke distance
export const TACKLE_RANGE = 1.5;
export const GRAVITY = -21;             // arcade gravity (snappier arcs)
export const BALL_R = 0.11;
export const RESTITUTION = 0.55;
export const AI_NAME_POOL = [
  'Rafa Vento', 'Moss Kante', 'Theo Brandt', 'Iko Sarr', 'Dario Pell',
  'Nico Falke', 'Bram Okafor', 'Luca Reyes', 'Jori Lindqvist', 'Emre Kaya',
  'Silas Mota', 'Anton Weiss', 'Kofi Mensah', 'Pavel Drozd', 'Marco Ruiz',
  'Elias Nord', 'Tariq Aziz', 'Owen Clarke', 'Yuto Sana', 'Gabriel Fonseca',
  'Viktor Halme', 'Sacha Diallo', 'Rory Quinn', 'Mateo Vidal', 'Jonas Berg',
  'Cole Ashford', 'Ilya Sorin', 'Tomás Rocha', 'Felix Grau', 'Andi Prata',
];

let nextAiNameIdx = 0;
export function takeAiName(rng) {
  const i = Math.floor((rng ? rng() : Math.random()) * AI_NAME_POOL.length);
  nextAiNameIdx = (i + 1) % AI_NAME_POOL.length;
  return AI_NAME_POOL[i];
}

// ── Pitch / formation helpers ────────────────────────────────────────────────

export function pitchFor(teamSize) {
  const L = 40 + (teamSize - 1) * 7.2;            // 40 m (1v1) … 112 m (11v11)
  const W = L * 0.62;
  const goalW = Math.min(7.32, Math.max(2.0, W * 0.10));
  const goalH = goalW * 0.33;
  const boxD = L * 0.14, boxW = W * 0.55;         // penalty box depth/width
  return { L, W, goalW, goalH, boxD, boxW };
}

// Role for a formation slot: slot 0 is GK, then defenders, midfield, forwards.
export function roleForSlot(slot, teamSize) {
  if (teamSize === 1) return 'FW';
  if (slot === 0) return 'GK';
  const f = slot / (teamSize - 1);
  if (f < 0.45) return 'DF';
  if (f < 0.8) return 'MF';
  return 'FW';
}

// Base formation anchor (normalized: u ∈ [-0.5,0.5] along length toward own
// goal = -, v ∈ [-0.5,0.5] across width), in the team's own attacking frame.
export function formationAnchor(slot, teamSize) {
  if (teamSize === 1) return { u: -0.05, v: 0 };
  const role = roleForSlot(slot, teamSize);
  if (role === 'GK') return { u: -0.47, v: 0 };
  // Spread players within their line.
  const lineMates = [];
  for (let i = 0; i < teamSize; i++) if (roleForSlot(i, teamSize) === role) lineMates.push(i);
  const idx = lineMates.indexOf(slot);
  const n = lineMates.length;
  const v = n === 1 ? 0 : -0.38 + (0.76 * idx) / (n - 1);
  const u = role === 'DF' ? -0.28 : role === 'MF' ? -0.05 : 0.22;
  return { u, v };
}

// Deterministic per-match RNG (mulberry32) so host and guests agree when seeded.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Match creation ───────────────────────────────────────────────────────────

// roster: [{ userId|null, name, isAi, personality? }] length = teamSize*2,
// first teamSize entries are team 0 (home), rest team 1 (away).
export function createMatch({ teamSize, roster, seed = 1234, halfLength = 180 }) {
  const rng = makeRng(seed);
  const pitch = pitchFor(teamSize);
  const players = [];
  for (let t = 0; t < 2; t++) {
    for (let s = 0; s < teamSize; s++) {
      const i = t * teamSize + s;
      const r = roster[i] || { name: takeAiName(rng), isAi: true, userId: null };
      players.push({
        id: i, team: t, slot: s, role: roleForSlot(s, teamSize),
        userId: r.userId ?? null, name: r.name, isAi: !!r.isAi,
        personality: r.personality || makePersonality(rng),
        x: 0, z: 0, vx: 0, vz: 0, facing: t === 0 ? 0 : Math.PI,
        anim: 'idle', animSpeed: 0, phase: rng() * 6.28,
        kickT: 0, tackleT: 0, stunT: 0, diveT: 0, diveDir: 0,
        celebrateT: 0,
      });
    }
  }
  const state = {
    teamSize, pitch, halfLength, rng,
    players,
    ball: { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTouch: null },
    phase: 'play',           // 'play' | 'goal' | 'halftime' | 'end'
    phaseT: 0,
    half: 1, time: 0,
    score: [0, 0],
    kickoffTeam: 0,
    events: [],
    stats: { shots: [0, 0], possession: [0, 0] },
  };
  resetKickoff(state, 0);
  return state;
}

export function makePersonality(rng) {
  const r = rng || Math.random;
  return {
    aggression: 0.3 + r() * 0.7,
    positioning: 0.3 + r() * 0.7,
    dribbling: 0.3 + r() * 0.7,
    passing: 0.3 + r() * 0.7,
    workRate: 0.4 + r() * 0.6,
  };
}

// Place both teams at formation anchors; ball at center with kickoff team.
export function resetKickoff(state, kickoffTeam) {
  const { pitch, teamSize } = state;
  state.kickoffTeam = kickoffTeam;
  for (const p of state.players) {
    const a = formationAnchor(p.slot, teamSize);
    p.x = a.u * pitch.L * -attackSign(state, p.team);
    p.z = a.v * pitch.W;
    if (p.team === kickoffTeam && p.role === 'FW') {
      // two forwards near the center spot
      p.x = -attackSign(state, p.team) * (p.slot % 2 === 0 ? 0.5 : 1.6);
      p.z = p.slot % 2 === 0 ? 0.3 : -0.9;
    }
    p.vx = p.vz = 0; p.stunT = 0; p.tackleT = 0; p.kickT = 0; p.diveT = 0;
    p.facing = attackSign(state, p.team) > 0 ? 0 : Math.PI;
    p.anim = 'idle'; p.celebrateT = 0;
  }
  state.ball.x = 0; state.ball.y = BALL_R; state.ball.z = 0;
  state.ball.vx = 0; state.ball.vy = 0; state.ball.vz = 0;
  state.ball.owner = null; state.ball.lastTouch = null;
}

// +1 if the team attacks toward +x this half.
export function attackSign(state, team) {
  const base = team === 0 ? 1 : -1;
  return state.half === 1 ? base : -base;
}

// ── Input shape ──────────────────────────────────────────────────────────────
// { mx, mz }  desired move direction, normalized, world space (≤ 1 magnitude)
// sprint      bool
// pass        true on the frame a pass is triggered
// shoot       0, or release power in (0,1]
// tackle      true on the frame a tackle/dive is triggered

const EMPTY_INPUT = { mx: 0, mz: 0, sprint: false, pass: false, shoot: 0, tackle: false };
export function emptyInput() { return { ...EMPTY_INPUT }; }

// ── Main step ────────────────────────────────────────────────────────────────

export function stepMatch(state, inputs, dt) {
  state.events.length = 0;
  dt = Math.min(dt, 0.05);

  if (state.phase === 'goal' || state.phase === 'halftime') {
    state.phaseT -= dt;
    // players celebrate / walk back
    for (const p of state.players) {
      if (p.celebrateT > 0) { p.celebrateT -= dt; p.anim = 'celebrate'; }
      else p.anim = Math.abs(p.vx) + Math.abs(p.vz) > 0.5 ? 'walk' : 'idle';
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

  for (const p of state.players) {
    const input = inputs.get(p.id) || EMPTY_INPUT;
    stepPlayer(state, p, input, dt);
  }
  stepBall(state, dt);

  // possession stat
  if (state.ball.owner != null) state.stats.possession[state.players[state.ball.owner].team] += dt;

  return state.events;
}

function ballInPlayDanger(state) {
  // don't blow the whistle while a shot is flying at goal
  const b = state.ball;
  const spd = Math.hypot(b.vx, b.vz);
  return b.owner == null && spd > 9;
}

function endMatch(state) {
  state.phase = 'end';
  const winner = state.score[0] === state.score[1] ? -1 : (state.score[0] > state.score[1] ? 0 : 1);
  for (const p of state.players) {
    p.anim = winner === -1 ? 'idle' : (p.team === winner ? 'celebrate' : 'dejected');
    if (p.team === winner) p.celebrateT = 5;
  }
  push(state, { type: 'fulltime', score: [...state.score], winner });
}

function push(state, ev) { state.events.push(ev); }

// ── Players ──────────────────────────────────────────────────────────────────

function stepPlayer(state, p, input, dt) {
  const b = state.ball;
  const hasBall = b.owner === p.id;

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
  const mag = Math.hypot(input.mx, input.mz);
  let speed = 0;
  if (mag > 0.01) {
    speed = input.sprint ? SPRINT_SPEED : (mag > 0.45 ? RUN_SPEED : WALK_SPEED);
    speed *= Math.min(1, mag * 1.6);
    if (hasBall) speed *= BALL_SLOWDOWN;
  }
  const nx = mag > 0.01 ? input.mx / mag : 0;
  const nz = mag > 0.01 ? input.mz / mag : 0;

  // acceleration
  const accel = 22;
  const tx = nx * speed, tz = nz * speed;
  p.vx += clamp(tx - p.vx, -accel * dt, accel * dt);
  p.vz += clamp(tz - p.vz, -accel * dt, accel * dt);

  // tackle lunge
  if (input.tackle && p.tackleT <= 0 && p.kickT <= 0) {
    p.tackleT = 0.45;
    const face = mag > 0.01 ? Math.atan2(nz, nx) : p.facing;
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
    const owner = b.owner != null ? state.players[b.owner] : null;
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
  const spd = Math.hypot(p.vx, p.vz);
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
  const { L, W } = state.pitch;
  const m = 1.5; // may step just off the pitch
  p.x = clamp(p.x, -L / 2 - m, L / 2 + m);
  p.z = clamp(p.z, -W / 2 - m, W / 2 + m);
}

function nearOwnGoal(state, p) {
  const gx = -attackSign(state, p.team) * state.pitch.L / 2;
  return Math.abs(p.x - gx) < state.pitch.L * 0.2;
}

function nearBall(state, p, r) {
  const b = state.ball;
  return Math.hypot(b.x - p.x, b.z - p.z) < r;
}

// ── Ball actions ─────────────────────────────────────────────────────────────

function doShoot(state, p, power) {
  const b = state.ball;
  const gx = attackSign(state, p.team) * state.pitch.L / 2;
  // aim at goal mouth; spread grows with distance and weaker technique
  const dx0 = gx - p.x;
  const distGoal = Math.hypot(dx0, p.z);
  const spread = (1 - (p.personality ? p.personality.dribbling : 0.5)) * 0.35
    + (distGoal / state.pitch.L) * 0.9;
  const aimZ = clamp((state.rng() - 0.5) * state.pitch.goalW * (0.6 + spread * 2),
    -state.pitch.goalW * 1.4, state.pitch.goalW * 1.4);
  const dx = gx - p.x, dz = aimZ - p.z;
  const d = Math.hypot(dx, dz) || 1;
  const spd = 15 + power * 11;
  const elev = 0.12 + power * 0.3 * state.rng() + (d / state.pitch.L) * 0.3;
  b.owner = null; b.lastTouch = p.id;
  b.vx = (dx / d) * spd; b.vz = (dz / d) * spd;
  b.vy = spd * elev * 0.55;
  b.x = p.x + (dx / d) * 0.6; b.z = p.z + (dz / d) * 0.6; b.y = Math.max(b.y, 0.15);
  p.kickT = 0.4;
  state.stats.shots[p.team]++;
  push(state, { type: 'kick', player: p.id, power: 0.4 + power * 0.6, kind: 'shoot' });
}

function doPass(state, p) {
  const b = state.ball;
  // best teammate: within a forward cone, prefer open + forward
  let best = null, bestScore = -1;
  for (const q of state.players) {
    if (q.team !== p.team || q.id === p.id) continue;
    const dx = q.x - p.x, dz = q.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 2 || d > 45) continue;
    const angTo = Math.atan2(dz, dx);
    let da = Math.abs(angDiff(angTo, p.facing));
    if (da > 1.9) continue;
    const fwd = attackSign(state, p.team) * dx / d;      // forward-ness
    const open = openness(state, q);
    const score = fwd * 0.9 + open * 0.8 - da * 0.25 + (state.rng() * 0.15);
    if (score > bestScore) { bestScore = score; best = q; }
  }
  const dir = best ? Math.atan2(best.z - p.z, best.x - p.x) : p.facing;
  const d = best ? Math.hypot(best.x - p.x, best.z - p.z) : 10;
  const spd = clamp(9 + d * 0.42, 10, 24);
  b.owner = null; b.lastTouch = p.id;
  // lead the receiver slightly
  const lead = best ? 0.35 : 0;
  const tx = best ? best.x + best.vx * lead : p.x + Math.cos(dir) * 12;
  const tz = best ? best.z + best.vz * lead : p.z + Math.sin(dir) * 12;
  const tdx = tx - p.x, tdz = tz - p.z;
  const td = Math.hypot(tdx, tdz) || 1;
  b.vx = (tdx / td) * spd; b.vz = (tdz / td) * spd;
  b.vy = d > 18 ? spd * 0.16 : 0;   // lofted only for long balls
  b.x = p.x + Math.cos(dir) * 0.6; b.z = p.z + Math.sin(dir) * 0.6;
  b.y = Math.max(b.y, 0.15);
  p.kickT = 0.35;
  push(state, { type: 'kick', player: p.id, power: 0.45, kind: 'pass' });
}

// Ball pops loose (tackle, heavy touch).
function looseBall(state, fromPlayer, spd) {
  const b = state.ball;
  const a = state.rng() * Math.PI * 2;
  b.owner = null; b.lastTouch = fromPlayer.id;
  b.vx = Math.cos(a) * spd; b.vz = Math.sin(a) * spd; b.vy = 1.2;
  b.x = fromPlayer.x + Math.cos(a) * 0.5; b.z = fromPlayer.z + Math.sin(a) * 0.5;
  push(state, { type: 'kick', player: fromPlayer.id, power: 0.25, kind: 'loose' });
}

// ── Ball physics ─────────────────────────────────────────────────────────────

function stepBall(state, dt) {
  const b = state.ball;
  const { L, W, goalW, goalH } = state.pitch;

  if (b.owner != null) {
    const p = state.players[b.owner];
    // dribble: ball held ahead of owner, small knock-on at speed
    const lead = 0.5 + Math.hypot(p.vx, p.vz) * 0.045;
    const tx = p.x + Math.cos(p.facing) * lead;
    const tz = p.z + Math.sin(p.facing) * lead;
    b.vx = (tx - b.x) / Math.max(dt, 1e-3);
    b.vz = (tz - b.z) / Math.max(dt, 1e-3);
    b.x = tx; b.z = tz; b.y = BALL_R; b.vy = 0;
    b.lastTouch = p.id;

    // proximity steal: opponent close enough on the ball side pokes it loose;
    // sprinting carriers take heavier touches and are easier to dispossess
    const ownerSpd = Math.hypot(p.vx, p.vz);
    const stealRate = 1.2 * (ownerSpd > 6 ? 1.8 : 1);
    for (const q of state.players) {
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
    const f = Math.max(0, 1 - 2.1 * dt);
    b.vx *= f; b.vz *= f;
  } else {
    // air drag
    const f = Math.max(0, 1 - 0.28 * dt);
    b.vx *= f; b.vz *= f;
  }

  // goals & out of bounds
  const inMouth = Math.abs(b.z) < goalW / 2 && b.y < goalH;
  if (Math.abs(b.x) > L / 2 + BALL_R) {
    if (inMouth) { goalScored(state); return; }
    // goal-frame bounce (posts/bar approximated as ring around the mouth)
    const overBar = b.y >= goalH && b.y < goalH + 0.25 && Math.abs(b.z) < goalW / 2 + 0.3;
    const nearPost = Math.abs(Math.abs(b.z) - goalW / 2) < 0.25 && b.y < goalH + 0.3;
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
  for (const p of state.players) {
    if (p.stunT > 0 || p.kickT > 0.15) continue;
    const d = dist(p, b);
    const reach = p.role === 'GK' && nearOwnGoal(state, p) ? CONTROL_RADIUS * 1.7 : CONTROL_RADIUS;
    if (d < reach && b.y < 1.25) {
      // slow enough, or GK claim
      const spd = Math.hypot(b.vx, b.vz);
      if (spd < 9 || (p.role === 'GK' && spd < 16)) {
        b.owner = p.id; b.lastTouch = p.id;
        push(state, { type: 'control', player: p.id });
        break;
      }
    }
  }
}

function goalScored(state) {
  const b = state.ball;
  // scoring team: the team attacking the goal the ball crossed
  const crossedSign = Math.sign(b.x);
  const scoringTeam = state.players.find(p => attackSign(state, p.team) === crossedSign).team;
  state.score[scoringTeam]++;
  state.lastScoredTeam = scoringTeam;
  state.phase = 'goal';
  state.phaseT = 3.2;
  b.owner = null;
  b.vx *= 0.15; b.vz *= 0.15;
  // pin ball into the net
  b.x = crossedSign * (state.pitch.L / 2 + 0.7);
  for (const p of state.players) {
    if (p.team === scoringTeam) p.celebrateT = 3;
  }
  push(state, { type: 'goal', team: scoringTeam, scorer: b.lastTouch, score: [...state.score] });
}

// Simplified restarts: throw-in / goal-kick / corner all become "nearest
// eligible player gains the ball at the boundary point".
function restart(state, kind) {
  const b = state.ball;
  const { L, W } = state.pitch;
  b.x = clamp(b.x, -L / 2 + 0.4, L / 2 - 0.4);
  b.z = clamp(b.z, -W / 2 + 0.4, W / 2 - 0.4);
  b.y = BALL_R; b.vx = 0; b.vy = 0; b.vz = 0;
  const lastTeam = b.lastTouch != null ? state.players[b.lastTouch].team : 1 - state.kickoffTeam;
  const giveTeam = 1 - lastTeam;
  // nearest player of the team awarded the restart
  let best = null, bd = 1e9;
  for (const p of state.players) {
    if (p.team !== giveTeam) continue;
    const d = dist(p, b);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) {
    b.owner = best.id; b.lastTouch = best.id;
    push(state, { type: 'restart', kind, team: giveTeam, player: best.id });
  }
}

// ── Small utilities ──────────────────────────────────────────────────────────

export function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function turnToward(cur, target, maxStep) {
  const d = angDiff(target, cur);
  return cur + clamp(d, -maxStep, maxStep);
}

// How unmarked is this player (0..1).
export function openness(state, p) {
  let nearest = 1e9;
  for (const q of state.players) {
    if (q.team === p.team) continue;
    nearest = Math.min(nearest, dist(p, q));
  }
  return clamp(nearest / 12, 0, 1);
}
