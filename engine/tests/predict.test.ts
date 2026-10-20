import { test } from "node:test";
import assert from "node:assert/strict";
import { dribbleLead, reconcile, stepPrediction } from "../src/logic/predict.ts";
import { parsePlayerRow } from "../src/logic/interp.ts";

const C = { WALK_SPEED: 2.1, RUN_SPEED: 5.4, SPRINT_SPEED: 7.4, TURN_RATE: 3.2, BALL_SLOWDOWN: 0.88 };

test("tank steering accelerates along the facing up to the run speed", () => {
  const p = { x: 0, z: 0, vx: 0, vz: 0, facing: 0 };
  for (let i = 0; i < 120; i++) stepPrediction(p, { mx: 0, mz: 0, turn: 0, fwd: 1, sprint: false }, 1 / 60, C, false, 100, 60);
  assert.ok(Math.abs(p.vx - 5.4) < 1e-6 && Math.abs(p.vz) < 1e-9);
  stepPrediction(p, { mx: 0, mz: 0, turn: 1, fwd: 0, sprint: false }, 0.5, C, false, 100, 60);
  assert.ok(Math.abs(p.facing - 1.6) < 1e-9, "turns at TURN_RATE");
});

test("the touch path follows mx/mz and the pitch margin clamps", () => {
  const p = { x: 49, z: 0, vx: 0, vz: 0, facing: 0 };
  for (let i = 0; i < 300; i++) stepPrediction(p, { mx: 1, mz: 0, turn: null, fwd: null, sprint: true }, 1 / 60, C, true, 100, 60);
  assert.equal(p.x, 51.5);
  assert.ok(Math.abs(p.vx - 7.4 * 0.88) < 1e-6, "dribbling slows the sprint");
});

test("reconciliation blends small errors and snaps large ones", () => {
  const me = parsePlayerRow([0, 0, 10, 0, 0, 0, 1, "idle", 0, 0, 0, 0, 0, 0, 0, 0, 0, "A", 0]);
  const fresh = reconcile(null, me, 0.07, -1, 0);
  assert.equal(fresh.x, 10);
  const pred = { x: 9, z: 0, vx: 0, vz: 0, facing: 0 };
  reconcile(pred, me, 0.07, 5, 5);
  assert.ok(Math.abs(pred.x - 9.18) < 1e-9, `blends 18 %: ${pred.x}`);
  const pending = { x: 9, z: 0, vx: 0, vz: 0, facing: 0 };
  reconcile(pending, me, 0.07, 3, 5);
  assert.ok(Math.abs(pending.x - 9.06) < 1e-9, "6 % while inputs are unacknowledged");
  const far = { x: 0, z: 0, vx: 0, vz: 0, facing: 0 };
  reconcile(far, me, 0.07, 5, 5);
  assert.equal(far.x, 10);
  assert.equal(far.facing, 1);
  assert.equal(dribbleLead(3, 4), 0.5 + 5 * 0.045);
});
