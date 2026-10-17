import { test } from "node:test";
import assert from "node:assert/strict";
import { eventIndexAfter, frameBlend, parseReplay, replayState, seekFrame } from "../src/logic/replay.ts";
import { loadServer, sessionCtx } from "./server.ts";

const row = (x: number): unknown[] => [0, 0, x, 0, 0, 0, 0, "idle", 0, 0, 0, 0, 0, 0, 0, 0, 1, "A", 0];

function log(frames: unknown[], evs: unknown[] = []): Record<string, unknown> {
  return { replay: { v: 1, every: 15, teamSize: 1, halfLength: 1, roster: [{ pid: 0, team: 0, name: "A", ai: true }], frames, evs, truncated: false } };
}

test("the archived state comes from the detail's state field or bare", () => {
  const state = log([]);
  assert.equal(replayState({ state }), state);
  assert.equal(replayState(state), state);
  assert.equal(replayState({ other: 1 }), null);
  assert.equal(replayState(null), null);
});

test("unusable logs are refused", () => {
  assert.equal(parseReplay(null), null);
  assert.equal(parseReplay({ replay: { v: 2, every: 15, frames: [{}] } }), null);
  assert.equal(parseReplay(log([])), null);
  assert.equal(parseReplay({ replay: { v: 1, every: 0, frames: [{ t: 0 }] } }), null);
});

test("the match clock runs only over play frames and halftime splits halves", () => {
  const frames = [
    { t: 0, sc: [0, 0], ph: "play", b: [0, 0.11, 0, 0, 0, 0, -1], pl: [row(0)] },
    { t: 30, sc: [0, 0], ph: "goal", b: [0, 0.11, 0, 0, 0, 0, -1], pl: [row(1)] },
    { t: 60, sc: [1, 0], ph: "play", b: [0, 0.11, 0, 0, 0, 0, -1], pl: [row(2)] },
    { t: 90, sc: [1, 0], ph: "halftime", b: [0, 0.11, 0, 0, 0, 0, -1], pl: [row(3)] },
  ];
  const r = parseReplay(log(frames, [{ t: 75, ev: { type: "halftime" } }, { t: 10, ev: { type: "goal" } }]))!;
  assert.ok(r);
  assert.deepEqual(r.frames.map((f) => f.sec), [0, 1, 1, 2]);
  assert.deepEqual(r.frames.map((f) => f.half), [1, 1, 1, 2]);
  assert.deepEqual(r.evs.map((e) => e.t), [10, 75], "events sorted");
  assert.equal(r.frames[2]!.pl[0]!.x, 2);
});

test("the playhead finds its keyframes both ways and skips past events", () => {
  const frames = [{ t: 0 }, { t: 15 }, { t: 30 }, { t: 45 }];
  let i = seekFrame(frames, 0, 31);
  assert.equal(i, 2);
  i = seekFrame(frames, i, 5);
  assert.equal(i, 0);
  assert.equal(seekFrame(frames, 0, 1000), 2, "stops at the last pair");
  assert.equal(frameBlend({ t: 15 }, { t: 30 }, 20), 1 / 3);
  assert.equal(frameBlend({ t: 30 }, { t: 30 }, 30), 1);
  assert.equal(eventIndexAfter([{ t: 1 }, { t: 5 }, { t: 9 }], 5), 2);
});

test("a log the script records parses", () => {
  const { game } = loadServer();
  let now = 1_700_000_000_000;
  let state = game.createSession(sessionCtx(now)).sessionState;
  // the script holds the kickoff for its 13 s intro before it records frames
  for (let i = 0; i < 440; i++) {
    now += 33;
    state = game.onTick(sessionCtx(now, state)).sessionState;
  }
  const r = parseReplay(state);
  assert.ok(r, "parsed");
  assert.ok(r.frames.length >= 2, `${r.frames.length} frames`);
  assert.equal(r.teamSize, 1);
  assert.equal(r.roster.length, 2);
  assert.equal(r.frames[0]!.pl.length, 2);
});
