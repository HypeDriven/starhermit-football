// session-expiry.js — the "session expired" prompt. Once the launch token can
// no longer be renewed (expired, refused, or past the 12 h renewal chain) the
// SDK signs out and sockets stop reconnecting; only a fresh launch from
// StarHermit can mint a new token. The prompt offers that relaunch — from the
// button click, since leaving the launcher frame needs a user gesture — or
// staying in offline practice.
import * as api from './api.js?v=11';
import { platformStrings } from './platform-i18n.js?v=11';

let showing = false;

/**
 * Show the prompt through the game's modal `confirm({title,text,yes,no})`
 * (resolves true for yes); `kind` 'terms' asks for updated-terms consent
 * instead of a fresh session. Resolves 'relaunch' (navigation started),
 * 'refused' (browser blocked it), 'offline' (dismissed) or 'shown' when the
 * prompt is already up.
 */
export async function offerRelaunch(confirm, t = platformStrings(), kind = 'expired') {
  if (showing) return 'shown';
  showing = true;
  try {
    const terms = kind === 'terms';
    const go = await confirm({ title: terms ? t.termsTitle : t.expiredTitle, text: terms ? t.termsText : t.expiredText, yes: t.relaunch, no: t.playOffline });
    if (!go) return 'offline';
    return api.relaunch() ? 'relaunch' : 'refused';
  } finally {
    showing = false;
  }
}
