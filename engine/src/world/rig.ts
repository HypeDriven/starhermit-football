// Footballer rigs on starhermit:world: each rig (a footballer, referee or
// medic view) is a row of the `rigs` table its view writes each frame (its
// place and the entity's animation state), and 15 rows of the `joints`
// table that drive its nodes through node bindings. Two kernels run after
// onUpdate: the pose (world/rigMath.ts: logic/pose.ts's blend and pose over
// a rig row) and the joints (each copies its channels from its rig's pose);
// the runtime then writes the nodes' transforms itself. A view's script work
// a frame is a dozen numbers.
import { bind, kernel, schedule, table } from "starhermit:world";
import type { Binding, Table } from "starhermit:world";
import type { Object3D } from "starhermit:scene";
import type { PoseEntity } from "../logic/pose.ts";
import {
  ANIM_CARRY_B, ANIM_CARRY_F, ANIM_CELEBRATE, ANIM_CROUCH, ANIM_DEJECTED, ANIM_FALLEN, ANIM_OTHER, jointRow, poseRow,
} from "./rigMath.ts";

/** Rigs at once: 22 footballers and the three ceremony actors, with room. */
const RIGS = 48;
/** Joint rows a rig: the group, pelvis, torso, head, the arms' and legs'
 * joints (13 in XYZ order, one binding) and the root (YXZ, its own). */
const JOINTS = 15;
const ROOT = 14;

/** The nodes a rig's joints drive, in their rows' order. */
export interface RigNodes {
  group: Object3D;
  root: Object3D;
  pelvis: Object3D;
  torso: Object3D;
  head: Object3D;
  lUpperArm: Object3D;
  rUpperArm: Object3D;
  lLowerArm: Object3D;
  rLowerArm: Object3D;
  lThigh: Object3D;
  rThigh: Object3D;
  lShin: Object3D;
  rShin: Object3D;
  lFoot: Object3D;
  rFoot: Object3D;
}

export interface Rig {
  /** Feet at (x, y, z), turned by `yaw` about +y (the group's rotation.y). */
  place(x: number, y: number, z: number, yaw: number): void;
  /** Eases toward `ent` over `dt` and poses the rig (after onUpdate). */
  update(dt: number, ent: PoseEntity): void;
  dispose(): void;
}

const F64 = "f64" as const;
const RIG_COLUMNS = [
  "anim", "aspeed", "phase", "kickT", "tackleT", "diveT", "diveDir", "celebT", "x", "y", "z", "yaw", "dt",
  "bt", "bspeed", "wCel", "wDej", "wFal", "wCarF", "wCarB", "wCro",
  "px", "py", "pz", "rx", "ry", "rz", "pelY", "pelZ", "pelRX", "pelRY", "pelRZ", "tRX", "tRY", "tRZ", "tSY",
  "hRX", "hRY", "hRZ", "lUAX", "lUAZ", "rUAX", "rUAZ", "lLAZ", "rLAZ", "lThZ", "rThZ", "lShZ", "rShZ", "lFtZ", "rFtZ",
] as const;
type RigColumn = (typeof RIG_COLUMNS)[number];

interface RigWorld {
  rigs: Table;
  joints: Table;
  col: Record<RigColumn, Float64Array>;
  /** Slots in use (1); the live rows are the slots up to the last used. */
  used: Uint8Array;
}
let world: RigWorld | null = null;

/** The rest transforms of joints 0..13 (position, scale y), as
 * world/player.ts builds the rig; the kernel sets the rest. */
const REST: readonly (readonly [number, number, number])[] = [
  [0, 0, 0], // group
  [0, 0.98, 0], // pelvis (its y and z come from the pose)
  [0, 0.1, 0], // torso
  [0, 0.52, 0], // head
  [0, 0.44, 0.26], // left upper arm
  [0, 0.44, -0.26], // right upper arm
  [0, -0.3, 0], // lower arms
  [0, -0.3, 0],
  [0, 0, 0.11], // thighs
  [0, 0, -0.11],
  [0, -0.4, 0], // shins
  [0, -0.4, 0],
  [0, -0.4, 0], // feet
  [0, -0.4, 0],
  [0, 0, 0], // root
];

function rigWorld(): RigWorld {
  if (world) return world;
  const schema: Record<string, "f64"> = {};
  for (const name of RIG_COLUMNS) schema[name] = F64;
  const rigs = table("rigs", RIGS, schema);
  const joints = table("joints", RIGS * JOINTS, {
    kind: "u8", rig: "ref:rigs", px: F64, py: F64, pz: F64, rx: F64, ry: F64, rz: F64, sx: F64, sy: F64, sz: F64,
  });
  schedule.update(kernel(rigs, poseRow));
  schedule.update(kernel(joints, jointRow));
  const col = {} as Record<RigColumn, Float64Array>;
  for (const name of RIG_COLUMNS) col[name] = rigs.column(name) as Float64Array;
  world = { rigs, joints, col, used: new Uint8Array(RIGS) };
  return world;
}

/** Takes the lowest free slot: rows past the live ones are spawned (zeroed)
 * and their joint rows given their kinds, rig and rest transforms. Rows
 * stay where they are while a rig holds them (no row moves under a
 * binding). */
function takeSlot(w: RigWorld): number {
  const slot = w.used.indexOf(0);
  if (slot < 0) throw new RangeError(`at most ${RIGS} footballer rigs`);
  w.used[slot] = 1;
  const live = w.rigs.count;
  if (slot >= live) {
    w.rigs.spawn(slot + 1 - live);
    w.joints.spawn((slot + 1 - live) * JOINTS);
    const kind = w.joints.column("kind") as Uint8Array;
    const ref = w.joints.column("rig") as Int32Array;
    const [px, py, pz, sx, sy, sz] = ["px", "py", "pz", "sx", "sy", "sz"].map((n) => w.joints.column(n) as Float64Array) as Float64Array[];
    for (let row = live * JOINTS; row < (slot + 1) * JOINTS; row++) {
      const j = row % JOINTS;
      kind[row] = j;
      ref[row] = Math.floor(row / JOINTS);
      const rest = REST[j]!;
      px![row] = rest[0];
      py![row] = rest[1];
      pz![row] = rest[2];
      sx![row] = sy![row] = sz![row] = 1;
    }
  }
  return slot;
}

/** Gives a slot back; free slots at the end leave the live rows, so the
 * kernels run only on rows up to the last slot in use. */
function giveSlot(w: RigWorld, slot: number): void {
  w.used[slot] = 0;
  let live = w.rigs.count;
  while (live > 0 && w.used[live - 1] === 0) live--;
  if (live < w.rigs.count) {
    w.joints.free(live * JOINTS, (w.rigs.count - live) * JOINTS);
    w.rigs.free(live, w.rigs.count - live);
  }
}

function animCode(anim: string): number {
  switch (anim) {
    case "celebrate":
      return ANIM_CELEBRATE;
    case "dejected":
      return ANIM_DEJECTED;
    case "fallen":
      return ANIM_FALLEN;
    case "carryF":
      return ANIM_CARRY_F;
    case "carryB":
      return ANIM_CARRY_B;
    case "crouch":
      return ANIM_CROUCH;
    default:
      return ANIM_OTHER;
  }
}

/** Binds a rig's nodes to a free slot (a RangeError when all are taken). */
export function createRig(nodes: RigNodes): Rig {
  const w = rigWorld();
  const slot = takeSlot(w);
  const c = w.col;
  // A fresh blend and entity (logic/pose.ts's createPoseBlend and params).
  for (const name of RIG_COLUMNS) c[name][slot] = 0;
  const first = slot * JOINTS;
  const body = bind.nodes(
    [
      nodes.group, nodes.pelvis, nodes.torso, nodes.head, nodes.lUpperArm, nodes.rUpperArm, nodes.lLowerArm, nodes.rLowerArm,
      nodes.lThigh, nodes.rThigh, nodes.lShin, nodes.rShin, nodes.lFoot, nodes.rFoot,
    ],
    w.joints,
    { position: ["px", "py", "pz"], rotation: ["rx", "ry", "rz"], scale: ["sx", "sy", "sz"] },
    first,
  );
  const root = bind.nodes([nodes.root], w.joints, { position: ["px", "py", "pz"], rotation: ["rx", "ry", "rz"], order: "YXZ" }, first + ROOT);
  let bindings: Binding[] | null = [body, root];
  return {
    place(x: number, y: number, z: number, yaw: number): void {
      c.x[slot] = x;
      c.y[slot] = y;
      c.z[slot] = z;
      c.yaw[slot] = yaw;
    },
    update(dt: number, ent: PoseEntity): void {
      c.anim[slot] = animCode(ent.anim || "idle");
      c.aspeed[slot] = ent.animSpeed || 0;
      c.phase[slot] = ent.phase || 0;
      c.kickT[slot] = ent.kickT || 0;
      c.tackleT[slot] = ent.tackleT || 0;
      c.diveT[slot] = ent.diveT || 0;
      c.diveDir[slot] = ent.diveDir || 0;
      c.celebT[slot] = ent.celebrateT || 0;
      c.dt[slot] = dt;
    },
    dispose(): void {
      if (bindings === null) return;
      for (const b of bindings) b.remove();
      bindings = null;
      giveSlot(w, slot);
    },
  };
}
