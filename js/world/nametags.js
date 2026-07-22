// Floating nickname plates above players' heads.
// One canvas + one texture per player, created once — zero per-frame cost.
import * as THREE from 'three';

// Sprite world height in meters; the tag reads ~0.5m tall over the head.
const TAG_HEIGHT = 0.45;
const SS = 2; // supersample factor — render at 2x so text stays crisp at distance

function roundRectPath(ctx, x, y, w, h, r) {
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

// createNameTag(name, { color: '#rrggbb', isYou: bool }) -> THREE.Sprite
export function createNameTag(name, opts = {}) {
  const color = opts.color || '#cccccc';
  const isYou = !!opts.isYou;
  const label = String(name == null ? '' : name);

  const fontPx = 30 * SS;
  const padX = 16 * SS;
  const padY = 9 * SS;
  const font = `bold ${fontPx}px "Segoe UI", system-ui, Arial, sans-serif`;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  const textW = ctx.measureText(label).width;
  const w = Math.max(2, Math.ceil(textW + padX * 2));
  const h = Math.ceil(fontPx + padY * 2);
  canvas.width = w;
  canvas.height = h;

  // Resizing resets context state — re-apply.
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Team-colored rounded plate with a dark rim for contrast under floodlights.
  roundRectPath(ctx, SS, SS, w - 2 * SS, h - 2 * SS, (h - 2 * SS) / 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5 * SS;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.stroke();

  // Name: white, or gold for the local player ("You").
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 3 * SS;
  ctx.shadowOffsetY = 1 * SS;
  ctx.fillStyle = isYou ? '#ffd54a' : '#ffffff';
  ctx.fillText(label, w / 2, h / 2 + 1 * SS);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(TAG_HEIGHT * (w / h), TAG_HEIGHT, 1);
  sprite.renderOrder = 20;
  return sprite;
}
