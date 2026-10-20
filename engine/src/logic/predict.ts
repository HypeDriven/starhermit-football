// Render-only local prediction of the controlled footballer online (and
// its reconciliation with each snapshot).
// The server stays authoritative: every value here is corrected toward the
// newest snapshot and large errors snap.
import type { PlayerRow } from "./interp.ts";

export interface Prediction {
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
}

/** The sim constants prediction mirrors (from FootballSim). */
export interface PredictConstants {
  WALK_SPEED: number;
  RUN_SPEED: number;
  SPRINT_SPEED: number;
  TURN_RATE: number;
  BALL_SLOWDOWN: number;
}

/** The steering input prediction reads. */
export interface SteerInput {
  mx: number;
  mz: number;
  turn: number | null;
  fwd: number | null;
  sprint: boolean;
}

/** Mirrors the server's stepPlayer movement for the local footballer. */
export function stepPrediction(
  pred: Prediction,
  raw: SteerInput,
  dt: number,
  c: PredictConstants,
  ownsBall: boolean,
  pitchL: number,
  pitchW: number,
): void {
  let speed = 0;
  let nx = 0;
  let nz = 0;
  if (raw.turn != null) {
    // steering (desktop tank controls)
    pred.facing += raw.turn * c.TURN_RATE * dt;
    const f = raw.fwd || 0;
    if (Math.abs(f) > 0.01) {
      speed = f < 0 ? c.WALK_SPEED * 0.9 : raw.sprint ? c.SPRINT_SPEED : c.RUN_SPEED;
      speed *= Math.min(1, Math.abs(f) * 1.6);
      if (ownsBall) speed *= c.BALL_SLOWDOWN;
      const sgn = f < 0 ? -1 : 1;
      nx = Math.cos(pred.facing) * sgn;
      nz = Math.sin(pred.facing) * sgn;
    }
  } else {
    const mag = Math.hypot(raw.mx, raw.mz);
    if (mag > 0.01) {
      speed = raw.sprint ? c.SPRINT_SPEED : mag > 0.45 ? c.RUN_SPEED : c.WALK_SPEED;
      speed *= Math.min(1, mag * 1.6);
      if (ownsBall) speed *= c.BALL_SLOWDOWN;
      nx = raw.mx / mag;
      nz = raw.mz / mag;
    }
  }
  const accel = 22;
  pred.vx += Math.max(-accel * dt, Math.min(accel * dt, nx * speed - pred.vx));
  pred.vz += Math.max(-accel * dt, Math.min(accel * dt, nz * speed - pred.vz));
  pred.x += pred.vx * dt;
  pred.z += pred.vz * dt;
  const margin = 1.5;
  pred.x = Math.max(-pitchL / 2 - margin, Math.min(pitchL / 2 + margin, pred.x));
  pred.z = Math.max(-pitchW / 2 - margin, Math.min(pitchW / 2 + margin, pred.z));
}

/** Projects the newest authoritative transform to about "now" and gently
 * reconciles the predictor (a fresh one when there is none). */
export function reconcile(
  pred: Prediction | null,
  me: PlayerRow,
  interpDelay: number,
  ack: number,
  inputSeq: number,
): Prediction {
  const lead = interpDelay + 0.03;
  const tx = me.x + me.vx * lead;
  const tz = me.z + me.vz * lead;
  if (!pred) return { x: tx, z: tz, vx: me.vx, vz: me.vz, facing: me.facing || 0 };
  const error = Math.hypot(tx - pred.x, tz - pred.z);
  const hasUnacknowledgedInput = Number.isFinite(ack) && ack >= 0 && ack < inputSeq;
  const blend = error > 3 ? 1 : hasUnacknowledgedInput ? 0.06 : 0.18;
  pred.x += (tx - pred.x) * blend;
  pred.z += (tz - pred.z) * blend;
  pred.vx += (me.vx - pred.vx) * 0.25;
  pred.vz += (me.vz - pred.vz) * 0.25;
  const fErr = Math.atan2(Math.sin(me.facing - pred.facing), Math.cos(me.facing - pred.facing));
  pred.facing += fErr * (error > 3 ? 1 : blend);
  return pred;
}

/** The server's dribble point: where an owned ball sits ahead of its
 * carrier. */
export function dribbleLead(vx: number, vz: number): number {
  return 0.5 + Math.hypot(vx, vz) * 0.045;
}
