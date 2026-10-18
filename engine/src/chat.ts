// In-match text chat, online matches only (the browser's js/chat.js). Every
// game session has a platform conversation (session → chatConversationId).
// History comes from chat.messages, new messages from the SDK's polled
// channel; the newest lines show bottom-left over the HUD with a text field
// under them (T focuses it, Enter sends, Escape cancels). Best-effort: any
// failure degrades to a status line or silence — the match never depends
// on chat. The field lays out in its own corner with starhermit:ui's area.
import { frame } from "starhermit:engine";
import type { Unsubscribe } from "starhermit:engine";
import * as draw from "starhermit:draw";
import { onKey } from "starhermit:input";
import * as ui from "starhermit:ui";
import type { ChatChannel, ChatMessage } from "starhermit:platform";
import { ChatLog, SendLimiter } from "./logic/chat.ts";
import { oneLine } from "./logic/format.ts";
import { ACCENT2, BORDER, PANEL, panel } from "./hud.ts";
import { P, displayNameNow, errorKind } from "./platform.ts";
import { T } from "./i18n.ts";

const PAGE_SIZE = 50;
const FAILS_BEFORE_NOTICE = 3;
const MAX_CHARS = 300;
const FIELD = "match-chat-input";
/** Lines the panel shows (the browser's 9.5em list). */
const VISIBLE_LINES = 8;

export interface MatchChat {
  start(): void;
  dispose(): void;
  setVisible(show: boolean): void;
  readonly visible: boolean;
  /** The chat field has the keyboard. */
  readonly typing: boolean;
  /** Draws the message list (starhermit:draw). */
  draw(): void;
  /** The text field's window rectangle, for this frame's ui viewport. */
  fieldRect(): { x: number; y: number; width: number; height: number };
  /** Builds the text field (inside a ui viewport at fieldRect()). */
  field(): void;
}

export function createMatchChat(sessionId: string, myUserId: string | null): MatchChat {
  const me = String(myUserId ?? "").toLowerCase();
  const log = new ChatLog<ChatMessage>();
  const limiter = new SendLimiter();
  let convId: string | null = null;
  let channel: ChatChannel | null = null;
  const subs: Unsubscribe[] = [];
  let started = false;
  let visible = false;
  let failures = 0;
  let outageShown = false;
  let draft = "";
  let cancel = false;

  const typing = (): boolean => ui.focused() === FIELD;

  const keySub = onKey((e) => {
    if (!started || !visible || !e.pressed) return;
    if (typing()) {
      if (e.code === "Escape") cancel = true;
      return;
    }
    // T opens the input (T is unbound in the default bindings); its own
    // text never reaches the field.
    if (e.code === "KeyT" && !e.repeat && !ui.capturingKeys()) {
      e.consume();
      ui.setFocus(FIELD);
    }
  });

  function failed(): void {
    if (++failures >= FAILS_BEFORE_NOTICE && !outageShown) {
      outageShown = true;
      log.addSystem(T("chat unavailable"));
    }
  }

  async function send(text: string): Promise<void> {
    if (!text || !convId) return;
    if (!limiter.take(performance.now())) {
      log.addSystem(T("slow down…"));
      return;
    }
    try {
      const m = await P.chat.post(convId, text);
      log.add(m);
      log.rebuild();
    } catch (e) {
      log.addSystem(errorKind(e) === "rate-limited" ? T("slow down — chat rate limit") : T("message not sent"));
    }
  }

  return {
    start(): void {
      if (started) return;
      started = true;
      void (async () => {
        try {
          const detail = await P.sessions.get(sessionId);
          if (!started) return; // disposed while the request was in flight
          convId = detail?.chatConversationId ?? null;
          if (!convId) return; // session not bridged to a conversation — silent
          const page = await P.chat.messages(convId, { page: 1, pageSize: PAGE_SIZE }).catch(() => null);
          if (!started) return;
          if (page) for (const m of page.items) log.add(m);
          else failed();
          log.rebuild();
          const ch = P.chat.subscribe(convId);
          channel = ch;
          subs.push(
            ch.on("message", (m) => {
              failures = 0;
              outageShown = false;
              log.add(m);
              log.rebuild();
            }),
            ch.on("error", () => failed()),
          );
        } catch {
          // no session detail, no chat — stay silent
        }
      })();
    },

    dispose(): void {
      started = false;
      convId = null;
      for (const u of subs) u();
      subs.length = 0;
      keySub();
      try {
        channel?.close();
      } catch {
        // already closed
      }
      channel = null;
      if (typing()) ui.setFocus(null);
      log.clear();
    },

    setVisible(show: boolean): void {
      visible = show;
      if (!show && typing()) ui.setFocus(null);
    },

    get visible() {
      return visible && started;
    },

    get typing() {
      return typing();
    },

    draw(): void {
      if (!visible || !started) return;
      const f = frame();
      const s = f.scale;
      const size = 12.48 * s; // #match-chat 0.78rem
      const lineH = size * 1.3;
      const rect = this.fieldRect();
      const x = rect.x;
      const width = rect.width;
      // the newest VISIBLE_LINES lines: messages, then status lines
      const tail = log.tail;
      const sys = log.system;
      const total = tail.length + sys.length;
      if (!total) return;
      const first = Math.max(0, total - VISIBLE_LINES);
      const count = total - first;
      const padX = 0.6 * 16 * s;
      const padY = 0.35 * 16 * s;
      const h = count * lineH + padY * 2;
      const y = rect.y - 4 * s - h;
      panel(x, y, width, h, 8 * s, s, BORDER, PANEL);
      let ly = y + padY;
      const clip = { x, y, width, height: h };
      for (let i = first; i < total; i++) {
        let lx = x + padX;
        if (i >= tail.length) {
          draw.text(sys[i - tail.length]!, lx, ly, { size, color: "#93a1b0", clip });
        } else {
          const m = tail[i]!;
          if (m.kind && m.kind !== "text") {
            draw.text(oneLine(m.content ?? ""), lx, ly, { size, color: "#93a1b0", clip });
          } else {
            const own = String(m.senderId ?? "").toLowerCase() === me;
            const label = `${displayNameNow(m.senderId) ?? "…"} `;
            draw.text(label, lx, ly, { size, color: own ? ACCENT2 : "#9fb0c0", weight: "700", clip });
            lx += draw.measureText(label, { size, weight: "700" }).width;
            draw.text(oneLine(m.content ?? ""), lx, ly, { size, color: "#d7e1e9", clip });
          }
        }
        ly += lineH;
      }
    },

    fieldRect(): { x: number; y: number; width: number; height: number } {
      const f = frame();
      const s = f.scale;
      const width = Math.min(300 * s, f.width * 0.6);
      const height = 30 * s;
      return { x: 14 * s, y: f.height - Math.max(14 * s, f.safeArea.bottom) - height, width, height };
    },

    field(): void {
      if (!visible || !started) return;
      const s = frame().scale;
      draft = ui.id(FIELD).textField(FIELD, draft, {
        maxChars: MAX_CHARS,
        width: Math.max(80, this.fieldRect().width / s - 16),
        placeholder: T("Press T to chat"),
      });
      if (ui.submitted(FIELD)) {
        const text = draft.trim();
        draft = "";
        ui.setFocus(null);
        void send(text);
      } else if (cancel) {
        cancel = false;
        draft = "";
        ui.setFocus(null);
      }
    },
  };
}
