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
import { T, language } from "./i18n.ts";
import { clockSeconds, formatClock } from "./logic/format.ts";
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


function inside(b: HudButton, x: number, y: number): boolean {
  return b.w > 0 && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

/** `T(key)` remembered until the key or the game language changes (the HUD
 * draws the same strings every frame). */
function translation(): (key: string) => string {
  let key = "";
  let lang = "";
  let text = "";
  return (k) => {
    const l = language();
    if (k !== key || l !== lang) {
      key = k;
      lang = l;
      text = T(k);
    }
    return text;
  };
}

/** measureText's width in one style (`spacing` em of letter spacing, if
 * any), remembered until the text or the size changes: it is a host call
 * and the HUD's text rarely changes. */
function measurer(weight: string, spacing?: number): (text: string, size: number) => number {
  let text: string | null = null;
  let size = NaN;
  let width = 0;
  return (t, s) => {
    if (t !== text || s !== size) {
      text = t;
      size = s;
      width = draw.measureText(t, spacing === undefined ? { size: s, weight } : { size: s, weight, letterSpacing: spacing * s }).width;
    }
    return width;
  };
}

export function createHud(): Hud {
  let visible = false;
  let homeName = "HOME";
  let awayName = "AWAY";
  let score = "0 – 0";
  let scoreHome = 0;
  let scoreAway = 0;
  let clockTime = 0;
  let clockHalf = 1;
  let clockLength = 180;
  /** The browser's clock reads "00:00" until play first sets it. */
  let clockSet = false;
  let power = 0;
  let bannerText = "";
  let bannerStart = 0;
  let bannerUntil = 0;
  let arrow: Arrow | null = null;
  let arrowDist = "";
  let arrowMetres = NaN;
  let mouseHint = false;
  let micVisible = false;
  let micMuted = false;
  let menuVisible = false;
  const mic: HudButton = { x: 0, y: 0, w: 0, h: 0 };
  const menu: HudButton = { x: 0, y: 0, w: 0, h: 0 };
  // Strings and widths kept between frames (see translation and measurer).
  const homeT = translation();
  const awayT = translation();
  const hintT = translation();
  const micT = translation();
  const homeWidth = measurer("800", 0.05);
  const awayWidth = measurer("800", 0.05);
  const scoreWidth = measurer("800", 0.05);
  const clockWidth = measurer("800");
  const hintWidth = measurer("700", 0.06);
  const micWidth = measurer("700");
  let clockText = "00:00";
  let clockShown = NaN;
  let clockShownHalf = NaN;
  let clockLang = "";
  // The arrow's two triangles, refilled each frame.
  const glyph: [number, number][] = [[0, 0], [0, 0], [0, 0]];
  const glyphShadow: [number, number][] = [[0, 0], [0, 0], [0, 0]];

  /** The match clock's text, formatted again only when its second, the
   * half or the language changes. */
  function clock(): string {
    if (!clockSet) return "00:00";
    const shown = clockSeconds(clockTime, clockHalf, clockLength);
    const lang = language();
    if (shown !== clockShown || clockHalf !== clockShownHalf || lang !== clockLang) {
      clockShown = shown;
      clockShownHalf = clockHalf;
      clockLang = lang;
      clockText = formatClock(clockTime, clockHalf, clockLength, T);
    }
    return clockText;
  }

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
    // the browser's #scorebar sizes: 1.25rem, names 0.8rem, clock 0.9rem
    const big = 20 * s;
    const small = 12.8 * s;
    const clockSize = 14.4 * s;
    const gap = 0.6 * 16 * s;
    const crestSize = 1.5 * 16 * s;
    const home = homeT(homeName);
    const away = awayT(awayName);
    const time = clock();
    // the bar's bold text with its 0.05em letter spacing
    const wHome = homeWidth(home, small);
    const wAway = awayWidth(away, small);
    const wScore = scoreWidth(score, big);
    const wClock = clockWidth(time, clockSize);
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
    draw.text(home, cx, mid - small / 2, { size: small, color: "#9fb0c0", letterSpacing: 0.05 * small, weight: "800" });
    cx += wHome + gap;
    draw.text(score, cx, mid - big / 2, { size: big, color: TEXT, letterSpacing: 0.05 * big, weight: "800" });
    cx += wScore + gap;
    draw.text(away, cx, mid - small / 2, { size: small, color: "#9fb0c0", letterSpacing: 0.05 * small, weight: "800" });
    cx += wAway + gap;
    draw.image(crest(1).canvas, cx, mid - crestSize / 2, crestSize, crestSize);
    cx += crestSize + gap * 2;
    // unspaced: the engine's football probe reads the clock as one text
    draw.text(time, cx, mid - clockSize / 2, { size: clockSize, color: ACCENT2, weight: "800" });
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
    const tri = (out: [number, number][], k: number): [number, number][] => {
      out[0]![0] = cx + dx * 12 * s * k;
      out[0]![1] = cy + dy * 12 * s * k;
      out[1]![0] = cx - dx * 8 * s * k + px * 10 * s * k;
      out[1]![1] = cy - dy * 8 * s * k + py * 10 * s * k;
      out[2]![0] = cx - dx * 8 * s * k - px * 10 * s * k;
      out[2]![1] = cy - dy * 8 * s * k - py * 10 * s * k;
      return out;
    };
    draw.polygon(tri(glyphShadow, 1.35), [0, 0, 0, 0.45]); // the glyph's dark text shadow
    draw.polygon(tri(glyph, 1), "#ffffff");
    const size = 11.2 * s; // #ball-arrow-dist 0.7rem
    draw.text(arrowDist, cx, cy + 14 * s, { size, color: "#ffffff", align: "center", weight: "700", shadow: { color: [0, 0, 0, 0.8], x: 0, y: s } });
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
    // green glow (text-shadow 0 0 30px): five copies 2 px apart, drawn two
    // to a call where the shadow is the next copy (the host lays the text
    // out once a call; equal translucent copies blend the same in any
    // order), then the dark drop shadow and white
    const glow: [number, number, number, number] = [39 / 255, 174 / 255, 96 / 255, 0.25 * alpha];
    const next = { color: glow, x: 2 * s, y: 0 };
    draw.text(bannerText, W / 2 - 4 * s, y, { size, letterSpacing: spacing, weight: "900", color: glow, align: "center", shadow: next });
    draw.text(bannerText, W / 2, y, { size, letterSpacing: spacing, weight: "900", color: glow, align: "center", shadow: next });
    draw.text(bannerText, W / 2 + 4 * s, y, { size, letterSpacing: spacing, weight: "900", color: glow, align: "center" });
    draw.text(bannerText, W / 2, y, {
      size, letterSpacing: spacing, weight: "900", align: "center", color: [1, 1, 1, alpha],
      shadow: { color: [0, 0, 0, 0.8 * alpha], x: 0, y: 2 * s },
    });
  }

  function drawMouseHint(W: number, H: number, s: number, bottomInset: number): void {
    if (!mouseHint) return;
    const text = hintT("CLICK THE PITCH FOR MOUSE CAMERA · LEFT SHOOT · RIGHT PASS · MIDDLE TACKLE");
    const size = 11.2 * s; // #mouse-hint 0.7rem
    const spacing = 0.06 * size;
    const tw = hintWidth(text, size);
    const padX = 0.8 * 16 * s;
    const padY = 0.45 * 16 * s;
    const w = tw + padX * 2;
    const h = size + padY * 2;
    const x = W / 2 - w / 2;
    const y = H - Math.max(24 * s, bottomInset) - h;
    panel(x, y, w, h, 7 * s, s, "rgba(255,255,255,0.2)", [4 / 255, 9 / 255, 15 / 255, 0.78]);
    draw.text(text, x + padX, y + padY, { size, color: "#d7e1e9", letterSpacing: spacing, weight: "700" });
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
    const label = micT(micMuted ? "MIC OFF · M" : "MIC ON · M");
    const size = 11.52 * s; // #btn-mic 0.72rem
    const tw = micWidth(label, size);
    const w = tw + 0.7 * 16 * s * 2;
    const h = size + 0.3 * 16 * s * 2;
    // left of the ☰ button when it shows
    mic.x = (menu.w ? menu.x - 8 * s : W - 14 * s) - w;
    mic.y = Math.max(14 * s, top);
    mic.w = w;
    mic.h = h;
    const color = micMuted ? "#e74c3c" : TEXT;
    panel(mic.x, mic.y, w, h, 8 * s, s, micMuted ? "#e74c3c" : BORDER);
    draw.text(label, mic.x + w / 2, mic.y + (h - size) / 2, { size, color, align: "center", weight: "700" });
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
        clockSet = false;
      }
    },
    setTeamNames(h: string, a: string): void {
      homeName = h;
      awayName = a;
    },
    setScore(h: number, a: number): void {
      if (h === scoreHome && a === scoreAway) return;
      scoreHome = h;
      scoreAway = a;
      score = `${h} – ${a}`; // the bar's flex gap around the separator
    },
    setClock(time: number, half: number, halfLength: number): void {
      clockSet = true;
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
      const metres = Math.round(distM);
      if (metres !== arrowMetres) {
        arrowMetres = metres;
        arrowDist = `${metres}m`;
      }
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
