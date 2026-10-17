// Unit tests for the pure graphics quality model (js/gfx.js). Run: node --test tests/gfx.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS, CATEGORIES, SHADOW_MAP, detectPreset, resolve, choosePreset, presetTier, describe,
  LEVELS, BUDGETS, MAX_FLASHES, MAX_HAZE, budget, detectLevel, presetForLevel,
} from '../js/gfx.js';
// js/gpu-level.js is a classic script in the page; imported here it sets globalThis.StarHermitGpu.
await import('../js/gpu-level.js');

test('hardware level picks the Auto preset (StarHermit gpu-level.js)', () => {
  assert.equal(detectPreset('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 'low');
  assert.equal(detectPreset('llvmpipe (LLVM 15.0.7, 256 bits)'), 'low');
  assert.equal(detectPreset('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'low');
  assert.equal(detectPreset('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)'), 'low');
  assert.equal(detectPreset('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)'), 'balanced');
  assert.equal(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce GTX 1070 Direct3D11 vs_5_0 ps_5_0)'), 'high');
  assert.equal(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)'), 'ultra');
  assert.equal(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0)'), 'ultra');
  assert.equal(detectLevel('NVIDIA GeForce RTX 5090'), 20);
  assert.equal(detectLevel('SwiftShader'), 0);
  for (const [p, lv] of Object.entries(LEVELS)) assert.equal(presetForLevel(lv), p);
  assert.equal(presetForLevel(9), 'balanced');
  assert.equal(presetForLevel(16), 'high');
});

test('phones and tablets are Balanced at most', () => {
  assert.ok(['low', 'balanced'].includes(detectPreset('Adreno (TM) 740', { touch: true })));
  assert.equal(detectPreset('NVIDIA GeForce RTX 5090', { touch: true }), 'balanced');
  assert.equal(detectPreset('NVIDIA GeForce RTX 5090', { mobile: true }), 'balanced');
  assert.equal(detectPreset('SwiftShader', { touch: true }), 'low');
});

test('per-preset budgets are explicit, grow from Low to Ultra and scale with the level', () => {
  const keys = ['material', 'grass', 'lines', 'crowd', 'body', 'flashes', 'haze', 'bloomRes', 'aoRes'];
  for (const p of PRESETS) for (const k of keys) assert.ok(k in BUDGETS[p], `${p}.${k}`);
  for (let i = 1; i < PRESETS.length; i++) {
    const a = BUDGETS[PRESETS[i - 1]], b = BUDGETS[PRESETS[i]];
    for (const k of ['grass', 'lines', 'crowd', 'flashes', 'haze', 'bloomRes', 'aoRes']) assert.ok(b[k] >= a[k], `${PRESETS[i]}.${k}`);
    assert.ok(b.body[1] >= a.body[1], `${PRESETS[i]}.body`);
  }
  assert.equal(BUDGETS.low.material, 'lambert');
  assert.deepEqual(budget('high', 10), BUDGETS.high);
  assert.ok(budget('high', 14).haze > BUDGETS.high.haze);
  assert.ok(budget('ultra', 20).haze <= Math.min(MAX_HAZE, BUDGETS.ultra.haze * 2));
  assert.ok(budget('ultra', 20).flashes <= MAX_FLASHES);
  assert.ok(budget('ultra', 2).flashes < BUDGETS.ultra.flashes);
  assert.deepEqual(resolve({ preset: 'low' }, 'low', 0).budget, BUDGETS.low);
  assert.equal(resolve({}, 'ultra', 20).level, 20);
});

test('resolve: auto uses the detected preset', () => {
  const r = resolve({}, 'low');
  assert.equal(r.preset, 'low');
  assert.equal(r.auto, true);
  assert.equal(r.shadows, presetTier('low', 'shadows'));
  assert.equal(r.cap, 1);
  assert.equal(r.adaptive, true);
  assert.equal(r.showFps, false);
  assert.equal(resolve(null, undefined).preset, 'balanced');
});

test('resolve: explicit preset wins over detection and fills every category', () => {
  const r = resolve({ preset: 'ultra' }, 'low');
  assert.equal(r.preset, 'ultra');
  assert.equal(r.auto, false);
  for (const [cat, tiers] of Object.entries(CATEGORIES)) assert.ok(tiers.includes(r[cat]), cat);
  assert.equal(r.post, true);
  for (const p of PRESETS) for (const cat of Object.keys(CATEGORIES)) assert.ok(CATEGORIES[cat].includes(presetTier(p, cat)), `${p}.${cat}`);
});

test('resolve: overrides apply, invalid tiers fall back to the preset', () => {
  const r = resolve({ preset: 'high', bloom: 'off', shadows: 'nope', crowd: 'sparse' }, 'low');
  assert.equal(r.bloom, 'off');
  assert.equal(r.shadows, presetTier('high', 'shadows'));
  assert.equal(r.crowd, 'sparse');
});

test('resolve: render scale is clamped to 50–200%', () => {
  assert.equal(resolve({ render_scale: 5 }, 'high').renderScale, 2);
  assert.equal(resolve({ render_scale: 0.1 }, 'high').renderScale, 0.5);
  assert.equal(resolve({ render_scale: 'x' }, 'high').renderScale, 1);
  assert.equal(resolve({ preset: 'high', render_scale: 1.5 }, 'low').scale, 1.5);
});

test('resolve: Low needs no post-processing chain', () => {
  const r = resolve({ preset: 'low' }, 'high');
  assert.equal(r.post, false);
  assert.equal(resolve({ preset: 'low', bloom: 'on' }).post, true);
});

test('choosePreset clears overrides but keeps scale, adaptive and fps', () => {
  const s = choosePreset({ preset: 'high', bloom: 'off', ao: 'high', render_scale: 1.25, adaptive: false, show_fps: true }, 'low');
  assert.deepEqual(s, { preset: 'low', render_scale: 1.25, adaptive: false, show_fps: true });
  assert.deepEqual(choosePreset({ bloom: 'off' }, 'auto'), { preset: 'auto' });
});

test('describe summarises cost', () => {
  const s = describe(resolve({ preset: 'high' }), [1920, 1080]);
  assert.match(s, new RegExp(`${SHADOW_MAP.medium}² shadows`));
  assert.match(s, /ambient occlusion/);
  assert.match(s, /SMAA/);
  assert.match(s, /1920×1080 px/);
  assert.match(describe(resolve({ preset: 'low', shadows: 'off' })), /no shadows/);
  assert.match(describe(resolve({ preset: 'low' }), null, { crowdSparse: 'publico' }), /publico/);
});
