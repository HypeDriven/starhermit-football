// gfx.js — graphics quality model: presets, per-category overrides, GPU
// detection and a cost summary. Pure (no three.js), so the settings panel,
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
  low: { scale: 1, cap: 1, shadows: 'low', ao: 'off', bloom: 'off', grade: 'off', antialias: 'msaa', reflections: 'off', detail: 'plain', crowd: 'sparse', particles: 'off' },
  balanced: { scale: 1, cap: 1.5, shadows: 'medium', ao: 'off', bloom: 'on', grade: 'on', antialias: 'fxaa', reflections: 'on', detail: 'detailed', crowd: 'full', particles: 'on' },
  high: { scale: 1, cap: 2, shadows: 'medium', ao: 'on', bloom: 'on', grade: 'on', antialias: 'smaa', reflections: 'on', detail: 'detailed', crowd: 'full', particles: 'on' },
  ultra: { scale: 1, cap: 2, shadows: 'high', ao: 'high', bloom: 'on', grade: 'on', antialias: 'msaa', reflections: 'on', detail: 'detailed', crowd: 'full', particles: 'on' },
};

export const SHADOW_MAP = { off: 0, low: 1024, medium: 2048, high: 4096 };

/** Best preset for this GPU, from the unmasked renderer string when the browser exposes it. */
export function detectPreset(gpu, { touch = false } = {}) {
  const g = String(gpu || '').toLowerCase();
  let p = 'balanced';
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(g)) p = 'low';
  else if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|amd radeon(?! graphics)|apple m\d/.test(g)) p = 'high';
  // phones and tablets: Auto never goes above Balanced
  if (touch && PRESETS.indexOf(p) > PRESETS.indexOf('balanced')) p = 'balanced';
  return p;
}

/**
 * Resolve saved settings into concrete tiers.
 * `saved`: { preset: 'auto'|preset, render_scale, adaptive, show_fps, <category>: 'preset'|tier }.
 */
export function resolve(saved, detected) {
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
