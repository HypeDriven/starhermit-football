// graphics.js — renderer wiring for the graphics settings (js/gfx.js):
// pixel ratio (preset cap × render scale × adaptive scale), shadow maps, the
// post-processing chain (RenderPass → GTAO → bloom → grade → OutputPass →
// SMAA/FXAA), the floodlit-stadium environment map, the frame-rate readout
// and persistence. World builders (stadium.js) subscribe with onGraphics().
//
// Usage (main.js):
//   const graphics = createGraphics({ renderer, scene, camera, isTouch });
//   graphics.render(dt);                 // instead of renderer.render()
//   graphics.save({ bloom: 'off' });     // patch saved settings, applies live
//   graphics.setPreset('high');          // clears per-category overrides
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { detectPreset, resolve, describe, choosePreset, SHADOW_MAP } from './gfx.js?v=8';

const STORE_KEY = 'starhermit-football-graphics';
const listeners = new Set();
let current = null;       // resolved settings, shared with subscribers
let envTexture = null;    // PMREM floodlit-stadium environment (lazy)
let envBuilder = null;

const reducedMotionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
/** True when the player asked the OS for reduced motion (ambient animation stops). */
export function reducedMotion() { return !!reducedMotionQuery?.matches; }

/** Subscribe to resolved graphics settings; called now (if known) and on every change. */
export function onGraphics(fn) {
  listeners.add(fn);
  if (current) fn(current);
  return () => listeners.delete(fn);
}

/** Floodlit-stadium environment map for PBR reflections (null until the renderer exists). */
export function stadiumEnvironment() {
  if (!envTexture && envBuilder) envTexture = envBuilder();
  return envTexture;
}

// Colour grade + vignette (display-space colours in, display-space out):
// gentle S-curve, a touch more saturation, cool shadows / warm floodlit highlights.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 1.0 }, uVignette: { value: 0.26 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uAmount; uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = clamp(src.rgb, 0.0, 1.0);
      vec3 s = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
      float l = dot(s, vec3(0.299, 0.587, 0.114));
      s = mix(vec3(l), s, 1.12);
      s *= mix(vec3(0.95, 0.99, 1.06), vec3(1.04, 1.01, 0.95), smoothstep(0.15, 0.8, l));
      c = mix(c, clamp(s, 0.0, 1.0), uAmount);
      float d = length((vUv - 0.5) * vec2(1.1, 1.0));
      c *= 1.0 - uVignette * smoothstep(0.38, 0.9, d);
      gl_FragColor = vec4(c, src.a);
    }`,
};

// GTAO reads a normal/depth pre-pass of the whole scene; the sky dome, light
// cones, nets and sprites are not surfaces and would cast false occlusion.
class StadiumGTAOPass extends GTAOPass {
  _overrideVisibility() {
    super._overrideVisibility();
    this.scene.traverse((o) => { if (o.isSprite || o.userData.noAO) o.visible = false; });
  }
}

function gpuName(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch {
    return '';
  }
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}

// A tiny stand-in for the stadium at night: dark sky, four HDR floodlight
// banks up in the corners, the glowing ad-board ring and green turf below.
function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP; void main() {
        float h = normalize(vP).y;
        vec3 sky = mix(vec3(0.030, 0.045, 0.080), vec3(0.004, 0.006, 0.014), smoothstep(0.05, 0.7, h));
        vec3 stands = vec3(0.020, 0.022, 0.030);
        vec3 turf = vec3(0.030, 0.090, 0.035);
        vec3 c = h > 0.18 ? sky : (h > -0.05 ? stands : turf);
        gl_FragColor = vec4(c, 1.0); }`,
    }),
  );
  env.add(dome);
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 14, 15) });
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 1), lamp);
    m.position.set(x * 30, 24, z * 22);
    m.lookAt(0, 0, 0);
    env.add(m);
  }
  const boards = new THREE.Mesh(
    new THREE.CylinderGeometry(34, 34, 1.2, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.7, 1.1), side: THREE.DoubleSide }),
  );
  boards.position.y = -1;
  env.add(boards);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return tex;
}

export function createGraphics({ renderer, scene, camera, isTouch = false }) {
  const canvas = renderer.domElement;
  const gpu = gpuName(renderer);
  const detected = detectPreset(gpu, { touch: isTouch });
  envBuilder = () => buildEnvironment(renderer);

  let saved = loadSaved();
  let q = null;
  let composer = null;
  let postKey = null;
  let postFailed = false;
  let size = [0, 0];
  let pixelRatio = 0;
  let adaptiveScale = 1;
  let frames = [];
  let fps = 0;
  let shadowsWereOn = null;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  function apply() {
    q = resolve(saved, detected);
    current = q;
    const on = SHADOW_MAP[q.shadows] > 0;
    renderer.shadowMap.enabled = on;
    renderer.shadowMap.needsUpdate = true;
    if (shadowsWereOn !== null && shadowsWereOn !== on) {
      // materials compile shadow sampling in or out
      scene.traverse((o) => {
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) m.needsUpdate = true;
      });
    }
    shadowsWereOn = on;
    adaptiveScale = 1;
    frames = [];
    postKey = null; // rebuild the post chain on the next frame
    showFps(q.showFps);
    document.body.dataset.gfxPreset = q.preset;
    for (const cat of ['shadows', 'bloom', 'ao', 'antialias', 'crowd', 'particles', 'reflections', 'detail']) {
      document.body.dataset[`gfx${cat[0].toUpperCase()}${cat.slice(1)}`] = q[cat];
    }
    for (const fn of listeners) fn(q);
  }

  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch { /* storage unavailable */ }
  }

  function showFps(on) {
    let el = document.getElementById('fps-meter');
    if (on && !el) {
      el = document.createElement('div');
      el.id = 'fps-meter';
      el.setAttribute('aria-hidden', 'true');
      document.body.append(el);
    }
    if (el) el.hidden = !on;
  }

  function buildPost(w, h) {
    composer?.dispose();
    composer = null;
    if (!q.post || postFailed) return;
    try {
      const pw = Math.max(1, Math.round(w * pixelRatio));
      const ph = Math.max(1, Math.round(h * pixelRatio));
      const target = new THREE.WebGLRenderTarget(pw, ph, {
        type: THREE.HalfFloatType, samples: q.antialias === 'msaa' ? 4 : 0,
      });
      const c = new EffectComposer(renderer, target);
      c.setPixelRatio(pixelRatio);
      c.setSize(w, h);
      c.addPass(new RenderPass(scene, camera));
      if (q.ao !== 'off') {
        const high = q.ao === 'high';
        const ao = new StadiumGTAOPass(scene, camera, pw, ph);
        ao.output = GTAOPass.OUTPUT.Default;
        ao.blendIntensity = high ? 0.85 : 0.7;
        ao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.6, thickness: 1.5, scale: 1.0, samples: high ? 16 : 8, distanceFallOff: 1.0 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: high ? 6 : 4, rings: 2, samples: high ? 16 : 8 });
        c.addPass(ao);
      }
      if (q.bloom === 'on') {
        // high threshold: floodlight lamps, camera flashes and hot highlights only
        c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.45, 1.3));
      }
      if (q.grade === 'on') c.addPass(new ShaderPass(GradeShader));
      c.addPass(new OutputPass());
      if (q.antialias === 'smaa') {
        const smaa = new SMAAPass();
        smaa.setSize(pw, ph);
        c.addPass(smaa);
      }
      if (q.antialias === 'fxaa') {
        const fxaa = new ShaderPass(FXAAShader);
        fxaa.material.uniforms.resolution.value.set(1 / pw, 1 / ph);
        c.addPass(fxaa);
      }
      composer = c;
    } catch {
      // post-processing is an enhancement: render directly and say so in the panel
      postFailed = true;
      composer = null;
    }
  }

  // Adaptive resolution: step the render scale down when frames are slow, back up when fast.
  function adapt(dtMs) {
    frames.push(dtMs);
    if (frames.length < 90) return false;
    const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
    frames = [];
    fps = 1000 / avg;
    const el = document.getElementById('fps-meter');
    if (el && !el.hidden) el.textContent = `${Math.round(fps)} fps · ${Math.round(pixelRatio * 100) / 100}×`;
    if (!q.adaptive) {
      if (adaptiveScale !== 1) { adaptiveScale = 1; return true; }
      return false;
    }
    const before = adaptiveScale;
    if (avg > 26) adaptiveScale = Math.max(0.6, adaptiveScale - 0.1);
    else if (avg < 14 && adaptiveScale < 1) adaptiveScale = Math.min(1, adaptiveScale + 0.05);
    return before !== adaptiveScale;
  }

  function render(dt) {
    const rescale = adapt(Math.min(250, (dt || 0.016) * 1000));
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, q.cap) * q.scale * adaptiveScale;
    if (w !== size[0] || h !== size[1] || ratio !== pixelRatio || rescale) {
      size = [w, h];
      pixelRatio = ratio;
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h, false);
    }
    const key = q.post && !postFailed ? [q.ao, q.bloom, q.grade, q.antialias, w, h, pixelRatio].join('|') : 'none';
    if (key !== postKey) {
      postKey = key;
      buildPost(w, h);
    }
    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
  }

  apply();

  return {
    render,
    /** Raw saved settings (for the panel's selects). */
    saved: () => ({ ...saved }),
    resolved: () => q,
    detected,
    /** Patch saved settings; `value: undefined` removes a key (back to "From preset"). */
    save(patch) {
      saved = { ...saved, ...patch };
      for (const k of Object.keys(patch)) if (patch[k] === undefined) delete saved[k];
      persist();
      apply();
    },
    /** Choose a preset ('auto' or a PRESETS entry); clears per-category overrides. */
    setPreset(preset) {
      saved = choosePreset(saved, preset);
      persist();
      apply();
    },
    info(t) {
      const px = [Math.round(size[0] * pixelRatio), Math.round(size[1] * pixelRatio)];
      return {
        gpu: gpu || 'unknown GPU',
        detected,
        resolved: q,
        summary: describe(q, px, t),
        fps: Math.round(fps),
        adaptiveScale,
        postFailed,
      };
    },
  };
}
