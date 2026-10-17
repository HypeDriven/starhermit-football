// The player's runtime preferences the game follows (engine.preferences):
// reduced motion stills the stadium's ambient effects, as the browser does
// under prefers-reduced-motion.
import { onPreferencesChange, preferences } from "starhermit:engine";

let reduced: boolean | null = null;

export function reducedMotion(): boolean {
  if (reduced === null) {
    try {
      reduced = preferences().reducedMotion;
      onPreferencesChange((p) => {
        reduced = p.reducedMotion;
      });
    } catch {
      reduced = false;
    }
  }
  return reduced;
}
