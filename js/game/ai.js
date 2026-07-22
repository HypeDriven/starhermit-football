// ai.js — AI brains for every AI seat (host-side only).
// Utility scoring re-evaluated at ~6 Hz per player; steering runs every tick
// through the same input shape human clients send, so AI footballers obey
// exactly the same physics as humans.

import {
  attackSign, formationAnchor, dist, clamp, openness, emptyInput,
} from './sim.js';

// Per-player decision cache so we don't re-plan every tick.
const plans = new Map(); // playerId -> { t, mx, mz, wantShoot, wantPass, wantTackle }

export function computeAiInput(state, p, dt, difficulty = 1) {
  const input = emptyInput();
  const b = state.ball;
  const hasBall = b.owner === p.id;

  let plan = plans.get(p.id);
  const replanEvery = 0.16 / Math.max(0.4, difficulty * p.personality.workRate);
  if (!plan || plan.t <= 0) {
    plan = decide(state, p, hasBall, difficulty);
    plan.t = replanEvery;
    plans.set(p.id, plan);
  } else {
    plan.t -= dt;
  }

  // steering toward current target
  const dx = plan.x - p.x, dz = plan.z - p.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.15) {
    input.mx = dx / d; input.mz = dz / d;
    input.sprint = plan.sprint && d > 2.5;
  } else if (hasBall) {
    // face upfield while dribbling on the spot
    input.mx = 0; input.mz = 0;
  }

  // actions trigger the moment they're valid, not only on replans
  if (hasBall) {
    const gx = attackSign(state, p.team) * state.pitch.L / 2;
    const distGoal = Math.hypot(gx - p.x, p.z);
    const shootRange = state.pitch.L * 0.3;
    const pressed = nearestOpponent(state, p) < 2.2;
    if (distGoal < shootRange && plan.wantShoot && Math.random() < dt * (2 + difficulty * 4)) {
      input.shoot = clamp(0.45 + (1 - distGoal / shootRange) * 0.5 + Math.random() * 0.1, 0.3, 1);
    } else if ((pressed || plan.wantPass) && Math.random() < dt * (1.5 + p.personality.passing * 3)) {
      input.pass = true;
    } else if (p.role === 'GK' && d < 1) {
      input.pass = true; // distribute
    }
  } else if (b.owner != null && state.players[b.owner].team !== p.team) {
    const owner = state.players[b.owner];
    if (dist(p, owner) < 1.7 && plan.wantTackle && Math.random() < dt * (1 + p.personality.aggression * 4)) {
      input.tackle = true;
    }
    // GK dive at close-range shots
    if (p.role === 'GK' && b.owner == null) {
      const spd = Math.hypot(b.vx, b.vz);
      if (spd > 10 && dist(p, b) < 3.2 && ballHeadingAt(state, p)) input.tackle = true;
    }
  }

  return input;
}

function decide(state, p, hasBall, difficulty) {
  const b = state.ball;
  const { L, W } = state.pitch;
  const atk = attackSign(state, p.team);
  const anchor = formationAnchor(p.slot, state.teamSize);
  const personality = p.personality;

  // Formation anchor shifts with the ball: attack when we have it, fall back
  // when we don't; more "positioning" = holds shape, less = chases.
  const ballBiasU = clamp(b.x / (L / 2), -1, 1) * 0.16 * (b.owner != null && state.players[b.owner].team === p.team ? 1 : -0.7);
  let ax = (anchor.u + ballBiasU) * L * -atk * -1;
  let az = anchor.v * W + clamp(b.z / (W / 2), -1, 1) * W * 0.08;

  const plan = { x: ax, z: az, sprint: false, wantShoot: false, wantPass: false, wantTackle: false };
  const weHaveBall = b.owner != null && state.players[b.owner].team === p.team;
  const theyHaveBall = b.owner != null && state.players[b.owner].team !== p.team;

  if (p.role === 'GK') {
    // hold the line, track ball laterally, come for loose through balls
    const gx = -atk * L / 2;
    plan.x = gx + atk * clamp(Math.abs(b.x - gx) * 0.06, 0.6, L * 0.06);
    plan.z = clamp(b.z * 0.35, -state.pitch.goalW / 2 - 1, state.pitch.goalW / 2 + 1);
    if (b.owner == null) {
      const toGoal = Math.abs(b.x - gx);
      if (toGoal < L * 0.12 && Math.hypot(b.vx, b.vz) < 6) { plan.x = b.x; plan.z = b.z; plan.sprint = true; }
    }
    if (hasBall) { plan.wantPass = true; }
    return plan;
  }

  if (hasBall) {
    // dribble toward goal; pass when pressed or a clearly better option exists
    const gx = atk * L / 2;
    const distGoal = Math.hypot(gx - p.x, p.z);
    const pressed = nearestOpponent(state, p) < 2.5;
    plan.wantShoot = distGoal < L * (0.22 + personality.aggression * 0.14);
    plan.wantPass = pressed && personality.passing > 0.35;
    if (plan.wantPass && Math.random() < personality.passing) {
      plan.x = p.x; plan.z = p.z; // hold and pass (action triggers in computeAiInput)
    } else {
      // carry toward goal with slight lane drift to open space
      const lane = p.z > 0 ? -1 : 1;
      plan.x = gx;
      plan.z = clamp(p.z + lane * 3 * (1 - openness(state, p)), -W * 0.4, W * 0.4);
      plan.sprint = !pressed && personality.workRate > 0.55;
    }
    return plan;
  }

  if (theyHaveBall) {
    // press: nearest N (by aggression) chase, everyone else holds shape
    const owner = state.players[b.owner];
    const chasers = state.players
      .filter(q => q.team === p.team && q.role !== 'GK')
      .sort((a, c) => dist(a, owner) - dist(c, owner));
    const chaserCount = 1 + Math.round(personality.aggression * 1.5);
    const myRank = chasers.findIndex(q => q.id === p.id);
    if (myRank >= 0 && myRank < chaserCount) {
      plan.x = owner.x; plan.z = owner.z;
      plan.sprint = true;
      plan.wantTackle = true;
    }
    return plan;
  }

  if (weHaveBall) {
    // support run: get open ahead of the ball
    const owner = state.players[b.owner];
    if (owner.id !== p.id) {
      const ahead = atk * (4 + personality.workRate * 6);
      plan.x = clamp(owner.x + ahead, -L / 2 + 2, L / 2 - 2);
      plan.z = clamp(az + (p.z > owner.z ? 2 : -2), -W / 2 + 2, W / 2 - 2);
      plan.sprint = personality.workRate > 0.6;
    }
    return plan;
  }

  // loose ball: nearest couple of players go win it
  if (b.owner == null) {
    const distMe = dist(p, b);
    const rank = state.players
      .filter(q => q.team === p.team && q.role !== 'GK')
      .sort((a, c) => dist(a, b) - dist(c, b))
      .findIndex(q => q.id === p.id);
    if (rank >= 0 && rank < 2 && distMe < L * 0.3) {
      plan.x = b.x; plan.z = b.z;
      plan.sprint = difficulty > 0.5;
    }
  }
  return plan;
}

function nearestOpponent(state, p) {
  let d = 1e9;
  for (const q of state.players) {
    if (q.team !== p.team) d = Math.min(d, dist(p, q));
  }
  return d;
}

function ballHeadingAt(state, p) {
  const b = state.ball;
  // will the ball pass near p within ~0.5 s?
  const t = 0.5;
  const fx = b.x + b.vx * t, fz = b.z + b.vz * t;
  // distance from p to segment b->f
  const dx = fx - b.x, dz = fz - b.z;
  const len2 = dx * dx + dz * dz || 1e-6;
  const tt = clamp(((p.x - b.x) * dx + (p.z - b.z) * dz) / len2, 0, 1);
  const px = b.x + dx * tt, pz = b.z + dz * tt;
  return Math.hypot(p.x - px, p.z - pz) < 2.4;
}

export function clearAiPlans() { plans.clear(); }
