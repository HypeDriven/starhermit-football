// Gameplay input on starhermit:input:
// the manifest's actions (control.* keys, engine.gamepad.* pads, the
// runtime's on-screen touch controls), pointer lock with mouse look and
// mouse buttons, and the gamepad's right stick for the camera. The player
// rebinds actions in the runtime's Options menu, so nothing here names a
// key except the game's fixed shortcuts (T chat, M mic, Escape).
import {
  exitPointerLock,
  gamepads,
  onAction,
  onPointerButton,
  onPointerDelta,
  onPointerLockChange,
  pointerLocked,
  primaryPointer,
  requestPointerLock,
  setTouchControls,
  value,
  vibrate,
} from "starhermit:input";
import type { TouchControl } from "starhermit:input";
import { onFocus, onOverlay } from "starhermit:engine";
import * as ui from "starhermit:ui";
import { T, onLanguage } from "./i18n.ts";
import { Steering } from "./logic/steering.ts";
import type { InputFrame, Joystick } from "./logic/steering.ts";

/** A touch button label in the game language (the host takes 16
 * characters). */
function touchLabel(key: string): string {
  return T(key).slice(0, 16);
}

/** The on-screen layout (logical pixels from the anchor corner): a joystick
 * bottom-left, TACKLE · PASS · SHOOT bottom-right. */
function touchLayout(): TouchControl[] {
  return [
    { kind: "stick", up: "up", down: "down", left: "left", right: "right", anchor: "bottom-left", offset: [90, 90], radius: 66 },
    { kind: "button", action: "shoot", label: touchLabel("SHOOT"), anchor: "bottom-right", offset: [66, 66], radius: 46 },
    { kind: "button", action: "pass", label: touchLabel("PASS"), anchor: "bottom-right", offset: [162, 56], radius: 37 },
    { kind: "button", action: "tackle", label: touchLabel("TACKLE"), anchor: "bottom-right", offset: [249, 56], radius: 37 },
  ];
}

/** Right-stick camera speed in mouse pixels per second. */
const STICK_LOOK_X = 700;
const STICK_LOOK_Y = 350;
const STICK_DEAD = 0.15;

export interface GameInput {
  /** The touch layout is in use: the player's primary pointer is coarse
   * (a touch screen). */
  readonly touchMode: boolean;
  readonly pointerLocked: boolean;
  getState(camYaw: number, dt: number): InputFrame;
  /** This frame's mouse-look pixels (and the right stick's). */
  consumeLookDelta(dt: number): { x: number; y: number };
  /** Gameplay is live: touch controls show and the pointer can lock. */
  showTouchUi(show: boolean): void;
  /** Presses at window points the HUD owns (its buttons) do not reach
   * gameplay. */
  setPointerFilter(filter: ((x: number, y: number) => boolean) | null): void;
  /** A haptic tick on phones (sprinting strides). */
  tick(): void;
}

function safe(f: () => void): void {
  try {
    f();
  } catch {
    // an action or capability the host refused
  }
}

export function createInput(): GameInput {
  const steering = new Steering();
  const joy: Joystick = { active: false, x: 0, y: 0 };
  const look = { x: 0, y: 0 };
  const lookOut = { x: 0, y: 0 };
  let gameplayActive = false;
  let typing = false;
  const isTouch = (): boolean => {
    try {
      return primaryPointer() === "coarse";
    } catch {
      return false;
    }
  };
  let filter: ((x: number, y: number) => boolean) | null = null;

  // the touch labels follow the game language
  onLanguage(() => {
    if (gameplayActive) safe(() => setTouchControls(touchLayout()));
  });

  const clear = (): void => {
    steering.clear();
    look.x = look.y = 0;
  };

  onAction((e) => {
    if (!gameplayActive || ui.capturingKeys()) return;
    switch (e.action) {
      case "pass":
        if (e.pressed) steering.pass();
        break;
      case "tackle":
        if (e.pressed) steering.tackle();
        break;
      case "shoot":
        // The keyboard/pad shoot control is contextual (tap = pass); the
        // touch SHOOT button always shoots.
        if (e.pressed) steering.pressShoot();
        else steering.releaseShoot(e.source !== "touch");
        break;
    }
  });

  // Desktop mouse camera: the first click on the pitch locks the pointer;
  // once locked the mouse aims, left shoots, right passes, middle tackles.
  onPointerButton((e) => {
    if (!gameplayActive || isTouch()) return;
    if (!pointerLocked()) {
      if (!e.pressed || ui.pointerOver() || (filter && filter(e.x, e.y))) return;
      safe(() => requestPointerLock());
      return; // the capture click must not also fire a shot
    }
    if (e.pressed) {
      if (e.button === 0) steering.pressShoot();
      else if (e.button === 1) steering.tackle();
      else if (e.button === 2) steering.pass();
    } else if (e.button === 0) {
      steering.releaseShoot(false);
    }
  });
  onPointerDelta((dx, dy) => {
    if (gameplayActive && pointerLocked()) {
      look.x += dx;
      look.y += dy;
    }
  });
  onPointerLockChange((locked) => {
    if (!locked) {
      look.x = look.y = 0;
      steering.cancelShoot();
    }
  });
  // Held input is released on focus loss and while the runtime's own
  // interface is open.
  onFocus((focused) => {
    if (!focused) clear();
  });
  onOverlay((open) => {
    if (open) clear();
  });

  const axis = (positive: string, negative: string): number => {
    try {
      return value(positive) - value(negative);
    } catch {
      return 0;
    }
  };

  return {
    get touchMode() {
      return isTouch();
    },
    get pointerLocked() {
      return pointerLocked();
    },
    getState(camYaw: number, dt: number): InputFrame {
      // A text field (match chat) has the keyboard: drop held state once
      // and steer nothing while typing.
      const nowTyping = ui.capturingKeys();
      if (nowTyping && !typing) clear();
      typing = nowTyping;
      let turn = 0;
      let fwd = 0;
      const touchMode = isTouch();
      joy.active = false;
      joy.x = joy.y = 0;
      if (!typing) {
        if (touchMode) {
          // The runtime's stick feeds the four move actions analog values.
          joy.x = axis("right", "left");
          joy.y = axis("down", "up");
          joy.active = Math.hypot(joy.x, joy.y) > 0.01;
        } else {
          turn = axis("right", "left");
          fwd = axis("up", "down");
        }
      }
      return steering.frame(dt, camYaw, turn, fwd, joy, touchMode);
    },
    consumeLookDelta(dt: number): { x: number; y: number } {
      let x = look.x;
      let y = look.y;
      look.x = look.y = 0;
      if (gameplayActive && !isTouch()) {
        try {
          for (const pad of gamepads()) {
            if (!pad.connected || pad.slot !== 0) continue;
            const ax = pad.axes[2] ?? 0;
            const ay = pad.axes[3] ?? 0;
            if (Math.hypot(ax, ay) > STICK_DEAD) {
              x += ax * STICK_LOOK_X * dt;
              y += ay * STICK_LOOK_Y * dt;
            }
            break;
          }
        } catch {
          // no pads
        }
      }
      lookOut.x = x;
      lookOut.y = y;
      return lookOut;
    },
    showTouchUi(show: boolean): void {
      gameplayActive = show;
      safe(() => setTouchControls(show ? touchLayout() : null));
      if (!show) {
        clear();
        if (pointerLocked()) safe(() => exitPointerLock());
      }
    },
    setPointerFilter(f: ((x: number, y: number) => boolean) | null): void {
      filter = f;
    },
    tick(): void {
      safe(() => vibrate(4));
    },
  };
}
