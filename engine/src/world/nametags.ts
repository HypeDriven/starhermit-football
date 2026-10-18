// Floating nickname plates above players' heads (spec.md §5.4): one canvas
// texture per player, drawn once — zero per-frame cost.
import { shown } from "../logic/glyphs.ts";
import { LinearMipmapLinearFilter, Sprite, SpriteMaterial } from "starhermit:scene";
import type { OffscreenCanvasRenderingContext2D } from "starhermit:canvas";
import { canvasTexture, makeCanvas } from "./resources.ts";

/** Sprite world height in meters; the tag reads ~0.5 m tall over the head. */
const TAG_HEIGHT = 0.45;
/** Supersample: render at 2× so text stays crisp at distance. */
const SS = 2;

function roundRectPath(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export interface NameTag {
  readonly sprite: Sprite;
  dispose(): void;
}

/** A team-colored plate with white text (gold for the local player). */
export function createNameTag(name: string, opts: { color?: string; isYou?: boolean } = {}): NameTag {
  const color = opts.color || "#cccccc";
  const isYou = !!opts.isYou;
  const label = shown(String(name ?? ""));

  const fontPx = 30 * SS;
  const padX = 16 * SS;
  const padY = 9 * SS;
  const font = `bold ${fontPx}px "Segoe UI", system-ui, Arial, sans-serif`;

  const [canvas, ctx] = makeCanvas(2, 2);
  ctx.font = font;
  const textW = ctx.measureText(label).width;
  const w = Math.max(2, Math.ceil(textW + padX * 2));
  const h = Math.ceil(fontPx + padY * 2);
  canvas.width = w;
  canvas.height = h;

  // Resizing resets the context's state — re-apply.
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Team-colored rounded plate with a dark rim for contrast.
  roundRectPath(ctx, SS, SS, w - 2 * SS, h - 2 * SS, (h - 2 * SS) / 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5 * SS;
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.stroke();

  // Name: white, or gold for the local player ("You").
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 3 * SS;
  ctx.shadowOffsetY = 1 * SS;
  ctx.fillStyle = isYou ? "#ffd54a" : "#ffffff";
  ctx.fillText(label, w / 2, h / 2 + 1 * SS);

  const tex = canvasTexture(canvas);
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;

  const mat = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new Sprite(mat);
  sprite.scale.set(TAG_HEIGHT * (w / h), TAG_HEIGHT, 1);
  sprite.renderOrder = 20;
  return {
    sprite,
    dispose(): void {
      tex.dispose();
      mat.dispose();
    },
  };
}
