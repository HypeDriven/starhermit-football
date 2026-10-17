// Canvas textures and GPU resources the world builds, and a bag that
// releases them together (the browser's dispose traversals).
import { OffscreenCanvas } from "starhermit:canvas";
import type { OffscreenCanvasRenderingContext2D } from "starhermit:canvas";
import { CanvasTexture } from "starhermit:scene";

export function makeCanvas(w: number, h: number): [OffscreenCanvas, OffscreenCanvasRenderingContext2D] {
  const c = new OffscreenCanvas(w, h);
  return [c, c.getContext("2d")];
}

/** A canvas as a texture (sRGB, the host's default; mipmapped) with the
 * browser's 4× anisotropy (kept by the host, which samples without it). */
export function canvasTexture(canvas: OffscreenCanvas): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

interface Disposable {
  dispose(): void;
}

export class ResourceBag {
  private readonly items: Disposable[] = [];

  add<T extends Disposable>(item: T): T {
    this.items.push(item);
    return item;
  }

  dispose(): void {
    for (const item of this.items) {
      try {
        item.dispose();
      } catch {
        // already released
      }
    }
    this.items.length = 0;
  }
}
