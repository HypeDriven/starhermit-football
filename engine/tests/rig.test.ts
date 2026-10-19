// world/rigMath.ts (the footballers' pose as starhermit:world kernels) against
// logic/pose.ts, number for number: the runtime runs the kernels natively and
// computes exactly what calling them on row objects computes, so the pose the
// rig shows is the pose logic/pose.ts computes. starhermit:world is mapped to
// a stand-in whose kernel.fn returns the helper, as the real one does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { blendPose, computePose, createPose, createPoseBlend, createPoseParams } from "../src/logic/pose.ts";
import type { Pose, PoseEntity } from "../src/logic/pose.ts";
import type { JointRow, RigRow } from "../src/world/rigMath.ts";

const world = "export const kernel = Object.assign(() => { throw new Error('no kernels here'); }, { fn: (f) => f });";
const hooks = `export async function resolve(specifier, context, next) {
  if (specifier === "starhermit:world") return { url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(world)}`)}, shortCircuit: true };
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);
const rig = await import("../src/world/rigMath.ts");

const ANIMS = ["idle", "walk", "run", "sprint", "celebrate", "dejected", "fallen", "carryF", "carryB", "crouch"];
const CODES: Record<string, number> = {
  celebrate: rig.ANIM_CELEBRATE, dejected: rig.ANIM_DEJECTED, fallen: rig.ANIM_FALLEN,
  carryF: rig.ANIM_CARRY_F, carryB: rig.ANIM_CARRY_B, crouch: rig.ANIM_CROUCH,
};
const POSE_KEYS = Object.keys(createPose()) as (keyof Pose)[];

function row(): RigRow {
  const r: Record<string, number> = {};
  for (const k of ["anim", "aspeed", "phase", "kickT", "tackleT", "diveT", "diveDir", "celebT", "x", "y", "z", "yaw", "dt",
    "bt", "bspeed", "wCel", "wDej", "wFal", "wCarF", "wCarB", "wCro", ...POSE_KEYS]) r[k] = 0;
  return r as unknown as RigRow;
}

/** A small deterministic generator (the test must not depend on luck). */
function random(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

test("the pose kernel computes logic/pose.ts's blend and pose exactly", () => {
  const next = random(12345);
  for (let trial = 0; trial < 200; trial++) {
    const blend = createPoseBlend();
    const params = createPoseParams();
    const P = createPose();
    const r = row();
    const yaw = (next() - 0.5) * 7;
    for (let frame = 0; frame < 40; frame++) {
      // the entity changes now and then, overlays come and go
      const e: PoseEntity = {
        anim: ANIMS[Math.floor(next() * ANIMS.length)]!,
        animSpeed: next() < 0.2 ? 0 : next() * 8,
        phase: next() * 400,
        kickT: next() < 0.3 ? next() * 0.4 : 0,
        tackleT: next() < 0.3 ? next() * 0.5 : 0,
        diveT: next() < 0.3 ? next() * 0.7 : 0,
        diveDir: (next() - 0.5) * 7,
        celebrateT: next() * 5,
      };
      const dt = next() < 0.1 ? 0 : next() * 0.1;
      blendPose(blend, e, dt, yaw, params);
      computePose(params, P);
      // what world/rig.ts writes for the row, then the kernel
      r.anim = CODES[e.anim] ?? rig.ANIM_OTHER;
      r.aspeed = e.animSpeed || 0;
      r.phase = e.phase || 0;
      r.kickT = e.kickT || 0;
      r.tackleT = e.tackleT || 0;
      r.diveT = e.diveT || 0;
      r.diveDir = e.diveDir || 0;
      r.celebT = e.celebrateT || 0;
      r.yaw = yaw;
      r.dt = dt;
      rig.poseRow(r);
      assert.equal(r.dt, 0, "the kernel uses up the frame's dt");
      for (const key of POSE_KEYS) assert.ok(Object.is(r[key], P[key]), `trial ${trial} frame ${frame}: ${key} ${r[key]} vs ${P[key]}`);
      assert.ok(Object.is(r.bt, params.t) && Object.is(r.bspeed, params.speed) && Object.is(r.wCel, params.wCelebrate));
    }
  }
});

test("a rig not updated in a frame keeps its pose", () => {
  const r = row();
  r.anim = rig.ANIM_OTHER;
  r.aspeed = 3;
  r.phase = 2;
  r.dt = 1 / 60;
  rig.poseRow(r);
  const before = POSE_KEYS.map((k) => r[k]);
  rig.poseRow(r); // dt is 0 now: nothing eases, the same pose
  assert.deepEqual(POSE_KEYS.map((k) => r[k]), before);
});

test("each joint row takes its channels from its rig's pose", () => {
  const g = row();
  POSE_KEYS.forEach((k, i) => (g[k] = i + 1));
  g.x = 101;
  g.y = 102;
  g.z = 103;
  g.yaw = 104;
  const joint = (kind: number): JointRow => {
    const j: JointRow = { kind, rig: g, px: -1, py: -2, pz: -3, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
    rig.jointRow(j);
    return j;
  };
  const channels = (j: JointRow): number[] => [j.px, j.py, j.pz, j.rx, j.ry, j.rz, j.sy];
  // world/player.ts's former applyPose and place, joint by joint
  assert.deepEqual(channels(joint(0)), [101, 102, 103, 0, 104, 0, 1]);
  assert.deepEqual(channels(joint(1)), [-1, g.pelY, g.pelZ, g.pelRX, g.pelRY, g.pelRZ, 1]);
  assert.deepEqual(channels(joint(2)), [-1, -2, -3, g.tRX, g.tRY, g.tRZ, g.tSY]);
  assert.deepEqual(channels(joint(3)), [-1, -2, -3, g.hRX, g.hRY, g.hRZ, 1]);
  assert.deepEqual(channels(joint(4)), [-1, -2, -3, g.lUAX, 0, g.lUAZ, 1]);
  assert.deepEqual(channels(joint(5)), [-1, -2, -3, g.rUAX, 0, g.rUAZ, 1]);
  const z: (keyof Pose)[] = ["lLAZ", "rLAZ", "lThZ", "rThZ", "lShZ", "rShZ", "lFtZ", "rFtZ"];
  z.forEach((key, i) => assert.deepEqual(channels(joint(6 + i)), [-1, -2, -3, 0, 0, g[key], 1], key));
  assert.deepEqual(channels(joint(14)), [g.px, g.py, g.pz, g.rx, g.ry, g.rz, 1]);
});
