// SETTINGS (the main menu's and the in-match menu's; the browser's
// js/settings.js plus the shared game-options.js panel). Natively the
// runtime's Options menu (F1) owns graphics quality, resolution, frame-rate
// limits and the sound volumes and voice limit, so this panel keeps what is
// the game's own: the game language (sh-language.js's selector and strings),
// the game's sound mute, a line naming the quality preset the runtime runs
// with, and Report a problem (signed in) through the platform.
import { frame, game, openMenu } from "starhermit:engine";
import * as ui from "starhermit:ui";
import type { Audio } from "../audio.ts";
import { LOCALES, T, autoLabel, languageChoice, languageTexts, nativeName, setLanguageChoice } from "../i18n.ts";
import { P, errorKind, me } from "../platform.ts";
import { OVERRIDE_TIERS, currentTier, override, setOverride } from "../quality.ts";
import type { Override } from "../quality.ts";
import { contentQuality } from "../logic/quality.ts";

const TIER_NAMES: Record<string, string> = { low: "Low", balanced: "Balanced", high: "High", ultra: "Ultra" };
/** The browser's game-content categories (settings.js's English). */
const CATEGORY_LABELS: Record<Override, string> = { detail: "Pitch & stand detail", crowd: "Crowd", particles: "Camera flashes & haze" };
const TIER_LABELS: Record<string, string> = { plain: "Plain", detailed: "Detailed", sparse: "Sparse", full: "Full", off: "Off", on: "On" };

export class SettingsPanel {
  open = false;
  private title = "";
  private details = "";
  private reportStatus = "";
  private sending = false;

  constructor(private readonly audio: Audio) {}

  show(): void {
    this.open = true;
  }

  close(): void {
    this.open = false;
  }

  private async send(): Promise<void> {
    const title = this.title.trim();
    if (!title || this.sending) return;
    this.sending = true;
    this.reportStatus = "Sending…";
    const f = frame();
    // the browser attaches a small non-personal context.json; here it rides
    // in the description
    const context = `\n\ncontext: language=${languageChoice()}, viewport=${f.width}×${f.height}, scale=${f.scale}, quality=${f.quality}, entry=${game.entry}`;
    try {
      await P.reportBug({ title, description: (this.details.trim() || title) + context });
      this.reportStatus = "Report sent. Thank you!";
      this.title = "";
      this.details = "";
    } catch (e) {
      this.reportStatus = errorKind(e) === "rate-limited" || errorKind(e) === "quota-exceeded"
        ? "Daily report limit reached. Try again tomorrow."
        : "Could not send the report. Try again later.";
    } finally {
      this.sending = false;
    }
  }

  /** The panel as a modal dialog while open. */
  drawUi(): void {
    if (!this.open) return;
    let close = false;
    const still = ui.dialog("settings", T("SETTINGS"), this.open, () => {
      // ── Language ──
      const lt = languageTexts();
      ui.heading(lt.heading);
      const options = [autoLabel(), ...LOCALES.map((l) => nativeName(l))];
      const choice = languageChoice();
      const index = choice === "auto" ? 0 : Math.max(0, LOCALES.indexOf(choice as (typeof LOCALES)[number]) + 1);
      const picked = ui.select(lt.label, index, options);
      if (picked !== index) {
        this.audio.ui();
        setLanguageChoice(picked === 0 ? "auto" : LOCALES[picked - 1]!);
      }
      ui.label(lt.status, { tone: "muted" });

      // ── Sound (the game's mute; volumes are the runtime's) ──
      if (ui.button(this.audio.isMuted() ? T("SOUND: OFF") : T("SOUND: ON"))) {
        this.audio.setMuted(!this.audio.isMuted());
        this.audio.ui();
      }

      // ── Graphics (the runtime's quality preset) ──
      ui.heading(T("Graphics"));
      ui.label(`${TIER_NAMES[currentTier()] ?? currentTier()} — the StarHermit Options menu (F1) sets quality, resolution and frame rate`, { tone: "muted" });
      // the game's own content per category, over the preset
      const preset = contentQuality(currentTier());
      const presetTier: Record<Override, string> = {
        detail: preset.detail ? "detailed" : "plain",
        crowd: preset.crowdFull ? "full" : "sparse",
        particles: preset.particles ? "on" : "off",
      };
      for (const cat of ["detail", "crowd", "particles"] as const) {
        const tiers = OVERRIDE_TIERS[cat];
        const opts = [`From preset (${TIER_LABELS[presetTier[cat]] ?? presetTier[cat]})`, ...tiers.map((x) => TIER_LABELS[x] ?? x)];
        const cur = override(cat);
        const index = cur ? tiers.indexOf(cur) + 1 : 0;
        const picked = ui.id(`gfx-${cat}`).select(CATEGORY_LABELS[cat], index, opts);
        if (picked !== index) {
          this.audio.ui();
          setOverride(cat, picked === 0 ? null : tiers[picked - 1]!);
        }
      }
      if (ui.button("OPTIONS (F1)")) {
        this.audio.ui();
        openMenu();
      }

      // ── Report a problem (signed in only) ──
      if (me()) {
        ui.heading("Report a problem");
        this.title = ui.textField("report-title", this.title, { maxChars: 200, placeholder: "What went wrong?" });
        this.details = ui.textField("report-details", this.details, { maxChars: 4000, placeholder: "Details (optional)" });
        if (ui.button(this.sending ? "Sending…" : "Send report", { disabled: this.sending || !this.title.trim() })) {
          this.audio.ui();
          void this.send();
        }
        if (this.reportStatus) ui.label(this.reportStatus, { tone: "muted" });
      }

      if (ui.button(T("BACK"), { tone: "accent" })) {
        this.audio.ui();
        close = true;
      }
    });
    this.open = still && !close;
  }
}
