// The two club crests. The browser shows assets/crest-blue.webp and
// crest-red.webp (a royal blue shield with a silver heron, a crimson shield
// with a gold wolf); the engine decodes PNG images only, so the native
// client draws a stand-in shield in each club's colors once, as a canvas
// (overlay) and a texture (UI).
import { CanvasTexture } from "starhermit:scene";
import type { OffscreenCanvas } from "starhermit:canvas";
import { makeCanvas } from "./resources.ts";

const CRESTS = [
  { field: "#1f4fa8", rim: "#c9d2dc", charge: "#e4e9ef" }, // BLUE: silver on royal blue
  { field: "#a8232c", rim: "#e0b84a", charge: "#f1cf6a" }, // RED: gold on crimson
] as const;

export interface Crest {
  readonly canvas: OffscreenCanvas;
  readonly texture: CanvasTexture;
}

const made: (Crest | undefined)[] = [];

export function crest(team: number): Crest {
  const i = team === 1 ? 1 : 0;
  const hit = made[i];
  if (hit) return hit;
  const c = CRESTS[i];
  const [canvas, g] = makeCanvas(64, 64);
  g.fillStyle = "#0a0e14";
  g.beginPath();
  g.arc(32, 32, 32, 0, Math.PI * 2);
  g.fill();
  // shield
  const shield = (inset: number): void => {
    g.beginPath();
    g.moveTo(14 + inset, 12 + inset);
    g.lineTo(50 - inset, 12 + inset);
    g.lineTo(50 - inset, 32);
    g.quadraticCurveTo(50 - inset, 48 - inset * 0.5, 32, 56 - inset);
    g.quadraticCurveTo(14 + inset, 48 - inset * 0.5, 14 + inset, 32);
    g.closePath();
  };
  shield(0);
  g.fillStyle = c.rim;
  g.fill();
  shield(3);
  g.fillStyle = c.field;
  g.fill();
  // a five-pointed star as the charge
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 4.5 : 10;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const x = 32 + Math.cos(a) * r;
    const y = 32 + Math.sin(a) * r;
    if (k) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.closePath();
  g.fillStyle = c.charge;
  g.fill();
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  const out = { canvas, texture };
  made[i] = out;
  return out;
}
