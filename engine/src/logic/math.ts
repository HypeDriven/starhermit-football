// Small numeric helpers shared by the native client. Pure: no host modules,
// so the Node tests run them directly.

export interface Vec2Like {
  x: number;
  z: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Smoothstep of `x` between edges `a` and `b` (either order). */
export function smooth(a: number, b: number, x: number): number {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
}

export function mix(a: number, b: number, w: number): number {
  return a + (b - a) * w;
}

/** The signed shortest turn from `cur` to `target`, in (−π, π]. */
export function angDelta(target: number, cur: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** The shortest signed difference `b − a` through atan2 (the snapshot
 * interpolation's facing rule). */
export function wrapAngle(d: number): number {
  return Math.atan2(Math.sin(d), Math.cos(d));
}

export function lerp3(out: Vec3Like, to: Vec3Like, k: number): Vec3Like {
  out.x += (to.x - out.x) * k;
  out.y += (to.y - out.y) * k;
  out.z += (to.z - out.z) * k;
  return out;
}

export function rand(min: number, max: number, random: () => number = Math.random): number {
  return min + random() * (max - min);
}
