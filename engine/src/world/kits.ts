// Team kits and hair colors (the browser's TEAM_KITS / HAIRS constants in
// match.js, menuScene.js and replayview.js).
import type { Role } from "../sim.ts";
import type { Kit } from "./player.ts";

export interface TeamKit {
  shirt: string;
  shorts: string;
  socks: string;
  gk: string;
  plate: string;
  label: string;
}

export const TEAM_KITS: readonly [TeamKit, TeamKit] = [
  { shirt: "#1f5fb4", shorts: "#f2f2f2", socks: "#1f5fb4", gk: "#e67e22", plate: "#1f5fb4", label: "BLUE" },
  { shirt: "#c0392b", shorts: "#232323", socks: "#c0392b", gk: "#8e44ad", plate: "#c0392b", label: "RED" },
];

export const HAIRS = ["#1a1a1a", "#3b2314", "#6e4a21", "#b99256", "#545454", "#8a3b12"];

/** A seat's kit: goalkeepers wear their team's keeper color. */
export function kitFor(team: number, role: Role, slot: number): Kit {
  const kit = TEAM_KITS[team === 1 ? 1 : 0];
  const gk = role === "GK";
  return {
    shirt: gk ? kit.gk : kit.shirt,
    shorts: kit.shorts,
    socks: gk ? kit.gk : kit.socks,
    number: slot + 1,
    gk,
  };
}
