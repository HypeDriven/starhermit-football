// Platform client (js/api.js + js/net.js game socket) on the real StarHermit SDK
// with a stubbed fetch / WebSocket and launch URL. Run: node --test tests/platform.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The package is ESM, so the UMD SDK is evaluated with a CommonJS-style module object.
const SDK = (() => { const module = { exports: {} }; new Function('module', readFileSync(new URL('../starhermit-sdk.js', import.meta.url), 'utf8'))(module); return module.exports; })();
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = 'h.' + b64u({ sub: 'u-striker-1', game_scope: 'football-id', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.s';

class FakeSocket {
  static last = null;
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeSocket.last = this; }
  send(s) { this.sent.push(JSON.parse(s)); }
  close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
  open() { this.readyState = 1; this.onopen?.(); }
  push(m) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

let n = 0;
async function load(href, routes = {}, opts = {}) {
  const calls = []; const url = new URL(href);
  const win = { location: { hash: url.hash, search: url.search, pathname: url.pathname, origin: url.origin, hostname: url.hostname, href, protocol: url.protocol, host: url.host }, history: { replaceState: (a, b, u) => { win.replaced = u; } } };
  const fetch = async (path, init = {}) => {
    const method = init.method || 'GET'; calls.push({ path, method, body: init.body });
    const hit = Object.entries(routes).find(([k]) => `${method} ${path}`.endsWith(k));
    if (hit && typeof hit[1] === 'function') return hit[1]();
    return hit ? new Response(JSON.stringify(hit[1]), { status: 200 }) : new Response('', { status: 404 });
  };
  win.location.assign = (u) => { win.assigned = u; };
  // Backoff timers run at once so reconnect paths are testable without waiting.
  globalThis.StarHermit = SDK.create({ window: win, fetch, WebSocket: FakeSocket, setTimeout: (fn, ms) => { const t = setTimeout(fn, opts.fastTimers ? 0 : ms); t.unref?.(); return t; } });
  const api = await import(`../js/api.js?v=10&case=${++n}`);
  return { api, calls, win, sh: globalThis.StarHermit };
}

test('launch token, nickname, settings KV, controls, achievements', async () => {
  const { api, calls, win } = await load('https://football-id.starhermit.com/#game_token=' + TOKEN, {
    'GET /api/v1/users/u-striker-1/profile': { username: 'raw_user', nickname: 'Golazo' },
    'GET /api/v1/games/football-id/settings': { settings: { muted: true } },
    'PATCH /api/v1/games/football-id/settings': {},
    'GET /api/v1/games/football-id/controls': { actions: [{ action: 'shoot', codes: ['KeyF'], defaultCodes: ['Space', 'KeyJ'] }] },
    'GET /api/v1/games/football-id/achievements': [{ key: 'hat-trick', name: 'Hat-trick', unlocked: true }],
  });
  const auth = api.initAuth();
  assert.equal(auth.online, true); assert.equal(auth.slug, 'football-id'); assert.equal(auth.userId, 'u-striker-1');
  assert.equal(win.replaced, '/');
  assert.equal(await api.resolveUsername(), 'Golazo');
  assert.equal(api.getAuth().username, 'Golazo');
  assert.deepEqual(await api.getSettings(), { muted: true });
  await api.patchSettings({ muted: false });
  const patch = calls.find((c) => c.method === 'PATCH');
  assert.equal(patch.path, '/api/v1/games/football-id/settings');
  assert.deepEqual(JSON.parse(patch.body), { settings: { muted: false } });
  assert.deepEqual((await api.getControls()).actions[0].codes, ['KeyF']);
  assert.equal((await api.getAchievements())[0].key, 'hat-trick');
  assert.match(api.inviteLink(), /\/game-invite\/u-striker-1\/football-id$/);
  assert.ok(calls.every((c) => c.path.startsWith('/api/v1/')));
  await assert.rejects(api.quickJoin(), (e) => e.status === 404, 'no open room → 404 for the create fallback');
});

test('game socket: SDK connect, sync on open, snapshots, realtime input envelope', async () => {
  const { api } = await load('https://football-id.starhermit.com/#game_token=' + TOKEN);
  api.initAuth();
  const { createGameClient } = await import('../js/net.js?v=10');
  const got = { snaps: [], evs: [], ach: [] };
  const client = createGameClient({ sessionId: 'sess-1' });
  const ready = client.connect({ onSnapshot: (s) => got.snaps.push(s), onEvent: (e) => got.evs.push(e), onAchievement: (a) => got.ach.push(a), onClose: () => { got.closed = true; } });
  const ws = FakeSocket.last;
  assert.match(ws.url, /^wss:\/\/football-id\.starhermit\.com\/ws\/v1\/games\?sessionId=sess-1&access_token=/);
  ws.open(); await ready;
  assert.deepEqual(ws.sent[0], { type: 'cmd', data: { type: 'sync' } });
  ws.push({ type: 'game', data: { type: 'snap', tick: 3 } });
  ws.push({ type: 'game', data: { type: 'ev', ev: { type: 'goal' } } });
  ws.push({ type: 'achievement', data: { name: 'Hat-trick' } });
  assert.equal(got.snaps[0].tick, 3); assert.equal(got.evs[0].type, 'goal'); assert.equal(got.ach[0].name, 'Hat-trick');
  client.sendInput({ seq: 1, mx: 0, mz: 1 });
  assert.deepEqual(ws.sent[1], { type: 'cmd', data: { type: 'input', realtime: true, seq: 1, mx: 0, mz: 1 }, realtime: true });
  client.close();
  assert.equal(got.closed, true);
});

test('renewal refused signs out to offline practice', async () => {
  const { api, sh } = await load('https://football-id.starhermit.com/#game_token=' + TOKEN);
  api.initAuth();
  const seen = []; api.onAuthChange((s) => seen.push(s.signedIn));
  sh.signOut('expired');
  assert.deepEqual(seen, [false]);
  assert.equal(api.getAuth().online, false);
  assert.equal(api.canSignIn(), true);
});

const TOKEN2 = 'h.' + b64u({ sub: 'u-striker-1', game_scope: 'football-id', exp: Math.floor(Date.now() / 1000) + 7200, v: 2 }) + '.s';
const tick = () => new Promise((r) => setTimeout(r, 5));
const refused = () => new Response('', { status: 401 });
const flaky = () => new Response('', { status: 503 });

test('game socket reconnect renews the token first and reopens with the new one', async () => {
  const { api, calls } = await load('https://football-id.starhermit.com/#game_token=' + TOKEN,
    { 'POST /api/v1/games/football-id/launch-token': { token: TOKEN2 } }, { fastTimers: true });
  api.initAuth();
  const { createGameClient } = await import('../js/net.js?v=10');
  const client = createGameClient({ sessionId: 'sess-1' });
  const ready = client.connect({ onReconnecting: () => {} });
  const first = FakeSocket.last; first.open(); await ready;
  first.readyState = 3; first.onclose({ code: 1006 }); // dropped — maybe an expired token
  for (let i = 0; i < 20 && FakeSocket.last === first; i++) await tick();
  assert.ok(calls.some((c) => c.method === 'POST' && c.path.endsWith('/launch-token')), 'renewed before reopening');
  assert.notEqual(FakeSocket.last, first);
  assert.ok(FakeSocket.last.url.includes('access_token=' + TOKEN2), 'reopened with the renewed token');
  client.close();
});

test('game socket: renewal refused stops reconnecting and reports onAuthLost', async () => {
  const { api } = await load('https://football-id.starhermit.com/#game_token=' + TOKEN,
    { 'POST /api/v1/games/football-id/launch-token': refused }, { fastTimers: true });
  api.initAuth();
  const { createGameClient } = await import('../js/net.js?v=10');
  const seen = []; api.onAuthChange((s) => seen.push(s));
  const client = createGameClient({ sessionId: 'sess-1' });
  let lost = 0;
  const ready = client.connect({ onAuthLost: () => { lost++; } });
  const first = FakeSocket.last; first.open(); await ready;
  first.readyState = 3; first.onclose({ code: 1006 });
  for (let i = 0; i < 20 && !lost; i++) await tick();
  assert.equal(lost, 1);
  assert.equal(FakeSocket.last, first, 'the old URL is never reopened');
  assert.deepEqual(seen, [{ signedIn: false, reason: 'expired' }]);
});

test('voice relay reconnect: renewed → new URL; retry → old URL untouched; relaunch → stop + prompt', async () => {
  globalThis.WebSocket = FakeSocket; FakeSocket.OPEN = 1;
  const { reconnectWithRenewal, createVoiceClient } = await import('../js/net.js?v=10');
  const { offerRelaunch } = await import('../js/session-expiry.js?v=10');

  // renewed: the reopened socket's URL carries the fresh token
  let env = await load('https://football-id.starhermit.com/#game_token=' + TOKEN,
    { 'POST /api/v1/games/football-id/launch-token': { token: TOKEN2 } });
  env.api.initAuth();
  const voice = createVoiceClient({ roomId: 'vr-1' });
  voice.connect({}); const v1 = FakeSocket.last; v1.open();
  assert.ok(v1.url.includes('access_token=' + TOKEN));
  const did = [];
  await reconnectWithRenewal({ reopen: () => { did.push('reopen'); voice.connect({}); }, retry: () => did.push('retry'), stop: () => did.push('stop') });
  assert.deepEqual(did, ['reopen']);
  assert.match(FakeSocket.last.url, /\/ws\/v1\/voice\?roomId=vr-1&access_token=/);
  assert.ok(FakeSocket.last.url.includes('access_token=' + TOKEN2));

  // retry: renewal failed transiently — back off, never reopen the old URL
  env = await load('https://football-id.starhermit.com/#game_token=' + TOKEN,
    { 'POST /api/v1/games/football-id/launch-token': flaky });
  env.api.initAuth();
  const before = FakeSocket.last; did.length = 0;
  await reconnectWithRenewal({ reopen: () => did.push('reopen'), retry: () => did.push('retry'), stop: () => did.push('stop') });
  assert.deepEqual(did, ['retry']);
  assert.equal(FakeSocket.last, before, 'no socket opened');
  assert.equal(env.api.getAuth().online, true, 'token kept for the next attempt');

  // relaunch: signed out with reason expired; the prompt's button relaunches
  env = await load('https://football-id.starhermit.com/#game_token=' + TOKEN,
    { 'POST /api/v1/games/football-id/launch-token': refused });
  env.api.initAuth();
  const seen = []; env.api.onAuthChange((s) => seen.push(s.reason)); did.length = 0;
  await reconnectWithRenewal({ reopen: () => did.push('reopen'), retry: () => did.push('retry'), stop: () => did.push('stop') });
  assert.deepEqual(did, ['stop']);
  assert.deepEqual(seen, ['expired']);
  assert.equal(env.api.getAuth().online, false);
  let shown = null;
  const r = await offerRelaunch(async (o) => { shown = o; return true; });
  assert.equal(shown.title, 'Session expired');
  assert.equal(shown.yes, 'Back to StarHermit');
  assert.equal(r, 'relaunch');
  assert.ok(env.win.assigned, 'navigated to the launcher');
  assert.equal(await offerRelaunch(async () => false), 'offline');
});

test('session-expired prompt is localized in all nine locales', async () => {
  const { PLATFORM_LOCALES, platformStrings } = await import('../js/platform-i18n.js?v=10');
  assert.equal(PLATFORM_LOCALES.length, 9);
  for (const loc of PLATFORM_LOCALES) {
    const t = platformStrings(loc);
    for (const k of ['expiredTitle', 'expiredText', 'relaunch', 'playOffline', 'relaunchFailed']) assert.ok(t[k], `${loc}.${k}`);
    if (!loc.startsWith('en')) assert.notEqual(t.relaunch, 'Back to StarHermit', loc);
  }
});

test('standalone: offline, no network calls', async () => {
  const { api, calls } = await load('http://127.0.0.1:8080/');
  const auth = api.initAuth();
  assert.equal(auth.online, false); assert.equal(auth.username, 'You');
  assert.equal(api.canSignIn(), false);
  assert.equal(await api.resolveUsername(), 'You');
  assert.deepEqual(await api.getSettings(), {});
  await api.patchSettings({ muted: true });
  await assert.rejects(api.getMyRoom());
  await assert.rejects(api.getRoomInvites());
  assert.equal(await api.getUserAvatarUrl('x'), null);
  assert.equal(await api.getDisplayName('x'), 'Player');
  assert.equal(api.inviteLink(), null);
  assert.equal(calls.length, 0);
});
