import { test } from "node:test";
import assert from "node:assert/strict";
import { BUDGETS, CATEGORIES, MAX_FLASHES, MAX_HAZE, PRESETS, TABLE, contentQuality } from "../src/logic/quality.ts";
import type { LevelEffects } from "../src/logic/quality.ts";

/** levelSettings() at the anchor levels, as levels.rs has them. */
const ao = (resolution: number, samples: number) => ({ resolution, samples, denoiseSamples: samples });
const LEVEL: Record<LevelEffects["quality"], LevelEffects> = {
  low: { quality: "low", shadows: false, shadowMapSize: 512, ao: null, bloom: null, grade: false, antialias: "off" },
  balanced: { quality: "balanced", shadows: true, shadowMapSize: 1024, ao: null, bloom: { resolution: 0.5 }, grade: true, antialias: "fxaa" },
  high: { quality: "high", shadows: true, shadowMapSize: 2048, ao: ao(0.5, 8), bloom: { resolution: 0.5 }, grade: true, antialias: "smaa" },
  ultra: { quality: "ultra", shadows: true, shadowMapSize: 4096, ao: ao(1, 16), bloom: { resolution: 1 }, grade: true, antialias: "msaa" },
};

test("each runtime quality tier takes the game's preset content", () => {
  const low = contentQuality(LEVEL.low);
  assert.equal(low.shadowMap, 0);
  assert.equal(low.bloomRes, null);
  assert.equal(low.crowdFull, false);
  assert.equal(low.particles, false);
  assert.equal(low.grass, 512);
  assert.deepEqual(low.body, [1, 5]);
  const high = contentQuality(LEVEL.high);
  assert.equal(high.shadowMap, 2048);
  assert.equal(high.secondCaster, false);
  assert.equal(high.detail, true);
  assert.equal(high.flashes, 220);
  const ultra = contentQuality(LEVEL.ultra);
  assert.equal(ultra.shadowMap, 4096);
  assert.equal(ultra.secondCaster, true);
  assert.equal(ultra.lines, 4096);
  assert.equal(contentQuality(LEVEL.high, 4).flashes, 440); // at most 2× past the anchor
});

test("reflections and the Lambert materials follow the presets", () => {
  assert.equal(contentQuality(LEVEL.low).lambert, true);
  assert.equal(contentQuality(LEVEL.balanced).lambert, false);
  assert.equal(contentQuality(LEVEL.low).reflections, false);
  assert.equal(contentQuality(LEVEL.high).reflections, true);
  assert.equal(contentQuality(LEVEL.ultra).secondCaster, true);
  assert.equal(contentQuality(LEVEL.high).secondCaster, false);
});

test("every preset names a tier of every category", () => {
  for (const p of PRESETS) {
    for (const [cat, tiers] of Object.entries(CATEGORIES)) {
      assert.ok((tiers as readonly string[]).includes((TABLE[p] as Record<string, string>)[cat]!), `${p}.${cat}`);
    }
  }
});

test("per-preset budgets are explicit and grow from Low to Ultra", () => {
  const keys = ["material", "grass", "lines", "crowd", "body", "flashes", "haze"];
  for (const p of PRESETS) for (const k of keys) assert.ok(k in BUDGETS[p], `${p}.${k}`);
  for (let i = 1; i < PRESETS.length; i++) {
    const a = BUDGETS[PRESETS[i - 1]!];
    const b = BUDGETS[PRESETS[i]!];
    for (const k of ["grass", "lines", "crowd", "flashes", "haze"] as const) assert.ok(b[k] >= a[k], `${PRESETS[i]}.${k}`);
    assert.ok(b.body[1] >= a.body[1], `${PRESETS[i]}.body`);
  }
  assert.equal(BUDGETS.low.material, "lambert");
  for (const p of PRESETS) assert.ok(BUDGETS[p].flashes <= MAX_FLASHES && BUDGETS[p].haze <= MAX_HAZE, p);
});

test("the post effects are the level's", () => {
  const low = contentQuality(LEVEL.low);
  assert.deepEqual([low.ao, low.bloomRes, low.grade, low.antialias], [null, null, false, "off"]);
  const balanced = contentQuality(LEVEL.balanced);
  assert.deepEqual([balanced.ao, balanced.bloomRes, balanced.grade, balanced.antialias], [null, 0.5, true, "fxaa"]);
  const high = contentQuality(LEVEL.high);
  assert.deepEqual([high.ao, high.bloomRes, high.grade, high.antialias], [ao(0.5, 8), 0.5, true, "smaa"]);
  const ultra = contentQuality(LEVEL.ultra);
  assert.deepEqual([ultra.ao, ultra.bloomRes, ultra.grade, ultra.antialias], [ao(1, 16), 1, true, "msaa"]);
});
