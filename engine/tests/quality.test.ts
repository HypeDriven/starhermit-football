import { test } from "node:test";
import assert from "node:assert/strict";
import { BUDGETS, CATEGORIES, MAX_FLASHES, MAX_HAZE, PRESETS, TABLE, asTier, contentQuality } from "../src/logic/quality.ts";

test("each runtime quality tier takes the game's preset content", () => {
  const low = contentQuality("low");
  assert.equal(low.shadowMap, 0);
  assert.equal(low.bloom, false);
  assert.equal(low.crowdFull, false);
  assert.equal(low.particles, false);
  assert.equal(low.grass, 512);
  assert.deepEqual(low.body, [1, 5]);
  const high = contentQuality("high");
  assert.equal(high.shadowMap, 2048);
  assert.equal(high.secondCaster, false);
  assert.equal(high.detail, true);
  assert.equal(high.flashes, 220);
  const ultra = contentQuality("ultra");
  assert.equal(ultra.shadowMap, 4096);
  assert.equal(ultra.secondCaster, true);
  assert.equal(ultra.lines, 4096);
  assert.equal(asTier("bogus"), "balanced");
  assert.equal(contentQuality("bogus").tier, "balanced");
});

test("reflections and the Lambert materials follow the presets", () => {
  assert.equal(contentQuality("low").lambert, true);
  assert.equal(contentQuality("balanced").lambert, false);
  assert.equal(contentQuality("low").reflections, false);
  assert.equal(contentQuality("high").reflections, true);
  assert.equal(contentQuality("ultra").secondCaster, true);
  assert.equal(contentQuality("high").secondCaster, false);
});

test("every preset names a tier of every category", () => {
  for (const p of PRESETS) {
    for (const [cat, tiers] of Object.entries(CATEGORIES)) {
      assert.ok((tiers as readonly string[]).includes((TABLE[p] as Record<string, string>)[cat]!), `${p}.${cat}`);
    }
  }
});

test("per-preset budgets are explicit and grow from Low to Ultra", () => {
  const keys = ["material", "grass", "lines", "crowd", "body", "flashes", "haze", "bloomRes", "aoRes"];
  for (const p of PRESETS) for (const k of keys) assert.ok(k in BUDGETS[p], `${p}.${k}`);
  for (let i = 1; i < PRESETS.length; i++) {
    const a = BUDGETS[PRESETS[i - 1]!];
    const b = BUDGETS[PRESETS[i]!];
    for (const k of ["grass", "lines", "crowd", "flashes", "haze", "bloomRes", "aoRes"] as const) assert.ok(b[k] >= a[k], `${PRESETS[i]}.${k}`);
    assert.ok(b.body[1] >= a.body[1], `${PRESETS[i]}.body`);
  }
  assert.equal(BUDGETS.low.material, "lambert");
  for (const p of PRESETS) assert.ok(BUDGETS[p].flashes <= MAX_FLASHES && BUDGETS[p].haze <= MAX_HAZE, p);
});

test("each preset turns on its post effects", () => {
  const low = contentQuality("low");
  assert.deepEqual([low.ao, low.bloom, low.grade, low.antialias], ["off", false, false, "msaa"]);
  const balanced = contentQuality("balanced");
  assert.deepEqual([balanced.ao, balanced.bloom, balanced.grade, balanced.antialias], ["off", true, true, "fxaa"]);
  const high = contentQuality("high");
  assert.deepEqual([high.ao, high.bloom, high.grade, high.antialias, high.aoRes, high.bloomRes], ["on", true, true, "smaa", 0.5, 0.5]);
  const ultra = contentQuality("ultra");
  assert.deepEqual([ultra.ao, ultra.bloom, ultra.grade, ultra.antialias, ultra.aoRes, ultra.bloomRes], ["high", true, true, "msaa", 1, 1]);
});
