// The footballers' pose as starhermit:world kernels (world/rig.ts runs them):
// logic/pose.ts's blendPose and computePose written over a rig row, so the
// runtime computes every footballer's pose natively, and the joint rows that
// drive the scene nodes. The same functions run as script on plain objects
// (the Node tests compare them with logic/pose.ts number for number); the
// only host import is kernel.fn, which declares the helpers.
import { kernel } from "starhermit:world";
import { DIVE_DUR, KICK_DUR, PELVIS_Y, TACKLE_DUR } from "../logic/pose.ts";

/** An entity's full-body state as a number (logic/pose.ts's weights). */
export const ANIM_OTHER = 0;
export const ANIM_CELEBRATE = 1;
export const ANIM_DEJECTED = 2;
export const ANIM_FALLEN = 3;
export const ANIM_CARRY_F = 4;
export const ANIM_CARRY_B = 5;
export const ANIM_CROUCH = 6;

/** A rig row: what the view writes each frame (`anim` … `celebT`, the
 * group's place, and `dt`, 0 once the pose kernel used it), the blend the
 * kernel eases (`bt` … `wCro`, logic/pose.ts's PoseBlend), and the pose
 * it computes (logic/pose.ts's Pose). */
export interface RigRow {
  anim: number;
  aspeed: number;
  phase: number;
  kickT: number;
  tackleT: number;
  diveT: number;
  diveDir: number;
  celebT: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  dt: number;
  bt: number;
  bspeed: number;
  wCel: number;
  wDej: number;
  wFal: number;
  wCarF: number;
  wCarB: number;
  wCro: number;
  px: number; py: number; pz: number; rx: number; ry: number; rz: number;
  pelY: number; pelZ: number; pelRX: number; pelRY: number; pelRZ: number;
  tRX: number; tRY: number; tRZ: number; tSY: number;
  hRX: number; hRY: number; hRZ: number;
  lUAX: number; lUAZ: number; rUAX: number; rUAZ: number;
  lLAZ: number; rLAZ: number;
  lThZ: number; rThZ: number; lShZ: number; rShZ: number; lFtZ: number; rFtZ: number;
}

// logic/math.ts's helpers, as kernel helpers.
const clamp01 = kernel.fn((v: number) => (v < 0 ? 0 : v > 1 ? 1 : v));
const smooth = kernel.fn((a: number, b: number, x: number) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
});
const mix = kernel.fn((a: number, b: number, w: number) => a + (b - a) * w);

/** blendPose then computePose (logic/pose.ts), over one rig row. */
export const poseRow = (r: RigRow): void => {
  // ---------------- blend: ease toward the entity's state ----------------
  const dt = r.dt;
  r.bt += dt;
  const k = 1 - Math.exp(-8 * dt);
  const anim = r.anim;
  r.bspeed += (r.aspeed - r.bspeed) * k;
  r.wCel += ((anim === ANIM_CELEBRATE ? 1 : 0) - r.wCel) * k;
  r.wDej += ((anim === ANIM_DEJECTED ? 1 : 0) - r.wDej) * k;
  r.wFal += ((anim === ANIM_FALLEN ? 1 : 0) - r.wFal) * k;
  r.wCarF += ((anim === ANIM_CARRY_F ? 1 : 0) - r.wCarF) * k;
  r.wCarB += ((anim === ANIM_CARRY_B ? 1 : 0) - r.wCarB) * k;
  r.wCro += ((anim === ANIM_CROUCH ? 1 : 0) - r.wCro) * k;
  r.dt = 0;

  const t = r.bt;
  const phase = r.phase;
  const speed = r.bspeed;
  const wCel = r.wCel;
  const wDej = r.wDej;
  const wFal = r.wFal;

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

  r.px = 0; r.py = 0; r.pz = 0; r.rx = 0; r.ry = 0; r.rz = 0;

  r.pelY = PELVIS_Y - bob * (0.5 - 0.5 * Math.cos(2 * phase)) + 0.008 * breathe * idleW;
  r.pelZ = 0.015 * sway * idleW;
  r.pelRX = 0.03 * sway * idleW;
  r.pelRY = 0.07 * sp * moveW;
  r.pelRZ = -0.04 * cp * moveW;

  r.tRX = 0.015 * breathe * idleW;
  r.tRY = -0.1 * sp * moveW;
  r.tRZ = -lean + 0.02 * breathe * idleW;
  r.tSY = 1 + 0.012 * breathe * idleW;

  r.hRX = 0;
  r.hRY = 0.25 * Math.sin(t * 0.5) * idleW;
  r.hRZ = lean * 0.7;

  r.lThZ = legAmp * sp;
  r.rThZ = -legAmp * sp;
  const kneeL = (kneeAmp * Math.max(0, Math.sin(phase + 1.9)) + 0.07) * moveW + 0.03;
  const kneeR = (kneeAmp * Math.max(0, Math.sin(phase + 1.9 + Math.PI)) + 0.07) * moveW + 0.03;
  r.lShZ = -kneeL;
  r.rShZ = -kneeR;
  r.lFtZ = -(r.lThZ + r.lShZ) * 0.55 + 0.3 * Math.max(0, Math.sin(phase - 0.9)) * moveW;
  r.rFtZ = -(r.rThZ + r.rShZ) * 0.55 + 0.3 * Math.max(0, Math.sin(phase + Math.PI - 0.9)) * moveW;

  r.lUAX = -0.07 - 0.05 * idleW * Math.sin(t * 1.1);
  r.rUAX = 0.07 + 0.05 * idleW * Math.sin(t * 1.1 + 1.3);
  r.lUAZ = -armAmp * sp + 0.03 * idleW * sway;
  r.rUAZ = armAmp * sp - 0.03 * idleW * sway;
  r.lLAZ = elbow + 0.35 * s * Math.max(0, -sp) * moveW;
  r.rLAZ = elbow + 0.35 * s * Math.max(0, sp) * moveW;

  // ---------------- kick overlay (right leg) ----------------
  const kt = r.kickT;
  if (kt > 0) {
    const prog = 1 - Math.min(kt, KICK_DUR) / KICK_DUR;
    const w = smooth(0, 0.06, prog) * smooth(1, 0.9, prog);
    if (w > 0) {
      const wind = smooth(0, 0.45, prog);
      const strike = smooth(0.45, 0.62, prog);
      r.rThZ = mix(r.rThZ, -1.05 * wind + 2.25 * strike, w);
      r.rShZ = mix(r.rShZ, -(1.5 * wind * (1 - strike) + 0.25), w);
      r.rFtZ = mix(r.rFtZ, 0.35 * strike, w);
      r.lUAZ = mix(r.lUAZ, 0.9 * strike - 0.4 * wind, w);
      r.rUAZ = mix(r.rUAZ, -0.7 * strike + 0.3 * wind, w);
      r.lUAX = mix(r.lUAX, -0.5, w);
      r.lLAZ = mix(r.lLAZ, 0.5, w);
      r.tRY = mix(r.tRY, 0.15 * wind - 0.25 * strike, w);
      r.tRZ = mix(r.tRZ, r.tRZ - 0.12 * strike, w);
      r.pelY = mix(r.pelY, PELVIS_Y - 0.05, w);
    }
  }

  // ---------------- slide tackle overlay ----------------
  const tt = r.tackleT;
  if (tt > 0) {
    const prog = 1 - Math.min(tt, TACKLE_DUR) / TACKLE_DUR;
    const w = smooth(0, 0.18, prog) * smooth(1, 0.8, prog);
    if (w > 0) {
      r.pelY = mix(r.pelY, 0.42, w);
      r.rz = mix(r.rz, -0.15, w);
      r.tRZ = mix(r.tRZ, 0.55, w);
      r.hRZ = mix(r.hRZ, -0.2, w);
      r.rThZ = mix(r.rThZ, 1.35, w); r.rShZ = mix(r.rShZ, -0.15, w); r.rFtZ = mix(r.rFtZ, -0.3, w);
      r.lThZ = mix(r.lThZ, 0.55, w); r.lShZ = mix(r.lShZ, -1.9, w);
      r.lUAX = mix(r.lUAX, -0.9, w); r.lUAZ = mix(r.lUAZ, -0.6, w);
      r.rUAX = mix(r.rUAX, 0.5, w); r.rUAZ = mix(r.rUAZ, -0.9, w);
    }
  }

  // ---------------- goalkeeper dive overlay ----------------
  const dvt = r.diveT;
  if (dvt > 0) {
    const prog = 1 - Math.min(dvt, DIVE_DUR) / DIVE_DUR;
    const w = smooth(0, 0.15, prog) * smooth(1, 0.75, prog);
    if (w > 0) {
      const rel = r.diveDir - r.yaw; // dive yaw relative to the current facing
      const arc = Math.sin(Math.PI * Math.min(prog * 1.15, 1));
      r.ry = mix(r.ry, Math.PI / 2 + rel, w);
      r.rx = mix(r.rx, (Math.PI / 2 - 0.15) * Math.min(prog * 2, 1), w);
      r.px = mix(r.px, Math.cos(rel) * 0.7 * prog, w);
      r.pz = mix(r.pz, -Math.sin(rel) * 0.7 * prog, w);
      r.py = mix(r.py, 0.55 * arc + 0.42 * smooth(0.55, 0.95, prog), w);
      r.lUAZ = mix(r.lUAZ, 2.9, w); r.rUAZ = mix(r.rUAZ, 2.7, w);
      r.lUAX = mix(r.lUAX, -0.25, w); r.rUAX = mix(r.rUAX, 0.25, w);
      r.lLAZ = mix(r.lLAZ, 0.15, w); r.rLAZ = mix(r.rLAZ, 0.15, w);
      r.lThZ = mix(r.lThZ, -0.25, w); r.rThZ = mix(r.rThZ, 0.15, w);
      r.lShZ = mix(r.lShZ, -0.35, w); r.rShZ = mix(r.rShZ, -0.5, w);
      r.tRZ = mix(r.tRZ, 0, w);
      r.hRZ = mix(r.hRZ, -0.2, w);
    }
  }

  // ---------------- fallen (crumpled) ----------------
  if (wFal > 0.001) {
    r.pelY = mix(r.pelY, 0.28, wFal);
    r.rx = mix(r.rx, 1.35, wFal);
    r.rz = mix(r.rz, 0.25, wFal);
    r.tRZ = mix(r.tRZ, 0.2, wFal);
    r.hRZ = mix(r.hRZ, 0.3, wFal);
    r.lThZ = mix(r.lThZ, 0.5, wFal); r.rThZ = mix(r.rThZ, 0.7, wFal);
    r.lShZ = mix(r.lShZ, -1.4, wFal); r.rShZ = mix(r.rShZ, -1.1, wFal);
    r.lUAZ = mix(r.lUAZ, 0.8, wFal); r.rUAZ = mix(r.rUAZ, 1.0, wFal);
    r.lLAZ = mix(r.lLAZ, 0.5, wFal); r.rLAZ = mix(r.rLAZ, 0.6, wFal);
  }

  // ---------------- celebrate ----------------
  if (wCel > 0.001) {
    const ct = r.celebT;
    if (ct > 2.2) {
      r.pelY = mix(r.pelY, 0.46, wCel);
      r.tRZ = mix(r.tRZ, 0.5, wCel);
      r.hRZ = mix(r.hRZ, -0.35, wCel);
      r.lThZ = mix(r.lThZ, 0.4, wCel); r.rThZ = mix(r.rThZ, 0.4, wCel);
      r.lShZ = mix(r.lShZ, -2.0, wCel); r.rShZ = mix(r.rShZ, -2.0, wCel);
      r.lUAZ = mix(r.lUAZ, 2.3, wCel); r.rUAZ = mix(r.rUAZ, 2.3, wCel);
      r.lUAX = mix(r.lUAX, -0.6, wCel); r.rUAX = mix(r.rUAX, 0.6, wCel);
      r.lLAZ = mix(r.lLAZ, 0.4, wCel); r.rLAZ = mix(r.rLAZ, 0.4, wCel);
    } else {
      const jp = Math.max(0, Math.sin(t * 7));
      const pump = Math.sin(t * 7);
      r.py = mix(r.py, 0.22 * jp, wCel);
      r.pelY = mix(r.pelY, PELVIS_Y - 0.06, wCel);
      r.lUAZ = mix(r.lUAZ, 2.6 + 0.35 * pump, wCel);
      r.rUAZ = mix(r.rUAZ, 2.6 - 0.35 * pump, wCel);
      r.lLAZ = mix(r.lLAZ, 0.7, wCel); r.rLAZ = mix(r.rLAZ, 0.7, wCel);
      r.lThZ = mix(r.lThZ, 0.35 * jp, wCel); r.rThZ = mix(r.rThZ, 0.35 * jp, wCel);
      r.lShZ = mix(r.lShZ, -0.7 * jp, wCel); r.rShZ = mix(r.rShZ, -0.7 * jp, wCel);
      r.tRZ = mix(r.tRZ, -0.1, wCel);
      r.hRZ = mix(r.hRZ, 0.15, wCel);
    }
  }

  // ---------------- dejected ----------------
  if (wDej > 0.001) {
    r.pelY = mix(r.pelY, PELVIS_Y - 0.04, wDej);
    r.tRZ = mix(r.tRZ, -0.18, wDej);
    r.hRZ = mix(r.hRZ, -0.5, wDej);
    r.hRY = mix(r.hRY, 0, wDej);
    r.lUAX = mix(r.lUAX, -0.55, wDej); r.rUAX = mix(r.rUAX, 0.55, wDej);
    r.lUAZ = mix(r.lUAZ, -0.35, wDej); r.rUAZ = mix(r.rUAZ, -0.35, wDej);
    r.lLAZ = mix(r.lLAZ, 1.7, wDej); r.rLAZ = mix(r.rLAZ, 1.7, wDej);
    r.lThZ = mix(r.lThZ, 0.05, wDej); r.rThZ = mix(r.rThZ, -0.05, wDej);
    r.lShZ = mix(r.lShZ, -0.08, wDej); r.rShZ = mix(r.rShZ, -0.08, wDej);
    r.lFtZ = mix(r.lFtZ, 0, wDej); r.rFtZ = mix(r.rFtZ, 0, wDej);
  }

  // ---------------- stretcher carry + crouch (ceremony medics) ----------------
  const wCF = r.wCarF;
  const wCB = r.wCarB;
  const wCro = r.wCro;

  if (wCF + wCB > 0.001) {
    const wC = Math.min(1, wCF + wCB);
    const reach = (wCB - wCF) / Math.max(wC, 1e-4); // +1 fwd, −1 back
    r.lUAZ = mix(r.lUAZ, 0.58 * reach, wC); r.rUAZ = mix(r.rUAZ, 0.58 * reach, wC);
    r.lUAX = mix(r.lUAX, -0.16, wC); r.rUAX = mix(r.rUAX, 0.16, wC);
    r.lLAZ = mix(r.lLAZ, 0.28, wC); r.rLAZ = mix(r.rLAZ, 0.28, wC);
    r.tRZ = mix(r.tRZ, -0.09, wC);
  }

  if (wCro > 0.001) {
    r.pelY = mix(r.pelY, 0.52, wCro);
    r.tRZ = mix(r.tRZ, -0.38, wCro);
    r.hRZ = mix(r.hRZ, -0.22, wCro);
    r.lThZ = mix(r.lThZ, 1.05, wCro); r.rThZ = mix(r.rThZ, 1.05, wCro);
    r.lShZ = mix(r.lShZ, -1.75, wCro); r.rShZ = mix(r.rShZ, -1.75, wCro);
    r.lFtZ = mix(r.lFtZ, 0.7, wCro); r.rFtZ = mix(r.rFtZ, 0.7, wCro);
    r.lUAZ = mix(r.lUAZ, 0.55, wCro); r.rUAZ = mix(r.rUAZ, 0.55, wCro);
    r.lUAX = mix(r.lUAX, -0.14, wCro); r.rUAX = mix(r.rUAX, 0.14, wCro);
    r.lLAZ = mix(r.lLAZ, 0.15, wCro); r.rLAZ = mix(r.rLAZ, 0.15, wCro);
  }
};

/** A joint row: which node of the rig it drives (`kind`, as world/rig.ts
 * lays a rig's 15 rows out), its rig, and the node's local transform. */
export interface JointRow {
  kind: number;
  rig: RigRow;
  px: number; py: number; pz: number;
  rx: number; ry: number; rz: number;
  sx: number; sy: number; sz: number;
}

/** Copies a joint's channels from its rig's pose (logic/pose.ts's
 * applyPose and place); channels a kind does not set keep the rest values
 * its row was made with. */
export const jointRow = (r: JointRow): void => {
  const g = r.rig;
  const k = r.kind;
  if (k === 0) {
    // the group: feet at the sim's position, facing its yaw
    r.px = g.x; r.py = g.y; r.pz = g.z;
    r.ry = g.yaw;
  } else if (k === 1) {
    r.py = g.pelY; r.pz = g.pelZ;
    r.rx = g.pelRX; r.ry = g.pelRY; r.rz = g.pelRZ;
  } else if (k === 2) {
    r.rx = g.tRX; r.ry = g.tRY; r.rz = g.tRZ;
    r.sy = g.tSY;
  } else if (k === 3) {
    r.rx = g.hRX; r.ry = g.hRY; r.rz = g.hRZ;
  } else if (k === 4) {
    r.rx = g.lUAX; r.rz = g.lUAZ;
  } else if (k === 5) {
    r.rx = g.rUAX; r.rz = g.rUAZ;
  } else if (k === 6) {
    r.rz = g.lLAZ;
  } else if (k === 7) {
    r.rz = g.rLAZ;
  } else if (k === 8) {
    r.rz = g.lThZ;
  } else if (k === 9) {
    r.rz = g.rThZ;
  } else if (k === 10) {
    r.rz = g.lShZ;
  } else if (k === 11) {
    r.rz = g.rShZ;
  } else if (k === 12) {
    r.rz = g.lFtZ;
  } else if (k === 13) {
    r.rz = g.rFtZ;
  } else {
    // the root (Euler order YXZ: dives yaw, then tip)
    r.px = g.px; r.py = g.py; r.pz = g.pz;
    r.rx = g.rx; r.ry = g.ry; r.rz = g.rz;
  }
};
