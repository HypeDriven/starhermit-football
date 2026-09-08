// Server regression: stateless match ticks, kickoff hold, results, Elo and replay.
'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
vm.runInThisContext(code, { filename: 'server.js' });
const game = globalThis.game;
assert(game, 'globalThis.game missing');

function makeCtx(now) {
  return {
    now: now,
    random: 0.42,
    sessionId: 'sess-1',
    players: [{ id: 'u1', name: 'Alice' }, { id: 'u2', name: 'Bob' }],
    room: {
      roomId: 'room-1', metadata: {},
      roster: [
        { userId: 'u1', name: 'Alice', team: 0, slot: 0, ai: false },
        { userId: null, name: 'AI-One', team: 0, slot: 1, ai: true },
        { userId: 'u2', name: 'Bob', team: 1, slot: 0, ai: false },
        { userId: null, name: 'AI-Two', team: 1, slot: 1, ai: true },
      ],
    },
    playerStates: { u1: { elo: 1400, wins: 2, losses: 1, draws: 0 } }, // u2: default
    presence: { u1: { online: true, left: false }, u2: { online: true, left: false } },
  };
}

// A newly created online match must remain stationary during the client intro.
{
  const ctx = makeCtx(1000);
  let state = JSON.parse(JSON.stringify(game.createSession(ctx).sessionState));
  const positions = state.match.players.map(p => [p.x, p.z]);
  for (let now = 1033; now < 14000; now += 33) {
    const ret = game.onTick({ ...ctx, now, sessionState: state });
    assert(ret.ok);
    state = JSON.parse(JSON.stringify(ret.sessionState));
    assert.strictEqual(state.match.time, 0);
    assert.deepStrictEqual(state.match.players.map(p => [p.x, p.z]), positions);
  }
  console.log('intro hold: clock and formation frozen through stateless ticks');
}

// Runs a session to a result. opts.forceDraw pins the score to 0-0 each tick;
// opts.abandon flips presence to left:true after createSession.
function runMatch(opts) {
  opts = opts || {};
  const ctx = makeCtx(1000);
  const created = game.createSession(ctx);
  assert(created.ok && created.sessionState, 'createSession failed');
  let state = created.sessionState;
  state.match.halfLength = opts.halfLength || 3; // harness speed-up (default 2x3 s)
  if (opts.abandon) {
    ctx.presence = { u1: { online: false, left: true }, u2: { online: false, left: true } };
  }
  let snapShape = null;
  let now = 1000;
  for (let i = 0; i < 20000; i++) {
    now += 33;
    const ret = game.onTick({
      now: now, random: 0.5, sessionId: 'sess-1',
      players: ctx.players, room: ctx.room, presence: ctx.presence,
      sessionState: state,
    });
    assert(ret.ok, 'onTick not ok: ' + ret.error);
    state = JSON.parse(JSON.stringify(ret.sessionState)); // stateless round-trip
    if (!snapShape) {
      for (const b of ret.broadcast) {
        if (b.data && b.data.type === 'snap') { snapShape = { b: b.data.b.length, pl: b.data.pl[0].length }; break; }
      }
    }
    if (opts.forceDraw) state.match.score = [0, 0];
    if (ret.result) return { ret: ret, state: state, snapShape: snapShape };
  }
  throw new Error('match never ended');
}

// ── Scenario 1: full match, rated ───────────────────────────────────────────
{
  const { ret, state, snapShape } = runMatch({});
  const r = ret.result;
  assert(Array.isArray(r.score) && r.score.length === 2, 'result.score');
  assert([-1, 0, 1].includes(r.winner), 'result.winner');
  assert.strictEqual(typeof r.draw, 'boolean', 'result.draw');

  assert(ret.eloUpdates && typeof ret.eloUpdates.u1 === 'number' && typeof ret.eloUpdates.u2 === 'number',
    'eloUpdates missing');
  const e1 = ret.eloUpdates.u1, e2 = ret.eloUpdates.u2;
  if (r.winner === 0) { assert(e1 > 1400 && e2 < 1200, 'elo direction (u1 won)'); }
  else if (r.winner === 1) { assert(e1 < 1400 && e2 > 1200, 'elo direction (u2 won)'); }
  else { assert(e1 < 1400 && e2 > 1200, 'elo direction (draw: favorite loses points)'); }
  // exact values: E0 = 1/(1+10^-0.5) ≈ 0.7597
  const E0 = 1 / (1 + Math.pow(10, -0.5));
  const S0 = r.winner === -1 ? 0.5 : (r.winner === 0 ? 1 : 0);
  assert.strictEqual(e1, Math.max(100, 1400 + Math.round(32 * (S0 - E0))), 'u1 elo exact');
  assert.strictEqual(e2, Math.max(100, 1200 + Math.round(32 * ((1 - S0) - (1 - E0)))), 'u2 elo exact');

  const d1 = ret.playerStates.u1, d2 = ret.playerStates.u2;
  assert.strictEqual(d1.elo, e1, 'playerStates u1 elo');
  assert.strictEqual(d2.elo, e2, 'playerStates u2 elo');
  assert.strictEqual(d1.wins, 2 + (r.winner === 0 ? 1 : 0), 'u1 wins');
  assert.strictEqual(d1.losses, 1 + (r.winner === 1 ? 1 : 0), 'u1 losses');
  assert.strictEqual(d1.draws, 0 + (r.winner === -1 ? 1 : 0), 'u1 draws');
  assert.strictEqual(d2.wins, 0 + (r.winner === 1 ? 1 : 0), 'u2 wins');
  assert.strictEqual(d2.losses, 0 + (r.winner === 0 ? 1 : 0), 'u2 losses');

  assert.strictEqual(state.summary.status, 'finished', 'summary.status');
  assert(state.summary.moveCount > 0, 'summary.moveCount');

  const frames = state.replay.frames;
  assert(frames.length > 0, 'replay frames empty');
  for (let i = 0; i < frames.length; i++) {
    if (i) assert(frames[i].t > frames[i - 1].t, 'frame t not increasing');
    assert.strictEqual(frames[i].t % 15, 0, 'frame cadence');
    assert.strictEqual(frames[i].b.length, snapShape.b, 'frame b shape vs snap');
    assert.strictEqual(frames[i].pl.length, state.replay.teamSize * 2, 'frame pl count');
    assert.strictEqual(frames[i].pl[0].length, snapShape.pl, 'frame pl entry shape vs snap');
    assert(Array.isArray(frames[i].sc) && typeof frames[i].ph === 'string', 'frame sc/ph');
  }
  const evTypes = state.replay.evs.map(e => e.ev.type);
  assert(evTypes.includes('kickoff'), 'replay evs: kickoff');
  assert(evTypes.includes('fulltime'), 'replay evs: fulltime');
  for (const e of state.replay.evs) assert(typeof e.t === 'number', 'ev t');
  assert.strictEqual(state.replay.truncated, false, 'truncated');
  assert.strictEqual(state.replay.roster.length, 4, 'replay roster');
  assert.deepStrictEqual(
    state.replay.roster.map(x => [x.pid, x.team, x.ai]),
    [[0, 0, false], [1, 0, true], [2, 1, false], [3, 1, true]], 'roster order/flags');

  const bytes = JSON.stringify(state).length;
  console.log('scenario 1 (full match): OK  score=' + r.score.join('-') +
    ' winner=' + r.winner + ' elo u1 1400->' + e1 + ' u2 1200->' + e2 +
    ' frames=' + frames.length + ' evs=' + state.replay.evs.length);
  console.log('final sessionState JSON bytes: ' + bytes);
}

// ── Scenario 1b: longer match, likely a decisive result ─────────────────────
{
  const { ret } = runMatch({ halfLength: 60 });
  const r = ret.result;
  console.log('scenario 1b (2x60 s): score=' + r.score.join('-') + ' winner=' + r.winner +
    ' elo u1 1400->' + ret.eloUpdates.u1 + ' u2 1200->' + ret.eloUpdates.u2);
  if (r.winner === 0) assert(ret.eloUpdates.u1 > 1400 && ret.eloUpdates.u2 < 1200, 'u1 won, elo up');
  if (r.winner === 1) assert(ret.eloUpdates.u1 < 1400 && ret.eloUpdates.u2 > 1200, 'u2 won, elo up');
  assert(ret.eloUpdates, 'rated');
}

// ── Scenario 2: draw at full time, rated ────────────────────────────────────
{
  const { ret } = runMatch({ forceDraw: true });
  assert.strictEqual(ret.result.draw, true, 'draw flag');
  assert.strictEqual(ret.result.winner, -1, 'draw winner');
  assert(ret.eloUpdates, 'draw should still be rated');
  assert(ret.eloUpdates.u1 < 1400 && ret.eloUpdates.u2 > 1200, 'draw: favorite sheds points');
  assert.strictEqual(ret.playerStates.u1.draws, 1, 'u1 draws incremented');
  console.log('scenario 2 (draw): OK  elo u1 1400->' + ret.eloUpdates.u1 +
    ' u2 1200->' + ret.eloUpdates.u2);
}

// ── Scenario 3: abandoned (all humans left), NOT rated ─────────────────────
{
  const { ret, state } = runMatch({ abandon: true });
  assert.strictEqual(ret.result.draw, true, 'abandoned draw flag');
  assert(!('eloUpdates' in ret), 'abandoned must not carry eloUpdates');
  assert(!('playerStates' in ret), 'abandoned must not carry playerStates');
  assert.strictEqual(state.summary.status, 'finished', 'abandoned summary finished');
  console.log('scenario 3 (abandoned): OK  no eloUpdates/playerStates, result.draw=true');
}

console.log('ALL SCENARIOS PASSED');
