// The two club crests, assets/crest-blue.webp and crest-red.webp (a royal
// blue shield with a silver heron, a crimson shield with a gold wolf), as
// the score bar shows them: round, cover-fitted on #0a0e14 with a
// 1px #2c3e50 rim. One canvas each (overlay) with a texture of it (UI); a
// shield in the club's colors stands in while the image decodes or if it
// cannot be.
import { CanvasTexture, SRGBColorSpace } from "starhermit:scene";
import { createImageBitmap } from "starhermit:canvas";
import type { OffscreenCanvas } from "starhermit:canvas";
import { makeCanvas } from "./resources.ts";

const FILES = ["assets/crest-blue.webp", "assets/crest-red.webp"] as const;
const SIZE = 96;

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
  const [canvas, g] = makeCanvas(SIZE, SIZE);
  g.scale(SIZE / 64, SIZE / 64); // the stand-in is drawn on a 64-unit grid
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
  g.setTransform(1, 0, 0, 1, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  const out = { canvas, texture };
  made[i] = out;
  createImageBitmap(FILES[i])
    .then((img) => {
      const r = SIZE / 2;
      g.clearRect(0, 0, SIZE, SIZE);
      g.save();
      g.beginPath();
      g.arc(r, r, r, 0, Math.PI * 2);
      g.fillStyle = "#0a0e14";
      g.fill();
      g.clip();
      const k = Math.max(SIZE / img.width, SIZE / img.height);
      g.drawImage(img, (SIZE - img.width * k) / 2, (SIZE - img.height * k) / 2, img.width * k, img.height * k);
      g.restore();
      g.beginPath();
      g.arc(r, r, r - 2, 0, Math.PI * 2);
      g.strokeStyle = "#2c3e50";
      g.lineWidth = 4; // 1px at the bar's 24px
      g.stroke();
      img.close();
      texture.needsUpdate = true;
    })
    .catch(() => {
      // the stand-in stays
    });
  return out;
}
