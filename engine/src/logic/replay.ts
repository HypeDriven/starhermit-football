// The archived replay log (sessionState.replay, spec.md §4.6) as the
// viewer plays it: keyframes every `every` ticks, the reconstructed match
// clock, and the frame pair around the playhead.
import { parseBallRow, parsePlayerRow } from "./interp.ts";
import type { BallRow, PlayerRow } from "./interp.ts";

export const TICK_HZ = 30;

export interface ReplayFrame {
  t: number;
  sc: [number, number];
  ph: string;
  b: BallRow;
  pl: PlayerRow[];
  /** Match-clock seconds at this frame. */
  sec: number;
  half: number;
}

export interface ReplayRosterSeat {
  pid: number;
  team: number;
  name: string;
  ai: boolean;
}

export interface ReplayLog {
  teamSize: number;
  halfLength: number;
  truncated: boolean;
  roster: ReplayRosterSeat[];
  frames: ReplayFrame[];
  evs: { t: number; ev: Record<string, unknown> }[];
}

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function arr(v: unknown): readonly unknown[] {
  return Array.isArray(v) ? v : [];
}

/** The archived session state from a replays.get result: the platform's
 * detail carries it as `state` (the browser reads `data.state`); a bare
 * state is accepted too. */
export function replayState(detail: unknown): Record<string, unknown> | null {
  const d = rec(detail);
  if (!d) return null;
  const state = rec(d["state"]);
  if (state) return state;
  return d["replay"] !== undefined || d["seats"] !== undefined ? d : null;
}

/** Parses `state.replay` (v1); null when it is missing or unusable. */
export function parseReplay(state: Record<string, unknown> | null): ReplayLog | null {
  const r = rec(state?.["replay"]);
  if (!r || r["v"] !== 1) return null;
  const rawFrames = arr(r["frames"]);
  const every = Number(r["every"]);
  if (!rawFrames.length || !(every > 0)) return null;
  const teamSize = Math.max(1, Number(r["teamSize"]) | 0);
  const halfLength = Number(r["halfLength"]) || 180;
  const roster: ReplayRosterSeat[] = [];
  for (const s of arr(r["roster"])) {
    const seat = rec(s);
    if (!seat) continue;
    roster.push({ pid: Number(seat["pid"]) | 0, team: Number(seat["team"]) | 0, name: String(seat["name"] ?? ""), ai: !!seat["ai"] });
  }
  const frames: ReplayFrame[] = [];
  for (const f of rawFrames) {
    const fr = rec(f);
    if (!fr) continue;
    const sc = arr(fr["sc"]);
    frames.push({
      t: Number(fr["t"]) || 0,
      sc: [Number(sc[0]) || 0, Number(sc[1]) || 0],
      ph: String(fr["ph"] ?? "play"),
      b: parseBallRow(arr(fr["b"])),
      pl: arr(fr["pl"]).map((row) => parsePlayerRow(arr(row))),
      sec: 0,
      half: 1,
    });
  }
  if (!frames.length) return null;
  const evs: { t: number; ev: Record<string, unknown> }[] = [];
  for (const e of arr(r["evs"])) {
    const er = rec(e);
    const ev = rec(er?.["ev"]);
    if (er && ev) evs.push({ t: Number(er["t"]) || 0, ev });
  }
  evs.sort((a, b) => a.t - b.t);
  reconstructClock(frames, evs, halfLength);
  return { teamSize, halfLength, truncated: !!r["truncated"], roster, frames, evs };
}

/** The sim's clock runs only in open play, so accumulate tick deltas over
 * frames recorded in the 'play' phase; the halftime event splits halves. */
export function reconstructClock(frames: ReplayFrame[], evs: readonly { t: number; ev: Record<string, unknown> }[], halfLength: number): void {
  const ht = evs.find((e) => e.ev["type"] === "halftime");
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!;
    const prev = frames[i - 1];
    if (prev && prev.ph === "play") f.sec = prev.sec + (f.t - prev.t) / TICK_HZ;
    else if (prev) f.sec = prev.sec;
    f.half = ht ? (f.t >= ht.t ? 2 : 1) : f.sec >= halfLength ? 2 : 1;
  }
}

/** Moves `idx` so frames[idx] and frames[idx + 1] surround `vt` (both
 * directions, so seeks work). */
export function seekFrame(frames: readonly { t: number }[], idx: number, vt: number): number {
  let i = idx;
  while (i < frames.length - 2 && frames[i + 1]!.t <= vt) i++;
  while (i > 0 && frames[i]!.t > vt) i--;
  return i;
}

/** The blend between two keyframes at `vt`. */
export function frameBlend(a: { t: number }, b: { t: number }, vt: number): number {
  return b.t > a.t ? Math.max(0, Math.min(1, (vt - a.t) / (b.t - a.t))) : 1;
}

/** The first event index after `vt` (events behind the playhead are
 * skipped, not re-fired, on a seek). */
export function eventIndexAfter(evs: readonly { t: number }[], vt: number): number {
  let i = 0;
  while (i < evs.length && evs[i]!.t <= vt) i++;
  return i;
}
