// Localization coverage: every English key the UI shows — static index.html
// markup, HTML literals in the modules, T('…') / N('…') keys in code — is
// translated in every locale (en-GB → en-US, es-ES → es-419, fr-CA → fr-FR
// inherit) with intact placeholders; the language follows sh-language.js and
// switches live; the Settings panel and the account strings (including the
// updated-terms prompt) cover the nine locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadTables, codeKeys, literals, htmlKeys, mixedSegments, markupKeys, audit, bootI18n, LOCALES } from './i18n-common.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const FILES = ['js/i18n/strings.js'];
const JS = readdirSync(new URL('js/', ROOT), { recursive: true })
  .filter((f) => f.endsWith('.js') && !f.startsWith('i18n') && !/i18n\.js$|settings\.js$/.test(f)).map((f) => 'js/' + f);

export function usedKeys() {
  const keys = new Set(markupKeys(read('index.html')));
  for (const f of JS) {
    const src = read(f);
    codeKeys(src).forEach((k) => keys.add(k));
    for (const lit of literals(src)) htmlKeys(lit).forEach((k) => keys.add(k));
  }
  return [...keys].filter((k) => /[A-Za-z]/.test(k)).sort();
}

test('every used key is translated in every locale; placeholders intact', () => {
  assert.deepEqual(audit(loadTables(ROOT, FILES, 'FB_STRINGS'), usedKeys()), []);
});

test('template text never mixes words with an interpolation in one text node', () => {
  const bad = [];
  for (const f of JS) for (const lit of literals(read(f))) bad.push(...mixedSegments(lit));
  assert.deepEqual(bad, []);
});

test('the locale follows sh-language and switches live', () => {
  const { I18N, events, doc } = bootI18n(ROOT, { files: ['sh-language.js', ...FILES, 'js/i18n/i18n.js'], global: 'FBI18N', event: 'fb-language', languages: ['de-DE'] });
  assert.equal(I18N.lang, 'de-DE');
  assert.equal(doc.documentElement.lang, 'de-DE');
  assert.equal(I18N.T('QUICK PLAY'), 'SCHNELLSPIEL');
  I18N.language.setChoice('fr-CA');
  assert.equal(I18N.lang, 'fr-CA');
  assert.equal(events.at(-1), 'fr-CA');
  I18N.language.setChoice('es-ES');
  assert.equal(I18N.T('Finding players… {n}s', { n: 12 }), 'Buscando jugadores… 12 s');
});

test('settings panel and account strings cover all nine locales', async () => {
  const { platformStrings } = await import('../js/platform-i18n.js?v=10');
  const src = read('js/settings.js');
  for (const l of LOCALES) {
    for (const k of Object.keys(platformStrings('en-US'))) assert.ok(platformStrings(l)[k], `${l} ${k}`);
    if (!['en-US', 'en-GB'].includes(l)) assert.ok(src.includes(`'${l}': {`), `settings.js has ${l}`);
  }
  assert.ok(platformStrings('de-DE').termsText.includes('StarHermit'));
  assert.match(src, /addEventListener\('fb-language'/);
});
