// The third-person follow camera and the off-screen ball arrow as plain
// math: the rig keeps the camera's
// position and look-at point, and the host side copies them onto the
// scene's PerspectiveCamera (position + lookAt) each frame.
import { angDelta, clamp, lerp3 } from "./math.ts";
import type { Vec3Like } from "./math.ts";

export const BASE_FOV = 55;

/** What the camera follows. */
export interface FollowTarget {
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
}

export interface BallLike {
  x: number;
  y: number;
  z: number;
}

export class FollowRig {
  readonly pos: Vec3Like = { x: 0, y: 18, z: -24 };
  readonly look: Vec3Like = { x: 0, y: 0, z: 0 };
  private readonly desired: Vec3Like = { x: 0, y: 0, z: 0 };
  private readonly desiredLook: Vec3Like = { x: 0, y: 0, z: 0 };
  /** Smoothed camera yaw (world angle in the x/z plane). */
  yaw = 0;
  dist = 13;
  height = 7;
  heightOffset = 0;
  manualCamera = false;
  sprintFov = 0;
  fov = BASE_FOV;

  /** Follow `target`; `lookX`/`lookY` are this frame's mouse-look pixels. */
  update(dt: number, target: FollowTarget, ball: BallLike, lookX: number, lookY: number): void {
    // Look direction: the way the player faces; the camera swings behind it.
    const mvSpd = Math.hypot(target.vx || 0, target.vz || 0);
    let dirX = Math.cos(target.facing || 0);
    let dirZ = Math.sin(target.facing || 0);
    if (!Number.isFinite(target.facing)) {
      dirX = ball.x - target.x;
      dirZ = ball.z - target.z;
      const bd = Math.hypot(dirX, dirZ);
      if (bd > 0.5) {
        dirX /= bd;
        dirZ /= bd;
      }
    }
    const targetYaw = Math.atan2(dirZ, dirX);
    if (lookX || lookY) {
      this.yaw += lookX * 0.0025;
      this.heightOffset = clamp(this.heightOffset - lookY * 0.018, -2.2, 5.5);
      this.manualCamera = true;
    }
    // Before the mouse is used, keep the automatic ball camera; afterwards
    // it becomes a gentle assist that never wrestles control away.
    const yawAssist = this.manualCamera ? 0.42 : 3.2;
    this.yaw += angDelta(targetYaw, this.yaw) * Math.min(1, dt * yawAssist);

    // camera sits behind & above the player
    const sprinting = mvSpd > 6;
    this.dist += ((sprinting ? 15 : 13) - this.dist) * Math.min(1, dt * 2);
    this.height += ((sprinting ? 7.5 : 7) + this.heightOffset - this.height) * Math.min(1, dt * 2);
    const d = this.desired;
    d.x = target.x - Math.cos(this.yaw) * this.dist;
    d.y = this.height;
    d.z = target.z - Math.sin(this.yaw) * this.dist;
    const k = 1 - Math.exp(-6 * dt);
    lerp3(this.pos, d, k);

    const viewDirX = this.manualCamera ? Math.cos(this.yaw) : dirX;
    const viewDirZ = this.manualCamera ? Math.sin(this.yaw) : dirZ;
    const dl = this.desiredLook;
    dl.x = target.x + viewDirX * 6;
    dl.y = 1.2;
    dl.z = target.z + viewDirZ * 6;
    lerp3(this.look, dl, k);

    // FOV kick at sprint
    const wantFov = sprinting ? 4 : 0;
    this.sprintFov += (wantFov - this.sprintFov) * Math.min(1, dt * 4);
    this.fov = BASE_FOV + this.sprintFov;
  }

  setYaw(y: number): void {
    this.yaw = y;
    this.heightOffset = 0;
    this.manualCamera = false;
  }

  /** Cinematic helper: smoothly frame `point` from `from` (walkout, coin
   * flip, ceremonies, replays). */
  frame(point: Vec3Like, from: Vec3Like, dt: number, speed = 2.5): void {
    const k = Math.min(1, dt * speed);
    lerp3(this.pos, from, k);
    lerp3(this.look, point, k);
  }
}

/** A ball projected to normalized device coordinates (three.js's
 * `Vector3.project`): x, y −1..1 on screen; z > 1 behind the camera or past
 * its far plane. */
export interface Ndc {
  x: number;
  y: number;
  z: number;
}

export interface Arrow {
  visible: boolean;
  /** Window position of the arrow's center. */
  px: number;
  py: number;
  /** How far to turn an up-pointing arrow clockwise (degrees, screen
   * space) so it points toward the ball. */
  angleDeg: number;
}

/** The arrow's clamp: its half size and the bottom band touch controls
 * cover, in window pixels, and the UI scale. */
export interface ArrowBox {
  halfWidth: number;
  halfHeight: number;
  bottomReserve: number;
  scale: number;
}

/** The edge-clamped ball arrow for a projected ball: visible when the ball is behind or outside 92 % / 88 % of the view; the
 * whole arrow and its label stay inside the window and above the touch
 * controls. It points toward the ball (spec.md §5.5). */
export function ballArrow(ndc: Ndc, width: number, height: number, box: ArrowBox, out: Arrow): Arrow {
  const offscreen = ndc.z > 1 || Math.abs(ndc.x) > 0.92 || Math.abs(ndc.y) > 0.88;
  out.visible = offscreen;
  if (!offscreen) return out;
  const ax = ndc.x;
  const ay = ndc.y;
  const m = Math.max(Math.abs(ax) / 0.86, Math.abs(ay) / 0.8, 1e-6);
  const ex = ax / m;
  const ey = ay / m;
  const z = box.scale;
  const px = (ex * 0.5 + 0.5) * width;
  const py = (-ey * 0.5 + 0.5) * height;
  out.px = Math.min(Math.max(px, box.halfWidth + 6 * z), width - box.halfWidth - 6 * z);
  out.py = Math.min(Math.max(py, box.halfHeight + 60 * z), height - box.halfHeight - 6 * z - box.bottomReserve);
  out.angleDeg = (Math.atan2(-ey, ex) * 180) / Math.PI + 90;
  return out;
}
