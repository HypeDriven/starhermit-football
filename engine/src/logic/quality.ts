// The game's graphics content per quality preset, from the browser's own
// quality model (js/gfx.js: preset tiers and per-preset budgets), keyed by
// the runtime's quality tier. Natively the tier is the player's choice in
// the runtime's Options menu (frame().quality, the same four names as the
// game's presets); render scale, anti-aliasing, frame-rate limits and the
// adaptive resolution are the runtime's own and are not repeated here.
import { BUDGETS, SHADOW_MAP, presetTier } from "../../../js/gfx.js";

export type Tier = "low" | "balanced" | "high" | "ultra";

export interface ContentQuality {
  tier: Tier;
  /** Floodlight shadow-map size (0: no shadows). */
  shadowMap: number;
  /** The opposite tower casts too (the floodlit double shadow). */
  secondCaster: boolean;
  bloom: boolean;
  /** The floodlit-stadium environment map (Reflections). */
  reflections: boolean;
  /** Lambert twins for the stands, seats and crowd (the Low budget). */
  lambert: boolean;
  /** The detailed pitch (turf variation, worn goalmouths, mow-stripe normal map). */
  detail: boolean;
  /** Full or the evenly spread half crowd. */
  crowdFull: boolean;
  /** Camera flashes in the stands and haze in the beams. */
  particles: boolean;
  /** Grass and line-marking texture widths (px). */
  grass: number;
  lines: number;
  /** Share of the crowd tier's spectators drawn. */
  crowdShare: number;
  /** Spectator capsule LOD: [cap segments, radial segments]. */
  body: [number, number];
  flashes: number;
  haze: number;
}

export function asTier(q: string): Tier {
  return q === "low" || q === "balanced" || q === "high" || q === "ultra" ? q : "balanced";
}

/** The content a tier asks for (the preset's own tiers and budget). */
export function contentQuality(tierName: string): ContentQuality {
  const tier = asTier(tierName);
  const b = BUDGETS[tier];
  const shadows = String(presetTier(tier, "shadows"));
  return {
    tier,
    shadowMap: (SHADOW_MAP as Record<string, number>)[shadows] ?? 0,
    secondCaster: shadows === "high",
    bloom: presetTier(tier, "bloom") === "on",
    reflections: presetTier(tier, "reflections") === "on",
    lambert: b.material === "lambert",
    detail: presetTier(tier, "detail") === "detailed",
    crowdFull: presetTier(tier, "crowd") === "full",
    particles: presetTier(tier, "particles") === "on",
    grass: b.grass,
    lines: b.lines,
    crowdShare: b.crowd,
    body: [b.body[0] ?? 3, b.body[1] ?? 8],
    flashes: b.flashes,
    haze: b.haze,
  };
}
