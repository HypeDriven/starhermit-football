// Procedural footballer factory (the browser's js/world/player.js): a
// ~1.8 m jointed character built from primitives. The group's origin is at
// the feet; the character faces +x when group.rotation.y = 0. Joints are
// Group pivots driven by logic/pose.ts each frame.
import {
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
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
  hand: BufferGeometry;
  thigh: BufferGeometry;
  shin: BufferGeometry;
  boot: BufferGeometry;
  number: BufferGeometry;
}
let geo: Geo | null = null;
function GEO(): Geo {
  if (!geo) {
    geo = {
      pelvis: new CapsuleGeometry(0.17, 0.14, 4, 12),
      torso: new CapsuleGeometry(0.185, 0.30, 4, 12),
      head: new SphereGeometry(0.125, 18, 14),
      hair: new SphereGeometry(0.132, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      upperArm: new CapsuleGeometry(0.05, 0.22, 4, 10),
      lowerArm: new CapsuleGeometry(0.042, 0.20, 4, 10),
      hand: new SphereGeometry(0.05, 10, 8),
      thigh: new CapsuleGeometry(0.082, 0.26, 4, 10),
      shin: new CapsuleGeometry(0.058, 0.28, 4, 10),
      boot: new BoxGeometry(0.27, 0.1, 0.11),
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
  root: Group;
  pelvis: Group;
  torso: Group;
  head: Group;
  lUpperArm: Group;
  lLowerArm: Group;
  rUpperArm: Group;
  rLowerArm: Group;
  lThigh: Group;
  lShin: Group;
  rThigh: Group;
  rShin: Group;
  lFoot: Group;
  rFoot: Group;
}

/** Writes a pose onto the rig. */
function applyPose(J: Joints, P: Pose): void {
  J.root.position.set(P.px, P.py, P.pz);
  J.root.rotation.set(P.rx, P.ry, P.rz, "YXZ");
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
  const pelvis = new Group();
  pelvis.position.y = 0.98;
  root.add(pelvis);
  mesh(G.pelvis, shortsMat, 0, 0.03, 0, pelvis);

  // Torso with shirt texture + back number.
  const torso = new Group();
  torso.position.y = 0.1;
  pelvis.add(torso);
  mesh(G.torso, shirtMat, 0, 0.27, 0, torso);
  if (number != null) {
    const numMesh = mesh(G.number, numberMaterial(number, kit.shirt), -0.2, 0.3, 0, torso);
    numMesh.rotation.set(0, -Math.PI / 2, 0); // face backward (−x)
    numMesh.castShadow = false;
  }

  // Head + hair cap.
  const head = new Group();
  head.position.y = 0.52;
  torso.add(head);
  mesh(G.head, skinMat, 0, 0.14, 0, head);
  mesh(G.hair, hairMat, -0.012, 0.155, 0, head);

  // Arms: shoulder pivots, sleeve upper arm, skin lower arm + hand.
  const buildArm = (side: number): { upper: Group; lower: Group } => {
    const upper = new Group();
    upper.position.set(0, 0.44, side * 0.26);
    torso.add(upper);
    mesh(G.upperArm, sleeveMat, 0, -0.13, 0, upper);
    const lower = new Group();
    lower.position.set(0, -0.3, 0);
    upper.add(lower);
    mesh(G.lowerArm, armMat, 0, -0.12, 0, lower);
    mesh(G.hand, skinMat, 0, -0.26, 0, lower);
    return { upper, lower };
  };
  const la = buildArm(1);
  const ra = buildArm(-1);

  // Legs: hip pivots, shorts thigh, sock shin, boot.
  const buildLeg = (side: number): { thigh: Group; shin: Group; foot: Group } => {
    const thigh = new Group();
    thigh.position.set(0, 0, side * 0.11);
    pelvis.add(thigh);
    mesh(G.thigh, shortsMat, 0, -0.2, 0, thigh);
    const shin = new Group();
    shin.position.set(0, -0.4, 0);
    thigh.add(shin);
    mesh(G.shin, socksMat, 0, -0.19, 0, shin);
    const foot = new Group();
    foot.position.set(0, -0.4, 0);
    shin.add(foot);
    mesh(G.boot, bootMat, 0.05, -0.11, 0, foot);
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
  let yaw = 0;

  return {
    group,
    place(x: number, y: number, z: number, facing: number): void {
      group.position.set(x, y, z);
      yaw = -facing; // the model faces +x at rotation 0; the sim's yaw is CCW around +y
      group.rotation.set(0, yaw, 0);
    },
    update(dt: number, ent: PoseEntity): void {
      blendPose(blend, ent, dt, yaw, params);
      applyPose(joints, computePose(params, pose));
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
