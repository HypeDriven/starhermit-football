// Text the HUD and menus show, as pure functions. Strings go through a
// translator `t` (the game's T from i18n.ts; English with placeholders filled
// by default) with the browser's English keys, so js/i18n/strings.js
// translates them.

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** English: the key with {placeholders} filled. */
export const english: Translate = (key, vars) =>
  vars ? key.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : key;

/** "1st 02:15" — the half's own clock, as the browser's hud.js shows it. */
export function formatClock(time: number, half: number, halfLength: number, t: Translate = english): string {
  const tt = Math.min(time, halfLength * 2);
  const shown = Math.max(0, half === 1 ? tt : tt - halfLength);
  const mm = String(Math.floor(shown / 60)).padStart(2, "0");
  const ss = String(Math.floor(shown % 60)).padStart(2, "0");
  return t(half === 1 ? "1st {time}" : "2nd {time}", { time: `${mm}:${ss}` });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 17, 02:05 PM": the browser's `toLocaleString(lang, { month: 'short',
 * day: 'numeric', hour: '2-digit', minute: '2-digit' })` in en-US, built by
 * hand for runtimes without those Intl options. `offsetMinutes` is the local
 * offset from UTC (`-new Date().getTimezoneOffset()`). */
export function formatReplayDateEnglish(ms: number | null | undefined, offsetMinutes: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "—";
  const d = new Date(ms + offsetMinutes * 60000);
  const h24 = d.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${String(h12).padStart(2, "0")}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
}

/** The replay list's date in the game language, as the browser formats it. */
export function formatReplayDate(ms: number | null | undefined, locale: string): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "—";
  try {
    return new Date(ms).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return formatReplayDateEnglish(ms, -new Date().getTimezoneOffset());
  }
}

export interface MatchStats {
  shots: readonly number[];
  possession: readonly number[];
}

/** The result screen's stats lines (practice only; the server owns online
 * stats). */
export function statsLines(stats: MatchStats | null, t: Translate = english): string[] {
  if (!stats) return [];
  const p0 = Number(stats.possession[0]) || 0;
  const p1 = Number(stats.possession[1]) || 0;
  const poss = p0 + p1 || 1;
  return [
    t("Possession: {a}% – {b}%", { a: Math.round((100 * p0) / poss), b: Math.round((100 * p1) / poss) }),
    t("Shots: {a} – {b}", { a: stats.shots[0] ?? 0, b: stats.shots[1] ?? 0 }),
  ];
}

/** VICTORY / DEFEAT / DRAW for the local team (an English key). */
export function resultTitle(winner: number, myTeam: number): string {
  return winner === -1 ? "DRAW" : winner === myTeam ? "VICTORY" : "DEFEAT";
}

export function playersInLobby(humans: number, t: Translate = english): string {
  return humans === 1 ? t("{n} player in lobby", { n: humans }) : t("{n} players in lobby", { n: humans });
}

/** "A, B vs C" — the sides line of a replay list row. */
export function sidesLine(teams: readonly (readonly string[])[]): string {
  const a = teams[0] ?? [];
  const b = teams[1] ?? [];
  return `${a.join(", ") || "—"} vs ${b.join(", ") || "—"}`;
}

/** The fallback when the replay detail is missing: halve the players list. */
export function halvedSides(names: readonly string[]): string {
  const mid = Math.ceil(names.length / 2);
  return names.length > 1
    ? `${names.slice(0, mid).join(", ")} vs ${names.slice(mid).join(", ")}`
    : names[0] || "—";
}

/** A neutral stand-in name for a user whose profile did not resolve (the
 * browser's `Player <id6>`). */
export function fallbackName(userId: string): string {
  return `Player ${String(userId).slice(0, 6)}`;
}

/** Text from another player shown as one line (no control characters). */
export function oneLine(text: string, max = 300): string {
  let s = "";
  for (const ch of String(text)) {
    const c = ch.codePointAt(0) ?? 0;
    s += c < 32 || c === 127 ? " " : ch;
    if (s.length >= max) break;
  }
  return s;
}
