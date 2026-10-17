// sRGB helpers for kit contrast and skin tones, matching three.js's color
// management (hex and CSS colors are sRGB and converted to linear light).

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** '#rrggbb' (or a 0xRRGGBB number) as sRGB components 0–1. */
export function parseHex(color: string | number): [number, number, number] {
  const n = typeof color === "number" ? color : parseInt(color.replace(/^#/, ""), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function toHex(r: number, g: number, b: number): string {
  const c = (v: number): string => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** The browser's player.js luminance: `new THREE.Color(hex)` holds linear
 * components, weighted 0.299 / 0.587 / 0.114. */
export function luminance(color: string | number): number {
  const [r, g, b] = parseHex(color);
  return 0.299 * srgbToLinear(r) + 0.587 * srgbToLinear(g) + 0.114 * srgbToLinear(b);
}

/** Trim and number color that reads on a shirt. */
export function contrastFor(color: string | number): string {
  return luminance(color) > 0.5 ? "#161616" : "#f2f2f2";
}

/** three.js `new Color().lerpColors(a, b, t)` (in linear light), as sRGB hex. */
export function lerpSrgbHex(a: string, b: string, t: number): string {
  const ca = parseHex(a).map(srgbToLinear);
  const cb = parseHex(b).map(srgbToLinear);
  const mix = (i: number): number => linearToSrgb(ca[i]! + (cb[i]! - ca[i]!) * t);
  return toHex(mix(0), mix(1), mix(2));
}
