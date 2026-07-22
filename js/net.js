// net.js — realtime rooms WebSocket client (ws/v1/realtime).
// Binary frames carry gameplay payloads: one kind byte ('I' input, 'S'
// snapshot, 'E' match event) followed by UTF-8 JSON. The server routes by
// role: host frames fan out to the room, guest frames go to the host only,
// and every delivered frame is prefixed with the sender's participant id
// (16-byte UUID) by the server — identity cannot be spoofed.
// JSON text frames are lobby/control: roster, presence, chat/ready, events.

const PREFIX_LEN = 16; // server-attached sender participant id (UUID bytes)

export function createNetClient({ roomId, getToken }) {
  let ws = null;
  let connected = false;
  let handlers = {};
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function connect(h) {
    handlers = h || {};
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${location.host}/ws/v1/realtime?roomId=${encodeURIComponent(roomId)}&access_token=${encodeURIComponent(getToken())}`;
      ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => { connected = true; resolve(); };
      ws.onerror = (e) => { if (!connected) reject(new Error('WebSocket connection failed')); };
      ws.onclose = (e) => { connected = false; handlers.onClose?.(e); };
      ws.onmessage = (m) => route(m);
    });
  }

  function route(m) {
    if (typeof m.data === 'string') {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }
      switch (msg.type) {
        case 'roster': handlers.onRoster?.(msg.participants || []); break;
        case 'presence': handlers.onPresence?.(msg); break;
        case 'event': handlers.onEvent?.(msg.data ?? msg, msg.from ?? null); break;
        case 'error': handlers.onError?.(msg.error); break;
        default: handlers.onEvent?.(msg, null);
      }
      return;
    }
    // binary: [sender participant id (16B)] [kind byte] [JSON payload]
    const buf = new Uint8Array(m.data);
    if (buf.length < PREFIX_LEN + 1) return;
    const fromId = guidFromBytes(buf.subarray(0, PREFIX_LEN));
    const kind = buf[PREFIX_LEN];
    let payload = null;
    try { payload = JSON.parse(decoder.decode(buf.subarray(PREFIX_LEN + 1))); } catch { return; }
    if (kind === 0x53) handlers.onSnapshot?.(payload, fromId);       // 'S'
    else if (kind === 0x49) handlers.onInput?.(payload, fromId);     // 'I'
    else if (kind === 0x45) handlers.onEvent?.(payload, fromId);     // 'E'
  }

  function sendBinary(kind, obj) {
    if (!connected) return;
    const json = encoder.encode(JSON.stringify(obj));
    const frame = new Uint8Array(1 + json.length);
    frame[0] = kind;
    frame.set(json, 1);
    ws.send(frame.buffer);
  }

  function sendJson(obj) {
    if (!connected) return;
    ws.send(JSON.stringify(obj));
  }

  function guidFromBytes(b) {
    const hex = [];
    for (let i = 0; i < 16; i++) hex.push(b[i].toString(16).padStart(2, '0'));
    const s = hex.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }

  return {
    connect,
    sendInput: (input) => sendBinary(0x49, input),      // guest → host
    sendSnapshot: (snap) => sendBinary(0x53, snap),     // host → room
    sendMatchEvent: (ev) => sendBinary(0x45, ev),       // host → room (binary event)
    sendEvent: (ev) => sendJson({ type: 'event', data: ev }),
    sendReady: (ready) => sendJson({ type: 'ready', ready }),
    sendChat: (text) => sendJson({ type: 'chat', text }),
    close: () => { try { ws?.close(); } catch {} connected = false; },
    get connected() { return connected; },
  };
}
