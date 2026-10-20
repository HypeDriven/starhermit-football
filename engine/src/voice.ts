// In-match voice chat with distance-based volume (spec.md §9) on starhermit:platform's voice: the SDK joins the match
// conversation's voice room (the runtime asks for the microphone and lights
// its indicator) and carries the audio; the client sets each speaker's
// volume and pan at 10 Hz from the distance and side between the two
// footballers. Opt-out via the main menu's checkbox (the per-player game
// setting `voice`), M or the HUD button mutes.
// Best-effort: any failure degrades to silence.
import { onKey } from "starhermit:input";
import * as ui from "starhermit:ui";
import { settings } from "starhermit:storage";
import { VOICE_POS_HZ, voiceGain, voicePan } from "./logic/presence.ts";
import { P, me } from "./platform.ts";

const SETTING = "voice";

export interface VoicePlayer {
  userId: string | null;
  x: number;
  z: number;
  facing: number;
}

export interface Voice {
  readonly active: boolean;
  readonly muted: boolean;
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  joinMatch(sessionId: string): void;
  leaveMatch(): void;
  toggleMute(): void;
  updatePositions(dt: number, players: readonly VoicePlayer[] | null, myPlayerId: number): void;
}

function readEnabled(): boolean {
  try {
    return settings.get(SETTING) !== false; // default: on
  } catch {
    return true;
  }
}

export function createVoice(): Voice {
  let enabled = readEnabled();
  let generation = 0; // join generation — stale async steps bail out
  let active = false;
  let matchSessionId: string | null = null;
  let muted = false;
  let posTimer = 0;
  const volumes = new Map<string, number>();
  const pans = new Map<string, number | null>();

  const live = (g: number): boolean => g === generation && active;

  function setMuted(m: boolean): void {
    muted = !!m;
    if (active) {
      try {
        P.voice.setMuted(muted);
      } catch {
        // voice gone
      }
    }
  }

  onKey((e) => {
    if (!active || e.code !== "KeyM" || !e.pressed || e.repeat) return;
    if (ui.capturingKeys()) return; // typing in chat
    setMuted(!muted);
  });

  async function joinMatch(sid: string): Promise<void> {
    hangup();
    matchSessionId = sid || null;
    if (!enabled || !sid || !me()) return;
    const g = ++generation;
    active = true;
    try {
      const detail = await P.sessions.get(sid);
      if (!live(g)) return;
      const convId = detail?.chatConversationId;
      if (!convId) {
        hangup(); // session has no conversation (not bridged)
        return;
      }
      await P.voice.join(convId); // the runtime prompts for the microphone
      if (!live(g)) {
        void P.voice.leave().catch(() => {});
        return;
      }
      P.voice.setMode("open-mic");
      setMuted(muted); // publish my mute state and show the mic button
    } catch (e) {
      if (live(g)) {
        console.warn("voice: join failed:", e instanceof Error ? e.message : String(e));
        hangup();
      }
    }
  }

  /** Tear down the voice connection but remember the match (the menu
   * checkbox can rejoin). */
  function hangup(): void {
    generation++;
    const was = active;
    active = false;
    volumes.clear();
    pans.clear();
    if (was) void P.voice.leave().catch(() => {});
  }

  return {
    get active() {
      return active;
    },
    get muted() {
      return muted;
    },
    isEnabled: () => enabled,
    setEnabled(v: boolean): void {
      enabled = !!v;
      try {
        settings.set(SETTING, enabled);
      } catch {
        // settings unavailable
      }
      if (!enabled) hangup();
      else if (matchSessionId && !active) void joinMatch(matchSessionId);
    },
    joinMatch(sid: string): void {
      void joinMatch(sid);
    },
    leaveMatch(): void {
      matchSessionId = null;
      hangup();
    },
    toggleMute(): void {
      setMuted(!muted);
    },
    updatePositions(dt: number, players: readonly VoicePlayer[] | null, myPlayerId: number): void {
      if (!active || !players) return;
      posTimer -= dt;
      if (posTimer > 0) return;
      posTimer = 1 / VOICE_POS_HZ;
      const mine = players[myPlayerId];
      if (!mine) return;
      let status;
      try {
        status = P.voice.status();
      } catch {
        return;
      }
      for (const part of status.participants) {
        const id = String(part.userId).toLowerCase();
        if (myPlayerId >= 0 && mine.userId && String(mine.userId).toLowerCase() === id) continue;
        let volume = 0;
        let pan: number | null = pans.get(id) ?? null;
        if (!part.muted && !part.serverMuted) {
          // find the speaker's footballer by userId (AI seats have none)
          let sp: VoicePlayer | null = null;
          for (const p of players) {
            if (p.userId && String(p.userId).toLowerCase() === id) {
              sp = p;
              break;
            }
          }
          if (sp) {
            const dx = sp.x - mine.x;
            const dz = sp.z - mine.z;
            volume = voiceGain(Math.hypot(dx, dz));
            // pan by direction relative to my facing (kept when too close)
            pan = voicePan(dx, dz, mine.facing || 0) ?? pan;
          }
        }
        try {
          if (volumes.get(id) !== volume) {
            volumes.set(id, volume);
            P.voice.setVolume(part.userId, volume);
          }
          if (pans.get(id) !== pan) {
            pans.set(id, pan);
            P.voice.setPan(part.userId, pan);
          }
        } catch {
          // participant left
        }
      }
    },
  };
}
