import { test } from "node:test";
import assert from "node:assert/strict";
import { PELVIS_Y, blendPose, computePose, createPose, createPoseBlend, createPoseParams } from "../src/logic/pose.ts";
import type { Pose, PoseEntity } from "../src/logic/pose.ts";

function ent(over: Partial<PoseEntity> = {}): PoseEntity {
  return { anim: "idle", animSpeed: 0, phase: 0, kickT: 0, tackleT: 0, diveT: 0, diveDir: 0, celebrateT: 0, ...over };
}

function finite(p: Pose): boolean {
  return Object.values(p).every((v) => Number.isFinite(v));
}

test("standing still rests at the rig's pelvis height", () => {
  const params = createPoseParams();
  const P = computePose(params, createPose());
  assert.equal(P.pelY, PELVIS_Y);
  assert.ok(P.lThZ === 0 && P.rThZ === 0);
  assert.equal(P.tSY, 1);
});

test("running swings the legs against each other and leans forward", () => {
  const params = createPoseParams();
  params.speed = 6.5;
  params.phase = Math.PI / 2;
  const P = computePose(params, createPose());
  assert.ok(P.lThZ > 0.9, `left thigh forward: ${P.lThZ}`);
  assert.equal(P.rThZ, -P.lThZ);
  assert.ok(P.tRZ < -0.2, "torso leans forward");
  assert.ok(P.pelY < PELVIS_Y, "the hip bobs down");
});

test("a kick drives the right leg through wind-up and strike", () => {
  const params = createPoseParams();
  const P = createPose();
  params.kickT = 0.35 * (1 - 0.3); // 30 % in: winding up
  const wind = computePose(params, P).rThZ;
  params.kickT = 0.35 * (1 - 0.7); // 70 % in: struck through
  const strike = computePose(params, P).rThZ;
  assert.ok(wind < 0, `drawn back: ${wind}`);
  assert.ok(strike > 1, `whipped forward: ${strike}`);
});

test("every full-body state stays finite and lowers or lifts the body", () => {
  const blend = createPoseBlend();
  const params = createPoseParams();
  const P = createPose();
  for (const anim of ["celebrate", "dejected", "fallen", "carryF", "carryB", "crouch", "dive", "slide"]) {
    const e = ent({ anim, animSpeed: 2, phase: 1.2, celebrateT: 3, diveT: 0.3, diveDir: 1, tackleT: 0.2 });
    for (let i = 0; i < 60; i++) blendPose(blend, e, 1 / 60, 0, params);
    computePose(params, P);
    assert.ok(finite(P), `${anim} is finite`);
  }
});

test("blending eases toward the entity's state over time", () => {
  const blend = createPoseBlend();
  const params = createPoseParams();
  const e = ent({ anim: "celebrate", animSpeed: 5 });
  blendPose(blend, e, 1 / 60, 0, params);
  const first = params.wCelebrate;
  for (let i = 0; i < 120; i++) blendPose(blend, e, 1 / 60, 0, params);
  assert.ok(first > 0 && first < 0.2, `starts small: ${first}`);
  assert.ok(params.wCelebrate > 0.99, `reaches the state: ${params.wCelebrate}`);
  assert.ok(Math.abs(params.speed - 5) < 0.01);
  assert.ok(Math.abs(params.t - 121 / 60) < 1e-9);
});

test("the dive direction is relative to the group's yaw", () => {
  const params = createPoseParams();
  blendPose(createPoseBlend(), ent({ diveDir: 1.5 }), 0.016, -0.5, params);
  assert.equal(params.diveRel, 2);
});
