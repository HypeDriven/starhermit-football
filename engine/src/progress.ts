// How far the current loading has got (0–1), for the loading screen's bar:
// the stadium build and the footballers report as they go.
let fraction = 0;

/** Starts a loading run at 0. */
export function beginLoading(): void {
  fraction = 0;
}

/** Reports `f` (0–1) of the run done; it only moves forward. */
export function reportLoading(f: number): void {
  if (f > fraction) fraction = Math.min(1, f);
}

export function loadingFraction(): number {
  return fraction;
}
