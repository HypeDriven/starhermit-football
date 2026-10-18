// The procedural night-match stadium (the browser's js/world/stadium.js):
// striped pitch with line markings, goals with nets, a two-tier seated bowl
// with an instanced animated crowd, floodlight towers with light cones, lamp
// glows and shadow-casting spotlights, scrolling LED boards, tunnel,
// dugouts, corner flags, camera flashes and haze (points), and the floodlit
// environment map for reflections. Everything is generated in code. The
// parts with a cost follow the runtime's quality tier through the game's own
// presets (logic/quality.ts over js/gfx.js): shadow-map size and the second
// caster, the grass and line texture sizes, the detailed pitch (with its
// mow-stripe normal map), crowd density and LOD, Lambert materials on Low,
// particles, reflections and bloom.
//
// The build and the texture rebuilds slice their work across frames when the
// running call's fuel runs low (tasks.ts).
import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  SpotLight,
  Sprite,
  SpriteMaterial,
  Vector3,
  renderer,
} from "starhermit:scene";
import type { CanvasTexture, Fog as FogType, FogExp2, Material, Scene, Texture } from "starhermit:scene";
import { budgets, usage } from "starhermit:engine";
import type { Vec3Like } from "../logic/math.ts";
import type { ContentQuality } from "../logic/quality.ts";
import { onQuality } from "../quality.ts";
import { reducedMotion } from "../prefs.ts";
import type { Pitch } from "../sim.ts";
import { breathe, lowOnFuel, nextFrame, sliced } from "../tasks.ts";
import { MAX_FLASHES, MAX_HAZE } from "../../../js/gfx.js";
import { reportLoading } from "../progress.ts";
import { stadiumEnvironment } from "./environment.ts";
import { ResourceBag, canvasTexture, makeCanvas } from "./resources.ts";

const DEFAULT_PITCH: Pitch = { L: 105, W: 68, goalW: 7.32, goalH: 2.44, boxD: 16.5, boxW: 40.32 };
const Y_AXIS = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);

// Bowl layout constants (meters).
const STAND_GAP = 9; // pitch edge -> stand front
const ROWS_T1 = 7; // lower tier rows
const ROWS_T2 = 9; // upper tier rows (scaled up on small pitches)
const ROW_DEPTH = 0.85;
const RISE_T1 = 0.5;
const RISE_T2 = 0.65;
const WALKWAY = 2.6; // between tiers
const WALL_H = 1.1; // front wall height
const SEAT_DX = 0.62; // seat spacing along a row
const CROWD_FILL = 0.8; // fraction of seats occupied

// three.js intensities (r155+ lights) divided by π: the host API's light
// convention (a white surface under intensity 1 shows its base color).
const SPOT_INTENSITY = 3.4 / Math.PI;
const FILL_INTENSITY = 1.7 / Math.PI;
const HEMI_NIGHT = 0.55 / Math.PI;
const HEMI_DAY = 1.05 / Math.PI;
const AMB_NIGHT = 0.35 / Math.PI;
const AMB_DAY = 0.6 / Math.PI;
const TOWER_H = 30;
/** three.js's UnrealBloomPass(strength 0.55, radius 0.45, threshold 1.3):
 * only over-bright light (lamp faces, flashes, hot highlights) blooms. */
const BLOOM = { threshold: 1.3, intensity: 0.55 };
/** The canvas pixel bound (8,388,608 per canvas). */
const MAX_CANVAS_PIXELS = 8388608;

export interface Stadium {
  /** `camera` is the scene camera's position (the tunnel fades when it
   * backs up over it). */
  update(dt: number, camera: Vec3Like): void;
  crowd: {
    setExcitement(level: number): void;
    pulse(strength: number): void;
    boo(strength: number): void;
  };
  setNight(isNight: boolean): void;
  /** Applies a quality tier's content (textures rebuild across frames). */
  applyQuality(q: ContentQuality): void;
  dispose(): void;
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Merges primitive geometries into one non-indexed geometry with position,
 * normal and uv (the browser's mergeGeoms), releasing the parts. One pass
 * expands each part's index straight into the merged arrays: the runtime's
 * toNonIndexed and computeBoundingSphere took 17 ms for the stands' 108
 * boxes, and the runtime never reads a geometry's bounding sphere. */
function mergeGeoms(geoms: BufferGeometry[]): BufferGeometry {
  let vCount = 0;
  for (const g of geoms) vCount += g.getIndex()?.count ?? g.getAttribute("position")!.count;
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  let v = 0;
  for (const g of geoms) {
    const p = g.getAttribute("position")!.array;
    const n = g.getAttribute("normal")?.array;
    const u = g.getAttribute("uv")?.array;
    const index = g.getIndex()?.array;
    const count = index ? index.length : p.length / 3;
    for (let i = 0; i < count; i++, v++) {
      const s = index ? index[i]! : i;
      const o = v * 3;
      const so = s * 3;
      pos[o] = p[so]!;
      pos[o + 1] = p[so + 1]!;
      pos[o + 2] = p[so + 2]!;
      if (n) {
        nor[o] = n[so]!;
        nor[o + 1] = n[so + 1]!;
        nor[o + 2] = n[so + 2]!;
      }
      if (u) {
        uv[v * 2] = u[s * 2]!;
        uv[v * 2 + 1] = u[s * 2 + 1]!;
      }
    }
    g.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute("position", new BufferAttribute(pos, 3));
  out.setAttribute("normal", new BufferAttribute(nor, 3));
  out.setAttribute("uv", new BufferAttribute(uv, 2));
  return out;
}

function box(list: BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.translate(x, y, z);
  list.push(g);
  return g;
}

// A net panel with explicit world-space corners, so +x and −x goals mirror.
function netQuad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, uMeters: number, vMeters: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z], 3));
  const cell = 0.14;
  g.setAttribute("uv", new Float32BufferAttribute([0, 0, uMeters / cell, 0, uMeters / cell, vMeters / cell, 0, vMeters / cell], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

function cylinderBetween(list: BufferGeometry[], a: Vector3, b: Vector3, radius = 0.04, segments = 8): void {
  const delta = b.clone().sub(a);
  const g = new CylinderGeometry(radius, radius, delta.length(), segments);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(Y_AXIS, delta.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  list.push(g);
}

/** A texture width that fits the canvas bound and, for `copies` images of
 * that size (with mipmaps), 60 % of what is left of the engine's texture
 * budget, halving from the preset's. */
function fitTextureWidth(want: number, aspect: number, copies = 1): number {
  let w = Math.min(want, 4096, Math.floor(Math.sqrt(MAX_CANVAS_PIXELS / aspect)));
  try {
    const free = budgets().textureBytes - usage().textureBytes;
    while (w > 512 && w * w * aspect * 4 * (4 / 3) * copies > free * 0.6) w = Math.floor(w / 2);
  } catch {
    // no budget figures: the bounds above stand
  }
  return w;
}

// ── procedural textures ─────────────────────────────────────────────────────

function makeSkyTexture(night: boolean): CanvasTexture {
  const [c, ctx] = makeCanvas(16, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  if (night) {
    g.addColorStop(0.0, "#010208");
    g.addColorStop(0.5, "#040914");
    g.addColorStop(0.78, "#0a1524");
    g.addColorStop(1.0, "#122036"); // faint horizon glow
  } else {
    g.addColorStop(0.0, "#2c4a70");
    g.addColorStop(0.6, "#54759c");
    g.addColorStop(1.0, "#a7bfd4");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  return canvasTexture(c);
}

/** Texture width `w` is the preset budget's `grass` (authored at 1024 px;
 * pixel constants scale with k). */
async function makeGrassTexture(L: number, W: number, detailed: boolean, w: number, alive: () => boolean): Promise<CanvasTexture | null> {
  const h = Math.max(2, Math.round((w * W) / L));
  const k = w / 1024;
  const [c, ctx] = makeCanvas(w, h);
  const bands = 16; // mow bands along the length (x axis)
  const bw = w / bands;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = i % 2 ? "#2f6d31" : "#2a602c";
    ctx.fillRect(Math.floor(i * bw), 0, Math.ceil(bw) + 1, h);
  }
  if (detailed) {
    // broad, soft turf variation so the pitch is not a flat print
    for (let i = 0; i < 90; i++) {
      if (i % 10 === 9 && lowOnFuel()) {
        await nextFrame();
        if (!alive()) return null;
      }
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = (30 + Math.random() * 110) * k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tint = Math.random() < 0.5 ? "70,120,40" : "10,40,15";
      g.addColorStop(0, `rgba(${tint},0.10)`);
      g.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // worn, lighter turf in the goalmouths, on the centre spot and the penalty spots
    const px = w / L;
    const wear = (mx: number, mz: number, rx: number, rz: number, a: number): void => {
      const x = (mx + L / 2) * px;
      const y = (mz + W / 2) * px;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, rz / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * px);
      g.addColorStop(0, `rgba(122,118,70,${a})`);
      g.addColorStop(0.6, `rgba(100,110,60,${a * 0.45})`);
      g.addColorStop(1, "rgba(100,110,60,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-rx * px, -rx * px, rx * px * 2, rx * px * 2);
      ctx.restore();
    };
    for (const side of [-1, 1]) {
      wear(side * (L / 2 - 2.2), 0, 4.5, 3.2, 0.42);
      wear(side * (L / 2 - 8), 0, 5, 7, 0.14);
      wear(side * (L / 2 - Math.min(11, L * 0.1)), 0, 1.2, 1.2, 0.3);
    }
    wear(0, 0, 3, 3, 0.25);
  }
  // per-pixel grass grain noise, a band of rows at a time
  const rows = 4;
  for (let y0 = 0; y0 < h; y0 += rows) {
    if (!alive()) return null;
    const rh = Math.min(rows, h - y0);
    const img = ctx.getImageData(0, y0, w, rh);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 15;
      d[i] = d[i]! + n * 0.8;
      d[i + 1] = d[i + 1]! + n * 1.2;
      d[i + 2] = d[i + 2]! + n * 0.8;
    }
    ctx.putImageData(img, 0, y0);
    reportLoading(0.35 + (0.28 * y0) / h);
    if (lowOnFuel()) await nextFrame();
  }
  // sparse lighter/darker flecks for extra texture
  const flecks = Math.round((detailed ? 9000 : 2600) * k * k);
  await sliced(flecks, 200, () => {
    const a = Math.random() * 0.05;
    ctx.fillStyle = Math.random() < 0.5 ? `rgba(255,255,240,${a})` : `rgba(0,20,0,${a})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2 * k, 2 * k);
  }, alive);
  return alive() ? canvasTexture(c) : null;
}

/** The detailed pitch's normal map (the browser's makeGrassNormal): the mow
 * bands tilt alternately along the length (the stripes' sheen under the
 * floodlights) over per-pixel blade relief. Same size as the grass texture;
 * rows are made a band at a time when the call's fuel runs low. */
async function makeGrassNormal(L: number, W: number, w: number, alive: () => boolean): Promise<DataTexture | null> {
  const h = Math.max(2, Math.round((w * W) / L));
  const d = new Uint8Array(w * h * 4);
  const bw = w / 16;
  // random heights, wrapping at the edges as the browser's
  const first = new Float32Array(w);
  for (let x = 0; x < w; x++) first[x] = Math.random();
  let row = first;
  for (let y = 0; y < h; y++) {
    const next = y + 1 < h ? new Float32Array(w) : first;
    if (next !== first) for (let x = 0; x < w; x++) next[x] = Math.random();
    for (let x = 0; x < w; x++) {
      const band = Math.floor(x / bw) % 2 ? 1 : -1;
      const hx = row[(x + 1) % w]! - row[x]!;
      const hy = next[x]! - row[x]!;
      const nx = band * 0.22 - hx * 0.35;
      const ny = -hy * 0.35;
      const len = Math.sqrt(nx * nx + ny * ny + 1);
      const o = (y * w + x) * 4;
      d[o] = ((nx / len) * 0.5 + 0.5) * 255;
      d[o + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      d[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      d[o + 3] = 255;
    }
    row = next;
    reportLoading(0.65 + (0.3 * y) / h);
    if (lowOnFuel()) {
      await nextFrame();
      if (!alive()) return null;
    }
  }
  const tex = new DataTexture(d, w, h);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** The markings at `Wpx` pixels across the pitch's length. They are
 * symmetric about both halfway lines, so the canvas holds one corner
 * quarter (corner at the image's bottom-left, centre spot at its top-right)
 * and the texture mirrors it twice each way: Ultra's 4096 px markings fit a
 * 2048-px canvas and a quarter of the memory. */
function makeLinesTexture(p: Pitch, Wpx: number): CanvasTexture {
  const L = p.L;
  const W = p.W;
  const goalW = p.goalW;
  const boxD = Math.min(p.boxD, L * 0.25);
  const boxW = Math.min(p.boxW, W * 0.8);
  const gbD = boxD * 0.55; // six-yard box
  const gbW = Math.max(goalW + 2, boxW * 0.45);
  const spotD = boxD * 0.67; // penalty spot distance
  const circR = Math.min(9.15, L * 0.09, W / 2 - 1.5);
  const penR = circR;

  const w = Math.max(2, Math.round(Wpx / 2));
  const h = Math.max(2, Math.round((Wpx * W) / L / 2));
  const [c, ctx] = makeCanvas(w, h);
  const s = w / (L / 2); // px per meter
  // canvas x from the goal line (0) to the halfway line (w); canvas y from
  // the long axis through the spots (0) to the touchline (h)
  const X = (fromGoal: number): number => fromGoal * s;
  const Y = (fromMiddle: number): number => fromMiddle * s;
  const lw = Math.max(2, 0.12 * s);

  ctx.strokeStyle = "#f5f8f5";
  ctx.fillStyle = "#f5f8f5";
  ctx.lineWidth = lw;
  ctx.lineCap = "round";

  const dot = (x: number, y: number, r: number): void => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const seg = (x0: number, y0: number, x1: number, y1: number): void => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };

  // boundary (inset half a line width so it stays on the plane)
  seg(lw / 2, -lw, lw / 2, h - lw / 2); // goal line
  seg(lw / 2, h - lw / 2, w + lw, h - lw / 2); // touchline
  seg(w, -lw, w, h + lw); // halfway line, half of it (the mirror draws the rest)
  ctx.beginPath();
  ctx.arc(w, 0, circR * s, 0, Math.PI * 2); // centre circle
  ctx.stroke();
  dot(w, 0, lw * 0.85); // centre spot

  ctx.strokeRect(0, -Y(boxW / 2), X(boxD), Y(boxW)); // penalty box
  ctx.strokeRect(0, -Y(gbW / 2), X(gbD), Y(gbW)); // goal box
  const spx = X(spotD);
  dot(spx, 0, lw * 0.85); // penalty spot
  // penalty arc (part of the spot-circle outside the box)
  const cosA = Math.min(1, Math.max(-1, (boxD - spotD) / penR));
  const a = Math.acos(cosA);
  ctx.beginPath();
  ctx.arc(spx, 0, penR * s, -a, a);
  ctx.stroke();

  // corner arc (a 1 m quarter circle)
  const cr = Math.min(1, W * 0.02) * s;
  ctx.beginPath();
  ctx.arc(0, h, cr, -Math.PI / 2, 0);
  ctx.stroke();
  const tex = canvasTexture(c);
  tex.wrapS = MirroredRepeatWrapping;
  tex.wrapT = MirroredRepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function makeNetTexture(): CanvasTexture {
  const [c, ctx] = makeCanvas(64, 64);
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = "rgba(228,234,238,0.95)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(2, 0); ctx.lineTo(2, 64);
  ctx.moveTo(0, 2); ctx.lineTo(64, 2);
  ctx.stroke();
  const tex = canvasTexture(c);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  return tex;
}

// Soft round sprite for floodlight glow, camera flashes and haze.
function makeGlowTexture(): CanvasTexture {
  const [c, ctx] = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return canvasTexture(c);
}

function makeLedTexture(): CanvasTexture {
  const [c, ctx] = makeCanvas(2048, 128);
  const sponsors: [string, string, string][] = [
    ["STARHERMIT", "#0d1f4b", "#8fd4ff"],
    ["VELOCE", "#7a1020", "#ffd9a0"],
    ["NORDWIND", "#0b3d2e", "#c8ffe8"],
    ["KITE SPORTS", "#3d2c06", "#ffe98a"],
  ];
  const segW = 512;
  sponsors.forEach(([word, bg, fg], i) => {
    const x = i * segW;
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, bg);
    g.addColorStop(1, "#04060e");
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, segW, 128);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "italic 900 72px sans-serif"; // the browser's Arial, Helvetica (generic families only)
    ctx.fillText(word, x + segW / 2, 56);
    ctx.globalAlpha = 0.65;
    ctx.font = "700 22px sans-serif";
    ctx.fillText("OFFICIAL CLUB PARTNER", x + segW / 2, 102);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(x, 0, 3, 128);
  });
  const tex = canvasTexture(c);
  tex.wrapS = RepeatWrapping;
  tex.repeat.set(8, 1);
  return tex;
}

function makeLampTexture(): CanvasTexture {
  const [c, ctx] = makeCanvas(256, 128);
  ctx.fillStyle = "#090c11";
  ctx.fillRect(0, 0, 256, 128);
  for (let r = 0; r < 3; r++) {
    for (let col = 0; col < 6; col++) {
      const x = 24 + col * 42;
      const y = 22 + r * 42;
      const g = ctx.createRadialGradient(x, y, 1, x, y, 18);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.35, "#d6e6ff");
      g.addColorStop(1, "rgba(15,25,45,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return canvasTexture(c);
}

function makeSignTexture(): CanvasTexture {
  const [c, ctx] = makeCanvas(512, 96);
  ctx.fillStyle = "#0d1f4b";
  ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = "#8fd4ff";
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 504, 88);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 52px sans-serif";
  // the browser's "★ STARHERMIT FC ★", with the stars drawn as paths (the
  // host's built-in font has no ★)
  const text = "STARHERMIT FC";
  // fit the line (the system's sans-serif may be wider than Arial)
  const k = Math.min(1, 480 / (ctx.measureText(text).width + 2 * ctx.measureText(" ").width + 80));
  ctx.font = `900 ${Math.floor(52 * k)}px sans-serif`;
  ctx.fillText(text, 256, 50);
  const half = ctx.measureText(text).width / 2;
  const gap = ctx.measureText(" ").width;
  const r = 20 * k;
  const star = (cx: number, cy: number, r: number): void => {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? r * 0.4 : r;
      if (k) ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  };
  star(256 - half - gap - r, 48, r);
  star(256 + half + gap + r, 48, r);
  return canvasTexture(c);
}

// ── main builder ────────────────────────────────────────────────────────────

/** Builds the stadium into `scene` over several frames at quality `q`;
 * `alive` turning false (the owner was disposed) abandons the build. */
export async function buildStadium(scene: Scene, pitch: Pitch | null, q: ContentQuality, alive: () => boolean): Promise<Stadium | null> {
  const p: Pitch = { ...DEFAULT_PITCH, ...(pitch ?? {}) };
  const L = p.L;
  const W = p.W;
  const goalW = Math.min(p.goalW, W - 2);
  const goalH = p.goalH;
  const bag = new ResourceBag();
  const abandon = (): null => {
    bag.dispose();
    return null;
  };

  const root = new Group();
  root.name = "stadium";
  const prevBackground = scene.background;
  const prevEnvironment = scene.environment;
  let wantEnvironment = false;
  let envShown: Texture | null = null;
  const prevFog: FogType | FogExp2 | null = scene.fog;

  const mesh = (geometry: BufferGeometry, material: MeshStandardMaterial | MeshBasicMaterial): Mesh => {
    bag.add(geometry);
    bag.add(material);
    return new Mesh(geometry, material);
  };

  // ── sky + fog ──
  const skyTexNight = bag.add(makeSkyTexture(true));
  const skyTexDay = bag.add(makeSkyTexture(false));
  const background = new Color(0x04060d);
  const skyMat = new MeshBasicMaterial({ map: skyTexNight, side: BackSide, fog: false, depthWrite: false });
  const sky = mesh(new SphereGeometry(380, 24, 14), skyMat);
  sky.renderOrder = -10;
  root.add(sky);
  const fog = new Fog(0x070d18, 130, 420);

  // ── ground planes: far apron, run-off ring, pitch grass, line markings ──
  const ground = mesh(new PlaneGeometry(L + 90, W + 90), new MeshStandardMaterial({ color: 0x0c100d, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  root.add(ground);

  const runoff = mesh(new PlaneGeometry(L + 17, W + 17), new MeshStandardMaterial({ color: 0x14211a, roughness: 1 }));
  runoff.rotation.x = -Math.PI / 2;
  runoff.position.y = -0.01;
  runoff.receiveShadow = true;
  root.add(runoff);

  // Grass and line textures are built at the preset budget's size by
  // applyQuality (rebuilt when the tier changes).
  // One grass texture at a time (plain, or detailed with its normal map):
  // Ultra's 2048-px pair, the plain one and the markings would not fit the
  // texture budget together. Switching rebuilds.
  let grassTex: CanvasTexture | null = null;
  let grassNormalTex: DataTexture | null = null;
  let grassDetailed = false;
  const grassMat = new MeshStandardMaterial({ roughness: 0.95 });
  const grass = mesh(new PlaneGeometry(L + 0.6, W + 0.6), grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = 0.02;
  grass.receiveShadow = true;
  root.add(grass);

  let linesTex: CanvasTexture | null = null;
  let linesSize = 0;
  const disposeTextures = (): void => {
    grassTex?.dispose();
    grassNormalTex?.dispose();
    linesTex?.dispose();
  };
  const linesMat = new MeshStandardMaterial({
    transparent: true,
    roughness: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const lines = mesh(new PlaneGeometry(L, W), linesMat);
  lines.rotation.x = -Math.PI / 2;
  lines.position.y = 0.045;
  lines.receiveShadow = true;
  lines.renderOrder = 1;
  root.add(lines);
  reportLoading(0.04);
  await breathe();

  // ── goals (mirrored trapezoid nets, wholly behind each goal line) ──
  // Team 0 begins at the west (−x) goal and team 1 at the east (+x) goal.
  const frameGeoms: BufferGeometry[][] = [[], []];
  const netGeoms: BufferGeometry[] = [];
  const netDepth = Math.min(2.4, Math.max(1.6, goalH * 0.9));
  const rearH = goalH * 0.82;
  const halfW = goalW / 2;
  const groundY = 0.045;
  const v3 = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
  for (const sign of [-1, 1]) {
    const fg = frameGeoms[sign < 0 ? 0 : 1]!;
    const goalX = (sign * L) / 2; // posts sit on the goal line
    const netFrontX = goalX + sign * 0.07; // net begins behind the frame
    const rearX = goalX + sign * netDepth; // never projects onto the pitch
    for (const zSign of [-1, 1]) {
      cylinderBetween(fg, v3(goalX, 0.03, zSign * halfW), v3(goalX, goalH, zSign * halfW), 0.06, 12);
    }
    cylinderBetween(fg, v3(goalX, goalH, -halfW), v3(goalX, goalH, halfW), 0.06, 12);
    // rear support and the two depth rails; the lower rear roof sags the net
    for (const zSign of [-1, 1]) {
      cylinderBetween(fg, v3(rearX, groundY, zSign * halfW), v3(rearX, rearH, zSign * halfW));
      cylinderBetween(fg, v3(goalX, groundY, zSign * halfW), v3(rearX, groundY, zSign * halfW));
      cylinderBetween(fg, v3(goalX, goalH, zSign * halfW), v3(rearX, rearH, zSign * halfW));
    }
    cylinderBetween(fg, v3(rearX, rearH, -halfW), v3(rearX, rearH, halfW));
    cylinderBetween(fg, v3(rearX, groundY, -halfW), v3(rearX, groundY, halfW));
    netGeoms.push(netQuad(v3(rearX, groundY, -halfW), v3(rearX, groundY, halfW), v3(rearX, rearH, halfW), v3(rearX, rearH, -halfW), goalW, rearH));
    netGeoms.push(netQuad(v3(netFrontX, goalH, -halfW), v3(netFrontX, goalH, halfW), v3(rearX, rearH, halfW), v3(rearX, rearH, -halfW), goalW, netDepth));
    for (const zSign of [-1, 1]) {
      netGeoms.push(netQuad(
        v3(netFrontX, groundY, zSign * halfW), v3(rearX, groundY, zSign * halfW),
        v3(rearX, rearH, zSign * halfW), v3(netFrontX, goalH, zSign * halfW), netDepth, goalH));
    }
  }
  const goalTints = [0x76a9df, 0xe98278]; // blue west goal, red east goal
  for (let team = 0; team < 2; team++) {
    const goalFrames = mesh(mergeGeoms(frameGeoms[team]!), new MeshStandardMaterial({ color: goalTints[team]!, roughness: 0.4, metalness: 0.15 }));
    goalFrames.name = team === 0 ? "blue-goal-frame" : "red-goal-frame";
    goalFrames.castShadow = true;
    root.add(goalFrames);
  }
  const netMesh = mesh(mergeGeoms(netGeoms), new MeshStandardMaterial({
    map: bag.add(makeNetTexture()), color: 0xdfe6ea, alphaTest: 0.3, side: DoubleSide, roughness: 0.9,
  }));
  root.add(netMesh);
  reportLoading(0.08);
  await breathe();
  if (!alive()) return abandon();

  // ── stadium bowl: two tiers on four sides + instanced seats + crowd ──
  // Small pitches get a taller, denser bowl so the crowd stays ~6–10k.
  const rowsT1 = Math.min(12, Math.max(ROWS_T1, Math.round((ROWS_T1 * 68) / W)));
  const rowsT2 = Math.min(16, Math.max(ROWS_T2, Math.round((ROWS_T2 * 68) / W)));
  const standGeoms: BufferGeometry[] = [];
  const seatCoords: number[] = []; // flat [x, stepTopY, z, ...]
  const sides = [
    { len: L + 18, edge: W / 2 + STAND_GAP, rot: 0, tunnel: false }, // south
    { len: L + 18, edge: W / 2 + STAND_GAP, rot: Math.PI, tunnel: false }, // north
    { len: W + 18, edge: L / 2 + STAND_GAP, rot: Math.PI / 2, tunnel: false }, // east
    { len: W + 18, edge: L / 2 + STAND_GAP, rot: -Math.PI / 2, tunnel: true }, // west (tunnel)
  ];
  for (const s of sides) {
    const rows: { z: number; top: number; tier: number }[] = [];
    for (let i = 0; i < rowsT1; i++) rows.push({ z: s.edge + i * ROW_DEPTH + ROW_DEPTH / 2, top: WALL_H + (i + 1) * RISE_T1, tier: 1 });
    const z2 = s.edge + rowsT1 * ROW_DEPTH + WALKWAY;
    const base2 = WALL_H + rowsT1 * RISE_T1 + 1.5;
    for (let i = 0; i < rowsT2; i++) rows.push({ z: z2 + i * ROW_DEPTH + ROW_DEPTH / 2, top: base2 + (i + 1) * RISE_T2, tier: 2 });
    const local: BufferGeometry[] = [];
    box(local, s.len, WALL_H + 0.7, 0.4, 0, (WALL_H + 0.7) / 2, s.edge - 0.2); // front wall
    for (const r of rows) box(local, s.len, r.top, ROW_DEPTH, 0, r.top / 2, r.z);
    const last = rows[rows.length - 1]!;
    box(local, s.len, last.top + 1.2, 0.4, 0, (last.top + 1.2) / 2, last.z + ROW_DEPTH / 2 + 0.2); // back wall
    for (const g of local) {
      g.rotateY(s.rot);
      standGeoms.push(g);
    }
    // seat positions on each step (local frame -> world, about +y)
    const nSeats = Math.floor((s.len - 2.4) / SEAT_DX);
    const x0 = (-(nSeats - 1) * SEAT_DX) / 2;
    const cos = Math.cos(s.rot);
    const sin = Math.sin(s.rot);
    for (const r of rows) {
      for (let k = 0; k < nSeats; k++) {
        if (k % 27 === 13) continue; // stair aisle
        const x = x0 + k * SEAT_DX;
        if (s.tunnel && r.tier === 1 && Math.abs(x) < 3.8) continue; // tunnel opening
        seatCoords.push(x * cos + r.z * sin, r.top, -x * sin + r.z * cos);
      }
    }
    reportLoading(0.1);
    await breathe();
  }
  const stands = mesh(mergeGeoms(standGeoms), new MeshStandardMaterial({ color: 0x181c23, roughness: 0.95 }));
  root.add(stands);
  // Material class per preset budget: Lambert twins on Low for the stands,
  // seats and crowd (each entry: the mesh, its [standard, Lambert] pair).
  const lambertSwap: [Mesh, [Material, Material]][] = [];
  let lambertOn = false;
  const lambertTwin = (m: Mesh): void => {
    const base = m.material as MeshStandardMaterial;
    lambertSwap.push([m, [base, bag.add(new MeshLambertMaterial({ color: base.color.clone() }))]]);
  };
  lambertTwin(stands);
  if (!alive()) return abandon();

  // seats: translation matrices and colors written straight into the
  // instance attributes, sent in one host call
  const nSeatPos = seatCoords.length / 3;
  const seatMesh = new InstancedMesh(bag.add(new BoxGeometry(0.44, 0.46, 0.4)), bag.add(new MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 })), nSeatPos);
  {
    const col = new Color();
    seatMesh.setColorAt(0, col);
    const m = seatMesh.instanceMatrix.array as Float32Array;
    const c = seatMesh.instanceColor!.array as Float32Array;
    await sliced(nSeatPos, 200, (i) => {
      if (i % 200 === 0) reportLoading(0.12 + (0.08 * i) / nSeatPos);
      const o = i * 16;
      m[o] = 1; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = 1; m[o + 11] = 0;
      m[o + 12] = seatCoords[i * 3]!; m[o + 13] = seatCoords[i * 3 + 1]! + 0.22; m[o + 14] = seatCoords[i * 3 + 2]!; m[o + 15] = 1;
      if (Math.random() < 0.12) col.setHex(0x7e2233); // away-fan section splash
      else col.setHSL(0.62, 0.42, 0.15 + Math.random() * 0.08);
      c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
    }, alive);
    seatMesh.instanceMatrix.needsUpdate = true;
    seatMesh.instanceColor!.needsUpdate = true;
  }
  root.add(seatMesh);
  if (!alive()) return abandon();

  // crowd (subset of seats, shuffled so a "sparse" crowd — the first half —
  // is spread evenly), with per-instance animation data
  const crowdIdx: number[] = [];
  for (let i = 0; i < nSeatPos; i++) if (Math.random() < CROWD_FILL) crowdIdx.push(i);
  for (let i = crowdIdx.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = crowdIdx[i]!;
    crowdIdx[i] = crowdIdx[j]!;
    crowdIdx[j] = tmp;
  }
  const cN = crowdIdx.length;
  const sparseN = Math.ceil(cN * 0.5);
  const baseX = new Float32Array(cN);
  const baseY = new Float32Array(cN);
  const baseZ = new Float32Array(cN);
  const phase = new Float32Array(cN);
  const freqV = new Float32Array(cN);
  const ampV = new Float32Array(cN);
  let crowdBody = `${q.body[0]},${q.body[1]}`;
  let crowdGeo: BufferGeometry = new CapsuleGeometry(0.17, 0.5, q.body[0], q.body[1]);
  const crowdMat = bag.add(new MeshStandardMaterial({ roughness: 0.9 }));
  const crowdMesh = new InstancedMesh(crowdGeo, crowdMat, Math.max(1, cN));
  const carr = crowdMesh.instanceMatrix.array as Float32Array;
  {
    const JACKETS = [0x22242c, 0x2e3138, 0x39404e, 0x1d2833, 0x2c3a2f, 0x41352b, 0x4b4b55, 0x2a2320];
    const SPLASH = [0xc23b3b, 0x2f5fd0, 0xe6e2d8, 0xd8a02c, 0x3f9e4d];
    const col = new Color();
    crowdMesh.setColorAt(0, col);
    const ccol = crowdMesh.instanceColor!.array as Float32Array;
    await sliced(cN, 200, (i) => {
      if (i % 200 === 0) reportLoading(0.2 + (0.1 * i) / cN);
      const si = crowdIdx[i]!;
      const x = seatCoords[si * 3]!;
      const y = seatCoords[si * 3 + 1]! + 0.62;
      const z = seatCoords[si * 3 + 2]!;
      baseX[i] = x; baseY[i] = y; baseZ[i] = z;
      phase[i] = Math.random() * Math.PI * 2;
      freqV[i] = 0.85 + Math.random() * 0.3;
      ampV[i] = 0.7 + Math.random() * 0.6;
      // yaw × scale, as three.js's compose of Euler(0, yaw, 0) and (s, s·k, s)
      const yaw = Math.random() * Math.PI * 2;
      const s = 0.88 + Math.random() * 0.22;
      const sy = s * (0.92 + Math.random() * 0.16);
      const a = Math.cos(yaw) * s;
      const b = Math.sin(yaw) * s;
      const o = i * 16;
      carr[o] = a; carr[o + 1] = 0; carr[o + 2] = -b; carr[o + 3] = 0;
      carr[o + 4] = 0; carr[o + 5] = sy; carr[o + 6] = 0; carr[o + 7] = 0;
      carr[o + 8] = b; carr[o + 9] = 0; carr[o + 10] = a; carr[o + 11] = 0;
      carr[o + 12] = x; carr[o + 13] = y; carr[o + 14] = z; carr[o + 15] = 1;
      if (Math.random() < 0.16) col.setHex(SPLASH[(Math.random() * SPLASH.length) | 0]!);
      else col.setHex(JACKETS[(Math.random() * JACKETS.length) | 0]!);
      ccol[i * 3] = col.r; ccol[i * 3 + 1] = col.g; ccol[i * 3 + 2] = col.b;
    }, alive);
    crowdMesh.instanceMatrix.needsUpdate = true;
    crowdMesh.instanceColor!.needsUpdate = true;
  }
  root.add(crowdMesh);
  lambertTwin(seatMesh);
  lambertTwin(crowdMesh);
  await breathe();
  if (!alive()) {
    crowdGeo.dispose();
    return abandon();
  }

  // ── floodlights: 4 corner towers, emissive lamp heads, light cones ──
  const poleGeoms: BufferGeometry[] = [];
  const headGeoms: BufferGeometry[] = [];
  const coneGeoms: BufferGeometry[] = [];
  const corners: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [cx, cz] of corners) {
    const tx = cx * (L / 2 + 22);
    const tz = cz * (W / 2 + 22);
    const pole = new CylinderGeometry(0.45, 0.85, TOWER_H, 10);
    pole.translate(tx, TOWER_H / 2, tz);
    poleGeoms.push(pole);
    const cross = new CylinderGeometry(0.18, 0.18, 5.4, 8);
    cross.rotateX(Math.PI / 2);
    cross.rotateY(Math.atan2(tx, tz));
    cross.translate(tx, TOWER_H - 2, tz);
    poleGeoms.push(cross);
    // lamp head aimed at the pitch centre
    const yaw = Math.atan2(-tx, -tz);
    const tilt = Math.atan2(TOWER_H, Math.hypot(tx, tz));
    const head = new BoxGeometry(5.2, 2.6, 0.5);
    head.rotateX(tilt * 0.85);
    head.rotateY(yaw);
    head.translate(tx, TOWER_H + 1.2, tz);
    headGeoms.push(head);
    // volumetric-style cone, apex at the head, opening toward the pitch
    const headPos = new Vector3(tx, TOWER_H + 1.2, tz);
    const dir = new Vector3(cx * L * 0.15, 0, cz * W * 0.15).sub(headPos);
    const len = dir.length();
    const cone = new ConeGeometry(len * 0.3, len, 20, 1, true);
    cone.translate(0, -len / 2, 0); // apex at local origin
    cone.applyQuaternion(new Quaternion().setFromUnitVectors(DOWN, dir.normalize()));
    cone.translate(headPos.x, headPos.y, headPos.z);
    coneGeoms.push(cone);
  }
  const poles = mesh(mergeGeoms(poleGeoms), new MeshStandardMaterial({ color: 0x15181d, roughness: 0.8, metalness: 0.3 }));
  root.add(poles);
  const lampMat = new MeshStandardMaterial({
    color: 0x11141a, emissive: 0xffffff, emissiveMap: bag.add(makeLampTexture()), emissiveIntensity: 2.4, roughness: 0.6,
  });
  const heads = mesh(mergeGeoms(headGeoms), lampMat);
  root.add(heads);
  const coneMesh = mesh(mergeGeoms(coneGeoms), new MeshBasicMaterial({
    color: 0xaac8ff, transparent: true, opacity: 0.028, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false,
  }));
  coneMesh.renderOrder = 8;
  root.add(coneMesh);
  reportLoading(0.32);
  await breathe();

  // bright glow on each lamp bank (HDR, so bloom picks it up when on)
  const glowTex = bag.add(makeGlowTexture());
  const glowMat = bag.add(new SpriteMaterial({
    map: glowTex, color: new Color(1.5, 1.55, 1.7), blending: AdditiveBlending, depthWrite: false, transparent: true, fog: false,
  }));
  const lampGlows: Sprite[] = [];
  for (const [cx, cz] of corners) {
    const tx = cx * (L / 2 + 22);
    const tz = cz * (W / 2 + 22);
    const glow = new Sprite(glowMat);
    const toward = new Vector3(-tx, -TOWER_H, -tz).normalize().multiplyScalar(1.2);
    glow.position.set(tx + toward.x, TOWER_H + 1.2 + toward.y, tz + toward.z);
    glow.scale.setScalar(5.5);
    glow.renderOrder = 9;
    root.add(glow);
    lampGlows.push(glow);
  }

  // ── lights: one shadow-casting spot + corner fills + ambient/hemisphere ──
  const spot = new SpotLight(0xf2f6ff, SPOT_INTENSITY, 0, 0.75, 0.45, 0);
  spot.position.set(L / 2 + 22, TOWER_H + 1, W / 2 + 22);
  spot.target.position.set(0, 0, 0);
  spot.castShadow = true;
  spot.shadow.mapSize = 2048;
  spot.shadow.bias = -0.0004;
  root.add(spot);
  root.add(spot.target);
  // Fit a spot's shadow frustum to the pitch (plus the goals and a margin) so
  // every shadow-map texel lands on the play area instead of the stands.
  const fitShadow = (light: SpotLight): void => {
    const pos = light.position;
    const dir = light.target.position.clone().sub(pos).normalize();
    let maxA = 0;
    let near = Infinity;
    let far = 0;
    const v = new Vector3();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, 3]) {
      v.set(sx * (L / 2 + 4), y, sz * (W / 2 + 3)).sub(pos);
      const dist = v.length();
      near = Math.min(near, dist);
      far = Math.max(far, dist);
      maxA = Math.max(maxA, Math.acos(Math.min(1, Math.max(-1, dir.dot(v) / dist)))); // three.js angleTo
    }
    light.shadow.focus = Math.min(1, Math.max(0.3, (maxA * 1.04) / light.angle));
    light.shadow.camera.near = Math.max(1, near * 0.7);
    light.shadow.camera.far = far * 1.1;
  };
  fitShadow(spot);
  const setShadow = (light: SpotLight, size: number): void => {
    light.castShadow = size > 0;
    if (size > 0) light.shadow.mapSize = size;
  };
  const fillSpots: SpotLight[] = [];
  for (const [cx, cz] of [[1, -1], [-1, 1], [-1, -1]] as [number, number][]) {
    const f = new SpotLight(0xe8f0ff, FILL_INTENSITY, 0, 0.75, 0.6, 0);
    f.position.set(cx * (L / 2 + 22), TOWER_H + 1, cz * (W / 2 + 22));
    f.target.position.set(0, 0, 0);
    root.add(f);
    root.add(f.target);
    fillSpots.push(f);
  }
  // the opposite tower also casts at the top shadow tier: the classic
  // floodlit double shadow under every player
  const spot2 = fillSpots[2]!;
  spot2.shadow.bias = -0.0004;
  fitShadow(spot2);
  const hemi = new HemisphereLight(0x8fb4e8, 0x0e1a12, HEMI_NIGHT);
  const amb = new AmbientLight(0x223048, AMB_NIGHT);
  root.add(hemi);
  root.add(amb);

  await breathe();

  // ── LED advertising boards ringing the pitch ──
  const ledTex = bag.add(makeLedTexture());
  const ledGeoms: BufferGeometry[] = [];
  const bh = 0.9;
  const ledOff = 3.2;
  box(ledGeoms, L + 8, bh, 0.18, 0, bh / 2, W / 2 + ledOff);
  box(ledGeoms, L + 8, bh, 0.18, 0, bh / 2, -(W / 2 + ledOff));
  box(ledGeoms, 0.18, bh, W + 8, L / 2 + ledOff, bh / 2, 0);
  const segLen = (W + 8 - 9) / 2; // west end split for the tunnel
  box(ledGeoms, 0.18, bh, segLen, -(L / 2 + ledOff), bh / 2, 4.5 + segLen / 2);
  box(ledGeoms, 0.18, bh, segLen, -(L / 2 + ledOff), bh / 2, -(4.5 + segLen / 2));
  // slightly over-driven so the boards still read as lit LEDs
  const ledBoards = mesh(mergeGeoms(ledGeoms), new MeshBasicMaterial({ map: ledTex, color: new Color(1.35, 1.35, 1.35) }));
  root.add(ledBoards);

  // ── tunnel behind the west (−x) goal ──
  const tunW = 6.4;
  const tunH = 3.3;
  const tunD = STAND_GAP + 4;
  const tunX = -L / 2 - 1.2 - tunD / 2;
  const tunGeoms: BufferGeometry[] = [];
  box(tunGeoms, tunD, tunH, 0.5, tunX, tunH / 2, -tunW / 2);
  box(tunGeoms, tunD, tunH, 0.5, tunX, tunH / 2, tunW / 2);
  box(tunGeoms, tunD + 0.4, 0.5, tunW + 0.8, tunX, tunH + 0.25, 0);
  box(tunGeoms, 0.5, tunH, tunW, tunX - tunD / 2 + 0.25, tunH / 2, 0);
  const tunnelMat = new MeshStandardMaterial({ color: 0x20242b, roughness: 0.9 });
  const tunnel = mesh(mergeGeoms(tunGeoms), tunnelMat);
  tunnel.castShadow = true;
  root.add(tunnel);
  const tunnelDarkMat = new MeshBasicMaterial({ color: 0x010203 });
  const tunnelDark = mesh(new PlaneGeometry(tunW - 0.6, tunH - 0.3), tunnelDarkMat);
  tunnelDark.rotateY(Math.PI / 2);
  tunnelDark.position.set(tunX - tunD / 2 + 0.56, (tunH - 0.3) / 2, 0);
  root.add(tunnelDark);
  let tunnelFade = 1;
  const tunnelSign = mesh(new PlaneGeometry(5.4, 1.0), new MeshBasicMaterial({ map: bag.add(makeSignTexture()), color: new Color(1.25, 1.25, 1.25) }));
  tunnelSign.rotateY(Math.PI / 2);
  tunnelSign.position.set(-L / 2 - 1.05, tunH + 0.9, 0);
  root.add(tunnelSign);

  await breathe();

  // ── dugouts on the south (+z) touchline ──
  const dugGeoms: BufferGeometry[] = [];
  for (const dx of [-7.5, 7.5]) {
    const dz = W / 2 + 5.2;
    box(dugGeoms, 5, 0.15, 1.9, dx, 0.07, dz); // base
    box(dugGeoms, 5, 2.1, 0.12, dx, 1.05, dz + 0.9); // back wall
    box(dugGeoms, 5.3, 0.12, 2.2, dx, 2.15, dz); // roof
    box(dugGeoms, 0.12, 2.1, 1.9, dx - 2.5, 1.05, dz); // side
    box(dugGeoms, 0.12, 2.1, 1.9, dx + 2.5, 1.05, dz); // side
    box(dugGeoms, 4.6, 0.45, 0.4, dx, 0.35, dz + 0.5); // bench
  }
  const dugouts = mesh(mergeGeoms(dugGeoms), new MeshStandardMaterial({ color: 0x1c2026, roughness: 0.9 }));
  dugouts.castShadow = true;
  root.add(dugouts);

  // ── corner flags (poles merged; flag planes wave in update) ──
  const flagPoleGeoms: BufferGeometry[] = [];
  const flagMeshes: Mesh[] = [];
  const flagBaseRot: number[] = [];
  const flagMat = bag.add(new MeshBasicMaterial({ color: 0xd23c3c, side: DoubleSide }));
  const flagGeo = bag.add(new PlaneGeometry(0.42, 0.3).translate(0.21, 0, 0)); // hangs off the pole
  for (const [sx, sz] of corners) {
    const px = (sx * L) / 2;
    const pz = (sz * W) / 2;
    const pole = new CylinderGeometry(0.02, 0.02, 1.6, 6);
    pole.translate(px, 0.8, pz);
    flagPoleGeoms.push(pole);
    const fm = new Mesh(flagGeo, flagMat);
    fm.position.set(px, 1.42, pz);
    const baseRot = Math.atan2(-pz, -px) + Math.PI / 2;
    fm.rotation.y = baseRot;
    flagBaseRot.push(baseRot);
    flagMeshes.push(fm);
    root.add(fm);
  }
  const flagPoles = mesh(mergeGeoms(flagPoleGeoms), new MeshStandardMaterial({ color: 0xe8c93b, roughness: 0.6 }));
  root.add(flagPoles);
  reportLoading(0.35);
  await breathe();

  // ── particles: camera flashes in the stands + haze drifting in the beams ──
  // Pools sized for the largest budget; the budget sets how many are drawn
  // and animated (draw ranges).
  const flashPos = new Float32Array(MAX_FLASHES * 3);
  const flashCol = new Float32Array(MAX_FLASHES * 3);
  const flashLife = new Float32Array(MAX_FLASHES);
  for (let i = 0; i < MAX_FLASHES; i++) {
    const k = (Math.random() * Math.max(1, cN)) | 0;
    flashPos[i * 3] = baseX[k] ?? 0;
    flashPos[i * 3 + 1] = (baseY[k] ?? 0) + 0.55;
    flashPos[i * 3 + 2] = baseZ[k] ?? 0;
  }
  const flashGeo = bag.add(new BufferGeometry());
  flashGeo.setAttribute("position", new BufferAttribute(flashPos, 3));
  const flashColAttr = new BufferAttribute(flashCol, 3);
  flashGeo.setAttribute("color", flashColAttr);
  const flashes = new Points(flashGeo, bag.add(new PointsMaterial({
    map: glowTex, size: 1.1, vertexColors: true, transparent: true, depthWrite: false,
    blending: AdditiveBlending, fog: false,
  })));
  flashes.renderOrder = 7;
  root.add(flashes);

  const hazePos = new Float32Array(MAX_HAZE * 3);
  const hazeBaseY = new Float32Array(MAX_HAZE);
  const hazePh = new Float32Array(MAX_HAZE);
  for (let i = 0; i < MAX_HAZE; i++) {
    const [cx, cz] = corners[i % 4]!;
    const hx = cx * (L / 2 + 22);
    const hy = TOWER_H + 1.2;
    const hz = cz * (W / 2 + 22);
    const tx = cx * L * 0.15;
    const tz = cz * W * 0.15;
    const f = 0.12 + Math.random() * 0.7;
    const r = f * Math.hypot(tx - hx, -hy, tz - hz) * 0.25 * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    hazePos[i * 3] = hx + (tx - hx) * f + Math.cos(a) * r;
    hazeBaseY[i] = hy - hy * f + Math.sin(a) * r * 0.6;
    hazePos[i * 3 + 1] = hazeBaseY[i]!;
    hazePos[i * 3 + 2] = hz + (tz - hz) * f + Math.sin(a) * r;
    hazePh[i] = Math.random() * Math.PI * 2;
  }
  const hazeGeo = bag.add(new BufferGeometry());
  const hazePosAttr = new BufferAttribute(hazePos, 3);
  hazeGeo.setAttribute("position", hazePosAttr);
  const haze = new Points(hazeGeo, bag.add(new PointsMaterial({
    map: glowTex, size: 0.32, color: 0x8397bd, transparent: true, opacity: 0.4, depthWrite: false,
    blending: AdditiveBlending, fog: false,
  })));
  haze.renderOrder = 8;
  root.add(haze);
  let flashN = 0;
  let hazeN = 0;

  // ── quality ──
  let night = true;
  let particlesOn = false;
  let grassWant = 0;
  let generation = 0;
  let disposed = false;
  async function rebuildTextures(want: ContentQuality, gen: number): Promise<void> {
    const live = (): boolean => !disposed && gen === generation;
    const aspect = (W + 0.6) / (L + 0.6);
    if (want.grass !== grassWant || want.detail !== grassDetailed || !grassTex) {
      // the old pair goes first (the pitch shows its base colour meanwhile)
      grassMat.map = null;
      grassMat.normalMap = null;
      grassMat.color.setHex(0x2c652e);
      grassTex?.dispose();
      grassNormalTex?.dispose();
      grassTex = grassNormalTex = null;
      const gw = fitTextureWidth(want.grass, aspect, want.detail ? 2 : 1);
      const tex = await makeGrassTexture(L + 0.6, W + 0.6, want.detail, gw, live);
      const normal = tex && live() && want.detail ? await makeGrassNormal(L + 0.6, W + 0.6, gw, live) : null;
      if (!live() || !tex || (want.detail && !normal)) {
        tex?.dispose();
        normal?.dispose();
        return;
      }
      grassTex = tex;
      grassNormalTex = normal;
      grassDetailed = want.detail;
      grassWant = want.grass;
      grassMat.color.setHex(0xffffff);
      grassMat.map = tex;
      grassMat.normalMap = normal;
      grassMat.normalScale.set(0.9, 0.9);
      grassMat.roughness = want.detail ? 0.82 : 0.95;
    }
    // the canvas is a quarter of the markings (see makeLinesTexture)
    const lw = 2 * fitTextureWidth(want.lines / 2, W / L);
    if (lw !== linesSize) {
      const tex = makeLinesTexture(p, lw);
      if (!live()) {
        tex.dispose();
        return;
      }
      linesTex?.dispose();
      linesTex = tex;
      linesSize = lw;
      linesMat.map = tex;
    }
  }
  let requested = "";
  function applyQuality(want: ContentQuality): void {
    const key = `${want.grass}|${want.lines}|${want.detail}`;
    if (key !== requested) {
      requested = key;
      const gen = ++generation;
      void rebuildTextures(want, gen).catch((e: unknown) => console.warn("stadium textures:", e instanceof Error ? e.message : String(e)));
    }
    setShadow(spot, want.shadowMap);
    // the opposite tower also casts at the top shadow tier
    setShadow(spot2, want.secondCaster ? want.shadowMap : 0);
    if (want.lambert !== lambertOn) {
      lambertOn = want.lambert;
      for (const [m, twins] of lambertSwap) m.material = lambertOn ? twins[1] : twins[0];
    }
    wantEnvironment = want.reflections;
    if (!want.reflections) {
      if (scene.environment === envShown) scene.environment = null;
      envShown = null;
    } else {
      void stadiumEnvironment().then((env) => {
        if (disposed || !wantEnvironment || !env) return;
        envShown = env;
        scene.environment = env;
        scene.environmentIntensity = 0.35;
      });
    }
    const body = `${want.body[0]},${want.body[1]}`;
    if (body !== crowdBody) {
      crowdBody = body;
      const old = crowdGeo;
      crowdGeo = new CapsuleGeometry(0.17, 0.5, want.body[0], want.body[1]);
      crowdMesh.geometry = crowdGeo;
      old.dispose();
    }
    crowdMesh.count = Math.max(1, Math.min(cN, Math.round((want.crowdFull ? cN : sparseN) * want.crowdShare)));
    particlesOn = want.particles;
    flashN = Math.min(MAX_FLASHES, want.flashes);
    hazeN = Math.min(MAX_HAZE, want.haze);
    flashGeo.setDrawRange(0, flashN);
    hazeGeo.setDrawRange(0, hazeN);
    for (let i = flashN; i < MAX_FLASHES; i++) flashLife[i] = 0;
    flashes.visible = haze.visible = particlesOn && night;
    renderer.bloom = want.bloom ? { ...BLOOM } : null;
  }
  // the pitch textures exist before the stadium shows
  requested = `${q.grass}|${q.lines}|${q.detail}`;
  await rebuildTextures(q, generation);
  reportLoading(0.97);
  if (!alive()) {
    crowdGeo.dispose();
    disposeTextures();
    return abandon();
  }
  scene.background = background;
  scene.fog = fog;
  scene.add(root);
  applyQuality(q);
  const unsubscribeQuality = onQuality(applyQuality);

  // ── animation state + public handle ──
  let t = 0;
  let excTarget = 0;
  let exc = 0;
  let pulseV = 0;
  let booV = 0;
  let cursor = 0;

  function update(dt: number, camera: Vec3Like): void {
    const step = Math.min(dt || 0, 0.1);
    t += step;
    exc += (excTarget - exc) * Math.min(1, step * 2.5);
    pulseV *= Math.exp(-2.0 * step);
    booV *= Math.exp(-0.9 * step); // anger lingers longer than joy
    const energy = Math.min(1, exc + pulseV);

    // The follow camera backs up over the tunnel when the player faces
    // up-pitch near the west goal; fade the tunnel so its roof never hides
    // the player.
    const behind = camera.x < -L / 2 - 1.2 && camera.y > tunH + 0.5;
    const want = behind ? 0.15 : 1;
    if (tunnelFade !== want) {
      tunnelFade += (want - tunnelFade) * Math.min(1, step * 8);
      if (Math.abs(tunnelFade - want) < 0.01) tunnelFade = want;
      for (const m of [tunnelMat, tunnelDarkMat]) {
        m.transparent = tunnelFade < 1;
        m.opacity = tunnelFade;
        m.depthWrite = tunnelFade === 1;
      }
    }

    // crowd sway/bounce: a rotating eighth of the shown crowd, translation
    // lanes written in place and sent as one range; a boo damps the joyful
    // bounce and a fast jittery shake takes over
    const amp = 0.02 + 0.3 * energy * (1 - booV * 0.65);
    const spd = 2.4 + 5.5 * energy;
    const sway = 0.02 * (0.3 + energy);
    const shake = 0.09 * booV;
    const shown = crowdMesh.count;
    const chunk = Math.max(1, Math.ceil(shown / 8));
    const start = cursor < shown ? cursor : 0;
    const end = Math.min(start + chunk, shown);
    for (let i = start; i < end; i++) {
      const o = i * 16;
      const ph = phase[i]!;
      const f = freqV[i]!;
      const av = ampV[i]!;
      const j = Math.sin(t * spd * f + ph);
      const bj = Math.sin(t * 12.7 * f + ph * 2.9);
      carr[o + 13] = baseY[i]! + (j > 0 ? j * j : 0) * amp * av + bj * shake * av;
      carr[o + 12] = baseX[i]! + Math.sin(t * 1.1 + ph * 1.7) * sway + Math.sin(t * 9.3 + ph * 4.1) * shake * 0.4;
      carr[o + 14] = baseZ[i]! + Math.cos(t * 0.9 + ph) * sway;
    }
    cursor = end >= shown ? 0 : end;
    if (end > start) {
      crowdMesh.instanceMatrix.clearUpdateRanges();
      crowdMesh.instanceMatrix.addUpdateRange(start * 16, (end - start) * 16);
      crowdMesh.instanceMatrix.needsUpdate = true;
    }

    // LED board scroll
    ledTex.offset.x = (t * 0.025) % 1;

    const still = reducedMotion();

    // camera flashes: a trickle all match, bursts when the crowd erupts
    if (flashes.visible) {
      if (!still) {
        let spawn = step * (2 + 40 * pulseV + 6 * exc);
        while (spawn > 0 && flashN > 0) {
          if (spawn >= 1 || Math.random() < spawn) flashLife[(Math.random() * flashN) | 0] = 0.14;
          spawn -= 1;
        }
      }
      // HDR white (up to 7) so bloom takes the flashes
      for (let i = 0; i < flashN; i++) {
        const life = (flashLife[i] = Math.max(0, flashLife[i]! - step));
        const v = still ? 0 : (life / 0.14) * 7;
        flashCol[i * 3] = v;
        flashCol[i * 3 + 1] = v;
        flashCol[i * 3 + 2] = v * 1.08;
      }
      flashColAttr.needsUpdate = true;
    }
    // haze drifts slowly up and down through the beams
    if (haze.visible && !still) {
      for (let i = 0; i < hazeN; i++) hazePos[i * 3 + 1] = hazeBaseY[i]! + Math.sin(t * 0.25 + hazePh[i]!) * 0.8;
      hazePosAttr.needsUpdate = true;
    }

    // floodlight flicker (subtle mains hum; steady with reduced motion)
    if (night && !still) {
      const fl = 0.97 + 0.03 * Math.sin(t * 43.7 + Math.sin(t * 17.3) * 2.0);
      lampMat.emissiveIntensity = 2.4 * fl;
      spot.intensity = SPOT_INTENSITY * fl;
    }

    // corner flag wave
    for (let i = 0; i < 4; i++) {
      flagMeshes[i]!.rotation.y = flagBaseRot[i]! + Math.sin(t * 2.1 + i * 1.37) * 0.2;
      flagMeshes[i]!.rotation.z = Math.sin(t * 1.6 + i * 2.1) * 0.08;
    }
  }

  function setNight(isNight: boolean): void {
    night = !!isNight;
    spot.visible = night;
    for (const f of fillSpots) f.visible = night;
    coneMesh.visible = night;
    for (const g of lampGlows) g.visible = night;
    flashes.visible = haze.visible = particlesOn && night;
    lampMat.emissiveIntensity = night ? 2.4 : 0.25;
    skyMat.map = night ? skyTexNight : skyTexDay;
    background.setHex(night ? 0x04060d : 0x6f87a3);
    fog.color.setHex(night ? 0x070d18 : 0x7f93a8);
    hemi.intensity = night ? HEMI_NIGHT : HEMI_DAY;
    amb.intensity = night ? AMB_NIGHT : AMB_DAY;
  }

  function dispose(): void {
    disposed = true;
    unsubscribeQuality();
    scene.remove(root);
    if (scene.background === background) scene.background = prevBackground;
    if (scene.fog === fog) scene.fog = prevFog;
    if (envShown && scene.environment === envShown) scene.environment = prevEnvironment;
    renderer.bloom = null;
    disposeTextures();
    crowdGeo.dispose();
    bag.dispose();
  }

  return {
    update,
    crowd: {
      setExcitement(level: number): void {
        excTarget = Math.min(1, Math.max(0, +level || 0));
      },
      pulse(strength: number): void {
        pulseV = Math.max(pulseV, Math.min(1, Math.max(0, +strength || 0)));
      },
      boo(strength: number): void {
        booV = Math.max(booV, Math.min(1, Math.max(0, +strength || 0)));
      },
    },
    setNight,
    applyQuality,
    dispose,
  };
}
