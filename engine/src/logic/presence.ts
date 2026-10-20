// Small per-frame models: crowd excitement following the action and
// distance-based voice volume (spec.md §9 and §13).

/** Crowd excitement eases toward the ball's danger near either goal. */
export function nextExcitement(excitement: number, ballX: number, pitchL: number, dt: number): number {
  const halfL = pitchL / 2;
  const danger = 1 - Math.min(1, (halfL - Math.abs(ballX)) / (pitchL * 0.3));
  const target = 0.3 + danger * 0.55;
  return excitement + (target - excitement) * Math.min(1, dt * 1.5);
}

export const VOICE_NEAR_M = 4;
export const VOICE_FAR_M = 55;
export const VOICE_POS_HZ = 10;

/** Full volume within 4 m, silent beyond 55 m, squared falloff. */
export function voiceGain(distance: number): number {
  const g = Math.min(1, Math.max(0, (VOICE_FAR_M - distance) / (VOICE_FAR_M - VOICE_NEAR_M)));
  return g * g;
}

/** Pan −0.8..0.8 from the speaker's side relative to my facing
 * (forward = (cos f, sin f), right = (−sin f, cos f)); null when too close
 * to tell. */
export function voicePan(dx: number, dz: number, facing: number): number | null {
  const d = Math.hypot(dx, dz);
  if (d <= 1.5) return null;
  const lateral = (dx * -Math.sin(facing) + dz * Math.cos(facing)) / d;
  return Math.max(-0.8, Math.min(0.8, lateral * 0.8));
}

/** Whether my footsteps crossed a new step this frame (one per π of the
 * run cycle's phase). */
export function stepIndex(phase: number): number {
  return Math.floor(phase / Math.PI);
}
