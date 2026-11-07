// The game's graphics quality model. The engine's effects (shadows, GTAO,
// bloom, grade, anti-aliasing) come from the frame's graphics level
// (levelSettings(), passed in: this module stays free of host modules); the
// game's own content is four presets, each a row of tiers per category and a
// budget, keyed by the level's quality tier. The level is the player's choice
// in the runtime's Options menu; render scale, frame-rate limits and the
// adaptive resolution are the runtime's own and are not repeated here.

export const PRESETS = ["low", "balanced", "high", "ultra"] as const;
export type Tier = (typeof PRESETS)[number];

/** Category → tiers, cheapest first. */
export const CATEGORIES = {
  reflections: ["off", "on"], // floodlit stadium environment map
  detail: ["plain", "detailed"], // grass relief, pitch wear, stand texture
  crowd: ["sparse", "full"], // share of seats with spectators
  particles: ["off", "on"], // camera flashes in the stands, haze in the beams
} as const;
type Category = keyof typeof CATEGORIES;
type TierOf<C extends Category> = (typeof CATEGORIES)[C][number];

/** Each preset's tier per category. */
export const TABLE: Record<Tier, { [C in Category]: TierOf<C> }> = {
  low: { reflections: "off", detail: "plain", crowd: "sparse", particles: "off" },
  balanced: { reflections: "on", detail: "detailed", crowd: "full", particles: "on" },
  high: { reflections: "on", detail: "detailed", crowd: "full", particles: "on" },
  ultra: { reflections: "on", detail: "detailed", crowd: "full", particles: "on" },
};

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
 *   flashes / haze  camera-flash and floodlight-haze points (Particles on), scaled by the level (at most 2×)
 */
export const BUDGETS: Record<Tier, {
  material: "lambert" | "standard"; grass: number; lines: number; crowd: number; body: [number, number];
  flashes: number; haze: number;
}> = {
  low: { material: "lambert", grass: 512, lines: 1024, crowd: 0.6, body: [1, 5], flashes: 80, haze: 160 },
  balanced: { material: "standard", grass: 1024, lines: 2048, crowd: 0.8, body: [2, 6], flashes: 140, haze: 300 },
  high: { material: "standard", grass: 1024, lines: 2048, crowd: 1, body: [3, 8], flashes: 220, haze: 480 },
  ultra: { material: "standard", grass: 2048, lines: 4096, crowd: 1, body: [4, 12], flashes: 300, haze: 700 },
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
  /** The level's post effects: bloom's share of the frame (null: off), GTAO
   * (null: off), the grade and the anti-aliasing. */
  bloomRes: number | null;
  ao: { resolution: number; samples: number; denoiseSamples: number } | null;
  grade: boolean;
  antialias: LevelEffects["antialias"];
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

/** What the game reads of levelSettings() (a subset of LevelSettings). */
export interface LevelEffects {
  quality: Tier;
  shadows: boolean;
  shadowMapSize: number;
  ao: { resolution: number; samples: number; denoiseSamples: number } | null;
  bloom: { resolution: number } | null;
  grade: boolean;
  antialias: "off" | "fxaa" | "smaa" | "msaa";
}
/** The level each preset's budgets were tuned at. */
export const TIER_ANCHOR = { low: "quantum", balanced: "molecular", high: "terrestrial", ultra: "galactic" } as const;

/** What a level asks for: its engine effects, its tier's preset and budget;
 * particleScale is the level's particle budget over the anchor's. */
export function contentQuality(level: LevelEffects, particleScale = 1): ContentQuality {
  const tier = level.quality;
  const k = Math.min(2, Math.max(1, particleScale));
  const b = BUDGETS[tier];
  const t = TABLE[tier];
  return {
    tier,
    shadowMap: level.shadows ? level.shadowMapSize : 0,
    secondCaster: tier === "ultra",
    bloomRes: level.bloom ? level.bloom.resolution : null,
    ao: level.ao && { resolution: level.ao.resolution, samples: level.ao.samples, denoiseSamples: level.ao.denoiseSamples },
    grade: level.grade,
    antialias: level.antialias,
    reflections: t.reflections === "on",
    lambert: b.material === "lambert",
    detail: t.detail === "detailed",
    crowdFull: t.crowd === "full",
    particles: t.particles === "on",
    grass: b.grass,
    lines: b.lines,
    crowdShare: b.crowd,
    body: [b.body[0], b.body[1]],
    flashes: Math.min(MAX_FLASHES, Math.round(b.flashes * k)),
    haze: Math.min(MAX_HAZE, Math.round(b.haze * k)),
  };
}
