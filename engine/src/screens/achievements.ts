// The achievements screen (the browser's js/achievements.js): the game's
// catalog — declared by server.js, unlocked only by the server — with the
// player's unlock state, read-only.
import * as ui from "starhermit:ui";
import type { Achievement } from "starhermit:platform";
import type { Audio } from "../audio.ts";
import { platformStrings, upper } from "../i18n.ts";
import { P } from "../platform.ts";

export class AchievementsScreen {
  private items: Achievement[] | null = null;
  private failed = false;

  constructor(private readonly audio: Audio, private readonly onBack: () => void) {}

  async open(): Promise<void> {
    this.items = null;
    this.failed = false;
    try {
      this.items = await P.achievements.list();
    } catch {
      this.failed = true;
      this.items = [];
    }
  }

  drawUi(): void {
    const t = platformStrings();
    ui.heading(upper(t["achievements"]!));
    ui.scrollArea("ach-list", { width: 440, height: 340 }, () => {
      if (!this.items) ui.label(t["achLoading"]!, { tone: "muted" });
      else if (!this.items.length && !this.failed) ui.label(t["achEmpty"]!, { tone: "muted" });
      for (const a of this.items ?? []) {
        const got = !!(a.unlocked || a.unlockedAt);
        ui.row(`ach-${a.key}`, () => {
          ui.label(got ? "★" : "○", { tone: got ? "accent" : "muted" });
          ui.column(`ach-text-${a.key}`, () => {
            ui.label(a.name || a.key, got ? {} : { tone: "muted" });
            ui.label(a.description || "", { color: "#93a1b0" });
          }, { width: 300, spacing: 2 });
          ui.label(got ? t["achUnlocked"]! : t["achLocked"]!, { tone: got ? "accent" : "muted" });
        }, { spacing: 12, align: "center" });
      }
    });
    if (this.failed) ui.label(t["achFailed"]!, { tone: "muted" });
    if (ui.button(upper(t["back"]!)) || ui.back()) {
      this.audio.ui();
      this.onBack();
    }
  }
}
