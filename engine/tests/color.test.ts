import { test } from "node:test";
import assert from "node:assert/strict";
import { contrastFor, lerpSrgbHex, linearToSrgb, luminance, parseHex, srgbToLinear } from "../src/logic/color.ts";

test("kit trims contrast with their shirt", () => {
  assert.equal(contrastFor("#1f5fb4"), "#f2f2f2");
  assert.equal(contrastFor("#c0392b"), "#f2f2f2");
  assert.equal(contrastFor("#f2f2f2"), "#161616");
  assert.ok(luminance("#ffffff") > 0.99 && luminance("#000000") === 0);
});

test("sRGB conversions round-trip and skin tones blend in linear light", () => {
  for (const v of [0, 0.02, 0.2, 0.5, 1]) assert.ok(Math.abs(linearToSrgb(srgbToLinear(v)) - v) < 1e-9);
  assert.deepEqual(parseHex(0xff8000), [1, 128 / 255, 0]);
  assert.equal(lerpSrgbHex("#f2c79b", "#4a2c17", 0), "#f2c79b");
  assert.equal(lerpSrgbHex("#f2c79b", "#4a2c17", 1), "#4a2c17");
  assert.equal(lerpSrgbHex("#000000", "#ffffff", 0.5), "#bcbcbc");
});
