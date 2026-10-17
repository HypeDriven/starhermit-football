// Cooperative slicing of heavy setup work (stadium textures, crowd
// instances). A call that spends its fuel is paused under the runtime's
// not-responding watchdog, so long loops yield to the next frame once the
// running call's fuel runs low (engine.fuelLeft) instead.
import { fuelLeft } from "starhermit:engine";

/** Fuel (ms of reference instructions) kept back before yielding. */
const RESERVE_MS = 6;

/** Resolves on a timer before the next frame's onUpdate. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Whether this call should yield now. */
export function lowOnFuel(): boolean {
  try {
    return fuelLeft() < RESERVE_MS;
  } catch {
    return false;
  }
}

/** Runs `body(i)` for i in [0, count), yielding to the next frame whenever
 * the call's fuel runs low (checked every `check` iterations). */
export async function sliced(count: number, check: number, body: (i: number) => void, alive: () => boolean = () => true): Promise<void> {
  for (let i = 0; i < count; i++) {
    body(i);
    if ((i + 1) % check === 0 && i + 1 < count && lowOnFuel()) {
      await nextFrame();
      if (!alive()) return;
    }
  }
}

/** Yields when the call's fuel runs low (between coarse build steps). */
export async function breathe(): Promise<void> {
  if (lowOnFuel()) await nextFrame();
}
