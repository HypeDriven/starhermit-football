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
// Reconnects with exponential backoff (250ms → 500ms → 1s … cap 15s) until closed.

export function createNetClient({ roomId, getToken }) {
  let ws = null;
  let connected = false;
  let handlers = {};

  function connect(h) {
    handlers = h || {};
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${location.host}/ws/v1/realtime?roomId=${encodeURIComponent(roomId)}&access_token=${encodeURIComponent(getToken())}`;
      ws = new WebSocket(url);
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
export function createVoiceClient({ roomId, getToken }) {
  let ws = null;
  let handlers = {};
  let connected = false;

  function connect(h) {
    handlers = h || {};
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${location.host}/ws/v1/voice?roomId=${encodeURIComponent(roomId)}&access_token=${encodeURIComponent(getToken())}`;
      ws = new WebSocket(url);
      ws.onopen = () => { connected = true; resolve(); };
      ws.onerror = () => { if (!connected) reject(new Error('Voice socket connection failed')); };
      ws.onclose = (e) => { connected = false; handlers.onClose?.(e); };
      ws.onmessage = (m) => {
        if (typeof m.data !== 'string') return; // native PCM relay frames — not for us
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
    close: () => { try { ws?.close(); } catch {} ws = null; connected = false; },
    get connected() { return connected; },
  };
}

export function createGameClient({ sessionId, getToken }) {
  let ws = null;
  let handlers = {};
  let disposed = false;
  let attempts = 0;
  let reconnectTimer = null;

  function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws/v1/games?sessionId=${encodeURIComponent(sessionId)}&access_token=${encodeURIComponent(getToken())}`;
  }

  function connect(h) {
    handlers = h || {};
    return new Promise((resolve, reject) => {
      let settled = false;
      disposed = false;
      openOnce(() => { if (!settled) { settled = true; resolve(); } },
               () => { if (!settled) { settled = true; reject(new Error('Games socket connection failed')); } });
    });
  }

  function openOnce(onOpen, onFirstFail) {
    if (disposed) return;
    let sock;
    try { sock = new WebSocket(wsUrl()); } catch { scheduleReconnect(); return; }
    ws = sock;
    let opened = false;
    sock.onopen = () => {
      opened = true;
      attempts = 0;
      sendCmd({ type: 'sync' }); // full snapshot comes back to us only
      onOpen?.();
    };
    sock.onmessage = (m) => route(m);
    sock.onerror = () => { if (!opened) onFirstFail?.(); /* close follows */ };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      if (!disposed) scheduleReconnect();
      else handlers.onClose?.();
    };
  }

  function scheduleReconnect() {
    if (disposed) return;
    const delay = Math.min(15000, 250 * Math.pow(2, attempts++));
    handlers.onReconnecting?.(delay);
    reconnectTimer = setTimeout(() => openOnce(handlers.onResync), delay);
  }

  function route(m) {
    let msg;
    try { msg = JSON.parse(m.data); } catch { return; }
    if (msg.type === 'game' && msg.data) {
      const d = msg.data;
      if (d.type === 'snap') handlers.onSnapshot?.(d);
      else if (d.type === 'ev') handlers.onEvent?.(d.ev);
      return;
    }
    if (msg.type === 'presence') { handlers.onPresence?.(msg); return; }
    if (msg.type === 'error') handlers.onError?.(msg.error);
  }

  function sendCmd(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'cmd', data }));
    }
  }

  return {
    connect,
    // input: {seq, mx, mz, sprint, pass, shoot, tackle} — caller throttles.
    // Drop stale movement under backpressure, but never discard an action edge.
    sendInput: (input) => {
      const action = input.pass || input.shoot > 0 || input.tackle;
      if (!action && ws?.bufferedAmount > 32768) return;
      sendCmd({ type: 'input', realtime: true, ...input });
    },
    close: () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      try { ws?.close(); } catch {}
      if (!ws) handlers.onClose?.();
    },
    get connected() { return !!ws && ws.readyState === WebSocket.OPEN; },
  };
}
