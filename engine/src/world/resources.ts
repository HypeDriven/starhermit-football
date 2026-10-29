// Canvas textures and GPU resources the world builds, and a bag that
// releases them together.
import { OffscreenCanvas } from "starhermit:canvas";
import type { OffscreenCanvasRenderingContext2D } from "starhermit:canvas";
import { CanvasTexture, SRGBColorSpace } from "starhermit:scene";

export function makeCanvas(w: number, h: number): [OffscreenCanvas, OffscreenCanvasRenderingContext2D] {
  const c = new OffscreenCanvas(w, h);
  return [c, c.getContext("2d")];
}

/** A canvas as a texture (sRGB as the browser build set it: minor 28 colour
 * maps follow colorSpace; mipmapped) with 4× anisotropy. */
export function canvasTexture(canvas: OffscreenCanvas): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
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
