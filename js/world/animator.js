// Procedural character animation for the footballer rig built by player.js.
// Pure sin/cos math on a module-level scratch pose — no per-frame allocation.
//
// Joint conventions (character faces +x, up is +y):
//   - positive rotation.z swings a downward limb forward (+x)
//   - negative rotation.z leans an upward axis (torso/head) forward
//   - positive rotation.x swings a downward limb toward -z (arm abduction uses ±)
// joints.root has Euler order 'YXZ' so dives can yaw-then-tip.

const PELVIS_Y = 0.98; // must match the rig rest pose in player.js

const KICK_DUR = 0.35;    // seconds, matches sim.js kickT window
const TACKLE_DUR = 0.45;  // matches sim.js tackleT
const DIVE_DUR = 0.6;     // matches sim.js diveT

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
// smoothstep of x between edges a..b (works with a < b or a > b)
function smooth(a, b, x) {
  x = clamp01((x - a) / (b - a));
  return x * x * (3 - 2 * x);
}
function mix(a, b, w) { return a + (b - a) * w; }

// Scratch pose — reused every frame, every player (applyPose is synchronous).
const P = {
  px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0,           // root
  pelY: 0, pelZ: 0, pelRX: 0, pelRY: 0, pelRZ: 0,     // pelvis
  tRX: 0, tRY: 0, tRZ: 0, tSY: 1,                     // torso
  hRX: 0, hRY: 0, hRZ: 0,                             // head
  lUAX: 0, lUAZ: 0, rUAX: 0, rUAZ: 0,                 // upper arms
  lLAZ: 0, rLAZ: 0,                                   // lower arms (elbows)
  lThZ: 0, rThZ: 0, lShZ: 0, rShZ: 0, lFtZ: 0, rFtZ: 0, // legs
};

export function applyPose(joints, params) {
  const t = params.t || 0;
  const phase = params.phase || 0;
  const speed = params.speed || 0;
  const anim = params.anim || 'idle';

  // Optional eased weights supplied by player.js (default: hard on/off by anim).
  const wCel = params.wCelebrate !== undefined ? params.wCelebrate : (anim === 'celebrate' ? 1 : 0);
  const wDej = params.wDejected !== undefined ? params.wDejected : (anim === 'dejected' ? 1 : 0);
  const wFal = params.wFallen !== undefined ? params.wFallen : (anim === 'fallen' ? 1 : 0);

  const s = clamp01(speed / 6.5);          // 0 = standing, 1 = full sprint
  const moveW = smooth(0.05, 0.7, speed);  // locomotion blend
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

  const sway = Math.sin(t * 0.9);     // idle weight shift
  const breathe = Math.sin(t * 1.7);  // idle breathing

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

  // Legs: phase-locked swing; knee flexes through the swing phase then extends
  // for plant; support leg stays near-straight. Ankle compensates + toe-off.
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
  const kt = params.kickT || 0;
  if (kt > 0) {
    const prog = 1 - Math.min(kt, KICK_DUR) / KICK_DUR;
    const w = smooth(0, 0.06, prog) * smooth(1, 0.9, prog); // ease in, decay out
    if (w > 0) {
      const wind = smooth(0, 0.45, prog);     // draw back
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
  const tt = params.tackleT || 0;
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
  const dvt = params.diveT || 0;
  if (dvt > 0) {
    const prog = 1 - Math.min(dvt, DIVE_DUR) / DIVE_DUR;
    const w = smooth(0, 0.15, prog) * smooth(1, 0.75, prog);
    if (w > 0) {
      const rel = params.diveRel || 0; // dive yaw relative to current facing
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
    const ct = params.celebrateT || 0;
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
    P.hRZ = mix(P.hRZ, -0.5, wDej);  // head down
    P.hRY = mix(P.hRY, 0, wDej);
    // hands on hips: elbows flared out and sharply bent
    P.lUAX = mix(P.lUAX, -0.55, wDej); P.rUAX = mix(P.rUAX, 0.55, wDej);
    P.lUAZ = mix(P.lUAZ, -0.35, wDej); P.rUAZ = mix(P.rUAZ, -0.35, wDej);
    P.lLAZ = mix(P.lLAZ, 1.7, wDej); P.rLAZ = mix(P.rLAZ, 1.7, wDej);
    P.lThZ = mix(P.lThZ, 0.05, wDej); P.rThZ = mix(P.rThZ, -0.05, wDej);
    P.lShZ = mix(P.lShZ, -0.08, wDej); P.rShZ = mix(P.rShZ, -0.08, wDej);
    P.lFtZ = mix(P.lFtZ, 0, wDej); P.rFtZ = mix(P.rFtZ, 0, wDej);
  }

  // ---------------- write pose to the rig ----------------
  const J = joints;
  J.root.position.set(P.px, P.py, P.pz);
  J.root.rotation.set(P.rx, P.ry, P.rz);
  J.pelvis.position.set(0, P.pelY, P.pelZ);
  J.pelvis.rotation.set(P.pelRX, P.pelRY, P.pelRZ);
  J.torso.rotation.set(P.tRX, P.tRY, P.tRZ);
  J.torso.scale.set(1, P.tSY, 1);
  J.head.rotation.set(P.hRX, P.hRY, P.hRZ);
  J.lUpperArm.rotation.set(P.lUAX, 0, P.lUAZ);
  J.rUpperArm.rotation.set(P.rUAX, 0, P.rUAZ);
  J.lLowerArm.rotation.set(0, 0, P.lLAZ);
  J.rLowerArm.rotation.set(0, 0, P.rLAZ);
  J.lThigh.rotation.set(0, 0, P.lThZ);
  J.rThigh.rotation.set(0, 0, P.rThZ);
  J.lShin.rotation.set(0, 0, P.lShZ);
  J.rShin.rotation.set(0, 0, P.rShZ);
  J.lFoot.rotation.set(0, 0, P.lFtZ);
  J.rFoot.rotation.set(0, 0, P.rFtZ);
}
