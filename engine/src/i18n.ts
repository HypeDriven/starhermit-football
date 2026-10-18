// The game language for the native client (spec.md §10), from the game's own
// tables and resolver: js/i18n/strings.js and sh-language.js are classic
// scripts loaded with starhermit:script's loadClassic, so the browser's
// translations and locale matching are used unchanged. The choice is the
// per-player game setting `ui.language` ({ choice }) — the same key the
// browser saves — kept by starhermit:storage on the device and in the account.
// Automatic follows the signed-in player's StarHermit language, then the
// player's interface language (the device's for a guest), then en-US. The
// UI announces in it through starhermit:ui's setLanguage. The account
// strings are the browser's js/platform-i18n.js, imported as a module.
import { onPreferencesChange, preferences } from "starhermit:engine";
import { loadClassic } from "starhermit:script";
import { settings } from "starhermit:storage";
import * as ui from "starhermit:ui";
import { me } from "./platform.ts";
import { platformStrings as browserPlatformStrings } from "../../js/platform-i18n.js";

export const LOCALES = ["en-US", "en-GB", "es-419", "es-ES", "de-DE", "fr-FR", "fr-CA", "pt-BR", "it-IT"] as const;
const PARENT: Record<string, string> = { "en-GB": "en-US", "es-ES": "es-419", "fr-CA": "fr-FR" };
const SETTING = "ui.language";

interface ShLanguageInstance {
  setChoice(value: string): Promise<boolean>;
  text(): string[];
  label(locale: string): string;
}
interface ShLanguage {
  NATIVE: Record<string, string>;
  match(tag: string, supported?: readonly string[]): string | null;
  resolve(o: { choice: string; platform: string | null; device: string[]; supported: readonly string[]; fallback: string }): { locale: string; source: string };
  validChoice(choice: string, supported?: readonly string[]): string | null;
  create(opts: Record<string, unknown>): ShLanguageInstance;
}

let tables: Record<string, Record<string, string>> = {};
let SL: ShLanguage | null = null;
let texts: ShLanguageInstance | null = null;
let lang = "en-US";
let choice = "auto";
let status: "account" | "device" | "unavailable" = "device";
const listeners = new Set<(lang: string) => void>();

function lookup(key: string): string {
  for (let l: string | undefined = lang; l; l = PARENT[l]) {
    const t = tables[l];
    if (t && Object.prototype.hasOwnProperty.call(t, key)) return t[key]!;
  }
  return key;
}

/** Translate an English source string; {name} placeholders filled from vars
 * (the browser's FBI18N.T). Native-only text is its own English key. */
export function T(key: string, vars?: Record<string, string | number>): string {
  const s = lookup(key);
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
}

export function language(): string {
  return lang;
}

export function languageChoice(): string {
  return choice;
}

export function onLanguage(fn: (lang: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function compute(): void {
  const platform = me();
  const resolved = SL
    ? SL.resolve({ choice, platform: platformLanguage(platform), device: deviceLanguages(), supported: LOCALES, fallback: "en-US" }).locale
    : "en-US";
  status = platform ? "account" : "device";
  if (resolved === lang) return;
  lang = resolved;
  try {
    ui.setLanguage(lang);
  } catch {
    // the UI keeps the player's language
  }
  for (const fn of listeners) fn(lang);
}

function platformLanguage(p: ReturnType<typeof me>): string | null {
  return p?.language || null;
}

function deviceLanguages(): string[] {
  try {
    return [preferences().language];
  } catch {
    return [];
  }
}

function readChoice(): string {
  try {
    const v = settings.get(SETTING) as { choice?: unknown } | undefined;
    const c = v && typeof v === "object" && typeof v.choice === "string" ? v.choice : null;
    return (c && SL?.validChoice(c, LOCALES)) || "auto";
  } catch {
    return "auto";
  }
}

/** Loads the tables and the resolver and applies the stored choice. */
export function loadLanguages(): void {
  try {
    loadClassic("js/i18n/strings.js");
    loadClassic("sh-language.js");
  } catch (e) {
    console.warn("i18n: the game's language files did not load:", e instanceof Error ? e.message : String(e));
  }
  const g = globalThis as unknown as { FB_STRINGS?: Record<string, Record<string, string>>; StarHermitLanguage?: ShLanguage };
  tables = g.FB_STRINGS ?? {};
  SL = g.StarHermitLanguage ?? null;
  // a resolver instance with no storage or SDK: only its localized labels are used
  texts = SL ? SL.create({ game: "football", supported: LOCALES, window: { navigator: { languages: [] } }, starhermit: false, register: false, panel: false }) : null;
  choice = readChoice();
  compute();
  try {
    onPreferencesChange(() => compute());
  } catch {
    // no preference events
  }
  try {
    settings.onChange((key) => {
      if (key !== SETTING) return;
      choice = readChoice();
      compute();
    });
  } catch {
    // no settings sync
  }
}

/** The player's sign-in changed: Automatic may follow a new account language. */
export function refreshLanguage(): void {
  compute();
}

/** Applies at once and saves to the game setting `ui.language`. */
export function setLanguageChoice(value: string): void {
  const v = SL?.validChoice(value, LOCALES);
  if (!v) return;
  choice = v;
  try {
    settings.set(SETTING, { choice: v });
  } catch {
    status = "unavailable";
  }
  compute();
}

function textsFor(locale: string): string[] {
  if (!texts) return ["Automatic — {lang}", "Saved to account", "Saved on this device", "Account sync unavailable", "Saving…", "Language", "Game language"];
  void texts.setChoice(locale);
  return texts.text();
}

/** "Automatic — Français (Canada)" in the effective language. */
export function autoLabel(): string {
  return textsFor(lang)[0]!.replace("{lang}", nativeName(lang));
}

export function nativeName(locale: string): string {
  return SL?.NATIVE[locale] ?? locale;
}

/** The selector's heading and status line (sh-language.js's own strings). */
export function languageTexts(): { heading: string; label: string; status: string } {
  const t = textsFor(lang);
  return { heading: t[5]!, label: t[6]!, status: status === "account" ? t[1]! : status === "unavailable" ? t[3]! : t[2]! };
}

// ── the StarHermit account strings (js/platform-i18n.js) ──

/** The account-surface strings in the game language. */
export function platformStrings(): Record<string, string> {
  try {
    return browserPlatformStrings(lang) as Record<string, string>;
  } catch {
    return browserPlatformStrings("en-US") as Record<string, string>;
  }
}

/** Locale-aware upper case where the runtime has it. */
export function upper(s: string): string {
  try {
    return s.toLocaleUpperCase(lang);
  } catch {
    return s.toUpperCase();
  }
}
