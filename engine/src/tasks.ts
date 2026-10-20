// Cooperative slicing of heavy setup work (stadium textures, the crowd, the
// environment, the footballers). Long loops yield to the next frame once
// this frame's slice work has taken its share of wall time (shared by every
// task running in the frame), or earlier when the running call's fuel runs
// low (a call that spends its fuel is paused under the runtime's
// not-responding watchdog). Fuel alone is not a frame budget: a call has
// 32 ms of reference instructions, which take longer on a slower machine,
// and each timer is a call of its own.
import { frame, fuelLeft } from "starhermit:engine";

/** Wall time (ms) slice work may take each frame. */
const FRAME_BUDGET_MS = 8;
/** Fuel (ms of reference instructions) kept back before yielding. */
const RESERVE_MS = 6;

let budgetFrame = -1;
let budgetStart = 0;

function frameNumber(): number {
  try {
    return frame().frame;
  } catch {
    return -1;
  }
}

function timer(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Resolves on a timer before onUpdate in a later frame whose slice time
 * is not yet spent: a task woken after others have used this frame's share
 * waits for the next frame rather than starting a step over budget. */
export async function nextFrame(): Promise<void> {
  do await timer();
  while (budgetSpent());
}

function budgetSpent(): boolean {
  const f = frameNumber();
  const now = performance.now();
  if (f !== budgetFrame) {
    budgetFrame = f;
    budgetStart = now;
  }
  return now - budgetStart > FRAME_BUDGET_MS;
}

/** Whether slice work should yield now: this frame's share of wall time is
 * spent (counted from the first check in the frame), or the call's fuel
 * runs low. */
export function lowOnFuel(): boolean {
  if (budgetSpent()) return true;
  try {
    return fuelLeft() < RESERVE_MS;
  } catch {
    return false;
  }
}

/** Runs `body(i)` for i in [0, count), yielding to the next frame when
 * `lowOnFuel` says so (checked every `check` iterations). */
export async function sliced(count: number, check: number, body: (i: number) => void, alive: () => boolean = () => true): Promise<void> {
  for (let i = 0; i < count; i++) {
    body(i);
    if ((i + 1) % check === 0 && i + 1 < count && lowOnFuel()) {
      await nextFrame();
      if (!alive()) return;
    }
  }
}

/** Yields when this frame's slice time is spent (between coarse build
 * steps). */
export async function breathe(): Promise<void> {
  if (lowOnFuel()) await nextFrame();
}
