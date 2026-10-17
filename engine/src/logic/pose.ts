// Procedural footballer pose: the browser's js/world/animator.js math, as a
// pure function from locomotion state to joint angles. world/animator.ts
// writes the result onto the rig; nothing here allocates per call.
//
// Joint conventions (character faces +x, up is +y):
//   - positive rotation.z swings a downward limb forward (+x)
//   - negative rotation.z leans an upward axis (torso/head) forward
//   - positive rotation.x swings a downward limb toward −z
// The root uses Euler order 'YXZ' so dives can yaw then tip.
import { clamp01, mix, smooth } from "./math.ts";

/** Must match the rig's rest pose (world/player.ts). */
export const PELVIS_Y = 0.98;
/** Overlay windows, matching the sim's kickT / tackleT / diveT. */
export const KICK_DUR = 0.35;
export const TACKLE_DUR = 0.45;
export const DIVE_DUR = 0.6;

export interface PoseParams {
  anim: string;
  phase: number;
  speed: number;
  dt: number;
  t: number;
  kickT: number;
  tackleT: number;
  diveT: number;
  diveDir: number;
  /** Dive yaw relative to the current facing. */
  diveRel: number;
  celebrateT: number;
  /** Eased weights of the full-body states (player.ts cross-fades them). */
  wCelebrate: number;
  wDejected: number;
  wFallen: number;
  wCarryF: number;
  wCarryB: number;
  wCrouch: number;
}

export interface Pose {
  px: number; py: number; pz: number; rx: number; ry: number; rz: number;
  pelY: number; pelZ: number; pelRX: number; pelRY: number; pelRZ: number;
  tRX: number; tRY: number; tRZ: number; tSY: number;
  hRX: number; hRY: number; hRZ: number;
  lUAX: number; lUAZ: number; rUAX: number; rUAZ: number;
  lLAZ: number; rLAZ: number;
  lThZ: number; rThZ: number; lShZ: number; rShZ: number; lFtZ: number; rFtZ: number;
}

export function createPose(): Pose {
  return {
    px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0,
    pelY: 0, pelZ: 0, pelRX: 0, pelRY: 0, pelRZ: 0,
    tRX: 0, tRY: 0, tRZ: 0, tSY: 1,
    hRX: 0, hRY: 0, hRZ: 0,
    lUAX: 0, lUAZ: 0, rUAX: 0, rUAZ: 0,
    lLAZ: 0, rLAZ: 0,
    lThZ: 0, rThZ: 0, lShZ: 0, rShZ: 0, lFtZ: 0, rFtZ: 0,
  };
}

export function createPoseParams(): PoseParams {
  return {
    anim: "idle", phase: 0, speed: 0, dt: 0, t: 0,
    kickT: 0, tackleT: 0, diveT: 0, diveDir: 0, diveRel: 0, celebrateT: 0,
    wCelebrate: 0, wDejected: 0, wFallen: 0, wCarryF: 0, wCarryB: 0, wCrouch: 0,
  };
}

/** Fills `P` from `params` and returns it. */
export function computePose(params: PoseParams, P: Pose): Pose {
  const t = params.t;
  const phase = params.phase;
  const speed = params.speed;
  const wCel = params.wCelebrate;
  const wDej = params.wDejected;
  const wFal = params.wFallen;

  const s = clamp01(speed / 6.5); // 0 = standing, 1 = full sprint
  const moveW = smooth(0.05, 0.7, speed); // locomotion blend
  const idleW = 1 - moveW;

  const sp = Math.sin(phase);
  const cp = Math.cos(phase);

  // ---------------- base: idle + locomotion ----------------
  const legAmp = (0.34 + 0.62 * s) * moveW;
  const kneeAmp = 0.55 + 0.85 * s;
  const armAmp = 0.05 * idleW + (0.16 + 0.5 * s) * moveW;
  const elbow = 0.25 + 1.0 * s * moveW;
  const bob = (0.012 + 0.05 * s) * moveW;
  const lean = (0.03 + 0.24 * s) * moveW;

  const sway = Math.sin(t * 0.9); // idle weight shift
  const breathe = Math.sin(t * 1.7); // idle breathing

  P.px = 0; P.py = 0; P.pz = 0; P.rx = 0; P.ry = 0; P.rz = 0;

  // Hip: bob at double step cadence, subtle idle sway + breathing rise.
  P.pelY = PELVIS_Y - bob * (0.5 - 0.5 * Math.cos(2 * phase)) + 0.008 * breathe * idleW;
  P.pelZ = 0.015 * sway * idleW;
  P.pelRX = 0.03 * sway * idleW;
  P.pelRY = 0.07 * sp * moveW;
  P.pelRZ = -0.04 * cp * moveW;

  // Torso: forward lean grows with speed, counter-twists against the pelvis.
  P.tRX = 0.015 * breathe * idleW;
  P.tRY = -0.1 * sp * moveW;
  P.tRZ = -lean + 0.02 * breathe * idleW;
  P.tSY = 1 + 0.012 * breathe * idleW;

  // Head: held roughly level, idle glances.
  P.hRX = 0;
  P.hRY = 0.25 * Math.sin(t * 0.5) * idleW;
  P.hRZ = lean * 0.7;

  // Legs: phase-locked swing; knee flexes through the swing phase then
  // extends for plant; support leg stays near-straight.
  P.lThZ = legAmp * sp;
  P.rThZ = -legAmp * sp;
  const kneeL = (kneeAmp * Math.max(0, Math.sin(phase + 1.9)) + 0.07) * moveW + 0.03;
  const kneeR = (kneeAmp * Math.max(0, Math.sin(phase + 1.9 + Math.PI)) + 0.07) * moveW + 0.03;
  P.lShZ = -kneeL;
  P.rShZ = -kneeR;
  P.lFtZ = -(P.lThZ + P.lShZ) * 0.55 + 0.3 * Math.max(0, Math.sin(phase - 0.9)) * moveW;
  P.rFtZ = -(P.rThZ + P.rShZ) * 0.55 + 0.3 * Math.max(0, Math.sin(phase + Math.PI - 0.9)) * moveW;

  // Arms: counter-swing to legs, elbows bent — pumping harder at sprint.
  P.lUAX = -0.07 - 0.05 * idleW * Math.sin(t * 1.1);
  P.rUAX = 0.07 + 0.05 * idleW * Math.sin(t * 1.1 + 1.3);
  P.lUAZ = -armAmp * sp + 0.03 * idleW * sway;
  P.rUAZ = armAmp * sp - 0.03 * idleW * sway;
  P.lLAZ = elbow + 0.35 * s * Math.max(0, -sp) * moveW;
  P.rLAZ = elbow + 0.35 * s * Math.max(0, sp) * moveW;

  // ---------------- kick overlay (right leg) ----------------
  const kt = params.kickT;
  if (kt > 0) {
    const prog = 1 - Math.min(kt, KICK_DUR) / KICK_DUR;
    const w = smooth(0, 0.06, prog) * smooth(1, 0.9, prog); // ease in, decay out
    if (w > 0) {
      const wind = smooth(0, 0.45, prog); // draw back
      const strike = smooth(0.45, 0.62, prog); // whip forward + follow-through
      P.rThZ = mix(P.rThZ, -1.05 * wind + 2.25 * strike, w);
      P.rShZ = mix(P.rShZ, -(1.5 * wind * (1 - strike) + 0.25), w);
      P.rFtZ = mix(P.rFtZ, 0.35 * strike, w);
      // arms counter-balance the strike
      P.lUAZ = mix(P.lUAZ, 0.9 * strike - 0.4 * wind, w);
      P.rUAZ = mix(P.rUAZ, -0.7 * strike + 0.3 * wind, w);
      P.lUAX = mix(P.lUAX, -0.5, w);
      P.lLAZ = mix(P.lLAZ, 0.5, w);
      P.tRY = mix(P.tRY, 0.15 * wind - 0.25 * strike, w);
      P.tRZ = mix(P.tRZ, P.tRZ - 0.12 * strike, w);
      P.pelY = mix(P.pelY, PELVIS_Y - 0.05, w);
    }
  }

  // ---------------- slide tackle overlay ----------------
  const tt = params.tackleT;
  if (tt > 0) {
    const prog = 1 - Math.min(tt, TACKLE_DUR) / TACKLE_DUR;
    const w = smooth(0, 0.18, prog) * smooth(1, 0.8, prog);
    if (w > 0) {
      P.pelY = mix(P.pelY, 0.42, w);
      P.rz = mix(P.rz, -0.15, w);
      P.tRZ = mix(P.tRZ, 0.55, w); // tilted back
      P.hRZ = mix(P.hRZ, -0.2, w);
      // lead leg extended, trail leg folded under
      P.rThZ = mix(P.rThZ, 1.35, w); P.rShZ = mix(P.rShZ, -0.15, w); P.rFtZ = mix(P.rFtZ, -0.3, w);
      P.lThZ = mix(P.lThZ, 0.55, w); P.lShZ = mix(P.lShZ, -1.9, w);
      P.lUAX = mix(P.lUAX, -0.9, w); P.lUAZ = mix(P.lUAZ, -0.6, w);
      P.rUAX = mix(P.rUAX, 0.5, w); P.rUAZ = mix(P.rUAZ, -0.9, w);
    }
  }

  // ---------------- goalkeeper dive overlay ----------------
  const dvt = params.diveT;
  if (dvt > 0) {
    const prog = 1 - Math.min(dvt, DIVE_DUR) / DIVE_DUR;
    const w = smooth(0, 0.15, prog) * smooth(1, 0.75, prog);
    if (w > 0) {
      const rel = params.diveRel; // dive yaw relative to current facing
      const arc = Math.sin(Math.PI * Math.min(prog * 1.15, 1));
      // root order is 'YXZ': yaw to the dive direction, then tip horizontal
      P.ry = mix(P.ry, Math.PI / 2 + rel, w);
      P.rx = mix(P.rx, (Math.PI / 2 - 0.15) * Math.min(prog * 2, 1), w);
      P.px = mix(P.px, Math.cos(rel) * 0.7 * prog, w);
      P.pz = mix(P.pz, -Math.sin(rel) * 0.7 * prog, w);
      P.py = mix(P.py, 0.55 * arc + 0.42 * smooth(0.55, 0.95, prog), w);
      // both arms extended overhead toward the ball
      P.lUAZ = mix(P.lUAZ, 2.9, w); P.rUAZ = mix(P.rUAZ, 2.7, w);
      P.lUAX = mix(P.lUAX, -0.25, w); P.rUAX = mix(P.rUAX, 0.25, w);
      P.lLAZ = mix(P.lLAZ, 0.15, w); P.rLAZ = mix(P.rLAZ, 0.15, w);
      P.lThZ = mix(P.lThZ, -0.25, w); P.rThZ = mix(P.rThZ, 0.15, w);
      P.lShZ = mix(P.lShZ, -0.35, w); P.rShZ = mix(P.rShZ, -0.5, w);
      P.tRZ = mix(P.tRZ, 0, w);
      P.hRZ = mix(P.hRZ, -0.2, w);
    }
  }

  // ---------------- fallen (crumpled) ----------------
  if (wFal > 0.001) {
    P.pelY = mix(P.pelY, 0.28, wFal);
    P.rx = mix(P.rx, 1.35, wFal);
    P.rz = mix(P.rz, 0.25, wFal);
    P.tRZ = mix(P.tRZ, 0.2, wFal);
    P.hRZ = mix(P.hRZ, 0.3, wFal);
    P.lThZ = mix(P.lThZ, 0.5, wFal); P.rThZ = mix(P.rThZ, 0.7, wFal);
    P.lShZ = mix(P.lShZ, -1.4, wFal); P.rShZ = mix(P.rShZ, -1.1, wFal);
    P.lUAZ = mix(P.lUAZ, 0.8, wFal); P.rUAZ = mix(P.rUAZ, 1.0, wFal);
    P.lLAZ = mix(P.lLAZ, 0.5, wFal); P.rLAZ = mix(P.rLAZ, 0.6, wFal);
  }

  // ---------------- celebrate ----------------
  if (wCel > 0.001) {
    const ct = params.celebrateT;
    if (ct > 2.2) {
      // knee slide: low, tilted back, shins folded, arms spread wide
      P.pelY = mix(P.pelY, 0.46, wCel);
      P.tRZ = mix(P.tRZ, 0.5, wCel);
      P.hRZ = mix(P.hRZ, -0.35, wCel);
      P.lThZ = mix(P.lThZ, 0.4, wCel); P.rThZ = mix(P.rThZ, 0.4, wCel);
      P.lShZ = mix(P.lShZ, -2.0, wCel); P.rShZ = mix(P.rShZ, -2.0, wCel);
      P.lUAZ = mix(P.lUAZ, 2.3, wCel); P.rUAZ = mix(P.rUAZ, 2.3, wCel);
      P.lUAX = mix(P.lUAX, -0.6, wCel); P.rUAX = mix(P.rUAX, 0.6, wCel);
      P.lLAZ = mix(P.lLAZ, 0.4, wCel); P.rLAZ = mix(P.rLAZ, 0.4, wCel);
    } else {
      // fist pumps with small jumps
      const jp = Math.max(0, Math.sin(t * 7));
      const pump = Math.sin(t * 7);
      P.py = mix(P.py, 0.22 * jp, wCel);
      P.pelY = mix(P.pelY, PELVIS_Y - 0.06, wCel);
      P.lUAZ = mix(P.lUAZ, 2.6 + 0.35 * pump, wCel);
      P.rUAZ = mix(P.rUAZ, 2.6 - 0.35 * pump, wCel);
      P.lLAZ = mix(P.lLAZ, 0.7, wCel); P.rLAZ = mix(P.rLAZ, 0.7, wCel);
      P.lThZ = mix(P.lThZ, 0.35 * jp, wCel); P.rThZ = mix(P.rThZ, 0.35 * jp, wCel);
      P.lShZ = mix(P.lShZ, -0.7 * jp, wCel); P.rShZ = mix(P.rShZ, -0.7 * jp, wCel);
      P.tRZ = mix(P.tRZ, -0.1, wCel);
      P.hRZ = mix(P.hRZ, 0.15, wCel);
    }
  }

  // ---------------- dejected ----------------
  if (wDej > 0.001) {
    P.pelY = mix(P.pelY, PELVIS_Y - 0.04, wDej);
    P.tRZ = mix(P.tRZ, -0.18, wDej); // shoulders slumped forward
    P.hRZ = mix(P.hRZ, -0.5, wDej); // head down
    P.hRY = mix(P.hRY, 0, wDej);
    // hands on hips: elbows flared out and sharply bent
    P.lUAX = mix(P.lUAX, -0.55, wDej); P.rUAX = mix(P.rUAX, 0.55, wDej);
    P.lUAZ = mix(P.lUAZ, -0.35, wDej); P.rUAZ = mix(P.rUAZ, -0.35, wDej);
    P.lLAZ = mix(P.lLAZ, 1.7, wDej); P.rLAZ = mix(P.rLAZ, 1.7, wDej);
    P.lThZ = mix(P.lThZ, 0.05, wDej); P.rThZ = mix(P.rThZ, -0.05, wDej);
    P.lShZ = mix(P.lShZ, -0.08, wDej); P.rShZ = mix(P.rShZ, -0.08, wDej);
    P.lFtZ = mix(P.lFtZ, 0, wDej); P.rFtZ = mix(P.rFtZ, 0, wDej);
  }

  // ---------------- stretcher carry + crouch (ceremony medics) ----------------
  const wCF = params.wCarryF;
  const wCB = params.wCarryB;
  const wCro = params.wCrouch;

  if (wCF + wCB > 0.001) {
    const wC = Math.min(1, wCF + wCB);
    // rear carrier (carryB) reaches forward to the rails; front carrier
    // (carryF) reaches back — both grip the poles at hip height
    const reach = (wCB - wCF) / Math.max(wC, 1e-4); // +1 fwd, −1 back
    P.lUAZ = mix(P.lUAZ, 0.58 * reach, wC); P.rUAZ = mix(P.rUAZ, 0.58 * reach, wC);
    P.lUAX = mix(P.lUAX, -0.16, wC); P.rUAX = mix(P.rUAX, 0.16, wC);
    P.lLAZ = mix(P.lLAZ, 0.28, wC); P.rLAZ = mix(P.rLAZ, 0.28, wC);
    P.tRZ = mix(P.tRZ, -0.09, wC); // slight hunch under the load
  }

  if (wCro > 0.001) {
    // kneel down / rise with the stretcher: hips low, knees folded, bent
    // over, hands reaching to the rails
    P.pelY = mix(P.pelY, 0.52, wCro);
    P.tRZ = mix(P.tRZ, -0.38, wCro);
    P.hRZ = mix(P.hRZ, -0.22, wCro);
    P.lThZ = mix(P.lThZ, 1.05, wCro); P.rThZ = mix(P.rThZ, 1.05, wCro);
    P.lShZ = mix(P.lShZ, -1.75, wCro); P.rShZ = mix(P.rShZ, -1.75, wCro);
    P.lFtZ = mix(P.lFtZ, 0.7, wCro); P.rFtZ = mix(P.rFtZ, 0.7, wCro);
    P.lUAZ = mix(P.lUAZ, 0.55, wCro); P.rUAZ = mix(P.rUAZ, 0.55, wCro);
    P.lUAX = mix(P.lUAX, -0.14, wCro); P.rUAX = mix(P.rUAX, 0.14, wCro);
    P.lLAZ = mix(P.lLAZ, 0.15, wCro); P.rLAZ = mix(P.rLAZ, 0.15, wCro);
  }
  return P;
}

/** The state the rig eases toward each frame (player.ts's cross-fades). */
export interface PoseBlend {
  t: number;
  speed: number;
  wCel: number;
  wDej: number;
  wFal: number;
  wCarF: number;
  wCarB: number;
  wCro: number;
}

export function createPoseBlend(): PoseBlend {
  return { t: 0, speed: 0, wCel: 0, wDej: 0, wFal: 0, wCarF: 0, wCarB: 0, wCro: 0 };
}

/** The entity fields a pose reads (players and ceremony actors). */
export interface PoseEntity {
  anim: string;
  animSpeed: number;
  phase: number;
  kickT: number;
  tackleT: number;
  diveT: number;
  diveDir: number;
  celebrateT: number;
}

/** Eases the blend toward `ent` over `dt` and fills `params` for
 * `computePose`; `yaw` is the group's current rotation.y. */
export function blendPose(blend: PoseBlend, ent: PoseEntity, dt: number, yaw: number, params: PoseParams): PoseParams {
  blend.t += dt;
  // Ease toward targets so anim transitions cross-fade instead of popping.
  const k = 1 - Math.exp(-8 * dt);
  const anim = ent.anim || "idle";
  blend.speed += ((ent.animSpeed || 0) - blend.speed) * k;
  blend.wCel += ((anim === "celebrate" ? 1 : 0) - blend.wCel) * k;
  blend.wDej += ((anim === "dejected" ? 1 : 0) - blend.wDej) * k;
  blend.wFal += ((anim === "fallen" ? 1 : 0) - blend.wFal) * k;
  blend.wCarF += ((anim === "carryF" ? 1 : 0) - blend.wCarF) * k;
  blend.wCarB += ((anim === "carryB" ? 1 : 0) - blend.wCarB) * k;
  blend.wCro += ((anim === "crouch" ? 1 : 0) - blend.wCro) * k;

  params.anim = anim;
  params.phase = ent.phase || 0;
  params.speed = blend.speed;
  params.dt = dt;
  params.t = blend.t;
  params.kickT = ent.kickT || 0;
  params.tackleT = ent.tackleT || 0;
  params.diveT = ent.diveT || 0;
  params.diveDir = ent.diveDir || 0;
  params.diveRel = (ent.diveDir || 0) - yaw;
  params.celebrateT = ent.celebrateT || 0;
  params.wCelebrate = blend.wCel;
  params.wDejected = blend.wDej;
  params.wFallen = blend.wFal;
  params.wCarryF = blend.wCarF;
  params.wCarryB = blend.wCarB;
  params.wCrouch = blend.wCro;
  return params;
}
