// The in-match HUD (the browser's js/hud.js, its score bar markup and CSS)
// drawn each frame with starhermit:draw: the score bar with the club crests,
// team names and match clock, the off-screen ball arrow, the shot power bar,
// event banners, the mouse camera hint, the ☰ match-menu button and the mic
// toggle. Window coordinates are physical pixels; sizes are the browser's
// CSS pixels times frame().scale.
import { frame } from "starhermit:engine";
import type { ColorLike } from "starhermit:engine";
import * as draw from "starhermit:draw";
import { OffscreenCanvas } from "starhermit:canvas";
import { T } from "./i18n.ts";
import { formatClock } from "./logic/format.ts";
import type { Arrow } from "./logic/camera.ts";
import { crest } from "./world/crest.ts";

export const ACCENT = "#27ae60";
export const ACCENT2 = "#f1c40f";
export const PANEL: [number, number, number, number] = [10 / 255, 14 / 255, 20 / 255, 0.82];
export const BORDER = "#2c3e50";
export const TEXT = "#eef2f5";
export const MUTED = "#93a1b0";

const BANNER_POP_S = 0.35;
/** The ball arrow's box (glyph + label) for its clamp, CSS px. */
export const ARROW_HALF = { width: 20, height: 22 };

export interface HudButton {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Hud {
  readonly visible: boolean;
  showHud(show: boolean): void;
  setTeamNames(home: string, away: string): void;
  setScore(home: number, away: number): void;
  setClock(time: number, half: number, halfLength: number): void;
  /** 0 hides the bar. */
  setPower(v: number): void;
  banner(text: string, ms?: number): void;
  /** The ball arrow (null hides it) and the ball's distance in meters. */
  setArrow(arrow: Arrow | null, distM: number): void;
  setMouseHint(show: boolean): void;
  setMic(visible: boolean, muted: boolean): void;
  /** Whether the ☰ match-menu button shows (during play). */
  setMenuButton(visible: boolean): void;
  /** What a window point hits: the mic toggle, the ☰ button or nothing. */
  hit(x: number, y: number): "mic" | "menu" | null;
  draw(): void;
}

/** A panel: a translucent rounded fill and a 1 px rounded border. */
export function panel(x: number, y: number, w: number, h: number, r: number, s: number, border: ColorLike = BORDER, fill: ColorLike = PANEL): void {
  draw.roundRect(x, y, w, h, r, fill);
  draw.strokeRoundRect(x, y, w, h, r, border, Math.max(1, s));
}

/** Pixel-font sizes are crisp at multiples of 10 (physical pixels). */
export function crisp(px: number): number {
  return Math.max(10, Math.round(px / 10) * 10);
}

function inside(b: HudButton, x: number, y: number): boolean {
  return b.w > 0 && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

export function createHud(): Hud {
  let visible = false;
  let homeName = "HOME";
  let awayName = "AWAY";
  let score = "0–0";
  let clockTime = 0;
  let clockHalf = 1;
  let clockLength = 180;
  let power = 0;
  let bannerText = "";
  let bannerStart = 0;
  let bannerUntil = 0;
  let arrow: Arrow | null = null;
  let arrowDist = "";
  let mouseHint = false;
  let micVisible = false;
  let micMuted = false;
  let menuVisible = false;
  const mic: HudButton = { x: 0, y: 0, w: 0, h: 0 };
  const menu: HudButton = { x: 0, y: 0, w: 0, h: 0 };

  // The power fill's green → yellow → red gradient, drawn once.
  const gradient = new OffscreenCanvas(240, 12);
  {
    const g = gradient.getContext("2d");
    const lg = g.createLinearGradient(0, 0, 240, 0);
    lg.addColorStop(0, ACCENT);
    lg.addColorStop(0.5, ACCENT2);
    lg.addColorStop(1, "#e74c3c");
    g.fillStyle = lg;
    g.fillRect(0, 0, 240, 12);
  }

  function drawScorebar(W: number, s: number, top: number): void {
    const big = crisp(20 * s);
    const small = crisp(10 * s);
    const clockSize = small * 1.4;
    const gap = 0.6 * 16 * s;
    const crestSize = 1.5 * 16 * s;
    const home = T(homeName);
    const away = T(awayName);
    const clock = formatClock(clockTime, clockHalf, clockLength, T);
    const wHome = draw.measureText(home, { size: small }).width;
    const wAway = draw.measureText(away, { size: small }).width;
    const wScore = draw.measureText(score, { size: big }).width;
    const wClock = draw.measureText(clock, { size: clockSize }).width;
    const padX = 1.1 * 16 * s;
    const padY = 0.4 * 16 * s;
    const inner = crestSize + gap + wHome + gap + wScore + gap + wAway + gap + crestSize + gap * 2 + wClock;
    const w = inner + padX * 2;
    const h = Math.max(big, crestSize) + padY * 2;
    // below 480 px the bar centres in the space left of the menu button
    const centre = W / s < 480 ? W / 2 - 26 * s : W / 2;
    const x = centre - w / 2;
    panel(x, top, w, h, 10 * s, s);
    let cx = x + padX;
    const mid = top + h / 2;
    draw.image(crest(0).canvas, cx, mid - crestSize / 2, crestSize, crestSize);
    cx += crestSize + gap;
    draw.text(home, cx, mid - small / 2, { size: small, color: "#9fb0c0" });
    cx += wHome + gap;
    draw.text(score, cx, mid - big / 2, { size: big, color: TEXT, letterSpacing: 0.05 * 20 * s });
    cx += wScore + gap;
    draw.text(away, cx, mid - small / 2, { size: small, color: "#9fb0c0" });
    cx += wAway + gap;
    draw.image(crest(1).canvas, cx, mid - crestSize / 2, crestSize, crestSize);
    cx += crestSize + gap * 2;
    draw.text(clock, cx, mid - clockSize / 2, { size: clockSize, color: ACCENT2 });
  }

  function drawArrow(s: number): void {
    if (!arrow || !arrow.visible) return;
    const a = (arrow.angleDeg * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const px = -dy;
    const py = dx;
    const cx = arrow.px;
    const cy = arrow.py - 6 * s;
    const tri = (k: number): [number, number][] => [
      [cx + dx * 12 * s * k, cy + dy * 12 * s * k],
      [cx - dx * 8 * s * k + px * 10 * s * k, cy - dy * 8 * s * k + py * 10 * s * k],
      [cx - dx * 8 * s * k - px * 10 * s * k, cy - dy * 8 * s * k - py * 10 * s * k],
    ];
    draw.polygon(tri(1.35), [0, 0, 0, 0.45]); // the glyph's dark text shadow
    draw.polygon(tri(1), "#ffffff");
    const size = crisp(10 * s);
    draw.text(arrowDist, cx, cy + 14 * s, { size, color: "#ffffff", align: "center", shadow: { color: [0, 0, 0, 0.8], x: 0, y: s } });
  }

  function drawPower(W: number, H: number, s: number, bottomInset: number): void {
    if (power <= 0) return;
    const w = Math.min(240 * s, W * 0.5);
    const h = 12 * s;
    const x = W / 2 - w / 2;
    const y = H - (H * 0.18 + bottomInset) - h;
    panel(x, y, w, h, 6 * s, s, BORDER, [0, 0, 0, 0.55]);
    const fw = Math.round(w * power);
    if (fw > 0) draw.image(gradient, x, y, fw, h, { clip: { x, y, width: w, height: h } });
  }

  function drawBanner(W: number, H: number, s: number, now: number): void {
    if (!bannerText || now >= bannerUntil) return;
    const u = Math.min(1, (now - bannerStart) / 1000 / BANNER_POP_S);
    const ease = 1 - (1 - u) * (1 - u) * (1 - u); // ease-out
    const base = Math.min(Math.max(25.6 * s, W * 0.06), 51.2 * s);
    const size = Math.max(10, base * (0.4 + 0.6 * ease));
    const y = H * 0.22;
    const alpha = ease;
    const spacing = 0.2 * size;
    // green glow (text-shadow 0 0 30px), then the dark drop shadow and white
    for (let i = -2; i <= 2; i++) {
      draw.text(bannerText, W / 2 + i * 2 * s, y, { size, letterSpacing: spacing, color: [39 / 255, 174 / 255, 96 / 255, 0.25 * alpha], align: "center" });
    }
    draw.text(bannerText, W / 2, y, {
      size, letterSpacing: spacing, align: "center", color: [1, 1, 1, alpha],
      shadow: { color: [0, 0, 0, 0.8 * alpha], x: 0, y: 2 * s },
    });
  }

  function drawMouseHint(W: number, H: number, s: number, bottomInset: number): void {
    if (!mouseHint) return;
    const text = T("CLICK THE PITCH FOR MOUSE CAMERA · LEFT SHOOT · RIGHT PASS · MIDDLE TACKLE");
    const size = crisp(10 * s);
    const tw = draw.measureText(text, { size }).width;
    const padX = 0.8 * 16 * s;
    const padY = 0.45 * 16 * s;
    const w = tw + padX * 2;
    const h = size + padY * 2;
    const x = W / 2 - w / 2;
    const y = H - Math.max(24 * s, bottomInset) - h;
    panel(x, y, w, h, 7 * s, s, "rgba(255,255,255,0.2)", [4 / 255, 9 / 255, 15 / 255, 0.78]);
    draw.text(text, x + padX, y + padY, { size, color: "#d7e1e9", letterSpacing: 0.06 * 11 * s });
  }

  function drawMenuButton(W: number, s: number, top: number, right: number): void {
    if (!menuVisible) {
      menu.w = 0;
      return;
    }
    const size = 44 * s;
    menu.x = W - Math.max(8 * s, right) - size;
    menu.y = Math.max(8 * s, top);
    menu.w = menu.h = size;
    panel(menu.x, menu.y, size, size, 10 * s, s, "rgba(255,255,255,0.3)", [4 / 255, 9 / 255, 15 / 255, 0.7]);
    // ☰ as three bars
    for (let i = -1; i <= 1; i++) {
      const y = menu.y + size / 2 + i * 6 * s;
      draw.line(menu.x + 14 * s, y, menu.x + size - 14 * s, y, TEXT, 2 * s);
    }
  }

  function drawMic(W: number, s: number, top: number): void {
    if (!micVisible) {
      mic.w = 0;
      return;
    }
    const label = micMuted ? T("MIC OFF · M") : T("MIC ON · M");
    const size = crisp(10 * s);
    const tw = draw.measureText(label, { size }).width;
    const w = tw + 0.7 * 16 * s * 2;
    const h = size + 0.3 * 16 * s * 2;
    // left of the ☰ button when it shows
    mic.x = (menu.w ? menu.x - 8 * s : W - 14 * s) - w;
    mic.y = Math.max(14 * s, top);
    mic.w = w;
    mic.h = h;
    const color = micMuted ? "#e74c3c" : TEXT;
    panel(mic.x, mic.y, w, h, 8 * s, s, micMuted ? "#e74c3c" : BORDER);
    draw.text(label, mic.x + w / 2, mic.y + (h - size) / 2, { size, color, align: "center" });
  }

  return {
    get visible() {
      return visible;
    },
    showHud(show: boolean): void {
      visible = show;
      if (!show) {
        arrow = null;
        power = 0;
        bannerText = "";
        mouseHint = false;
        menuVisible = false;
      }
    },
    setTeamNames(h: string, a: string): void {
      homeName = h;
      awayName = a;
    },
    setScore(h: number, a: number): void {
      score = `${h}–${a}`;
    },
    setClock(time: number, half: number, halfLength: number): void {
      clockTime = time;
      clockHalf = half;
      clockLength = halfLength;
    },
    setPower(v: number): void {
      power = Math.max(0, Math.min(1, v));
    },
    banner(text: string, ms = 2500): void {
      bannerText = text;
      bannerStart = performance.now();
      bannerUntil = bannerStart + ms;
    },
    setArrow(a: Arrow | null, distM: number): void {
      arrow = a;
      arrowDist = `${Math.round(distM)}m`;
    },
    setMouseHint(show: boolean): void {
      mouseHint = show;
    },
    setMic(v: boolean, m: boolean): void {
      micVisible = v;
      micMuted = m;
    },
    setMenuButton(v: boolean): void {
      menuVisible = v;
    },
    hit(x: number, y: number): "mic" | "menu" | null {
      if (!visible) return null;
      if (micVisible && inside(mic, x, y)) return "mic";
      if (menuVisible && inside(menu, x, y)) return "menu";
      return null;
    },
    draw(): void {
      if (!visible) return;
      const f = frame();
      const s = f.scale;
      const W = f.width;
      const H = f.height;
      const top = Math.max(10 * s, f.safeArea.top);
      const now = performance.now();
      drawScorebar(W, s, top);
      drawArrow(s);
      drawPower(W, H, s, f.safeArea.bottom);
      drawBanner(W, H, s, now);
      drawMouseHint(W, H, s, f.safeArea.bottom);
      drawMenuButton(W, s, f.safeArea.top, f.safeArea.right);
      drawMic(W, s, f.safeArea.top);
    },
  };
}
