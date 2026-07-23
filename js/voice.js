// voice.js — in-match voice chat with distance-based volume.
//
// Transport: WebRTC full-mesh audio between the human players of a match.
// Signaling rides the platform voice relay (/ws/v1/voice), which forwards
// opaque {type:'rtc', to, payload} frames to the addressed room participant
// only — the server never sees plaintext it shouldn't route, and payload size
// is capped (~4 KB frames), so SDP and ICE are trickled as separate messages.
//
// Positional audio: each remote stream runs through GainNode → StereoPanner.
// Every ~100 ms the gain is recomputed from the world distance between my
// footballer and the speaker's footballer (nearby = loud, far end of the
// pitch = silent), and the pan from the direction relative to my facing.
//
// The feature is best-effort: any failure (no mic permission, voice disabled
// platform-side, relay unreachable) degrades to a silent no-op — the match
// itself never depends on voice.
import * as api from './api.js';
import { createVoiceClient } from './net.js';

const LS_KEY = 'starhermit-football-voice';
const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302'] }];
const NEAR_M = 4;    // full volume within this distance
const FAR_M = 55;    // silent beyond this distance
const POS_HZ = 10;   // positional refresh rate

export function createVoice() {
  let enabled = localStorage.getItem(LS_KEY) !== '0'; // default: on
  let session = 0;          // join generation — stale async steps bail out
  let active = false;       // joined (or joining) the match's voice room
  let matchSessionId = null; // live match's game session id (survives hangup)
  let myUserId = null;
  let voiceRoomId = null;
  let voiceNet = null;
  let localStream = null;
  let actx = null;
  let bus = null;           // shared voice bus → destination
  const peers = new Map();  // userId(lower) → { pc, gain, pan, makingOffer, ignoreOffer }
  let posTimer = 0;
  let wsRetries = 0;

  const live = (s) => s === session && active;

  // ── mic + audio graph ─────────────────────────────────────────────────────

  async function ensureMic() {
    if (localStream) return true;
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      return true;
    } catch (e) {
      console.warn('voice: microphone unavailable:', e.message || e);
      return false;
    }
  }

  function ensureContext() {
    if (actx) return;
    actx = new (window.AudioContext || window.webkitAudioContext)();
    bus = actx.createGain();
    bus.gain.value = 1;
    bus.connect(actx.destination);
  }

  function attachRemote(peer, stream) {
    ensureContext();
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    if (peer.source) peer.source.disconnect();
    const source = actx.createMediaStreamSource(stream);
    peer.source = source;
    source.connect(peer.gain);
  }

  // ── peer connections (perfect negotiation) ────────────────────────────────

  function ensurePeer(userId) {
    const id = String(userId).toLowerCase();
    if (id === myUserId || peers.has(id)) return peers.get(id);
    ensureContext();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const gain = actx.createGain();
    gain.gain.value = 0;
    const pan = actx.createStereoPanner();
    gain.connect(pan).connect(bus);
    const peer = { pc, gain, pan, source: null, makingOffer: false, ignoreOffer: false };
    peers.set(id, peer);

    const polite = myUserId < id; // deterministic glare resolution
    peer.polite = polite;

    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        voiceNet?.sendRtc(id, { kind: 'sdp', sdp: pc.localDescription.toJSON() });
      } catch (e) {
        console.warn('voice: negotiation failed:', e);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) voiceNet?.sendRtc(id, { kind: 'ice', candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => { if (e.streams?.[0]) attachRemote(peer, e.streams[0]); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
    };
    return peer;
  }

  function dropPeer(userId) {
    const id = String(userId).toLowerCase();
    const peer = peers.get(id);
    if (!peer) return;
    peers.delete(id);
    try { peer.pc.close(); } catch {}
    try { peer.source?.disconnect(); } catch {}
    try { peer.gain.disconnect(); peer.pan.disconnect(); } catch {}
  }

  async function onRtc(from, payload) {
    const id = String(from).toLowerCase();
    if (!payload || id === myUserId) return;
    const peer = peers.get(id) || ensurePeer(id);
    if (!peer) return;
    const { pc } = peer;
    try {
      if (payload.kind === 'sdp') {
        const sdp = payload.sdp;
        const collision = sdp.type === 'offer' &&
          (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(sdp);
        if (sdp.type === 'offer') {
          await pc.setLocalDescription();
          voiceNet?.sendRtc(id, { kind: 'sdp', sdp: pc.localDescription.toJSON() });
        }
      } else if (payload.kind === 'ice') {
        try {
          await pc.addIceCandidate(payload.candidate);
        } catch (e) {
          if (!peer.ignoreOffer) throw e;
        }
      }
    } catch (e) {
      console.warn('voice: signaling error:', e);
    }
  }

  // ── voice relay socket ────────────────────────────────────────────────────

  function onVoiceEvent(event, data) {
    switch (event) {
      case 'voice.roster':
        for (const p of data.participants || []) ensurePeer(p.userId);
        break;
      case 'voice.participant_joined':
        if (data.userId) ensurePeer(data.userId);
        break;
      case 'voice.participant_left':
        if (data.userId) dropPeer(data.userId);
        break;
      case 'voice.rtc':
        onRtc(data.from, data.payload);
        break;
    }
  }

  async function connectWs(s) {
    // WS drop = implicit server-side leave, so re-join before reconnecting.
    await api.joinVoiceRoom(voiceRoomId);
    if (!live(s)) return;
    const net = createVoiceClient({ roomId: voiceRoomId, getToken: () => api.getAuth().token });
    voiceNet = net;
    await net.connect({
      onEvent: onVoiceEvent,
      onClose: () => {
        if (!live(s) || voiceNet !== net) return;
        if (++wsRetries > 5) { console.warn('voice: relay reconnects exhausted'); return; }
        setTimeout(() => { if (live(s)) reconnect(s); }, 2000);
      },
    });
    if (!live(s)) { net.close(); return; }
    wsRetries = 0;
  }

  async function reconnect(s) {
    // rebuild the mesh from the fresh roster; stale peer state is discarded
    for (const id of [...peers.keys()]) dropPeer(id);
    try { await connectWs(s); } catch { /* onClose retry chain handles it */ }
  }

  // ── match lifecycle ───────────────────────────────────────────────────────
  // main.js reports match start/end with joinMatch/leaveMatch regardless of the
  // enabled flag, so toggling the checkbox mid-match can join/leave on the spot.

  async function joinMatch({ sessionId: sid }) {
    hangup();
    matchSessionId = sid || null;
    if (!enabled || !sid) return;
    const auth = api.getAuth();
    if (!auth.online) return;
    const s = ++session;
    active = true;
    myUserId = String(auth.userId).toLowerCase();
    try {
      if (!(await ensureMic())) return void hangup();
      const detail = await api.getSession(sid);
      if (!live(s)) return;
      const convId = detail?.chatConversationId;
      if (!convId) return void hangup(); // session has no conversation (not bridged)
      const rooms = await api.listVoiceRooms(convId);
      if (!live(s)) return;
      const room = (rooms && rooms[0]) || await api.createVoiceRoom(convId);
      if (!live(s)) return;
      voiceRoomId = room.id;
      await connectWs(s);
      console.info('voice: joined room', voiceRoomId);
    } catch (e) {
      if (live(s)) { console.warn('voice: join failed:', e.message || e); hangup(); }
    }
  }

  // match over: forget the session and tear everything down
  function leaveMatch() {
    matchSessionId = null;
    hangup();
  }

  // tear down the voice connection but remember the match (checkbox toggles)
  function hangup() {
    session++;
    active = false;
    const net = voiceNet;
    voiceNet = null;
    if (net) net.close();
    for (const id of [...peers.keys()]) dropPeer(id);
    if (voiceRoomId) {
      const roomId = voiceRoomId;
      voiceRoomId = null;
      api.leaveVoiceRoom(roomId).catch(() => {});
    }
    if (localStream) {
      for (const t of localStream.getTracks()) t.stop();
      localStream = null;
    }
  }

  function setEnabled(v) {
    enabled = !!v;
    localStorage.setItem(LS_KEY, enabled ? '1' : '0');
    if (!enabled) hangup();
    else if (matchSessionId && !active) joinMatch({ sessionId: matchSessionId });
  }

  // ── positional update (call per frame; internally throttled) ─────────────

  function updatePositions(dt, players, myPlayerId) {
    if (!active || !peers.size || !players || !actx) return;
    posTimer -= dt;
    if (posTimer > 0) return;
    posTimer = 1 / POS_HZ;

    const me = players[myPlayerId];
    if (!me) return;
    const t = actx.currentTime;
    for (const [id, peer] of peers) {
      // find the speaker's footballer by userId (AI seats have userId null)
      let sp = null;
      for (const p of players) {
        if (p.userId && String(p.userId).toLowerCase() === id) { sp = p; break; }
      }
      if (!sp) { peer.gain.gain.setTargetAtTime(0, t, 0.2); continue; }
      const dx = sp.x - me.x, dz = sp.z - me.z;
      const d = Math.hypot(dx, dz);
      const g = Math.min(1, Math.max(0, (FAR_M - d) / (FAR_M - NEAR_M)));
      peer.gain.gain.setTargetAtTime(g * g, t, 0.1);
      // pan by direction relative to my facing (forward=(cos f, sin f), right=(-sin f, cos f))
      if (d > 1.5) {
        const f = me.facing || 0;
        const lateral = (dx * -Math.sin(f) + dz * Math.cos(f)) / d;
        peer.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, lateral * 0.8)), t, 0.1);
      }
    }
  }

  return {
    joinMatch,
    leaveMatch,
    setEnabled,
    updatePositions,
    isEnabled: () => enabled,
    get active() { return active; },
  };
}
