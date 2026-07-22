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
    username = claims.unique_name || claims.name || claims.sub?.slice(0, 8) || 'You';
    return { token, slug, userId, username, online: !!slug };
  }
  return { token: null, slug: null, userId: null, username: 'You', online: false };
}

export function getAuth() { return { token, slug, userId, username, online: !!token && !!slug }; }

// The launch token carries no name claim — resolve the real display name from
// the public profile endpoint (allowed for game-scoped tokens).
export async function resolveUsername() {
  if (!token || !userId) return username;
  try {
    const p = await req('GET', `/api/v1/users/${userId}/profile`);
    username = p.nickname || p.username || username;
  } catch { /* keep the fallback */ }
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

// ── realtime rooms (see spec.md §8) ──
export const createRoom = (cfg) => req('POST', '/api/v1/realtime/rooms', cfg);
export const getRoom = (id) => req('GET', `/api/v1/realtime/rooms/${id}`);
export const getMyRoom = () => req('GET', '/api/v1/realtime/rooms/mine');
export const inviteToRoom = (id, toUserId) => req('POST', `/api/v1/realtime/rooms/${id}/invites`, { toUserId });
export const getRoomInvites = () => req('GET', '/api/v1/realtime/rooms/invites');
export const acceptRoomInvite = (inviteId) => req('POST', `/api/v1/realtime/rooms/invites/${inviteId}/accept`);
export const declineRoomInvite = (inviteId) => req('POST', `/api/v1/realtime/rooms/invites/${inviteId}/decline`);
export const openRoom = (id) => req('POST', `/api/v1/realtime/rooms/${id}/open`);
export const quickJoin = () => req('POST', '/api/v1/realtime/rooms/quick-join', {});
export const startRoom = (id) => req('POST', `/api/v1/realtime/rooms/${id}/start`);
export const leaveRoom = (id) => req('POST', `/api/v1/realtime/rooms/${id}/leave`);
export const submitResult = (id, result) => req('POST', `/api/v1/realtime/rooms/${id}/result`, result);
