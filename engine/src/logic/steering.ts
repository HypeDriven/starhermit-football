// The input state machine, without the devices: tank-style desktop steering (turn/forward axes, smoothed),
// the camera-relative touch joystick (mx/mz), the contextual shoot control
// (tap = pass, hold = charged shot) and one-shot action edges. input.ts
// feeds it from starhermit:input.

/** Shorter press = pass, longer = charged shot. */
export const SHOOT_TAP_S = 0.22;
/** Stick deflection that sprints on the touch joystick. */
export const TOUCH_SPRINT = 0.92;
/** Desktop forward held this long runs into a sprint. */
export const AUTO_SPRINT_S = 0.2;

/** One frame of sim input plus the HUD's charge state. */
export interface InputFrame {
  mx: number;
  mz: number;
  /** Steering axes (desktop); null on the touch joystick. */
  turn: number | null;
  fwd: number | null;
  sprint: boolean;
  pass: boolean;
  tackle: boolean;
  /** 0, or the release power in (0, 1]. */
  shoot: number;
  shootHeld: boolean;
  shootCharge: number;
}

export interface Joystick {
  active: boolean;
  /** −1..1, screen right. */
  x: number;
  /** −1..1, screen down. */
  y: number;
}

export class Steering {
  passEdge = false;
  tackleEdge = false;
  shootHeld = false;
  shootCharge = 0;
  shootReleased = 0;
  shootHoldTime = 0;
  turnAxis = 0;
  fwdAxis = 0;
  keyboardMoveTime = 0;
  /** Reused every frame — no per-frame allocation. */
  private readonly out: InputFrame = {
    mx: 0, mz: 0, turn: null, fwd: null, sprint: false,
    pass: false, tackle: false, shoot: 0, shootHeld: false, shootCharge: 0,
  };

  pass(): void {
    this.passEdge = true;
  }

  tackle(): void {
    this.tackleEdge = true;
  }

  pressShoot(): void {
    this.shootHeld = true;
    this.shootCharge = 0;
    this.shootHoldTime = 0;
  }

  /** `tapToPass`: the keyboard shoot control is contextual (a tap passes);
   * mouse and touch shoot buttons always fire on release. */
  releaseShoot(tapToPass: boolean): void {
    if (!this.shootHeld) return;
    this.shootHeld = false;
    if (tapToPass && this.shootHoldTime < SHOOT_TAP_S) {
      this.passEdge = true;
      this.shootCharge = 0;
    } else {
      this.shootReleased = Math.max(0.15, this.shootCharge);
    }
    this.shootHoldTime = 0;
  }

  cancelShoot(): void {
    this.shootHeld = false;
    this.shootCharge = 0;
    this.shootReleased = 0;
    this.shootHoldTime = 0;
  }

  /** Drops held state and pending edges (focus loss, a text field taking
   * the keyboard, the runtime's interface opening). */
  clear(): void {
    this.turnAxis = 0;
    this.fwdAxis = 0;
    this.keyboardMoveTime = 0;
    this.passEdge = false;
    this.tackleEdge = false;
    this.cancelShoot();
  }

  /** One frame: `targetTurn`/`targetFwd` are the desktop axes (−1..1),
   * `joy` the touch stick, `touch` whether the touch layout is in use.
   * Consumes the action edges. */
  frame(dt: number, camYaw: number, targetTurn: number, targetFwd: number, joy: Joystick, touch: boolean): InputFrame {
    const step = Math.max(0, dt);
    // shoot charge builds while held
    if (this.shootHeld) {
      this.shootCharge = Math.min(1, this.shootCharge + dt * 1.4);
      this.shootHoldTime += dt;
    }

    // Desktop steering: smooth the axes so starts, stops and turn reversals
    // do not hammer the simulation with instantaneous changes.
    const steerK = 1 - Math.exp(-16 * step);
    this.turnAxis += (targetTurn - this.turnAxis) * steerK;
    this.fwdAxis += (targetFwd - this.fwdAxis) * steerK;
    if (!targetTurn && Math.abs(this.turnAxis) < 0.03) this.turnAxis = 0;
    if (!targetFwd && Math.abs(this.fwdAxis) < 0.03) this.fwdAxis = 0;
    // Keys give 1; a gamepad stick counts as "forward" past half travel.
    const forward = targetFwd > 0.5;
    this.keyboardMoveTime = forward ? this.keyboardMoveTime + step : 0;

    // Touch is analog and stays world-directed (camera-relative).
    let mx = 0;
    let mz = 0;
    let touchSprint = false;
    if (joy.active) {
      const fx = Math.cos(camYaw);
      const fz = Math.sin(camYaw);
      const sx = -fz;
      const sz = fx;
      mx = fx * -joy.y + sx * joy.x;
      mz = fz * -joy.y + sz * joy.x;
      const m = Math.hypot(mx, mz);
      if (m > 1) {
        mx /= m;
        mz /= m;
      }
      touchSprint = Math.hypot(joy.x, joy.y) > TOUCH_SPRINT;
    }

    const o = this.out;
    o.mx = mx;
    o.mz = mz;
    const steering = !(joy.active || touch);
    o.turn = steering ? this.turnAxis : null;
    o.fwd = steering ? this.fwdAxis : null;
    // Desktop movement ramps from a run to a sprint; no modifier needed.
    o.sprint = (!touch && forward && this.keyboardMoveTime >= AUTO_SPRINT_S) || touchSprint;
    o.pass = this.passEdge;
    o.tackle = this.tackleEdge;
    o.shoot = this.shootReleased;
    o.shootHeld = this.shootHeld;
    o.shootCharge = this.shootCharge;
    this.passEdge = false;
    this.tackleEdge = false;
    this.shootReleased = 0;
    return o;
  }
}
