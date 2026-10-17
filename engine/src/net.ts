// Match transport (the browser's js/net.js) on starhermit:platform's
// sockets. The game socket (ws/v1/games) carries the server-authoritative
// match: a `{type:'sync'}` command on every (re)open for a full snapshot
// (the SDK sends it as the platform's `cmd` frame), realtime input frames up
// (the SDK sets `type:'input'` and `realtime:true`), the script's
// `{type:'snap'|'ev'}` broadcasts and achievement unlocks down; a socket that
// stops says why (signed out, updated terms, the match gone). The room
// socket (ws/v1/realtime) stays open only for roster pushes. The SDK
// reconnects by itself (and holds the tickets), so there is no backoff or
// token handling here.
import * as P from "starhermit:platform";
import type { GameSocket, Participant, RoomSocket } from "starhermit:platform";
import type { JsonValue, Unsubscribe } from "starhermit:engine";

export interface GameHandlers {
  onSnapshot(snap: Record<string, unknown>): void;
  onEvent(ev: Record<string, unknown>): void;
  onAchievement(data: JsonValue): void;
  /** The connection stopped for good (another reason than below). */
  onClose(reason: string): void;
  /** The player's StarHermit session ended (the SDK signed out). */
  onAuthLost(): void;
  /** StarHermit needs the player to accept updated terms. */
  onTermsRequired(): void;
  /** The session is gone, finished or on another build. */
  onUnavailable(): void;
  /** Reconnected after an outage: drop prediction, a sync follows. */
  onResumed(): void;
}

/** The input frame the script reads (spec.md §6). */
export interface InputCmd {
  seq: number;
  mx: number;
  mz: number;
  turn?: number;
  fwd?: number;
  sprint: boolean;
  pass: boolean;
  shoot: number;
  tackle: boolean;
}

function record(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export class GameClient {
  private socket: GameSocket | null = null;
  private subs: Unsubscribe[] = [];
  private closed = false;
  /** Action edges a paced send dropped; they ride the next frame. */
  private pending = { pass: false, shoot: 0, tackle: false };

  constructor(private readonly sessionId: string) {}

  /** Resolves on the first open; rejects when the socket stops or drops
   * before it ever opened. */
  connect(h: GameHandlers): Promise<void> {
    return new Promise((resolve, reject) => {
      let opened = false;
      let socket: GameSocket;
      try {
        socket = P.connectGame(this.sessionId);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      this.socket = socket;
      this.subs.push(
        socket.on("open", () => {
          // a full snapshot comes back to us only
          socket.sendCommand({ type: "sync" });
          if (!opened) {
            opened = true;
            resolve();
          }
        }),
        socket.on("disconnected", () => {
          if (!opened) {
            this.close();
            reject(new Error("Games socket connection failed"));
          }
        }),
        socket.on("stopped", (reason) => {
          if (!opened) {
            reject(new Error(`Games socket stopped (${reason})`));
            return;
          }
          if (this.closed) return;
          if (reason === "signed-out") h.onAuthLost();
          else if (reason === "terms-required") h.onTermsRequired();
          else if (reason === "ended" || reason === "build-mismatch" || reason === "forbidden") h.onUnavailable();
          else h.onClose(reason);
        }),
        socket.on("game", (data) => {
          const d = record(data);
          if (!d) return;
          if (d["type"] === "snap") h.onSnapshot(d);
          else if (d["type"] === "ev") {
            const ev = record(d["ev"]);
            if (ev) h.onEvent(ev);
          }
        }),
        // server-authoritative achievement unlock, addressed to the earner
        socket.on("achievement", (data) => h.onAchievement(data)),
        socket.on("resumed", () => {
          h.onResumed();
          socket.sendCommand({ type: "sync" });
        }),
      );
    });
  }

  /** Movement is latest-wins and may be dropped under pacing; an action
   * edge is never lost — it rides the next send. */
  sendInput(input: InputCmd): boolean {
    const s = this.socket;
    if (!s || this.closed) return false;
    const pass = input.pass || this.pending.pass;
    const shoot = Math.max(input.shoot, this.pending.shoot);
    const tackle = input.tackle || this.pending.tackle;
    const frame: { [key: string]: JsonValue } = {
      type: "input", realtime: true, seq: input.seq,
      mx: input.mx, mz: input.mz, sprint: input.sprint, pass, shoot, tackle,
    };
    if (input.turn !== undefined) frame["turn"] = input.turn;
    if (input.fwd !== undefined) frame["fwd"] = input.fwd;
    let sent = false;
    try {
      sent = s.sendInput(frame);
    } catch {
      sent = false;
    }
    if (sent) this.pending = { pass: false, shoot: 0, tackle: false };
    else this.pending = { pass, shoot, tackle };
    return sent;
  }

  close(): void {
    this.closed = true;
    for (const u of this.subs) u();
    this.subs = [];
    try {
      this.socket?.close();
    } catch {
      // already closed
    }
    this.socket = null;
  }
}

/** The room socket, kept for roster pushes during a match (names and AI
 * flags; snapshots carry the same data, so this is a fast-path backup). */
export class RosterClient {
  private socket: RoomSocket | null = null;
  private unsub: Unsubscribe | null = null;

  connect(roomId: string, onRoster: (parts: readonly Participant[]) => void): void {
    try {
      const socket = P.rooms.connect(roomId);
      this.socket = socket;
      this.unsub = socket.on("roster", (room) => onRoster(room.participants));
    } catch {
      // ancillary — snapshots carry the same data
    }
  }

  close(): void {
    this.unsub?.();
    this.unsub = null;
    try {
      this.socket?.close();
    } catch {
      // already closed
    }
    this.socket = null;
  }
}
