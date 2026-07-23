// api.js — StarHermit platform REST client.
// Same-origin relative paths: on the hosted deployment the platform proxies
// /api and /ws to the backend. Launch token arrives as index.html#game_token=<jwt>.

let token = null;
let slug = null;
let userId = null;
let username = null;

function decodeJwt(t) {
  try {
    const payload = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch { return null; }
}

export function initAuth() {
  const hash = new URLSearchParams(location.hash.slice(1));
  token = hash.get('game_token');
  const claims = token && decodeJwt(token);
  if (claims) {
    slug = claims.game_scope || null;
    userId = claims.sub || null;
    // Never fall back to a raw id fragment — 'Player' until the profile resolves.
    username = claims.unique_name || claims.name || 'Player';
    return { token, slug, userId, username, online: !!slug };
  }
  return { token: null, slug: null, userId: null, username: 'You', online: false };
}

export function getAuth() { return { token, slug, userId, username, online: !!token && !!slug }; }

// Newer launch tokens carry a unique_name claim; older ones don't — resolve the
// real display name from the public profile endpoint (allowed for game-scoped
// tokens). Retried a few times: a flaky network must not leave the menu
// showing a placeholder.
export async function resolveUsername() {
  if (!token || !userId) return username;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const p = await req('GET', `/api/v1/users/${userId}/profile`);
      const name = p.nickname || p.username;
      if (name) { username = name; break; }
      return username; // profile exists but has no name fields — don't retry
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return username;
}

async function req(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ── platform ──
export const getGameInfo = () => req('GET', `/api/v1/games/${slug}`);
export const remintLaunchToken = () => req('POST', `/api/v1/games/${slug}/launch-token`)
  .then((d) => { if (d?.token) token = d.token; return d; });
export const getFriends = () => req('GET', '/api/v1/me/friends');

// ── per-player control bindings (spec.md §8.8) ──
export const getControls = () => req('GET', `/api/v1/games/${slug}/controls`);
export const putControls = (bindings) => req('PUT', `/api/v1/games/${slug}/controls`, { bindings });
export const resetControls = () => req('DELETE', `/api/v1/games/${slug}/controls`);

// ── realtime rooms (see spec.md §8) ──
export const createRoom = (cfg) => req('POST', '/api/v1/realtime/rooms', cfg);
export const getRoom = (id) => req('GET', `/api/v1/realtime/rooms/${id}`);
export const getMyRoom = () => req('GET', '/api/v1/realtime/rooms/mine');
export const inviteToRoom = (id, toUserId) => req('POST', `/api/v1/realtime/rooms/${id}/invites`, { toUserId });
export const getRoomInvites = () => req('GET', '/api/v1/realtime/rooms/invites');
export const acceptRoomInvite = (inviteId) => req('POST', `/api/v1/realtime/rooms/invites/${inviteId}/accept`);
export const declineRoomInvite = (inviteId) => req('POST', `/api/v1/realtime/rooms/invites/${inviteId}/decline`);
export const openRoom = (id) => req('POST', `/api/v1/realtime/rooms/${id}/open`);
export const setSeats = (id, seats) => req('POST', `/api/v1/realtime/rooms/${id}/seats`, { seats });
export const quickJoin = () => req('POST', '/api/v1/realtime/rooms/quick-join', {});
export const startRoom = (id) => req('POST', `/api/v1/realtime/rooms/${id}/start`);
export const leaveRoom = (id) => req('POST', `/api/v1/realtime/rooms/${id}/leave`);
export const submitResult = (id, result) => req('POST', `/api/v1/realtime/rooms/${id}/result`, result);

// ── game sessions ──
// Detail includes chatConversationId — the bridge from a match to its voice room.
export const getSession = (sessionId) => req('GET', `/api/v1/games/${slug}/sessions/${sessionId}`);

// ── voice rooms (platform voice relay; used for WebRTC signaling) ──
export const listVoiceRooms = (conversationId) => req('GET', `/api/v1/voice/rooms?conversationId=${encodeURIComponent(conversationId)}`);
export const createVoiceRoom = (conversationId) => req('POST', '/api/v1/voice/rooms', { conversationId });
export const joinVoiceRoom = (roomId) => req('POST', `/api/v1/voice/rooms/${roomId}/join`);
export const leaveVoiceRoom = (roomId) => req('POST', `/api/v1/voice/rooms/${roomId}/leave`);
