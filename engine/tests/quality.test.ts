import { test } from "node:test";
import assert from "node:assert/strict";
import { asTier, contentQuality } from "../src/logic/quality.ts";

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
