// The shared simulation: server.js, loaded as a classic script into the
// game's realm with starhermit:script's loadClassic — the same file the
// platform runs authoritatively — so practice, prediction and AI run one code path with the server. This
// module only types `globalThis.FootballSim`; never fork sim logic here.
import { loadClassic } from "starhermit:script";

export type Role = "GK" | "DF" | "MF" | "FW";

export interface Pitch {
  L: number;
  W: number;
  goalW: number;
  goalH: number;
  boxD: number;
  boxW: number;
}

export interface SimPlayer {
  id: number;
  team: number;
  slot: number;
  role: Role;
  userId: string | null;
  name: string;
  isAi: boolean;
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
  dejectedT: number;
}

export interface SimBall {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  owner: number | null;
}

export type SimPhase = "play" | "goal" | "halftime" | "injury" | "end";

export interface SimState {
  teamSize: number;
  pitch: Pitch;
  halfLength: number;
  players: SimPlayer[];
  ball: SimBall;
  phase: SimPhase;
  half: number;
  time: number;
  score: [number, number];
  kickoffTeam: number;
  stats: { shots: [number, number]; possession: [number, number] };
}

/** The input shape every seat sends (spec.md §6). */
export interface SimInput {
  mx: number;
  mz: number;
  turn?: number;
  fwd?: number;
  sprint: boolean;
  pass: boolean;
  shoot: number;
  tackle: boolean;
}

/** A sim or ceremony event (server.js header comment). */
export interface SimEvent {
  type: string;
  player?: number;
  power?: number;
  team?: number;
  ownGoal?: boolean;
  winner?: number;
  kind?: string;
  name?: string;
  inName?: string;
}

export interface RosterSeat {
  userId: string | null;
  name: string;
  isAi: boolean;
}

export interface FootballSimApi {
  readonly WALK_SPEED: number;
  readonly RUN_SPEED: number;
  readonly SPRINT_SPEED: number;
  readonly TURN_RATE: number;
  readonly BALL_SLOWDOWN: number;
  readonly GRAVITY: number;
  readonly BALL_R: number;
  takeAiName(rng?: () => number): string;
  pitchFor(teamSize: number): Pitch;
  roleForSlot(slot: number, teamSize: number): Role;
  makeRng(seed: number): () => number;
  createMatch(opts: { teamSize: number; roster: (RosterSeat | null)[]; seed: number }): SimState;
  resetKickoff(state: SimState, kickoffTeam: number): void;
  stepMatch(state: SimState, inputs: Map<number, SimInput>, dt: number): SimEvent[];
  computeAiInput(state: SimState, p: SimPlayer, dt: number, difficulty?: number): SimInput;
  clearAiPlans(state: SimState | null): void;
}

let loaded: FootballSimApi | null = null;

/** Evaluates server.js once (its globals stay in the realm). */
export function sim(): FootballSimApi {
  if (loaded) return loaded;
  loadClassic("server.js");
  const S = (globalThis as unknown as { FootballSim?: FootballSimApi }).FootballSim;
  if (!S) throw new Error("FootballSim missing: server.js did not define globalThis.FootballSim.");
  loaded = S;
  return S;
}
