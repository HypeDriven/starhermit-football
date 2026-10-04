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
async function load(href, routes = {}) {
  const calls = []; const url = new URL(href);
  const win = { location: { hash: url.hash, search: url.search, pathname: url.pathname, origin: url.origin, hostname: url.hostname, href, protocol: url.protocol, host: url.host }, history: { replaceState: (a, b, u) => { win.replaced = u; } } };
  const fetch = async (path, init = {}) => {
    const method = init.method || 'GET'; calls.push({ path, method, body: init.body });
    const hit = Object.entries(routes).find(([k]) => `${method} ${path}`.endsWith(k));
    return hit ? new Response(JSON.stringify(hit[1]), { status: 200 }) : new Response('', { status: 404 });
  };
  globalThis.StarHermit = SDK.create({ window: win, fetch, WebSocket: FakeSocket, setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; } });
  const api = await import(`../js/api.js?v=9&case=${++n}`);
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
  const { createGameClient } = await import('../js/net.js?v=9');
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
