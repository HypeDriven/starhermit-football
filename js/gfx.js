// gfx.js — graphics quality model: presets, per-category overrides, hardware-level
// detection, per-preset budgets and a cost summary. Pure (no three.js), so the settings panel,
// the renderer wiring and the unit tests agree on what a setting means.

export const PRESETS = ['low', 'balanced', 'high', 'ultra'];

// Category → allowed tiers, cheapest first.
export const CATEGORIES = {
  shadows: ['off', 'low', 'medium', 'high'],   // floodlight shadow map size (+ a second caster at high)
  ao: ['off', 'on', 'high'],                   // GTAO contact darkening
  bloom: ['off', 'on'],                        // glow on floodlights, flashes and highlights
  grade: ['off', 'on'],                        // colour grade + vignette
  antialias: ['off', 'fxaa', 'smaa', 'msaa'],
  reflections: ['off', 'on'],                  // floodlit stadium environment map
  detail: ['plain', 'detailed'],               // grass relief, pitch wear, stand texture
  crowd: ['sparse', 'full'],                   // share of seats with spectators
  particles: ['off', 'on'],                    // camera flashes in the stands, dust in the beams
};

// Each preset is a row of tiers plus a render scale (multiplies the pixel
// ratio) and a device-pixel-ratio cap (Low stays at 1× so it costs no more
// than the original renderer did).
const TABLE = {
  low: { scale: 0.85, cap: 1, shadows: 'off', ao: 'off', bloom: 'off', grade: 'off', antialias: 'msaa', reflections: 'off', detail: 'plain', crowd: 'sparse', particles: 'off' },
  balanced: { scale: 0.9, cap: 1.5, shadows: 'low', ao: 'off', bloom: 'on', grade: 'on', antialias: 'fxaa', reflections: 'on', detail: 'detailed', crowd: 'full', particles: 'on' },
  high: { scale: 1, cap: 2, shadows: 'medium', ao: 'on', bloom: 'on', grade: 'on', antialias: 'smaa', reflections: 'on', detail: 'detailed', crowd: 'full', particles: 'on' },
  ultra: { scale: 1, cap: 2, shadows: 'high', ao: 'high', bloom: 'on', grade: 'on', antialias: 'msaa', reflections: 'on', detail: 'detailed', crowd: 'full', particles: 'on' },
};

export const SHADOW_MAP = { off: 0, low: 1024, medium: 2048, high: 4096 };

// StarHermit hardware level (0–20, js/gpu-level.js → window.StarHermitGpu) at which Auto starts
// choosing each preset. 0 = Galaxy S20 / Intel UHD or weaker, 20 = RTX 5090; phones, tablets and
// ≤ 4 GB machines are capped at level 9 (Balanced); software renderers are level 0 (Low).
export const LEVELS = { low: 0, balanced: 4, high: 10, ultra: 17 };

/*
 * Per-preset asset and effect budgets, each tuned to hold 60 FPS on the weakest GPU Auto gives the
 * preset (Low: level 0 phones / Intel UHD; Balanced: level 4 Iris Xe; High: level 10 GTX 1070;
 * Ultra: level 17 RTX 4080; measured with tests/gfx-bench.mjs). Gameplay is identical on every preset.
 *   material  crowd, seats and stands: 'lambert' (Low) | 'standard'
 *   grass     pitch grass colour (and, with Detail on, normal) texture width in px
 *   lines     pitch line-marking texture width in px
 *   crowd     share of the Crowd tier's spectators drawn (full = 80 % of seats, sparse = half of that)
 *   body      spectator capsule LOD [cap segments, radial segments]
 *   flashes / haze  camera-flash and floodlight-haze points (Particles on), scaled by the hardware
 *             level within the preset (≤ 2×)
 *   bloomRes / aoRes  bloom and GTAO resolution as a fraction of the frame
 */
export const BUDGETS = {
  low: { material: 'lambert', grass: 512, lines: 1024, crowd: 0.6, body: [1, 5], flashes: 80, haze: 160, bloomRes: 0.5, aoRes: 0.5 },
  balanced: { material: 'standard', grass: 1024, lines: 2048, crowd: 0.8, body: [2, 6], flashes: 140, haze: 300, bloomRes: 0.5, aoRes: 0.5 },
  high: { material: 'standard', grass: 1024, lines: 2048, crowd: 1, body: [3, 8], flashes: 220, haze: 480, bloomRes: 0.5, aoRes: 0.5 },
  ultra: { material: 'standard', grass: 2048, lines: 4096, crowd: 1, body: [4, 12], flashes: 300, haze: 700, bloomRes: 1, aoRes: 1 },
};
export const MAX_FLASHES = 600;
export const MAX_HAZE = 1400;

const gpuApi = () => globalThis.StarHermitGpu;

/** Hardware level 0–20 for an unmasked renderer string plus StarHermitGpu.detectSystem() facts. */
export function detectLevel(gpu, system = {}) {
  const G = gpuApi();
  if (!G) return LEVELS.balanced;
  return G.detectLevel({ webgl: true, webgl2: true, ...system, gpu: String(gpu || '') });
}

/** Auto preset for a hardware level: Low 0, Balanced 4, High 10, Ultra 17. */
export function presetForLevel(level) {
  const G = gpuApi();
  if (G) return G.presetForLevel(level, LEVELS);
  return PRESETS.filter((p) => LEVELS[p] <= level).pop() || 'low';
}

/** Best preset for this GPU; phones and tablets (`touch` / `mobile`) are capped at Balanced by the level. */
export function detectPreset(gpu, system = {}) {
  const sys = { ...system, mobile: !!(system.mobile || system.touch) };
  delete sys.touch;
  return presetForLevel(detectLevel(gpu, sys));
}

/** A preset's concrete budget for a hardware level (flashes and haze scale within the preset, ≤ 2×). */
export function budget(preset, level) {
  const b = { ...(BUDGETS[preset] || BUDGETS.balanced) };
  const G = gpuApi(), floor = LEVELS[preset] ?? 0;
  const k = G ? Math.min(2, G.scaleBudget(1, Number.isFinite(level) ? level : floor, floor)) : 1;
  b.flashes = Math.min(MAX_FLASHES, Math.round(b.flashes * k));
  b.haze = Math.min(MAX_HAZE, Math.round(b.haze * k));
  return b;
}

/**
 * Resolve saved settings into concrete tiers.
 * `saved`: { preset: 'auto'|preset, render_scale, adaptive, show_fps, <category>: 'preset'|tier }.
 */
export function resolve(saved, detected, level) {
  const s = saved || {};
  const preset = PRESETS.includes(s.preset) ? s.preset : (PRESETS.includes(detected) ? detected : 'balanced');
  const row = TABLE[preset];
  const out = {
    preset,
    auto: !PRESETS.includes(s.preset),
    renderScale: clamp(Number(s.render_scale) || 1, 0.5, 2),
    cap: row.cap,
  };
  out.scale = row.scale * out.renderScale;
  for (const [cat, tiers] of Object.entries(CATEGORIES)) {
    out[cat] = tiers.includes(s[cat]) ? s[cat] : row[cat];
  }
  out.level = Number.isFinite(level) ? level : LEVELS[preset];
  out.budget = budget(preset, out.level);
  out.adaptive = s.adaptive !== false;
  out.showFps = !!s.show_fps;
  // Post-processing runs only when something needs it; otherwise the canvas's own MSAA is used.
  out.post = out.ao !== 'off' || out.bloom === 'on' || out.grade === 'on' || out.antialias === 'fxaa' || out.antialias === 'smaa';
  return out;
}

/** Saved settings after choosing a preset: overrides are cleared, scale/adaptive/fps kept. */
export function choosePreset(saved, preset) {
  const s = saved || {};
  const out = { preset: PRESETS.includes(preset) ? preset : 'auto' };
  for (const k of ['render_scale', 'adaptive', 'show_fps']) if (k in s) out[k] = s[k];
  return out;
}

/** The preset's own tier for a category (for "From preset (…)" labels). */
export function presetTier(preset, cat) {
  return TABLE[preset]?.[cat];
}

const EN = {
  noShadows: 'no shadows', shadows: '{n}² shadows', ao: 'ambient occlusion', aoHigh: 'full ambient occlusion',
  bloom: 'bloom', reflections: 'reflections', noAA: 'no anti-aliasing', crowdSparse: 'sparse crowd',
};

/** One-line cost summary. `t` maps the keys above to localized text (English by default). */
export function describe(r, pixels, t = EN) {
  const tr = (k) => t[k] ?? EN[k];
  const parts = [
    r.shadows === 'off' ? tr('noShadows') : tr('shadows').replace('{n}', SHADOW_MAP[r.shadows]),
    r.ao === 'off' ? null : r.ao === 'high' ? tr('aoHigh') : tr('ao'),
    r.bloom === 'on' ? tr('bloom') : null,
    r.reflections === 'on' ? tr('reflections') : null,
    r.crowd === 'sparse' ? tr('crowdSparse') : null,
    r.antialias === 'off' ? tr('noAA') : r.antialias.toUpperCase(),
    pixels ? `${pixels[0]}×${pixels[1]} px` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}
