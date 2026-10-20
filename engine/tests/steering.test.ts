import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTO_SPRINT_S, Steering } from "../src/logic/steering.ts";

const still = { active: false, x: 0, y: 0 };

test("a quick tap of the contextual shoot control passes", () => {
  const s = new Steering();
  s.pressShoot();
  s.frame(0.1, 0, 0, 0, still, false);
  s.releaseShoot(true);
  const f = s.frame(0.016, 0, 0, 0, still, false);
  assert.equal(f.pass, true);
  assert.equal(f.shoot, 0);
  assert.equal(s.frame(0.016, 0, 0, 0, still, false).pass, false, "edges fire once");
});

test("holding charges a shot released at its charge", () => {
  const s = new Steering();
  s.pressShoot();
  let f = s.frame(0.25, 0, 0, 0, still, false);
  assert.ok(f.shootHeld && Math.abs(f.shootCharge - 0.35) < 1e-9);
  s.frame(0.25, 0, 0, 0, still, false);
  s.releaseShoot(true);
  f = s.frame(0.016, 0, 0, 0, still, false);
  assert.ok(Math.abs(f.shoot - 0.7) < 1e-9, `power ${f.shoot}`);
  assert.equal(f.pass, false);
});

test("dedicated shoot buttons always shoot, with a minimum power", () => {
  const s = new Steering();
  s.pressShoot();
  s.frame(0.05, 0, 0, 0, still, false);
  s.releaseShoot(false);
  assert.equal(s.frame(0.016, 0, 0, 0, still, false).shoot, 0.15);
});

test("desktop steering smooths its axes and sprints after holding forward", () => {
  const s = new Steering();
  let f = s.frame(1 / 60, 0, 1, 1, still, false);
  assert.ok(f.turn! > 0 && f.turn! < 0.5, `eased turn ${f.turn}`);
  assert.equal(f.sprint, false);
  for (let t = 0; t < AUTO_SPRINT_S + 0.05; t += 1 / 60) f = s.frame(1 / 60, 0, 1, 1, still, false);
  assert.equal(f.sprint, true);
  assert.ok(f.fwd! > 0.95);
  for (let i = 0; i < 60; i++) f = s.frame(1 / 60, 0, 0, 0, still, false);
  assert.equal(f.turn, 0, "snaps to rest");
  assert.equal(f.fwd, 0);
  assert.equal(f.sprint, false);
});

test("the touch joystick is camera-relative and sprints at full tilt", () => {
  const s = new Steering();
  const f = s.frame(1 / 60, 0, 0, 0, { active: true, x: 0, y: -1 }, true);
  assert.equal(f.turn, null);
  assert.equal(f.fwd, null);
  assert.ok(Math.abs(f.mx - 1) < 1e-9 && Math.abs(f.mz) < 1e-9);
  assert.equal(f.sprint, true);
  const g = s.frame(1 / 60, Math.PI / 2, 0, 0, { active: true, x: 0.5, y: 0 }, true);
  assert.ok(Math.abs(g.mx + 0.5) < 1e-9 && Math.abs(g.mz) < 1e-9, `${g.mx} ${g.mz}`);
  assert.equal(g.sprint, false);
});

test("clearing drops held state and pending edges", () => {
  const s = new Steering();
  s.pass();
  s.tackle();
  s.pressShoot();
  s.clear();
  const f = s.frame(0.016, 0, 0, 0, still, false);
  assert.equal(f.pass || f.tackle || f.shootHeld, false);
});
