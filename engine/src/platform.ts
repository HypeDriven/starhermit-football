// The platform for the game: its calls through starhermit:platform, which holds the player's credentials —
// no token ever reaches the game, so there is no launch-token handling or
// remint here. Every call can fail with a PlatformError; online features
// degrade to a clear "online unavailable" message instead of failing the
// game.
import * as P from "starhermit:platform";
import { clipboard } from "starhermit:engine";
import type { PlatformError, Player } from "starhermit:platform";
import type { Texture } from "starhermit:scene";
import { fallbackName } from "./logic/format.ts";
import { canvasTexture, makeCanvas } from "./world/resources.ts";

export interface Me {
  userId: string;
  username: string;
  displayName: string;
  /** The StarHermit account's language (BCP 47). */
  language: string;
}

/** The signed-in player, or null for a local guest (or when the runtime
 * offers no platform session). */
export function me(): Me | null {
  try {
    const p: Player | null = P.player();
    return p ? { userId: p.userId, username: p.username, displayName: p.displayName, language: p.language } : null;
  } catch {
    return null;
  }
}

/** Online modes need a signed-in player. */
export function online(): boolean {
  return me() !== null;
}

function isPlatformError(e: unknown): e is PlatformError {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "PlatformError";
}

export function errorKind(e: unknown): string | null {
  return isPlatformError(e) ? e.kind : null;
}

/** The platform could not be reached or is not offered to this game. */
export function isUnavailable(e: unknown): boolean {
  const k = errorKind(e);
  return k === "not-allowed" || k === "signed-out" || k === "unavailable" || k === "transport" || k === "terms-required" || k === "unauthorized";
}

/** What the menus show for a failed call. */
export function errorMessage(e: unknown): string {
  if (isUnavailable(e)) {
    const k = errorKind(e);
    if (k === "signed-out" || k === "unauthorized") return "Online unavailable — sign in to StarHermit (F1) to play online.";
    if (k === "terms-required") return "Online unavailable — accept the StarHermit terms (F1) to play online.";
    return "Online unavailable — the StarHermit platform cannot be reached right now.";
  }
  if (e instanceof Error) return e.message || e.name;
  return String(e);
}

// Player-facing views render the profile's display name (nickname first),
// never the raw account username; lookups that fail fall back to a neutral
// shortened id. Cached per user for the session (chat, leaderboard and
// replays re-render often).
const displayNames = new Map<string, Promise<string>>();
const resolvedNames = new Map<string, string>();

export function displayName(userId: string | null | undefined): Promise<string> {
  if (!userId) return Promise.resolve("Player");
  const key = String(userId).toLowerCase();
  let hit = displayNames.get(key);
  if (!hit) {
    hit = P.profile(userId)
      .then((p) => p.displayName || fallbackName(userId))
      .catch(() => fallbackName(userId))
      .then((n) => {
        resolvedNames.set(key, n);
        return n;
      });
    displayNames.set(key, hit);
  }
  return hit;
}

/** The resolved nickname now, or null while the lookup runs (it starts
 * one); immediate-mode screens call this every frame. */
export function displayNameNow(userId: string | null | undefined): string | null {
  if (!userId) return null;
  const key = String(userId).toLowerCase();
  const n = resolvedNames.get(key);
  if (n) return n;
  void displayName(userId);
  return null;
}

// Avatars (the lobby's seat chips) as small textures, cached per user for
// the session; a user with no avatar caches null.
const avatars = new Map<string, Texture | null>();
const avatarLoads = new Set<string>();

export function avatarNow(userId: string | null | undefined): Texture | null {
  if (!userId) return null;
  const key = String(userId).toLowerCase();
  if (avatars.has(key)) return avatars.get(key) ?? null;
  if (!avatarLoads.has(key)) {
    avatarLoads.add(key);
    P.avatar(userId)
      .then((bitmap) => {
        if (!bitmap) {
          avatars.set(key, null);
          return;
        }
        const [c, ctx] = makeCanvas(48, 48);
        ctx.beginPath();
        ctx.arc(24, 24, 24, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(bitmap, 0, 0, 48, 48);
        bitmap.close();
        avatars.set(key, canvasTexture(c));
      })
      .catch(() => avatars.set(key, null));
  }
  return null;
}

/** The player's shareable invite link to this game, fetched ahead so a
 * button press can copy it in the same frame (null while it loads or
 * signed out). */
let invite: { userId: string; url: string | null } | null = null;
export function inviteLinkNow(): string | null {
  const mine = me();
  if (!mine) return null;
  if (!invite || invite.userId !== mine.userId) {
    const entry: { userId: string; url: string | null } = { userId: mine.userId, url: null };
    invite = entry;
    P.inviteLink()
      .then((url) => {
        entry.url = url;
      })
      .catch(() => {
        if (invite === entry) invite = null; // ask again later
      });
  }
  return invite.url;
}

/** Writes text to the system clipboard (inside a press's frame); false
 * when the runtime refuses. */
export function copyText(text: string): boolean {
  try {
    clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export { P };
