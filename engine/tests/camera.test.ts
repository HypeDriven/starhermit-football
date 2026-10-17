import { test } from "node:test";
import assert from "node:assert/strict";
import { FollowRig, ballArrow } from "../src/logic/camera.ts";
import type { Arrow, ArrowBox } from "../src/logic/camera.ts";

const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) < eps;

const box: ArrowBox = { halfWidth: 20, halfHeight: 20, bottomReserve: 0, scale: 1 };

test("the ball arrow shows off screen, inside the window, pointing at the ball", () => {
  const a: Arrow = { visible: false, px: 0, py: 0, angleDeg: 0 };
  ballArrow({ x: 0.5, y: 0.2, z: 0.5 }, 1000, 500, box, a);
  assert.equal(a.visible, false);
  ballArrow({ x: 3, y: 0, z: 0.5 }, 1000, 500, box, a);
  assert.ok(a.visible);
  assert.ok(near(a.px, (0.86 * 0.5 + 0.5) * 1000), `px ${a.px}`);
  assert.ok(near(a.py, 250));
  assert.ok(near(a.angleDeg, 90), `points right: ${a.angleDeg}`);
  ballArrow({ x: 0, y: 2, z: 0.5 }, 1000, 500, box, a);
  assert.ok(near(a.angleDeg, 0), `points up: ${a.angleDeg}`);
  assert.equal(a.py, 80, "kept 60 px below the top plus its half height");
  ballArrow({ x: 0, y: -2, z: 0.5 }, 1000, 500, { ...box, bottomReserve: 150 }, a);
  assert.ok(near(a.angleDeg, 180), `points down: ${a.angleDeg}`);
  assert.equal(a.py, 500 - 20 - 6 - 150, "above the touch controls");
  ballArrow({ x: 0.1, y: 0.1, z: 1.2 }, 1000, 500, box, a);
  assert.ok(a.visible, "a ball behind the camera shows the arrow");
});

test("the follow camera settles behind and above a player facing +x", () => {
  const rig = new FollowRig();
  const target = { x: 10, z: 5, vx: 0, vz: 0, facing: 0 };
  for (let i = 0; i < 600; i++) rig.update(1 / 60, target, { x: 20, y: 0.11, z: 5 }, 0, 0);
  assert.ok(near(rig.pos.x, 10 - 13, 0.05), `behind: ${rig.pos.x}`);
  assert.ok(near(rig.pos.y, 7, 0.05), `above: ${rig.pos.y}`);
  assert.ok(near(rig.pos.z, 5, 0.05));
  assert.ok(near(rig.look.x, 16, 0.05) && near(rig.look.y, 1.2, 0.05));
  assert.ok(near(rig.fov, 55, 1e-6));
});

test("sprinting pulls the camera back and widens the view; mouse look takes over", () => {
  const rig = new FollowRig();
  const target = { x: 0, z: 0, vx: 7.4, vz: 0, facing: 0 };
  for (let i = 0; i < 600; i++) rig.update(1 / 60, target, { x: 5, y: 0.11, z: 0 }, 0, 0);
  assert.ok(near(rig.dist, 15, 0.01) && near(rig.fov, 59, 0.01));
  rig.update(1 / 60, target, { x: 5, y: 0.11, z: 0 }, 400, 0);
  assert.ok(rig.manualCamera);
  assert.ok(rig.yaw > 0.9, `mouse yaw: ${rig.yaw}`);
  rig.setYaw(0);
  assert.equal(rig.manualCamera, false);
  assert.equal(rig.heightOffset, 0);
});

test("framing eases toward a cinematic shot", () => {
  const rig = new FollowRig();
  for (let i = 0; i < 300; i++) rig.frame({ x: 0, y: 1, z: 0 }, { x: -3.5, y: 2.2, z: 3.5 }, 1 / 60, 4);
  assert.ok(near(rig.pos.x, -3.5, 1e-3) && near(rig.look.y, 1, 1e-3));
});
