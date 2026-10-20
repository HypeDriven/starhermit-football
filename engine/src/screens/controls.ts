// The controls screen. The bindings of the manifest's actions are the
// runtime's own (kept with the player's engine settings, rebound in
// its Options menu), so this screen lists every binding of each action —
// keys, mouse buttons and gamepad controls — and asks the runtime to open
// its rebinding for a row. It refreshes when the player rebinds.
import { game } from "starhermit:engine";
import { bindings, onBindingsChange, requestRebind } from "starhermit:input";
import type { Binding } from "starhermit:input";
import * as ui from "starhermit:ui";
import type { Audio } from "../audio.ts";
import { T } from "../i18n.ts";

/** The seven actions' labels (logic/strings.ts keys). */
const LABELS: Record<string, string> = {
  up: "Move forward",
  down: "Move back",
  left: "Turn left",
  right: "Turn right",
  shoot: "Shoot (hold to charge)",
  pass: "Pass",
  tackle: "Tackle",
};

function list(action: string): readonly Binding[] {
  try {
    return bindings(action);
  } catch {
    return [];
  }
}

export class ControlsScreen {
  private rows: { action: string; label: string; keys: string; pad: string }[] = [];
  private dirty = true;

  constructor(private readonly audio: Audio, private readonly onBack: () => void) {
    try {
      onBindingsChange(() => {
        this.dirty = true;
      });
    } catch {
      // no live binding updates
    }
  }

  private refresh(): void {
    this.dirty = false;
    this.rows = [];
    // Sprint is automatic; a stale declaration never shows here.
    for (const a of game.actions) {
      if (a.name === "sprint") continue;
      const b = list(a.name);
      const keys = b.filter((x) => x.device !== "gamepad").map((x) => x.label).join(" / ") || "—";
      const pad = b.filter((x) => x.device === "gamepad").map((x) => x.label).join(" / ") || "—";
      this.rows.push({ action: a.name, label: LABELS[a.name] ?? a.label, keys, pad });
    }
  }

  drawUi(): void {
    if (this.dirty) this.refresh();
    ui.heading(T("CONTROLS"));
    ui.panel("controls-list", () => {
      for (const r of this.rows) {
        ui.row(`control-${r.action}`, () => {
          ui.column(`l-${r.action}`, () => ui.label(T(r.label)), { width: 200 });
          // the keycap button opens the runtime's rebinding for this action
          ui.column(`k-${r.action}`, () => {
            if (ui.id(`rebind-${r.action}`).button(r.keys)) {
              this.audio.ui();
              requestRebind(r.action);
            }
          }, { width: 170 });
          ui.column(`g-${r.action}`, () => ui.label(r.pad, { tone: "muted" }), { width: 130 });
        }, { spacing: 8, align: "center" });
      }
    }, { padding: 12, spacing: 6 });
    ui.paragraph(T("Click a key to rebind it. Esc cancels. Mouse: left shoots, right passes, middle tackles."), 520);
    ui.column("controls-buttons", () => {
      if (ui.button(T("RESET ALL"))) {
        // resetting is the runtime's: its controls page has the reset
        this.audio.ui();
        requestRebind();
      }
      if (ui.button(T("BACK")) || ui.back()) {
        this.audio.ui();
        this.onBack();
      }
    }, { spacing: 10, width: 320 });
  }
}
