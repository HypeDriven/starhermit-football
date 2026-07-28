// chat.js — in-match text chat (online matches only).
//
// Every game session has a platform chat conversation (session detail →
// chatConversationId, type "game"). Launch tokens may use the chat REST API
// but cannot open ws/v1/chat, so this polls the message list every 5 s and
// renders the tail into a small HUD panel (bottom-left, inside #hud).
// Like voice, chat is best-effort: any failure degrades to a muted status
// line or silence — the match itself never depends on it.
import * as api from './api.js?v=6';

const POLL_MS = 5000;
const PAGE_SIZE = 50;
const MAX_SHOWN = 50;        // DOM cap; the panel's max-height shows ~8
const MIN_SEND_GAP_MS = 1500;
const MAX_SENDS_PER_MIN = 8; // client-side cap; the platform limit is 10/min
const FAILS_BEFORE_NOTICE = 3;

export function createMatchChat({ sessionId, myUserId }) {
  const me = String(myUserId ?? '').toLowerCase();
  let convId = null;
  let started = false;
  let pollTimer = null;
  let pollFails = 0;
  let outageShown = false;
  let lastSendAt = 0;
  const sendTimes = [];      // sliding window for the per-minute cap
  const messages = new Map(); // id → dto (dedupe across polls)
  const sysLines = [];        // status notices, rendered after the messages

  // ── DOM (appended into #hud, which is pointer-events:none) ──
  const panel = document.createElement('div');
  panel.id = 'match-chat';
  panel.className = 'hidden';
  const list = document.createElement('div');
  list.id = 'match-chat-list';
  const input = document.createElement('input');
  input.id = 'match-chat-input';
  input.type = 'text';
  input.maxLength = 300;
  input.placeholder = 'Press T to chat';
  input.autocomplete = 'off';
  panel.append(list, input);
  document.getElementById('hud').appendChild(panel);

  const typing = () => document.activeElement === input;

  // ── rendering ───────────────────────────────────────────────
  // Rebuild from the merged map every poll: cheap at this size and immune to
  // whatever order the API pages in (sorted by sentAt, newest at the bottom).
  function rebuild() {
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
    const tail = [...messages.values()]
      .filter((m) => !m.isDeleted)
      .sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt))
        || String(a.id).localeCompare(String(b.id)))
      .slice(-MAX_SHOWN);
    messages.clear();
    for (const m of tail) messages.set(m.id, m);
    list.textContent = '';
    for (const m of tail) list.appendChild(renderMessage(m));
    for (const s of sysLines) {
      const el = document.createElement('div');
      el.className = 'chat-line system';
      el.textContent = s;
      list.appendChild(el);
    }
    if (atBottom) list.scrollTop = list.scrollHeight;
  }

  function renderMessage(m) {
    const el = document.createElement('div');
    el.className = 'chat-line';
    if (String(m.senderId ?? '').toLowerCase() === me) el.classList.add('own');
    if (m.kind && m.kind !== 'text') {
      el.classList.add('system');
      el.textContent = m.content ?? '';
      return el;
    }
    const name = document.createElement('span');
    name.className = 'chat-name';
    name.textContent = '…';
    // senderUsername is the account username — resolve the profile nickname
    api.getDisplayName(m.senderId).then((n) => { if (name.isConnected) name.textContent = n; });
    el.append(name, document.createTextNode(m.content ?? ''));
    return el;
  }

  function addSystemLine(text) {
    sysLines.push(text);
    while (sysLines.length > 3) sysLines.shift();
    rebuild();
  }

  // ── polling ─────────────────────────────────────────────────
  async function poll() {
    if (!convId) return;
    try {
      const data = await api.getChatMessages(convId, 1, PAGE_SIZE);
      for (const m of data?.items || []) if (m && m.id != null) messages.set(m.id, m);
      pollFails = 0;
      outageShown = false;
      rebuild();
    } catch {
      if (++pollFails >= FAILS_BEFORE_NOTICE && !outageShown) {
        outageShown = true;
        addSystemLine('chat unavailable');
      }
    }
  }

  // ── sending ─────────────────────────────────────────────────
  async function send() {
    const text = input.value.trim();
    input.value = '';
    if (!text || !convId) return;
    const now = Date.now();
    while (sendTimes.length && now - sendTimes[0] > 60000) sendTimes.shift();
    if (now - lastSendAt < MIN_SEND_GAP_MS || sendTimes.length >= MAX_SENDS_PER_MIN) {
      addSystemLine('slow down…');
      return;
    }
    lastSendAt = now;
    sendTimes.push(now);
    try {
      const m = await api.sendChatMessage(convId, text);
      if (m && m.id != null) { messages.set(m.id, m); rebuild(); }
    } catch (e) {
      addSystemLine(e?.status === 429 ? 'slow down — chat rate limit' : 'message not sent');
    }
  }

  // ── keys ────────────────────────────────────────────────────
  // T opens the input (T is unbound in the default keymap; Enter stays free
  // for menus). input.js ignores gameplay keys while a field has focus.
  function onKeydown(e) {
    if (!started || panel.classList.contains('hidden') || typing()) return;
    if (e.code === 'KeyT' && !e.repeat) {
      e.preventDefault();
      document.exitPointerLock?.(); // free the cursor while typing
      input.focus();
    }
  }
  addEventListener('keydown', onKeydown);

  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // gameplay/leave-prompt handlers must not see these
    if (e.key === 'Enter') { e.preventDefault(); send(); input.blur(); }
    else if (e.key === 'Escape') { input.value = ''; input.blur(); }
  });

  // ── lifecycle ───────────────────────────────────────────────
  async function start() {
    if (started) return;
    started = true;
    try {
      const detail = await api.getSession(sessionId);
      if (!started) return; // disposed while the request was in flight
      convId = detail?.chatConversationId ?? null;
      if (!convId) return; // session not bridged to a conversation — silent no-op
      poll();
      pollTimer = setInterval(poll, POLL_MS);
    } catch { /* no session detail, no chat — stay silent */ }
  }

  function setVisible(show) {
    panel.classList.toggle('hidden', !show);
    if (!show && typing()) input.blur();
  }

  function dispose() {
    started = false;
    convId = null;
    clearInterval(pollTimer);
    pollTimer = null;
    removeEventListener('keydown', onKeydown);
    panel.remove(); // the input's own listener goes with the element
  }

  return { start, dispose, setVisible };
}
