// net.js — WebSocket clients.
//
// createNetClient: realtime rooms socket (ws/v1/realtime). Lobby/control only:
// JSON text frames (roster, presence, chat/ready, events). Match gameplay no
// longer flows here — the binary 'I'/'S'/'E' frames are gone.
//
// createGameClient: games socket (ws/v1/games?sessionId=…) carrying the
// server-authoritative match. Client -> server: {type:'cmd', data:{...}}
// ('sync' on open/reconnect, 'input' at ~30 Hz). Server -> client:
// {type:'game', data:{type:'snap'|'ev', ...}} and {type:'presence', ...}.
// The games socket is the SDK's StarHermit.connect (reconnect with exponential
// backoff, stops on 4403/4404); socket URLs come from the SDK so they always
// carry the current, renewed launch token.
import * as api from './api.js?v=9';

export function createNetClient({ roomId }) {
  let ws = null;
  let connected = false;
  let handlers = {};

  function connect(h) {
    handlers = h || {};
    return new Promise((resolve, reject) => {
      ws = new WebSocket(api.realtimeSocketUrl(roomId));
      ws.onopen = () => { connected = true; resolve(); };
      ws.onerror = () => { if (!connected) reject(new Error('WebSocket connection failed')); };
      ws.onclose = (e) => { connected = false; handlers.onClose?.(e); };
      ws.onmessage = (m) => route(m);
    });
  }

  function route(m) {
    if (typeof m.data !== 'string') return; // gameplay binary frames are dead
    let msg;
    try { msg = JSON.parse(m.data); } catch { return; }
    switch (msg.type) {
      case 'roster': handlers.onRoster?.(msg.participants || []); break;
      case 'presence': handlers.onPresence?.(msg); break;
      case 'event': handlers.onEvent?.(msg.data ?? msg, msg.from ?? null); break;
      case 'error': handlers.onError?.(msg.error); break;
      default: handlers.onEvent?.(msg, null);
    }
  }

  function sendJson(obj) {
    if (!connected) return;
    ws.send(JSON.stringify(obj));
  }

  return {
    connect,
    sendEvent: (ev) => sendJson({ type: 'event', data: ev }),
    sendReady: (ready) => sendJson({ type: 'ready', ready }),
    sendChat: (text) => sendJson({ type: 'chat', text }),
    close: () => { try { ws?.close(); } catch {} connected = false; },
    get connected() { return connected; },
  };
}

// createVoiceClient: voice relay socket (ws/v1/voice?roomId=…). Carries room
// roster/presence and directed WebRTC signaling. Server → client frames are
// {event:'voice.*', data:{…}}; client → server: {type:'rtc'|'mute'|...}.
// Binary audio frames exist for native clients; the web client never sends any.
export function createVoiceClient({ roomId }) {
  let ws = null;
  let handlers = {};
  let connected = false;

  function connect(h) {
    handlers = h || {};
    return new Promise((resolve, reject) => {
      ws = new WebSocket(api.voiceSocketUrl(roomId));
      ws.onopen = () => { connected = true; resolve(); };
      ws.onerror = () => { if (!connected) reject(new Error('Voice socket connection failed')); };
      ws.onclose = (e) => { connected = false; handlers.onClose?.(e); };
      ws.onmessage = (m) => {
        if (typeof m.data !== 'string') return; // native Opus relay frames — not for us
        let msg;
        try { msg = JSON.parse(m.data); } catch { return; }
        if (msg && typeof msg.event === 'string') handlers.onEvent?.(msg.event, msg.data || {});
      };
    });
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const s = JSON.stringify(obj);
      if (s.length < 3800) ws.send(s); // server caps frames at 4000 bytes
    }
  }

  return {
    connect,
    // directed WebRTC signaling: delivered to `to` as voice.rtc with our userId stamped in
    sendRtc: (to, payload) => send({ type: 'rtc', to, payload }),
    sendMute: (muted) => send({ type: 'mute', muted: !!muted }),
    close: () => { try { ws?.close(); } catch {} ws = null; connected = false; },
    get connected() { return connected; },
  };
}

export function createGameClient({ sessionId }) {
  let conn = null;
  let handlers = {};
  let disposed = false;

  function connect(h) {
    handlers = h || {};
    disposed = false;
    return new Promise((resolve, reject) => {
      let settled = false;
      conn = api.connectGame(sessionId, {
        onOpen: () => {
          conn.send({ type: 'sync' }); // full snapshot comes back to us only
          if (!settled) { settled = true; resolve(); } else handlers.onResync?.();
        },
        onGame: (d) => {
          if (!d) return;
          if (d.type === 'snap') handlers.onSnapshot?.(d);
          else if (d.type === 'ev') handlers.onEvent?.(d.ev);
        },
        onPresence: (m) => handlers.onPresence?.(m),
        // server-authoritative achievement unlock, addressed to the earning player
        onAchievement: (a) => handlers.onAchievement?.(a),
        onError: (e) => handlers.onError?.(e),
        onAbandoned: () => { if (!disposed) { disposed = true; handlers.onClose?.(); } },
        onClose: (code) => {
          if (!settled) { settled = true; conn.close(); reject(new Error('Games socket connection failed')); return; }
          if (disposed) { handlers.onClose?.(); return; }
          // 4403/4404: the platform refused the session — no reconnect follows.
          if (code === 4403 || code === 4404) { disposed = true; handlers.onClose?.(); return; }
          handlers.onReconnecting?.();
        },
      });
    });
  }

  return {
    connect,
    // input: {seq, mx, mz, sprint, pass, shoot, tackle} — caller throttles.
    // realtime:true (envelope and payload) opts into platform tick batching.
    sendInput: (input) => { conn?.send({ type: 'input', realtime: true, ...input }, true); },
    close: () => {
      if (disposed) return;
      disposed = true;
      if (conn?.open) conn.close();
      else { conn?.close(); handlers.onClose?.(); }
    },
    get connected() { return !!conn?.open; },
  };
}
