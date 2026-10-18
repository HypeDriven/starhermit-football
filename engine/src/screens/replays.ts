// Archived replays of my online matches (the browser's js/replays.js): date,
// sides, score and a WATCH button that opens the 3D replay viewer.
import * as ui from "starhermit:ui";
import type { ReplaySummary } from "starhermit:platform";
import type { Audio } from "../audio.ts";
import { formatReplayDate, halvedSides, sidesLine } from "../logic/format.ts";
import { replayState } from "../logic/replay.ts";
import { P, displayName, errorMessage } from "../platform.ts";
import { T, language } from "../i18n.ts";

/** The list payload's players[] has no team assignment and an undocumented
 * order — halving it mis-splits unbalanced human teams. The archived state
 * knows the truth: seats map pid → userId/name and replay.teamSize splits
 * the teams. Halve only when the detail fetch fails. */
async function sidesFor(r: ReplaySummary): Promise<string> {
  try {
    const st = replayState(await P.replays.get(r.sessionId));
    const replay = st?.["replay"] as { teamSize?: unknown } | undefined;
    const seats = st?.["seats"] as Record<string, { userId?: string | null; name?: string } | undefined> | undefined;
    const ts = Number(replay?.teamSize) | 0;
    if (ts && seats) {
      const teams: string[][] = [[], []];
      for (let pid = 0; pid < ts * 2; pid++) {
        const seat = seats[pid];
        if (!seat) continue;
        const name = seat.userId ? await displayName(seat.userId) : `${seat.name ?? ""} (AI)`;
        teams[pid < ts ? 0 : 1]!.push(name);
      }
      if (teams[0]!.length || teams[1]!.length) return sidesLine(teams);
    }
  } catch {
    // fall through to the heuristic
  }
  const names = await Promise.all(r.players.map((p) => displayName(p.userId)));
  return halvedSides(names);
}

export class ReplaysScreen {
  private items: ReplaySummary[] | null = null;
  private hint = "";
  private readonly sides = new Map<string, string>();

  constructor(private readonly audio: Audio, private readonly onWatch: (sessionId: string) => void, private readonly onBack: () => void) {}

  async open(): Promise<void> {
    this.hint = "";
    this.items = null;
    try {
      const items = await P.replays.list({ limit: 20 });
      this.items = items;
      for (const r of items) {
        if (this.sides.has(r.sessionId)) continue;
        this.sides.set(r.sessionId, "…");
        void sidesFor(r).then((s) => this.sides.set(r.sessionId, s));
      }
    } catch (e) {
      this.items = [];
      this.hint = T("Could not load replays: {error}", { error: errorMessage(e) });
    }
  }

  drawUi(): void {
    ui.heading(T("REPLAYS"));
    const locale = language();
    ui.scrollArea("replays-list", { width: 560, height: 340 }, () => {
      if (!this.items) ui.label(T("Loading…"), { tone: "muted" });
      else if (!this.items.length && !this.hint) ui.label(T("No replays yet — finish an online match."), { tone: "muted" });
      for (const r of this.items ?? []) {
        const result = r.result as { score?: [number, number] } | null;
        const score = result && Array.isArray(result.score) ? `${result.score[0]} – ${result.score[1]}` : "–";
        ui.row(`replay-${r.sessionId}`, () => {
          ui.column(`rd-${r.sessionId}`, () => ui.label(formatReplayDate(r.finishedAt, locale), { tone: "muted" }), { width: 150 });
          ui.column(`rn-${r.sessionId}`, () => ui.label(this.sides.get(r.sessionId) ?? "…"), { width: 250 });
          ui.column(`rs-${r.sessionId}`, () => ui.label(score, { tone: "accent" }), { width: 60 });
          if (ui.id(`watch-${r.sessionId}`).button(T("WATCH"), { tone: "accent" })) {
            this.audio.ui();
            this.onWatch(r.sessionId);
          }
        }, { spacing: 8, align: "center" });
      }
    });
    if (this.hint) ui.label(this.hint, { tone: "muted" });
    if (ui.button(T("BACK")) || ui.back()) {
      this.audio.ui();
      this.onBack();
    }
  }
}
