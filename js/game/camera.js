// camera.js — third-person follow camera + off-screen ball arrow HUD.
import * as THREE from 'three';

export function createFollowCamera(camera) {
  const arrowEl = document.getElementById('ball-arrow');
  const arrowHead = document.getElementById('ball-arrow-head');
  const arrowDist = document.getElementById('ball-arrow-dist');

  const pos = new THREE.Vector3(0, 18, -24);
  const look = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  let yaw = 0;              // smoothed camera yaw (world angle in x/z plane)
  let dist = 13, height = 7;
  let sprintFov = 0;

  function update(dt, target, ball) {
    if (!target) return;
    // Look direction: mostly toward the ball, biased by player movement so the
    // camera swings naturally when you turn.
    const mvSpd = Math.hypot(target.vx || 0, target.vz || 0);
    let dirX = ball.x - target.x, dirZ = ball.z - target.z;
    const bd = Math.hypot(dirX, dirZ);
    if (bd > 0.5) { dirX /= bd; dirZ /= bd; }
    if (mvSpd > 2) {
      const w = Math.min(0.45, mvSpd * 0.05);
      dirX = dirX * (1 - w) + (target.vx / mvSpd) * w;
      dirZ = dirZ * (1 - w) + (target.vz / mvSpd) * w;
    }
    const targetYaw = Math.atan2(dirZ, dirX);
    yaw += angDelta(targetYaw, yaw) * Math.min(1, dt * 3.2);

    // camera sits behind & above the player
    const sprinting = mvSpd > 6;
    dist += ((sprinting ? 15 : 13) - dist) * Math.min(1, dt * 2);
    height += ((sprinting ? 7.5 : 7) - height) * Math.min(1, dt * 2);
    desired.set(
      target.x - Math.cos(yaw) * dist,
      height,
      target.z - Math.sin(yaw) * dist,
    );
    const k = 1 - Math.exp(-6 * dt);
    pos.lerp(desired, k);
    camera.position.copy(pos);

    desiredLook.set(
      target.x + dirX * 6,
      1.2,
      target.z + dirZ * 6,
    );
    look.lerp(desiredLook, k);
    camera.lookAt(look);

    // FOV kick at sprint
    const wantFov = sprinting ? 4 : 0;
    sprintFov += (wantFov - sprintFov) * Math.min(1, dt * 4);
    const fov = 55 + sprintFov;
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }

    updateBallArrow(target, ball);
  }

  function updateBallArrow(target, ball) {
    ndc.set(ball.x, ball.y ?? 0.2, ball.z).project(camera);
    const offscreen = ndc.z > 1 || Math.abs(ndc.x) > 0.92 || Math.abs(ndc.y) > 0.88;
    if (!offscreen) { arrowEl.classList.add('hidden'); return; }

    // clamp to viewport edge along the direction to the ball
    const ax = ndc.x, ay = ndc.y;
    const m = Math.max(Math.abs(ax) / 0.86, Math.abs(ay) / 0.8, 1e-6);
    const ex = ax / m, ey = ay / m;
    const px = (ex * 0.5 + 0.5) * innerWidth;
    const py = (-ey * 0.5 + 0.5) * innerHeight;
    arrowEl.classList.remove('hidden');
    arrowEl.style.left = `${px}px`;
    arrowEl.style.top = `${py}px`;
    const ang = Math.atan2(-(ey), ex) * 180 / Math.PI - 90;
    arrowHead.style.transform = `rotate(${ang}deg)`;
    const d = Math.hypot(ball.x - target.x, ball.z - target.z);
    arrowDist.textContent = `${Math.round(d)}m`;
  }

  function angDelta(target, cur) {
    let d = target - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  return {
    update,
    get yaw() { return yaw; },
    setYaw(y) { yaw = y; },
    // cinematic helper: smoothly frame an arbitrary point (walkout, coin flip)
    frame(point, from, dt, speed = 2.5) {
      desired.set(from.x, from.y, from.z);
      pos.lerp(desired, Math.min(1, dt * speed));
      camera.position.copy(pos);
      desiredLook.set(point.x, point.y ?? 1, point.z);
      look.lerp(desiredLook, Math.min(1, dt * speed));
      camera.lookAt(look);
    },
  };
}
