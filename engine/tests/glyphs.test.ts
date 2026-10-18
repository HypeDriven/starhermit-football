import { test } from "node:test";
import assert from "node:assert/strict";
import { shown } from "../src/logic/glyphs.ts";

test("text for the built-in font keeps ASCII and the symbols it has", () => {
  assert.equal(shown("PRACTICE vs AI"), "PRACTICE vs AI");
  assert.equal(shown("Offline mode — practice only…"), "Offline mode — practice only…");
  assert.equal(shown("LEFT SHOOT · RIGHT PASS × 2 ← →"), "LEFT SHOOT · RIGHT PASS × 2 ← →");
});

test("typographic characters become ASCII look-alikes and accents drop", () => {
  assert.equal(shown("3 – 9"), "3 - 9");
  assert.equal(shown("Pas encore d’amis"), "Pas encore d'amis");
  assert.equal(shown("Tomás Rocha"), "Tomas Rocha");
  assert.equal(shown("Übung für Spieler"), "Ubung fur Spieler");
  assert.equal(shown("Entraînement · Français"), "Entrainement · Francais");
  assert.equal(shown("¿Straße?"), "?Strasse?");
  assert.equal(shown("● online"), "· online");
});

test("characters with no stand-in pass through", () => {
  assert.equal(shown("日本"), "日本");
  assert.equal(shown("a\nb"), "a\nb");
});
