// Procedural footballer factory: ~1.8m jointed character built from primitives.
// Group origin at the feet, character faces +x when group.rotation.y = 0.
import * as THREE from 'three';
import { createNameTag } from './nametags.js';
import { applyPose } from './animator.js';

// ---------------------------------------------------------------------------
// Shared geometry cache (one set for all players)
// ---------------------------------------------------------------------------
const GEO = {
  pelvis: new THREE.CapsuleGeometry(0.17, 0.14, 4, 12),
  torso: new THREE.CapsuleGeometry(0.185, 0.30, 4, 12),
  head: new THREE.SphereGeometry(0.125, 18, 14),
  hair: new THREE.SphereGeometry(0.132, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
  upperArm: new THREE.CapsuleGeometry(0.05, 0.22, 4, 10),
  lowerArm: new THREE.CapsuleGeometry(0.042, 0.20, 4, 10),
  hand: new THREE.SphereGeometry(0.05, 10, 8),
  thigh: new THREE.CapsuleGeometry(0.082, 0.26, 4, 10),
  shin: new THREE.CapsuleGeometry(0.058, 0.28, 4, 10),
  boot: new THREE.BoxGeometry(0.27, 0.1, 0.11),
  number: new THREE.PlaneGeometry(0.3, 0.3),
};

// ---------------------------------------------------------------------------
// Material / texture caches (keyed by color, shared across players)
// ---------------------------------------------------------------------------
const matCache = new Map();
const texCache = new Map();

function colorMat(color) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
    matCache.set(color, m);
  }
  return m;
}

function luminance(hex) {
  const c = new THREE.Color(hex);
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

function contrastFor(hex) {
  return luminance(hex) > 0.5 ? '#161616' : '#f2f2f2';
}

// Shirt body texture: base color, collar + hem trim, GK gets a contrast chest band.
function shirtTexture(shirt, gk) {
  const key = `shirt|${shirt}|${gk ? 1 : 0}`;
  let tex = texCache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = shirt;
  ctx.fillRect(0, 0, 128, 128);
  const trim = contrastFor(shirt);
  if (gk) {
    ctx.fillStyle = trim;
    ctx.fillRect(0, 44, 128, 22); // bold chest band
  }
  // collar + hem trim
  ctx.fillStyle = trim;
  ctx.fillRect(0, 0, 128, 8);
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, 120, 128, 8);
  ctx.globalAlpha = 1;
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

// Back-number texture (transparent plate, white/black digit by shirt luminance).
function numberTexture(number, shirt) {
  const key = `num|${number}|${shirt}`;
  let tex = texCache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const fill = contrastFor(shirt);
  ctx.font = 'bold 170px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = fill === '#161616' ? 'rgba(242,242,242,0.85)' : 'rgba(22,22,22,0.85)';
  ctx.strokeText(String(number), 128, 136);
  ctx.fillStyle = fill;
  ctx.fillText(String(number), 128, 136);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

function shirtMaterial(shirt, gk) {
  const key = `shirtMat|${shirt}|${gk ? 1 : 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: shirtTexture(shirt, gk), roughness: 0.85, metalness: 0 });
    matCache.set(key, m);
  }
  return m;
}

function numberMaterial(number, shirt) {
  const key = `numMat|${number}|${shirt}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: numberTexture(number, shirt),
      transparent: true,
      roughness: 0.85,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    matCache.set(key, m);
  }
  return m;
}

const SKIN_A = new THREE.Color('#f2c79b');
const SKIN_B = new THREE.Color('#4a2c17');
const BOOT_COLOR = '#1b1b1f';

function mesh(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// createPlayerMesh(opts) -> PlayerView
// ---------------------------------------------------------------------------
export function createPlayerMesh(opts = {}) {
  const kit = opts.kit || { shirt: '#cc2222', shorts: '#ffffff', socks: '#cc2222', number: 9, gk: false };
  const gk = !!kit.gk;
  const number = kit.number == null ? null : kit.number; // null → no back number

  const skinColor = new THREE.Color().lerpColors(SKIN_A, SKIN_B, Math.min(1, Math.max(0, opts.skin == null ? 0.5 : opts.skin)));
  const skinKey = `#${skinColor.getHexString()}`;
  const skinMat = colorMat(skinKey);
  const shirtMat = shirtMaterial(kit.shirt, gk);
  const sleeveMat = colorMat(kit.shirt);
  const shortsMat = colorMat(kit.shorts);
  const socksMat = colorMat(kit.socks);
  const bootMat = colorMat(BOOT_COLOR);
  const hairMat = colorMat(opts.hair || '#2a1c10');
  const armMat = gk ? sleeveMat : skinMat; // goalkeepers wear long sleeves

  const group = new THREE.Group();

  // Inner root the animator can translate/rotate for dives, falls, jumps.
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  group.add(root);

  // Pelvis (hips) at 0.98m — matches PELVIS_Y in animator.js.
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.98;
  root.add(pelvis);
  mesh(GEO.pelvis, shortsMat, 0, 0.03, 0, pelvis);

  // Torso with shirt texture + back number.
  const torso = new THREE.Group();
  torso.position.y = 0.10;
  pelvis.add(torso);
  mesh(GEO.torso, shirtMat, 0, 0.27, 0, torso);
  if (number != null) {
    const numMesh = mesh(GEO.number, numberMaterial(number, kit.shirt), -0.20, 0.30, 0, torso);
    numMesh.rotation.y = -Math.PI / 2; // face backward (-x)
    numMesh.castShadow = false;
  }

  // Head + hair cap.
  const head = new THREE.Group();
  head.position.y = 0.52;
  torso.add(head);
  mesh(GEO.head, skinMat, 0, 0.14, 0, head);
  mesh(GEO.hair, hairMat, -0.012, 0.155, 0, head);

  // Arms: shoulder pivots, sleeve upper arm, skin lower arm + hand.
  function buildArm(side) { // side: +1 left (+z), -1 right (-z)
    const upper = new THREE.Group();
    upper.position.set(0, 0.44, side * 0.26);
    torso.add(upper);
    mesh(GEO.upperArm, sleeveMat, 0, -0.13, 0, upper);
    const lower = new THREE.Group();
    lower.position.set(0, -0.30, 0);
    upper.add(lower);
    mesh(GEO.lowerArm, armMat, 0, -0.12, 0, lower);
    mesh(GEO.hand, skinMat, 0, -0.26, 0, lower);
    return { upper, lower };
  }
  const la = buildArm(1);
  const ra = buildArm(-1);

  // Legs: hip pivots, shorts thigh, sock shin, boot.
  function buildLeg(side) {
    const thigh = new THREE.Group();
    thigh.position.set(0, 0, side * 0.11);
    pelvis.add(thigh);
    mesh(GEO.thigh, shortsMat, 0, -0.20, 0, thigh);
    const shin = new THREE.Group();
    shin.position.set(0, -0.40, 0);
    thigh.add(shin);
    mesh(GEO.shin, socksMat, 0, -0.19, 0, shin);
    const foot = new THREE.Group();
    foot.position.set(0, -0.40, 0);
    shin.add(foot);
    mesh(GEO.boot, bootMat, 0.05, -0.11, 0, foot);
    return { thigh, shin, foot };
  }
  const ll = buildLeg(1);
  const rl = buildLeg(-1);

  // Name tag floats above the head (~2.2m).
  const tag = createNameTag(opts.name || '', { color: opts.nameColor || kit.shirt, isYou: !!opts.isYou });
  tag.position.y = 2.2;
  group.add(tag);

  const joints = {
    root, pelvis, torso, head,
    lUpperArm: la.upper, lLowerArm: la.lower,
    rUpperArm: ra.upper, rLowerArm: ra.lower,
    lThigh: ll.thigh, lShin: ll.shin, rThigh: rl.thigh, rShin: rl.shin,
    lFoot: ll.foot, rFoot: rl.foot,
  };

  // Reused every update — no per-frame allocation.
  const params = {
    anim: 'idle', phase: 0, speed: 0, dt: 0, t: 0,
    kickT: 0, tackleT: 0, diveT: 0, diveDir: 0, diveRel: 0, celebrateT: 0,
    wCelebrate: 0, wDejected: 0, wFallen: 0,
  };

  let t = 0;
  let curSpeed = 0;
  let wCel = 0, wDej = 0, wFal = 0;

  function update(dt, ent) {
    t += dt;
    // Ease toward targets so anim transitions cross-fade instead of popping.
    const k = 1 - Math.exp(-8 * dt);
    curSpeed += ((ent.animSpeed || 0) - curSpeed) * k;
    wCel += ((ent.anim === 'celebrate' ? 1 : 0) - wCel) * k;
    wDej += ((ent.anim === 'dejected' ? 1 : 0) - wDej) * k;
    wFal += ((ent.anim === 'fallen' ? 1 : 0) - wFal) * k;

    params.anim = ent.anim || 'idle';
    params.phase = ent.phase || 0;
    params.speed = curSpeed;
    params.dt = dt;
    params.t = t;
    params.kickT = ent.kickT || 0;
    params.tackleT = ent.tackleT || 0;
    params.diveT = ent.diveT || 0;
    params.diveDir = ent.diveDir || 0;
    params.diveRel = (ent.diveDir || 0) - group.rotation.y;
    params.celebrateT = ent.celebrateT || 0;
    params.wCelebrate = wCel;
    params.wDejected = wDej;
    params.wFallen = wFal;
    applyPose(joints, params);
  }

  function setNameVisible(v) {
    tag.visible = !!v;
  }

  function dispose() {
    if (group.parent) group.parent.remove(group);
    // The tag texture/material are per-player; geometry and kit materials are
    // shared caches and intentionally kept alive.
    tag.material.map.dispose();
    tag.material.dispose();
  }

  return { group, update, setNameVisible, dispose };
}
