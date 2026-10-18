// Text for the engine's built-in font. Without a package font the host draws
// every generic family with one 5×7 pixel face that covers printable ASCII
// plus · × — … and the four arrows; anything else draws as a missing-glyph
// box. Displayed text goes through shown(): typographic characters become
// their ASCII look-alikes and Latin letters lose their accents (NFD without
// combining marks), so the browser's translations and players' names stay
// readable. Remove once the host's text covers Latin (HOST-API-GAPS.md).

const MAP: Record<string, string> = {
  "–": "-", "‒": "-", "−": "-", "‐": "-", "‑": "-",
  "‘": "'", "’": "'", "‚": "'", "′": "'", "‹": "'", "›": "'",
  "“": '"', "”": '"', "„": '"', "″": '"', "«": '"', "»": '"',
  " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", " ": " ",
  "ß": "ss", "ẞ": "SS", "æ": "ae", "Æ": "AE", "œ": "oe", "Œ": "OE",
  "ø": "o", "Ø": "O", "ł": "l", "Ł": "L", "đ": "d", "Đ": "D",
  "ð": "d", "Ð": "D", "þ": "th", "Þ": "Th", "ı": "i",
  "¡": "!", "¿": "?", "º": "o", "ª": "a", "•": "·", "●": "·",
  "★": "*", "☆": "*", "☰": "=",
};
/** Non-ASCII characters the built-in font has. */
const KEEP = new Set(["·", "×", "—", "…", "←", "↑", "→", "↓"]);
const PLAIN = /^[\x20-\x7e\n\t]*$/;

const cache = new Map<string, string>();

/** `text` as the built-in font can draw it. */
export function shown(text: string): string {
  if (PLAIN.test(text)) return text;
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  let out = "";
  for (const ch of text.normalize("NFD")) {
    if (KEEP.has(ch) || PLAIN.test(ch)) out += ch;
    else if (ch < "̀" || ch > "ͯ") out += MAP[ch] ?? ch; // combining marks drop
  }
  if (cache.size > 512) cache.clear();
  cache.set(text, out);
  return out;
}
