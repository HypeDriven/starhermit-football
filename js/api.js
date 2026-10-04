// api.js — StarHermit platform client for the game, over window.StarHermit
// (starhermit-sdk.js, loaded by index.html before the module graph). The SDK
// reads the launch token (#game_token=… library launch / #access_token=…
// sign-in return), strips it, renews it, and authenticates every same-origin
// /api call; this module keeps the game's named endpoints on top of it.
// Without a token every call is skipped and nothing touches the network.

const sh = () => globalThis.StarHermit || null;
let username = 'You';

export function initAuth() {
  const s = sh();
  if (s && !s.__footballInit) { s.__footballInit = true; s.init(); }
  if (s?.signedIn && s.slug) username = 'Player';
  return getAuth();
}

export function getAuth() {
  const s = sh();
  const online = !!(s?.signedIn && s.slug);
  return { token: s?.token || null, slug: s?.slug || null, userId: s?.userId || null, username: online ? username : 'You', online };
}

/** Subscribe to sign-in state changes ({ signedIn }); renewal refusal signs out. */
export function onAuthChange(fn) { return sh()?.on('auth', fn); }
export const canSignIn = () => !!sh()?.canSignIn();
export const signIn = () => !!sh()?.signIn();
/** Share link that friends the recipient and invites them back (null signed out). */
export const inviteLink = (query) => (getAuth().online ? sh().inviteLink(query) : null);

// Display name: profile nickname, "Player <id>" fallback (never /api/v1/me).
export async function resolveUsername() {
  const a = getAuth();
  if (!a.online || !a.userId) return a.username;
  username = await getDisplayName(a.userId);
  return username;
}

// Authenticated JSON call through the SDK (401 → one renewal + retry).
// Errors are Error instances carrying .status; 404 and 204 resolve null.
async function req(method, path, body) {
  const s = sh();
  if (!s?.signedIn) { const e = new Error('offline'); e.status = 0; throw e; }
  try {
    return await s.api(path, { method, body });
  } catch (x) {
    const e = new Error(x?.message || 'Request failed');
    e.status = x?.status || 0;
    throw e;
  }
}
const notFound = () => { const e = new Error('Not found'); e.status = 404; return e; };
const gamePath = (suffix) => sh().gamePath(suffix);

// Avatars need the Bearer header, which <img src> can't send — the SDK fetches
// a blob URL; cached per user for the session (misses cache as null too).
const avatarUrls = new Map();
export function getUserAvatarUrl(uid) {
  if (!uid || !getAuth().online) return Promise.resolve(null);
  if (!avatarUrls.has(uid)) avatarUrls.set(uid, sh().avatarUrl(uid).catch(() => null));
  return avatarUrls.get(uid);
}

// Player-facing views render the profile nickname, never the raw account
// username; the SDK caches lookups per user and falls back to a short id.
export function getDisplayName(uid) {
  if (!uid || !getAuth().online) return Promise.resolve('Player');
  return sh().profile(uid)
    .then((p) => p?.displayName || `Player ${String(uid).slice(0, 6)}`)
    .catch(() => `Player ${String(uid).slice(0, 6)}`);
}

// ── platform ──
export const getGameInfo = () => req('GET', gamePath('')).then((d) => d || {});
export const getFriends = () => req('GET', '/api/v1/me/friends').then((d) => d || []);
export const getAchievements = () => req('GET', gamePath('/achievements')).then((d) => d || []);
export const getSettings = () => (getAuth().online ? sh().getSettings() : Promise.resolve({}));
export const patchSettings = (obj) => (getAuth().online ? sh().patchSettings(obj) : Promise.resolve(null));

// ── per-player control bindings (spec.md §8.8) ──
// { actions: [{ action, label, defaultCodes, codes }] }; 404 when none declared.
export const getControls = () => (getAuth().online ? sh().getControls() : Promise.reject(notFound()))
  .then((list) => { if (!list?.length) throw notFound(); return { actions: list }; });
export const putControls = (bindings) => sh().setControls(bindings);
export const resetControls = () => req('DELETE', gamePath('/controls'));

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
export const quickJoin = () => req('POST', '/api/v1/realtime/rooms/quick-join', {}).then((r) => { if (!r) throw notFound(); return r; });
export const startRoom = (id) => req('POST', `/api/v1/realtime/rooms/${id}/start`);
export const leaveRoom = (id) => req('POST', `/api/v1/realtime/rooms/${id}/leave`);

// ── game sessions ──
// Detail includes chatConversationId — the bridge from a match to its voice room.
export const getSession = (sessionId) => req('GET', gamePath(`/sessions/${sessionId}`));
/** session_id from an invite-accept launch (null otherwise). */
export const launchSessionId = () => sh()?.launchSessionId || null;

// ── leaderboards ──
// Only set params are sent; `score` on an entry is the player's rating (elo).
export const getLeaderboardEntries = (id, { friendsOnly, page, pageSize } = {}) => {
  const q = new URLSearchParams();
  if (friendsOnly !== undefined) q.set('friendsOnly', friendsOnly);
  if (page !== undefined) q.set('page', page);
  if (pageSize !== undefined) q.set('pageSize', pageSize);
  const s = q.toString();
  return req('GET', `/api/v1/leaderboards/${id}/entries${s ? `?${s}` : ''}`).then((d) => d || { items: [], total: 0 });
};

// ── replays ──
export const getMyReplays = (limit = 20) => req('GET', gamePath(`/replays/mine?limit=${limit}`)).then((d) => d || []);
export const getReplay = (sessionId) => req('GET', gamePath(`/replays/${sessionId}`));

// ── chat (REST + polling; launch tokens cannot use ws/v1/chat) ──
export const getChatMessages = (conversationId, page = 1, pageSize = 50) =>
  req('GET', `/api/v1/chat/conversations/${conversationId}/messages?page=${page}&pageSize=${pageSize}`);
export const sendChatMessage = (conversationId, content) =>
  req('POST', `/api/v1/chat/conversations/${conversationId}/messages`, { content });

// ── voice rooms (platform voice relay; used for WebRTC signaling) ──
export const listVoiceRooms = (conversationId) => req('GET', `/api/v1/voice/rooms?conversationId=${encodeURIComponent(conversationId)}`);
// Platform caps voice rooms at 10 participants (docs/api/voice.md).
export const createVoiceRoom = (conversationId, maxParticipants = 10) =>
  req('POST', '/api/v1/voice/rooms', { conversationId, maxParticipants });
export const joinVoiceRoom = (roomId) => req('POST', `/api/v1/voice/rooms/${roomId}/join`);
export const leaveVoiceRoom = (roomId) => req('POST', `/api/v1/voice/rooms/${roomId}/leave`);
export const setVoiceMute = (roomId, muted) => req('POST', `/api/v1/voice/rooms/${roomId}/mute`, { muted: !!muted });

// ── sockets (URLs carry the current token; the SDK keeps it renewed) ──
export const realtimeSocketUrl = (roomId) => sh().realtime.socketUrl(roomId);
export const voiceSocketUrl = (roomId) => sh().voice.socketUrl(roomId);
/** Gameplay socket with reconnect (SDK): handlers onOpen/onGame/onPresence/onAchievement/onError/onClose. */
export const connectGame = (sessionId, handlers) => sh().connect(sessionId, handlers);
