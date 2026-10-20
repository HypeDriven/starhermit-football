// The game's translation tables (logic/strings.ts) against the text the native
// client shows: every key it passes to T() is translated in every locale with
// its placeholders intact (en-GB, es-ES and fr-CA inherit from en-US, es-419
// and fr-FR), every row is text the client shows, the account strings cover
// the nine locales, and the platform's resolver (sh-language.js) picks the
// locale i18n.ts asks it for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { STRINGS } from "../src/logic/strings.ts";
import { ACCOUNT_LOCALES, accountStrings, pickLocale } from "../src/logic/accountStrings.ts";

const repo = process.env["FOOTBALL_REPO"] ?? ".";
const FULL = ["es-419", "de-DE", "fr-FR", "pt-BR", "it-IT"];
const LOCALES = ["en-US", "en-GB", "es-419", "es-ES", "de-DE", "fr-FR", "fr-CA", "pt-BR", "it-IT"];

/** The client's sources (the tables themselves left out). */
function sources(): string {
  const root = `${repo}/engine/src/`;
  return readdirSync(root, { recursive: true })
    .filter((f) => f.endsWith(".ts") && !f.endsWith("logic/strings.ts"))
    .map((f) => readFileSync(root + f, "utf8"))
    .join("\n");
}

/** The literal keys passed to a translator (T, or format.ts's t), including
 * `T(c ? "…" : "…")`. */
function translatedKeys(src: string): string[] {
  const lit = String.raw`"((?:[^"\\]|\\.)*)"`;
  const keys = new Set<string>();
  for (const m of src.matchAll(new RegExp(String.raw`\b[Tt]\(\s*${lit}`, "g"))) keys.add(m[1]!);
  for (const m of src.matchAll(new RegExp(String.raw`\b[Tt]\([^()"?]*\?\s*${lit}\s*:\s*${lit}`, "g"))) {
    keys.add(m[1]!);
    keys.add(m[2]!);
  }
  return [...keys].filter((k) => /[A-Za-z]/.test(k));
}

const placeholders = (s: string): string => (s.match(/\{\w+\}/g) ?? []).sort().join();

test("every key the client translates is translated in every locale", () => {
  const keys = translatedKeys(sources());
  assert.ok(keys.length > 80, `found ${keys.length} keys`);
  const missing: string[] = [];
  for (const key of keys) {
    for (const l of FULL) if (!Object.prototype.hasOwnProperty.call(STRINGS[l], key)) missing.push(`${l}: ${key}`);
  }
  assert.deepEqual(missing, []);
});

test("every row is text the client shows, with its placeholders intact", () => {
  const src = sources();
  const problems: string[] = [];
  for (const [locale, table] of Object.entries(STRINGS)) {
    if (!LOCALES.includes(locale)) problems.push(`unknown locale ${locale}`);
    for (const [key, text] of Object.entries(table)) {
      if (!src.includes(JSON.stringify(key))) problems.push(`${locale} unused: ${key}`);
      if (placeholders(key) !== placeholders(text)) problems.push(`${locale} placeholders: ${key}`);
    }
  }
  for (const l of ["en-US", "en-GB", "es-ES", "fr-CA"]) if (!STRINGS[l]) problems.push(`no ${l} table`);
  assert.deepEqual(problems, []);
});

test("the account strings cover all nine locales", () => {
  assert.deepEqual([...ACCOUNT_LOCALES], LOCALES);
  const keys = Object.keys(accountStrings("en-US"));
  for (const l of LOCALES) for (const k of keys) assert.ok((accountStrings(l) as Record<string, string>)[k], `${l} ${k}`);
  assert.ok(accountStrings("de-DE").termsText.includes("StarHermit"));
  assert.equal(accountStrings("de-AT").signIn, accountStrings("de-DE").signIn);
  assert.equal(pickLocale("en-AU"), "en-GB");
  assert.equal(pickLocale("fr-CA"), "fr-CA");
  assert.equal(pickLocale("es-MX"), "es-419");
  assert.equal(pickLocale("xx"), "en-US");
});

test("the platform's resolver picks the locale i18n.ts asks for", () => {
  const sandbox: Record<string, unknown> = {};
  sandbox["self"] = sandbox;
  const context = createContext(sandbox);
  runInContext(readFileSync(`${repo}/sh-language.js`, "utf8"), context, { filename: "sh-language.js" });
  const SL = sandbox["StarHermitLanguage"] as {
    resolve(o: { choice: string; platform: string | null; device: string[]; supported: readonly string[]; fallback: string }): { locale: string };
    validChoice(choice: string, supported: readonly string[]): string | null;
  };
  const pick = (choice: string, platform: string | null, device: string[]): string =>
    SL.resolve({ choice, platform, device, supported: LOCALES, fallback: "en-US" }).locale;
  assert.equal(pick("auto", "de-DE", ["fr-FR"]), "de-DE");
  assert.equal(pick("auto", null, ["fr-CA"]), "fr-CA");
  assert.equal(pick("es-ES", "de-DE", []), "es-ES");
  assert.equal(pick("auto", null, ["ja-JP"]), "en-US");
  assert.equal(SL.validChoice("fr-CA", LOCALES), "fr-CA");
  assert.equal(SL.validChoice("auto", LOCALES), "auto");
  // a key with a row reads in the chosen locale, one an inheriting locale lacks from its parent
  assert.equal(STRINGS["de-DE"]!["QUICK PLAY"], "SCHNELLSPIEL");
  assert.equal(STRINGS["es-ES"]!["HALF TIME"], "DESCANSO");
});
