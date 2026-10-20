// The game's graphics quality model: four presets, each a row of tiers per
// category and a budget of content, keyed by the runtime's quality tier.
// The tier is the player's choice in the runtime's Options menu
// (frame().quality, the same four names as the presets); render scale,
// frame-rate limits and the adaptive resolution are the runtime's own and are
// not repeated here.

export const PRESETS = ["low", "balanced", "high", "ultra"] as const;
export type Tier = (typeof PRESETS)[number];

/** Category → tiers, cheapest first. */
export const CATEGORIES = {
  shadows: ["off", "low", "medium", "high"], // floodlight shadow map size (+ a second caster at high)
  ao: ["off", "on", "high"], // GTAO contact darkening
  bloom: ["off", "on"], // glow on floodlights, flashes and highlights
  grade: ["off", "on"], // colour grade + vignette
  antialias: ["off", "fxaa", "smaa", "msaa"],
  reflections: ["off", "on"], // floodlit stadium environment map
  detail: ["plain", "detailed"], // grass relief, pitch wear, stand texture
  crowd: ["sparse", "full"], // share of seats with spectators
  particles: ["off", "on"], // camera flashes in the stands, haze in the beams
} as const;
type Category = keyof typeof CATEGORIES;
type TierOf<C extends Category> = (typeof CATEGORIES)[C][number];

/** Each preset's tier per category. */
export const TABLE: Record<Tier, { [C in Category]: TierOf<C> }> = {
  low: { shadows: "off", ao: "off", bloom: "off", grade: "off", antialias: "msaa", reflections: "off", detail: "plain", crowd: "sparse", particles: "off" },
  balanced: { shadows: "low", ao: "off", bloom: "on", grade: "on", antialias: "fxaa", reflections: "on", detail: "detailed", crowd: "full", particles: "on" },
  high: { shadows: "medium", ao: "on", bloom: "on", grade: "on", antialias: "smaa", reflections: "on", detail: "detailed", crowd: "full", particles: "on" },
  ultra: { shadows: "high", ao: "high", bloom: "on", grade: "on", antialias: "msaa", reflections: "on", detail: "detailed", crowd: "full", particles: "on" },
};

export const SHADOW_MAP: Record<TierOf<"shadows">, number> = { off: 0, low: 1024, medium: 2048, high: 4096 };

/**
 * Per-preset content and effect budgets, each tuned to hold 60 frames a
 * second on the weakest GPU the preset is meant for (Low: phones and Intel
 * UHD; Balanced: Iris Xe; High: a GTX 1070; Ultra: an RTX 4080). Gameplay is
 * identical on every preset.
 *   material  crowd, seats and stands: "lambert" (Low) | "standard"
 *   grass     pitch grass colour (and, with Detail on, normal) texture width in px
 *   lines     pitch line-marking texture width in px
 *   crowd     share of the Crowd tier's spectators drawn (full = 80 % of seats, sparse = half of that)
 *   body      spectator capsule LOD [cap segments, radial segments]
 *   flashes / haze  camera-flash and floodlight-haze points (Particles on)
 *   bloomRes / aoRes  bloom and GTAO resolution as a fraction of the frame
 */
export const BUDGETS: Record<Tier, {
  material: "lambert" | "standard"; grass: number; lines: number; crowd: number; body: [number, number];
  flashes: number; haze: number; bloomRes: number; aoRes: number;
}> = {
  low: { material: "lambert", grass: 512, lines: 1024, crowd: 0.6, body: [1, 5], flashes: 80, haze: 160, bloomRes: 0.5, aoRes: 0.5 },
  balanced: { material: "standard", grass: 1024, lines: 2048, crowd: 0.8, body: [2, 6], flashes: 140, haze: 300, bloomRes: 0.5, aoRes: 0.5 },
  high: { material: "standard", grass: 1024, lines: 2048, crowd: 1, body: [3, 8], flashes: 220, haze: 480, bloomRes: 0.5, aoRes: 0.5 },
  ultra: { material: "standard", grass: 2048, lines: 4096, crowd: 1, body: [4, 12], flashes: 300, haze: 700, bloomRes: 1, aoRes: 1 },
};
/** The flash and haze pools (a budget draws a share of them). */
export const MAX_FLASHES = 600;
export const MAX_HAZE = 1400;

export interface ContentQuality {
  tier: Tier;
  /** Floodlight shadow-map size (0: no shadows). */
  shadowMap: number;
  /** The opposite tower casts too (the floodlit double shadow). */
  secondCaster: boolean;
  bloom: boolean;
  /** The post effects: GTAO off, on or high, the grade, the anti-aliasing,
   * and bloom's and GTAO's share of the frame. */
  ao: "off" | "on" | "high";
  grade: boolean;
  antialias: "off" | "fxaa" | "smaa" | "msaa";
  bloomRes: number;
  aoRes: number;
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
  const t = TABLE[tier];
  return {
    tier,
    shadowMap: SHADOW_MAP[t.shadows],
    secondCaster: t.shadows === "high",
    bloom: t.bloom === "on",
    ao: t.ao,
    grade: t.grade === "on",
    antialias: t.antialias,
    bloomRes: b.bloomRes,
    aoRes: b.aoRes,
    reflections: t.reflections === "on",
    lambert: b.material === "lambert",
    detail: t.detail === "detailed",
    crowdFull: t.crowd === "full",
    particles: t.particles === "on",
    grass: b.grass,
    lines: b.lines,
    crowdShare: b.crowd,
    body: [b.body[0], b.body[1]],
    flashes: b.flashes,
    haze: b.haze,
  };
}
