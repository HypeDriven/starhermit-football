// Unit tests for the pure graphics quality model (js/gfx.js). Run: node --test tests/gfx.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, CATEGORIES, SHADOW_MAP, detectPreset, resolve, choosePreset, presetTier, describe } from '../js/gfx.js';

test('detectPreset picks a tier from the GPU string', () => {
  assert.equal(detectPreset('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 'low');
  assert.equal(detectPreset('llvmpipe (LLVM 15.0.7, 256 bits)'), 'low');
  assert.equal(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)'), 'high');
  assert.equal(detectPreset('Apple M2'), 'high');
  assert.equal(detectPreset('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)'), 'balanced');
  assert.equal(detectPreset('Adreno (TM) 740'), 'balanced');
  assert.equal(detectPreset(''), 'balanced');
  assert.equal(detectPreset(null), 'balanced');
});

test('detectPreset caps Auto at balanced on touch devices', () => {
  assert.equal(detectPreset('Apple M1', { touch: true }), 'balanced');
  assert.equal(detectPreset('SwiftShader', { touch: true }), 'low');
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
