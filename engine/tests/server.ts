// Loads the repository's server.js into a fresh VM context — as the
// browser's classic <script> and the runtime's loadClassic do — and returns
// its globals.
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

export interface ServerGlobals {
  FootballSim: Record<string, unknown> & {
    createMatch(opts: unknown): Record<string, unknown>;
    stepMatch(state: unknown, inputs: Map<number, unknown>, dt: number): { type: string }[];
    computeAiInput(state: unknown, p: unknown, dt: number): unknown;
    resetKickoff(state: unknown, team: number): void;
    takeAiName(): string;
    pitchFor(teamSize: number): { L: number; W: number };
  };
  game: {
    tickRateHz: number;
    createSession(ctx: unknown): { ok: boolean; sessionState: Record<string, unknown>; broadcast: { to: unknown; data: Record<string, unknown> }[] };
    onTick(ctx: unknown): { ok: boolean; sessionState: Record<string, unknown>; broadcast: { to: unknown; data: Record<string, unknown> }[] };
  };
}

export function loadServer(): ServerGlobals {
  const repo = process.env["FOOTBALL_REPO"];
  if (!repo) throw new Error("FOOTBALL_REPO is not set (run engine/tests/run.sh)");
  const code = readFileSync(`${repo}/server.js`, "utf8");
  const context = createContext({});
  runInContext(code, context, { filename: "server.js" });
  return context as unknown as ServerGlobals;
}

/** A standalone two-human session's context (no room). */
export function sessionCtx(now: number, sessionState: unknown = null): Record<string, unknown> {
  return {
    now,
    random: 0.25,
    sessionId: "s-1",
    players: [{ id: "u-1", name: "Ada" }, { id: "u-2", name: "Bo" }],
    sessionState,
    playerStates: {},
    inputs: [],
  };
}
