// The engine client's typing of the shared simulation (src/sim.ts) against
// the real server.js: the members it reads exist and the loop it runs works.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadServer } from "./server.ts";

test("server.js publishes what the native client reads", () => {
  const { FootballSim: S, game } = loadServer();
  for (const k of ["WALK_SPEED", "RUN_SPEED", "SPRINT_SPEED", "TURN_RATE", "BALL_SLOWDOWN", "GRAVITY", "BALL_R"]) {
    assert.equal(typeof S[k], "number", k);
  }
  for (const k of ["takeAiName", "pitchFor", "roleForSlot", "makeRng", "createMatch", "resetKickoff", "stepMatch", "computeAiInput", "clearAiPlans"]) {
    assert.equal(typeof S[k], "function", k);
  }
  assert.equal(game.tickRateHz, 30);
});

test("practice runs the shared sim with AI on every seat", () => {
  const { FootballSim: S } = loadServer();
  const roster = [{ userId: null, name: "You", isAi: false }];
  for (let i = 1; i < 6; i++) roster.push({ userId: null, name: S.takeAiName(), isAi: true });
  const st = S.createMatch({ teamSize: 3, roster, seed: 1234 }) as { players: { id: number; x: number }[]; ball: { x: number; z: number }; time: number; phase: string };
  S.resetKickoff(st, 0);
  const inputs = new Map<number, unknown>();
  let kicks = 0;
  for (let i = 0; i < 60 * 20; i++) {
    inputs.clear();
    for (const p of st.players) inputs.set(p.id, S.computeAiInput(st, p, 1 / 60));
    for (const ev of S.stepMatch(st, inputs, 1 / 60)) if (ev.type === "kick") kicks++;
  }
  assert.ok(st.time > 5, `the clock ran (it pauses for goals): ${st.time}`);
  assert.ok(kicks > 0, "someone kicked the ball");
  assert.ok(Number.isFinite(st.ball.x) && Number.isFinite(st.ball.z));
});
