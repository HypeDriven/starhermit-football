// The floodlit-stadium environment map for reflections (js/graphics.js
// buildEnvironment, which the browser renders with PMREMGenerator.fromScene):
// a night sky over dark stands and turf, four HDR floodlight banks up in the
// corners and the glowing ad-board ring. The host has no render-to-texture,
// so the same scene is written as a latitude-longitude image of linear light
// and prefiltered with PMREMGenerator.fromEquirectangular (the recipe the
// runtime's rendering track tested). Built once, a row band at a time when
// the call's fuel runs low; the stadium shows it at intensity 0.35 when the
// tier has Reflections on.
import { DataTexture, FloatType, PMREMGenerator, RGBAFormat } from "starhermit:scene";
import type { Texture } from "starhermit:scene";
import { sliced } from "../tasks.ts";

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

let env: Texture | null = null;
let building: Promise<Texture | null> | null = null;

/** The prefiltered environment (shared by every stadium), or null when the
 * host cannot make one. */
export function stadiumEnvironment(): Promise<Texture | null> {
  if (env) return Promise.resolve(env);
  building ??= build().catch((e: unknown) => {
    console.warn("stadium environment:", e instanceof Error ? e.message : String(e));
    building = null;
    return null;
  });
  return building;
}

async function build(): Promise<Texture | null> {
  const w = 256;
  const h = 128;
  const pixels = new Float32Array(w * h * 4);
  // the lamp banks: 9 × 4 boxes at (±30, 24, ±22) facing the centre
  const lamps: [number, number, number][] = [];
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as [number, number][]) {
    const v: [number, number, number] = [x * 30, 24, z * 22];
    const l = Math.hypot(v[0], v[1], v[2]);
    lamps.push([v[0] / l, v[1] / l, v[2] / l]);
  }
  const lampDistance = Math.hypot(30, 24, 22);
  const halfW = 4.5 / lampDistance;
  const halfH = 2 / lampDistance;
  await sliced(h, 1, (row) => {
    const lat = (0.5 - (row + 0.5) / h) * Math.PI;
    const y = Math.sin(lat);
    const cl = Math.cos(lat);
    for (let column = 0; column < w; column++) {
      // the middle column faces +X, a quarter to its right +Z
      const phi = ((column + 0.5) / w - 0.5) * 2 * Math.PI;
      const dx = cl * Math.cos(phi);
      const dz = cl * Math.sin(phi);
      let r: number;
      let g: number;
      let b: number;
      if (y > 0.18) {
        const t = smoothstep(0.05, 0.7, y);
        r = 0.03 + (0.004 - 0.03) * t;
        g = 0.045 + (0.006 - 0.045) * t;
        b = 0.08 + (0.014 - 0.08) * t;
      } else if (y > -0.05) {
        r = 0.02; g = 0.022; b = 0.03;
      } else {
        r = 0.03; g = 0.09; b = 0.035;
      }
      // the ad-board ring (radius 34, 1.2 high, its centre 1 below)
      if (y > -0.047 && y < -0.012) {
        r = 0.5; g = 0.7; b = 1.1;
      }
      for (const lamp of lamps) {
        // within the box seen from the centre (its width across, its height up)
        const dot = dx * lamp[0] + y * lamp[1] + dz * lamp[2];
        if (dot < 0.9) continue;
        const up = y - lamp[1] * dot;
        const across = Math.sqrt(Math.max(0, 1 - dot * dot - up * up));
        if (across < halfW && Math.abs(up) < halfH) {
          r = 14; g = 14; b = 15;
        }
      }
      const o = (row * w + column) * 4;
      pixels[o] = r;
      pixels[o + 1] = g;
      pixels[o + 2] = b;
      pixels[o + 3] = 1;
    }
  });
  const image = new DataTexture(pixels, w, h, RGBAFormat, FloatType);
  // the source stays: the environment is prefiltered from it off-thread
  env = new PMREMGenerator().fromEquirectangular(image).texture;
  return env;
}
