// The game's graphics content: the runtime's graphics level (its Options
// menu, frame().level): its effects and its tier's preset (logic/quality.ts), plus the player's per-category overrides for what is the
// game's own content — pitch detail, crowd density, flashes and haze — kept
// in the `graphics` game setting ({ detail, crowd,
// particles, … }); shadows, ambient occlusion, bloom, grade and anti-aliasing
// follow the level, reflections the tier, and the render scale is the
// runtime's. Listeners hear every change.
import { frame, levelSettings } from "starhermit:engine";
import { settings } from "starhermit:storage";
import type { JsonValue } from "starhermit:engine";
import { TIER_ANCHOR, contentQuality } from "./logic/quality.ts";
import type { ContentQuality } from "./logic/quality.ts";

export type Override = "detail" | "crowd" | "particles";
export const OVERRIDE_TIERS: Record<Override, readonly string[]> = {
  detail: ["plain", "detailed"],
  crowd: ["sparse", "full"],
  particles: ["off", "on"],
};
const SETTING = "graphics";

let level: string | null = null;
let cached: Record<string, JsonValue> | null = null;
let watching = false;
const listeners = new Set<(q: ContentQuality) => void>();

export function currentTier(): string {
  try {
    return frame().quality;
  } catch {
    return "balanced";
  }
}

/** This frame's level as the game's content, before the player's overrides. */
export function levelContent(): ContentQuality {
  const s = levelSettings(frame().level);
  return contentQuality(s, s.particles / levelSettings(TIER_ANCHOR[s.quality]).particles);
}

function readSetting(): Record<string, JsonValue> {
  try {
    const v = settings.get(SETTING);
    return v && typeof v === "object" && !Array.isArray(v) ? { ...v } : {};
  } catch {
    return {};
  }
}

/** The `graphics` setting, cached and refreshed when it changes. */
function graphicsSetting(): Record<string, JsonValue> {
  if (!watching) {
    watching = true;
    try {
      settings.onChange((key) => {
        if (key !== SETTING) return;
        cached = readSetting();
        notify();
      });
    } catch {
      // no change events
    }
  }
  if (!cached) cached = readSetting();
  return { ...cached };
}

/** The player's override of a category, or null for the preset's own. */
export function override(cat: Override): string | null {
  const v = graphicsSetting()[cat];
  return typeof v === "string" && OVERRIDE_TIERS[cat].includes(v) ? v : null;
}

/** Saves an override (null: from preset), keeping the setting's other
 * fields (such as the settings an earlier version of the game kept). */
export function setOverride(cat: Override, value: string | null): void {
  const g = graphicsSetting();
  if (value && OVERRIDE_TIERS[cat].includes(value)) g[cat] = value;
  else delete g[cat];
  cached = g;
  try {
    settings.set(SETTING, g);
  } catch {
    // settings unavailable: kept for this run
  }
  notify();
}

export function currentQuality(): ContentQuality {
  const q = levelContent();
  const detail = override("detail");
  const crowd = override("crowd");
  const particles = override("particles");
  if (detail) q.detail = detail === "detailed";
  if (crowd) q.crowdFull = crowd === "full";
  if (particles) q.particles = particles === "on";
  return q;
}

export function onQuality(fn: (q: ContentQuality) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  const q = currentQuality();
  for (const fn of listeners) fn(q);
}

/** Called once a frame: tells the builders when the player changed the
 * level in the runtime's Options (overrides notify as they change). */
export function pollQuality(): void {
  const l = frame().level;
  if (l === level) return;
  const first = level === null;
  level = l;
  graphicsSetting();
  if (!first) notify();
}
