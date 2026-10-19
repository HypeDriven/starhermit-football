import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_EXTRAPOLATION, MAX_INTERP_DELAY, MIN_INTERP_DELAY, blankCeremony, ceremonyAt, createJitterState, interpBall, interpPlayer,
  lerpCer, noteArrival, parseBallRow, parsePlayerRow, parseSnap, pickPair, renderTime, snapTime, trimSnaps,
} from "../src/logic/interp.ts";
import type { CeremonySnap, InterpEntity, InterpPair, ParsedSnap } from "../src/logic/interp.ts";
import { loadServer, sessionCtx } from "./server.ts";

function entity(): InterpEntity {
  return { x: 0, y: 0, z: 0, vx: 0, vz: 0, facing: 0, anim: "idle", animSpeed: 0, phase: 0, kickT: 0, tackleT: 0, stunT: 0, diveT: 0, diveDir: 0, celebrateT: 0 };
}

test("player and ball rows follow server.js's layout", () => {
  const p = parsePlayerRow([3, 1, 1.5, -2, 0.5, 0.25, 3.1, "run", 5.4, 7.2, 0.1, 0, 0, 0, 0, 0, 1, "Rafa Vento", 0.3]);
  assert.equal(p.id, 3);
  assert.equal(p.team, 1);
  assert.equal(p.anim, "run");
  assert.equal(p.isAi, true);
  assert.equal(p.name, "Rafa Vento");
  assert.equal(p.y, 0.3);
  assert.equal(parseBallRow([0, 0.11, 0, 0, 0, 0, -1]).owner, null);
  assert.equal(parseBallRow([0, 0.11, 0, 0, 0, 0, 4]).owner, 4);
});

test("the script's own snapshot parses", () => {
  const { game } = loadServer();
  const created = game.createSession(sessionCtx(1_700_000_000_000));
  const snap = parseSnap(created.broadcast[0]!.data);
  assert.ok(snap);
  assert.equal(snap.pl.length, 2); // a 1v1 from two players
  assert.equal(snap.ph, "play");
  assert.equal(snap.h, 1);
  assert.deepEqual(snap.sc, [0, 0]);
  assert.equal(snap.cer, null);
  assert.equal(snapTime(created.broadcast[0]!.data["ts"], 5), 1_700_000_000);
  assert.equal(parseSnap({ type: "ev" }), null);
});

test("a recycled snapshot parses to the same values as a fresh one", () => {
  const { game } = loadServer();
  const created = game.createSession(sessionCtx(1_700_000_000_000));
  const data = created.broadcast[0]!.data;
  const fresh = parseSnap(data)!;
  // a bigger, older snapshot to fill: its extra rows and acks go
  const old = parseSnap({ ...data, ack: [1, 2, 3, 4], pl: [...(data["pl"] as unknown[]), ...(data["pl"] as unknown[])], cer: { k: "x" } })!;
  const rows = old.pl.slice();
  const reused = parseSnap(data, old)!;
  assert.equal(reused, old);
  assert.equal(reused.pl[0], rows[0], "rows are refilled in place");
  assert.deepEqual(reused, fresh);
  assert.equal(parseSnap({ type: "ev" }, old), null);
});

test("trimmed snapshots go to the spare list", () => {
  const snaps = [snapAt(0, 0), snapAt(0.5, 0), snapAt(1, 0), snapAt(3, 0)];
  const first = snaps[0]!;
  const spare: ParsedSnap[] = [];
  trimSnaps(snaps, 3, spare);
  assert.deepEqual(snaps.map((s) => s.at), [1, 3]);
  assert.equal(spare.length, 2);
  assert.equal(spare[0], first);
});

function snapAt(at: number, x: number): ParsedSnap {
  return {
    at, arrived: at, tick: 0, ack: [], t: 0, h: 1, ph: "play", sc: [0, 0], kt: 0,
    b: { x, y: 0.11, z: 0, vx: 10, vy: 0, vz: 0, owner: null },
    pl: [parsePlayerRow([0, 0, x, 0, 2, 0, 0, "run", 5, at, 0, 0, 0, 0, 0, 0, 0, "A", 0])],
    cer: null,
  };
}

test("the pair around the render time blends; past the newest it extrapolates a little", () => {
  const snaps = [snapAt(1, 0), snapAt(1.1, 1), snapAt(1.2, 2)];
  const pair = { a: snaps[0]!, b: snaps[0]!, k: 0, extrap: 0 } as InterpPair<ParsedSnap>;
  pickPair(snaps, 1.15, pair);
  assert.equal(pair.a, snaps[1]);
  assert.equal(pair.b, snaps[2]);
  assert.ok(Math.abs(pair.k - 0.5) < 1e-9);
  pickPair(snaps, 2, pair);
  assert.equal(pair.a, snaps[2]);
  assert.equal(pair.extrap, MAX_EXTRAPOLATION);
  pickPair(snaps, 0.5, pair);
  assert.equal(pair.b, snaps[0]);
  assert.equal(pair.k, 1);
});

test("render time follows the newest snapshot for at most 0.25 s", () => {
  assert.ok(Math.abs(renderTime({ at: 10, arrived: 100 }, 100.1, 0.1) - 10) < 1e-9);
  assert.ok(Math.abs(renderTime({ at: 10, arrived: 100 }, 105, 0.05) - 10.2) < 1e-9);
});

test("player interpolation turns the short way and extrapolates along velocity", () => {
  const a = parsePlayerRow([0, 0, 0, 0, 1, 0, 3.0, "run", 5, 0, 0, 0, 0, 0, 0, 0, 0, "A", 0]);
  const b = parsePlayerRow([0, 0, 1, 0, 1, 0, -3.0, "sprint", 6, 1, 0, 0, 0, 0, 0, 0, 0, "A", 0]);
  const p = entity();
  interpPlayer(p, a, b, 0.5, 0.1);
  assert.ok(Math.abs(p.x - 0.6) < 1e-9, `x ${p.x}`);
  // 3.0 → −3.0 is 0.28 rad through π, not 6 rad back through 0
  assert.ok(Math.abs(p.facing - Math.PI) < 0.01, `turns through π: ${p.facing}`);
  assert.equal(p.anim, "sprint");
});

test("an owned ball never extrapolates", () => {
  const ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: null as number | null };
  interpBall(ball, parseBallRow([0, 0.11, 0, 10, 0, 0, 2]), parseBallRow([1, 0.11, 0, 10, 0, 0, 2]), 1, 0.1, 0.11, -21);
  assert.equal(ball.x, 1);
  assert.equal(ball.owner, 2);
  interpBall(ball, parseBallRow([0, 0.11, 0, 10, 0, 0, -1]), parseBallRow([1, 0.11, 0, 10, 0, 0, -1]), 1, 0.1, 0.11, -21);
  assert.ok(Math.abs(ball.x - 2) < 1e-9);
  assert.equal(ball.y, 0.11, "gravity never takes it below the turf");
});

test("arrival jitter widens the interpolation delay within its bounds", () => {
  const s = createJitterState();
  noteArrival(s, 1, 1);
  noteArrival(s, 1.033, 1.033);
  assert.equal(s.interpDelay, MIN_INTERP_DELAY);
  for (let i = 0; i < 100; i++) noteArrival(s, 2 + i * 0.1 + (i % 2) * 0.08, 2 + i * 0.033);
  assert.ok(s.interpDelay > MIN_INTERP_DELAY && s.interpDelay <= MAX_INTERP_DELAY, String(s.interpDelay));
});

test("old snapshots drop but two always stay", () => {
  const snaps = [snapAt(0, 0), snapAt(0.5, 0), snapAt(1, 0), snapAt(3, 0)];
  trimSnaps(snaps, 3);
  assert.deepEqual(snaps.map((s) => s.at), [1, 3]);
  const two = [snapAt(0, 0), snapAt(10, 0)];
  trimSnaps(two, 10);
  assert.equal(two.length, 2);
});

test("a ceremony interpolates only between snapshots of the same one", () => {
  const cer = (t: number, x: number, v = 3): CeremonySnap => ({
    k: "leave", t, v, vn: "A", rn: "B", sp: [0, 0],
    ref: [x, 0, 0, "run", 5, t], ca: [[x, 1, 0, "carryB", 5, t], [x, -1, 0, "carryF", 5, t]], st: [x, 0, 0, 0.72],
  });
  const a = { ...snapAt(0, 0), cer: cer(1, 0) };
  const b = { ...snapAt(0.1, 0), cer: cer(2, 2) };
  assert.equal(ceremonyAt(a, b, 0.5)!.ref[0], 1);
  const other = { ...snapAt(0.1, 0), cer: cer(2, 2, 4) };
  assert.equal(ceremonyAt(a, other, 0.5)!.ref[0], 2);
  assert.equal(ceremonyAt(a, snapAt(0.1, 0), 0.5), null);
  // blended into a kept ceremony: the same values, no new object
  const out = blankCeremony();
  assert.equal(ceremonyAt(a, b, 0.5, out), out);
  assert.deepEqual(out, lerpCer(a.cer, b.cer, 0.5));
  assert.equal(ceremonyAt(a, other, 0.5, out), other.cer);
});
