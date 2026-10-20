// Snapshot layout and the client's interpolation rules, shared by live play
// and the replay viewer. server.js buildSnapshot() and recordReplayFrame() emit b/pl
// in exactly this layout; keep in sync with server.js.
import { wrapAngle } from "./math.ts";

/** pl row: [id, team, x, z, vx, vz, facing, anim, animSpeed, phase, kickT,
 *  tackleT, stunT, diveT, diveDir, celebrateT, isAi, name, y] */
export interface PlayerRow {
  id: number;
  team: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  anim: string;
  animSpeed: number;
  phase: number;
  kickT: number;
  tackleT: number;
  stunT: number;
  diveT: number;
  diveDir: number;
  celebrateT: number;
  isAi: boolean;
  name: string;
  y: number;
}

/** b row: [x, y, z, vx, vy, vz, owner] (owner −1 = loose ball). */
export interface BallRow {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  owner: number | null;
}

/** A ceremony actor: [x, z, facing, anim, animSpeed, phase]. */
export type CerEntity = [number, number, number, string, number, number];

export interface CeremonySnap {
  k: string;
  t: number;
  v: number;
  vn: string;
  rn: string;
  sp: [number, number];
  ref: CerEntity;
  ca: [CerEntity, CerEntity];
  /** Stretcher: [x, z, angle, bedHeight]. */
  st: [number, number, number, number];
}

export interface ParsedSnap {
  /** Server time (s) on the stamped timeline. */
  at: number;
  /** Local arrival time (s). */
  arrived: number;
  tick: number;
  ack: readonly number[];
  t: number;
  h: number;
  ph: string;
  sc: [number, number];
  kt: number;
  b: BallRow;
  pl: PlayerRow[];
  cer: CeremonySnap | null;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

function blankPlayerRow(): PlayerRow {
  return {
    id: 0, team: 0, x: 0, z: 0, vx: 0, vz: 0, facing: 0, anim: "idle", animSpeed: 0, phase: 0,
    kickT: 0, tackleT: 0, stunT: 0, diveT: 0, diveDir: 0, celebrateT: 0, isAi: false, name: "", y: 0,
  };
}

/** A pl row, written into `out` when given (a recycled row). */
export function parsePlayerRow(e: readonly unknown[], out: PlayerRow = blankPlayerRow()): PlayerRow {
  out.id = num(e[0]);
  out.team = num(e[1]);
  out.x = num(e[2]);
  out.z = num(e[3]);
  out.vx = num(e[4]);
  out.vz = num(e[5]);
  out.facing = num(e[6]);
  out.anim = String(e[7] ?? "idle");
  out.animSpeed = num(e[8]);
  out.phase = num(e[9]);
  out.kickT = num(e[10]);
  out.tackleT = num(e[11]);
  out.stunT = num(e[12]);
  out.diveT = num(e[13]);
  out.diveDir = num(e[14]);
  out.celebrateT = num(e[15]);
  out.isAi = !!e[16];
  out.name = String(e[17] ?? "");
  out.y = num(e[18]);
  return out;
}

/** A b row, written into `out` when given (a recycled row). */
export function parseBallRow(b: readonly unknown[], out: BallRow = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: null }): BallRow {
  const owner = num(b[6]);
  out.x = num(b[0]);
  out.y = num(b[1]);
  out.z = num(b[2]);
  out.vx = num(b[3]);
  out.vy = num(b[4]);
  out.vz = num(b[5]);
  out.owner = b[6] != null && owner >= 0 ? owner : null;
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): readonly unknown[] {
  return Array.isArray(v) ? v : [];
}

/** A broadcast `{type:'snap', …}` as the client keeps it; `at` and
 * `arrived` are filled by the caller. Null when it is not a snapshot.
 * `reuse` is a snapshot no longer kept (trimSnaps' `spare`): it is filled
 * in place, its rows too, instead of allocating ~15–30 objects a snapshot. */
export function parseSnap(snap: unknown, reuse: ParsedSnap | null = null): ParsedSnap | null {
  if (!isRecord(snap) || snap["type"] !== "snap") return null;
  const sc = asArray(snap["sc"]);
  const ackIn = asArray(snap["ack"]);
  const rows = asArray(snap["pl"]);
  const cer = isRecord(snap["cer"]) ? (snap["cer"] as unknown as CeremonySnap) : null;
  const out: ParsedSnap = reuse ?? {
    at: 0, arrived: 0, tick: 0, ack: [], t: 0, h: 1, ph: "play", sc: [0, 0], kt: 0,
    b: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: null }, pl: [], cer: null,
  };
  out.at = 0;
  out.arrived = 0;
  out.tick = num(snap["tick"]);
  const ack = out.ack as number[];
  ack.length = ackIn.length;
  for (let i = 0; i < ackIn.length; i++) ack[i] = num(ackIn[i]);
  out.t = num(snap["t"]);
  out.h = num(snap["h"]) || 1;
  out.ph = String(snap["ph"] ?? "play");
  out.sc[0] = num(sc[0]);
  out.sc[1] = num(sc[1]);
  out.kt = num(snap["kt"]);
  parseBallRow(asArray(snap["b"]), out.b);
  const pl = out.pl;
  for (let i = 0; i < rows.length; i++) pl[i] = parsePlayerRow(asArray(rows[i]), pl[i]);
  pl.length = rows.length;
  out.cer = cer;
  return out;
}

/** Where on the snapshot timeline to draw: the pair around `renderTime`,
 * the blend `k` between them and how far to extrapolate past the newest. */
export interface InterpPair<T> {
  a: T;
  b: T;
  k: number;
  extrap: number;
}

export const MIN_INTERP_DELAY = 0.055;
export const MAX_INTERP_DELAY = 0.14;
export const MAX_EXTRAPOLATION = 0.12;
/** Seconds of snapshots to keep. */
export const SNAP_BUF = 1.5;

/** The server time to draw at: the newest snapshot advanced by local time
 * since it arrived (at most 0.25 s), less the interpolation delay. */
export function renderTime(newest: { at: number; arrived: number }, now: number, interpDelay: number): number {
  const estimatedServerNow = newest.at + Math.min(0.25, Math.max(0, now - newest.arrived));
  return estimatedServerNow - interpDelay;
}

export function pickPair<T extends { at: number }>(snaps: readonly T[], rt: number, out: InterpPair<T>): InterpPair<T> | null {
  const n = snaps.length;
  if (!n) return null;
  let a = snaps[0]!;
  let b = snaps[n - 1]!;
  let k = 1;
  let extrap = 0;
  if (rt <= a.at) {
    b = a;
  } else if (rt >= b.at) {
    a = b;
    extrap = Math.min(MAX_EXTRAPOLATION, rt - b.at);
  } else {
    for (let i = n - 1; i > 0; i--) {
      if (snaps[i - 1]!.at <= rt) {
        a = snaps[i - 1]!;
        b = snaps[i]!;
        break;
      }
    }
    k = (rt - a.at) / Math.max(1e-3, b.at - a.at);
  }
  out.a = a;
  out.b = b;
  out.k = k;
  out.extrap = extrap;
  return out;
}

/** The render entity fields interpolation drives (sim players and the
 * replay viewer's lightweight entities). */
export interface InterpEntity {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  anim: string;
  animSpeed: number;
  phase: number;
  kickT: number;
  tackleT: number;
  stunT: number;
  diveT: number;
  diveDir: number;
  celebrateT: number;
}

export function interpPlayer(p: InterpEntity, pa: PlayerRow, pb: PlayerRow, k: number, extrap: number): void {
  p.x = pa.x + (pb.x - pa.x) * k + pb.vx * extrap;
  p.z = pa.z + (pb.z - pa.z) * k + pb.vz * extrap;
  p.y = (pa.y || 0) + ((pb.y || 0) - (pa.y || 0)) * k;
  p.vx = pb.vx;
  p.vz = pb.vz;
  p.facing = pa.facing + wrapAngle(pb.facing - pa.facing) * k;
  p.anim = pb.anim;
  p.animSpeed = pb.animSpeed;
  p.phase = pa.phase + (pb.phase - pa.phase) * k + pb.animSpeed * extrap;
  p.kickT = pb.kickT;
  p.tackleT = pb.tackleT;
  p.stunT = pb.stunT;
  p.diveT = pb.diveT;
  p.diveDir = pb.diveDir;
  p.celebrateT = pb.celebrateT;
}

export interface BallEntity {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  owner: number | null;
}

/** An owned ball is glued to its carrier server-side; its snapshot velocity
 * is the per-tick snap to the dribble point, not real motion — never
 * extrapolate with it. */
export function interpBall(ball: BallEntity, ba: BallRow, bb: BallRow, k: number, extrap: number, ballR: number, gravity: number): void {
  const bExt = bb.owner == null ? extrap : 0;
  ball.x = ba.x + (bb.x - ba.x) * k + bb.vx * bExt;
  ball.y = Math.max(ballR, ba.y + (bb.y - ba.y) * k + bb.vy * bExt + 0.5 * gravity * bExt * bExt);
  ball.z = ba.z + (bb.z - ba.z) * k + bb.vz * bExt;
  ball.vx = bb.vx;
  ball.vy = bb.vy + gravity * bExt;
  ball.vz = bb.vz;
  ball.owner = bb.owner;
}

/** Blends two ceremony actors, into `out` when given. */
export function lerpEnt(ea: CerEntity, eb: CerEntity, k: number, out: CerEntity = [0, 0, 0, "", 0, 0]): CerEntity {
  out[0] = ea[0] + (eb[0] - ea[0]) * k;
  out[1] = ea[1] + (eb[1] - ea[1]) * k;
  out[2] = eb[2];
  out[3] = eb[3];
  out[4] = eb[4];
  out[5] = ea[5] + (eb[5] - ea[5]) * k;
  return out;
}

/** An empty ceremony for lerpCer's `out` (filled before it is read). */
export function blankCeremony(): CeremonySnap {
  return {
    k: "", t: 0, v: 0, vn: "", rn: "", sp: [0, 0],
    ref: [0, 0, 0, "", 0, 0], ca: [[0, 0, 0, "", 0, 0], [0, 0, 0, "", 0, 0]], st: [0, 0, 0, 0],
  };
}

/** Blends two snapshots' ceremony, into `out` when given (live play keeps
 * one, as it blends every frame). */
export function lerpCer(ca: CeremonySnap, cb: CeremonySnap, k: number, out: CeremonySnap = blankCeremony()): CeremonySnap {
  out.k = cb.k;
  out.t = cb.t;
  out.v = cb.v;
  out.vn = cb.vn;
  out.rn = cb.rn;
  out.sp = cb.sp;
  lerpEnt(ca.ref, cb.ref, k, out.ref);
  lerpEnt(ca.ca[0], cb.ca[0], k, out.ca[0]);
  lerpEnt(ca.ca[1], cb.ca[1], k, out.ca[1]);
  out.st[0] = ca.st[0] + (cb.st[0] - ca.st[0]) * k;
  out.st[1] = ca.st[1] + (cb.st[1] - ca.st[1]) * k;
  out.st[2] = cb.st[2];
  out.st[3] = ca.st[3] + (cb.st[3] - ca.st[3]) * k;
  return out;
}

/** Ceremonies interpolate when both snapshots carry the same one; they
 * never extrapolate beyond their authoritative timeline. A blend goes into
 * `out` when given. */
export function ceremonyAt(a: ParsedSnap, b: ParsedSnap, k: number, out?: CeremonySnap): CeremonySnap | null {
  if (!b.cer) return null;
  if (a.cer && a.cer.k === b.cer.k && a.cer.v === b.cer.v) return lerpCer(a.cer, b.cer, k, out);
  return b.cer;
}

/** Adaptive interpolation delay from measured arrival jitter. */
export interface JitterState {
  interpDelay: number;
  arrivalJitter: number;
  lastSnapArrival: number;
  lastSnapServerAt: number;
}

export function createJitterState(): JitterState {
  return { interpDelay: 0.075, arrivalJitter: 0, lastSnapArrival: 0, lastSnapServerAt: 0 };
}

export function noteArrival(s: JitterState, arrived: number, at: number): void {
  if (s.lastSnapArrival && at > s.lastSnapServerAt) {
    const arrivalGap = arrived - s.lastSnapArrival;
    const serverGap = at - s.lastSnapServerAt;
    const sample = Math.abs(arrivalGap - serverGap);
    s.arrivalJitter += (sample - s.arrivalJitter) * 0.12;
    s.interpDelay = Math.min(MAX_INTERP_DELAY,
      Math.max(MIN_INTERP_DELAY, MIN_INTERP_DELAY + s.arrivalJitter * 2.5));
  }
  s.lastSnapArrival = arrived;
  s.lastSnapServerAt = at;
}

/** Server stamps are epoch milliseconds; older or missing ones fall back to
 * the arrival time. */
export function snapTime(ts: unknown, arrived: number): number {
  const v = Number(ts);
  return v > 1000000 ? v / 1000 : arrived;
}

/** Drops snapshots older than the buffer (keeping at least two), onto
 * `spare` when given (for parseSnap to fill again). */
export function trimSnaps<T extends { at: number }>(snaps: T[], newestAt: number, spare?: T[]): void {
  let drop = 0;
  while (snaps.length - drop > 2 && snaps[drop]!.at < newestAt - SNAP_BUF) drop++;
  if (!drop) return;
  if (spare) for (let i = 0; i < drop; i++) spare.push(snaps[i]!);
  snaps.splice(0, drop);
}
