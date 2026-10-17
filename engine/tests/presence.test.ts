import { test } from "node:test";
import assert from "node:assert/strict";
import { nextExcitement, stepIndex, voiceGain, voicePan } from "../src/logic/presence.ts";

test("voice volume falls off with distance", () => {
  assert.equal(voiceGain(0), 1);
  assert.equal(voiceGain(4), 1);
  assert.equal(voiceGain(55), 0);
  assert.equal(voiceGain(100), 0);
  const mid = voiceGain(29.5);
  assert.ok(Math.abs(mid - 0.25) < 1e-9, `squared falloff: ${mid}`);
});

test("voice pan follows the speaker's side of my facing", () => {
  assert.equal(voicePan(0.5, 0.5, 0), null);
  assert.ok(Math.abs(voicePan(0, 10, 0)! - 0.8) < 1e-9, "+z is my right when facing +x");
  assert.ok(Math.abs(voicePan(0, -10, 0)! + 0.8) < 1e-9);
  assert.ok(Math.abs(voicePan(10, 0, 0)!) < 1e-9);
});

test("crowd excitement eases toward danger near a goal", () => {
  let e = 0.3;
  for (let i = 0; i < 600; i++) e = nextExcitement(e, 50, 100, 1 / 60);
  assert.ok(Math.abs(e - 0.85) < 1e-3, `near goal: ${e}`);
  for (let i = 0; i < 600; i++) e = nextExcitement(e, 0, 100, 1 / 60);
  assert.ok(Math.abs(e - 0.3) < 1e-3, `midfield: ${e}`);
  assert.equal(stepIndex(Math.PI * 2.5), 2);
});
