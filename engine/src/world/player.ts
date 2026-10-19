// Procedural footballer factory (the browser's js/world/player.js): a
// ~1.8 m jointed character built from primitives. The group's origin is at
// the feet; the character faces +x when group.rotation.y = 0. Joints are
// pivots driven by logic/pose.ts each frame; each joint draws its own body
// part (the browser hangs the part's mesh under a joint Group) and a skin
// hand is one mesh with its lower arm, so the scene, which syncs every node
// every frame, has 18 nodes a footballer instead of 33.
import {
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  mergeGeometries,
} from "starhermit:scene";
import type { BufferGeometry, Material, Object3D } from "starhermit:scene";
import { contrastFor, lerpSrgbHex } from "../logic/color.ts";
import { blendPose, computePose, createPose, createPoseBlend, createPoseParams } from "../logic/pose.ts";
import type { Pose, PoseEntity } from "../logic/pose.ts";
import { createNameTag } from "./nametags.ts";
import type { NameTag } from "./nametags.ts";
import { makeCanvas } from "./resources.ts";

// ---------------------------------------------------------------------------
// Shared geometry (one set for all players, made on first use)
// ---------------------------------------------------------------------------
interface Geo {
  pelvis: BufferGeometry;
  torso: BufferGeometry;
  head: BufferGeometry;
  hair: BufferGeometry;
  upperArm: BufferGeometry;
  lowerArm: BufferGeometry;
  /** The lower arm with its hand, for arms all in skin. */
  lowerArmHand: BufferGeometry;
  hand: BufferGeometry;
  thigh: BufferGeometry;
  shin: BufferGeometry;
  boot: BufferGeometry;
  number: BufferGeometry;
}
let geo: Geo | null = null;
function GEO(): Geo {
  if (!geo) {
    // The joints' parts are moved by their offsets from the pivots (the
    // browser's mesh positions under each joint).
    const lowerArm = new CapsuleGeometry(0.042, 0.20, 4, 10).translate(0, -0.12, 0);
    const hand = new SphereGeometry(0.05, 10, 8);
    geo = {
      pelvis: new CapsuleGeometry(0.17, 0.14, 4, 12).translate(0, 0.03, 0),
      torso: new CapsuleGeometry(0.185, 0.30, 4, 12).translate(0, 0.27, 0),
      head: new SphereGeometry(0.125, 18, 14).translate(0, 0.14, 0),
      hair: new SphereGeometry(0.132, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      upperArm: new CapsuleGeometry(0.05, 0.22, 4, 10).translate(0, -0.13, 0),
      lowerArm,
      lowerArmHand: mergeGeometries([lowerArm, hand.clone().translate(0, -0.26, 0)])!,
      hand,
      thigh: new CapsuleGeometry(0.082, 0.26, 4, 10).translate(0, -0.2, 0),
      shin: new CapsuleGeometry(0.058, 0.28, 4, 10).translate(0, -0.19, 0),
      boot: new BoxGeometry(0.27, 0.1, 0.11).translate(0.05, -0.11, 0),
      number: new PlaneGeometry(0.3, 0.3),
    };
  }
  return geo;
}

// ---------------------------------------------------------------------------
// Material / texture caches (keyed by color, shared across players)
// ---------------------------------------------------------------------------
const matCache = new Map<string, MeshStandardMaterial>();
const texCache = new Map<string, CanvasTexture>();

function colorMat(color: string): MeshStandardMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
    matCache.set(color, m);
  }
  return m;
}

/** Shirt body: base color, collar + hem trim; a GK gets a chest band. */
function shirtTexture(shirt: string, gk: boolean): CanvasTexture {
  const key = `shirt|${shirt}|${gk ? 1 : 0}`;
  let tex = texCache.get(key);
  if (tex) return tex;
  const [c, ctx] = makeCanvas(128, 128);
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
  tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

/** Back number: transparent plate, white or black digits by shirt. */
function numberTexture(number: number, shirt: string): CanvasTexture {
  const key = `num|${number}|${shirt}`;
  let tex = texCache.get(key);
  if (tex) return tex;
  const [c, ctx] = makeCanvas(256, 256);
  const fill = contrastFor(shirt);
  ctx.font = "bold 170px sans-serif"; // the browser's "Arial Black", Arial (generic families only)
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 10;
  ctx.strokeStyle = fill === "#161616" ? "rgba(242,242,242,0.85)" : "rgba(22,22,22,0.85)";
  ctx.strokeText(String(number), 128, 136);
  ctx.fillStyle = fill;
  ctx.fillText(String(number), 128, 136);
  tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

function shirtMaterial(shirt: string, gk: boolean): MeshStandardMaterial {
  const key = `shirtMat|${shirt}|${gk ? 1 : 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ map: shirtTexture(shirt, gk), roughness: 0.85, metalness: 0 });
    matCache.set(key, m);
  }
  return m;
}

function numberMaterial(number: number, shirt: string): MeshStandardMaterial {
  const key = `numMat|${number}|${shirt}`;
  let m = matCache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
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

const SKIN_A = "#f2c79b";
const SKIN_B = "#4a2c17";
const BOOT_COLOR = "#1b1b1f";

/** A part at (x, y, z) under `parent`; for a joint, (x, y, z) is the pivot. */
function mesh(g: BufferGeometry, mat: Material, x: number, y: number, z: number, parent: Object3D): Mesh {
  const m = new Mesh(g, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export interface Kit {
  shirt: string;
  shorts: string;
  socks: string;
  /** null: no back number. */
  number: number | null;
  gk: boolean;
}

export interface PlayerViewOptions {
  kit: Kit;
  /** 0 (light) .. 1 (dark). */
  skin: number;
  hair: string;
  name: string;
  nameColor?: string;
  isYou?: boolean;
}

export interface PlayerView {
  readonly group: Group;
  /** Feet at (x, y, z), facing `facing` (the sim's yaw). */
  place(x: number, y: number, z: number, facing: number): void;
  update(dt: number, ent: PoseEntity): void;
  setNameVisible(visible: boolean): void;
  /** Redraws the tag with a new label ("You" after a language change). */
  setName(name: string): void;
  dispose(): void;
}

interface Joints {
  root: Object3D;
  pelvis: Object3D;
  torso: Object3D;
  head: Object3D;
  lUpperArm: Object3D;
  lLowerArm: Object3D;
  rUpperArm: Object3D;
  rLowerArm: Object3D;
  lThigh: Object3D;
  lShin: Object3D;
  rThigh: Object3D;
  rShin: Object3D;
  lFoot: Object3D;
  rFoot: Object3D;
}

/** The angles each joint was last set to, three a joint in applyPose's
 * order (NaN until the first pose). */
const JOINT_ANGLES = 14 * 3;

/** Sets a joint's Euler angles (in its own order) unless they are the ones
 * it has: each set recomputes the quaternion (six trig calls) and makes the
 * scene send the node again. */
function turn(o: Object3D, last: Float64Array, at: number, x: number, y: number, z: number): void {
  if (last[at] === x && last[at + 1] === y && last[at + 2] === z) return;
  last[at] = x;
  last[at + 1] = y;
  last[at + 2] = z;
  o.rotation.set(x, y, z);
}

/** Writes a pose onto the rig (the root's order is YXZ). */
function applyPose(J: Joints, P: Pose, last: Float64Array): void {
  J.root.position.set(P.px, P.py, P.pz);
  turn(J.root, last, 0, P.rx, P.ry, P.rz);
  J.pelvis.position.set(0, P.pelY, P.pelZ);
  turn(J.pelvis, last, 3, P.pelRX, P.pelRY, P.pelRZ);
  turn(J.torso, last, 6, P.tRX, P.tRY, P.tRZ);
  J.torso.scale.set(1, P.tSY, 1);
  turn(J.head, last, 9, P.hRX, P.hRY, P.hRZ);
  turn(J.lUpperArm, last, 12, P.lUAX, 0, P.lUAZ);
  turn(J.rUpperArm, last, 15, P.rUAX, 0, P.rUAZ);
  turn(J.lLowerArm, last, 18, 0, 0, P.lLAZ);
  turn(J.rLowerArm, last, 21, 0, 0, P.rLAZ);
  turn(J.lThigh, last, 24, 0, 0, P.lThZ);
  turn(J.rThigh, last, 27, 0, 0, P.rThZ);
  turn(J.lShin, last, 30, 0, 0, P.lShZ);
  turn(J.rShin, last, 33, 0, 0, P.rShZ);
  turn(J.lFoot, last, 36, 0, 0, P.lFtZ);
  turn(J.rFoot, last, 39, 0, 0, P.rFtZ);
}

export function createPlayerMesh(opts: PlayerViewOptions): PlayerView {
  const G = GEO();
  const kit = opts.kit;
  const gk = !!kit.gk;
  const number = kit.number;

  const skinKey = lerpSrgbHex(SKIN_A, SKIN_B, Math.min(1, Math.max(0, opts.skin)));
  const skinMat = colorMat(skinKey);
  const shirtMat = shirtMaterial(kit.shirt, gk);
  const sleeveMat = colorMat(kit.shirt);
  const shortsMat = colorMat(kit.shorts);
  const socksMat = colorMat(kit.socks);
  const bootMat = colorMat(BOOT_COLOR);
  const hairMat = colorMat(opts.hair || "#2a1c10");
  const armMat = gk ? sleeveMat : skinMat; // goalkeepers wear long sleeves

  const group = new Group();

  // Inner root the pose translates/rotates for dives, falls, jumps.
  const root = new Group();
  root.rotation.order = "YXZ";
  group.add(root);

  // Pelvis (hips) at 0.98 m — PELVIS_Y in logic/pose.ts.
  const pelvis = mesh(G.pelvis, shortsMat, 0, 0.98, 0, root);

  // Torso with shirt texture + back number.
  const torso = mesh(G.torso, shirtMat, 0, 0.1, 0, pelvis);
  if (number != null) {
    const numMesh = mesh(G.number, numberMaterial(number, kit.shirt), -0.2, 0.3, 0, torso);
    numMesh.rotation.set(0, -Math.PI / 2, 0); // face backward (−x)
    numMesh.castShadow = false;
  }

  // Head + hair cap.
  const head = mesh(G.head, skinMat, 0, 0.52, 0, torso);
  mesh(G.hair, hairMat, -0.012, 0.155, 0, head);

  // Arms: shoulder pivots, sleeve upper arm, skin lower arm + hand (one
  // mesh unless the sleeves are long).
  const buildArm = (side: number): { upper: Mesh; lower: Mesh } => {
    const upper = mesh(G.upperArm, sleeveMat, 0, 0.44, side * 0.26, torso);
    if (armMat === skinMat) return { upper, lower: mesh(G.lowerArmHand, skinMat, 0, -0.3, 0, upper) };
    const lower = mesh(G.lowerArm, armMat, 0, -0.3, 0, upper);
    mesh(G.hand, skinMat, 0, -0.26, 0, lower);
    return { upper, lower };
  };
  const la = buildArm(1);
  const ra = buildArm(-1);

  // Legs: hip pivots, shorts thigh, sock shin, boot.
  const buildLeg = (side: number): { thigh: Mesh; shin: Mesh; foot: Mesh } => {
    const thigh = mesh(G.thigh, shortsMat, 0, 0, side * 0.11, pelvis);
    const shin = mesh(G.shin, socksMat, 0, -0.4, 0, thigh);
    const foot = mesh(G.boot, bootMat, 0, -0.4, 0, shin);
    return { thigh, shin, foot };
  };
  const ll = buildLeg(1);
  const rl = buildLeg(-1);

  // Name tag floats above the head (~2.2 m).
  let tag: NameTag = createNameTag(opts.name || "", { color: opts.nameColor || kit.shirt, isYou: !!opts.isYou });
  tag.sprite.position.y = 2.2;
  group.add(tag.sprite);

  const joints: Joints = {
    root, pelvis, torso, head,
    lUpperArm: la.upper, lLowerArm: la.lower,
    rUpperArm: ra.upper, rLowerArm: ra.lower,
    lThigh: ll.thigh, lShin: ll.shin, rThigh: rl.thigh, rShin: rl.shin,
    lFoot: ll.foot, rFoot: rl.foot,
  };

  // Reused every update — no per-frame allocation.
  const params = createPoseParams();
  const blend = createPoseBlend();
  const pose = createPose();
  const angles = new Float64Array(JOINT_ANGLES).fill(NaN);
  let yaw = 0;
  let placedYaw = NaN;

  return {
    group,
    place(x: number, y: number, z: number, facing: number): void {
      group.position.set(x, y, z);
      yaw = -facing; // the model faces +x at rotation 0; the sim's yaw is CCW around +y
      if (yaw !== placedYaw) {
        placedYaw = yaw;
        group.rotation.set(0, yaw, 0);
      }
    },
    update(dt: number, ent: PoseEntity): void {
      blendPose(blend, ent, dt, yaw, params);
      applyPose(joints, computePose(params, pose), angles);
    },
    setNameVisible(visible: boolean): void {
      tag.sprite.visible = visible;
    },
    setName(name: string): void {
      const next = createNameTag(name || "", { color: opts.nameColor || kit.shirt, isYou: !!opts.isYou });
      next.sprite.position.y = tag.sprite.position.y;
      next.sprite.visible = tag.sprite.visible;
      group.remove(tag.sprite);
      tag.dispose();
      group.add(next.sprite);
      tag = next;
    },
    dispose(): void {
      group.removeFromParent();
      // The tag texture/material are per player; geometry and kit materials
      // are shared caches and stay alive.
      tag.dispose();
    },
  };
}
