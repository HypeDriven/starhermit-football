// lobby.js — lobby screen: create/invite/open/quick-join against the
// platform's Realtime Rooms API (spec.md §8). Pure DOM + api.js; main.js
// drives the transitions.
import * as api from './api.js';

export function createLobby({ onMatchReady, onLeave, setStatus }) {
  let room = null;
  let pollTimer = null;
  let countdownTimer = null;

  const rosterEl = document.getElementById('lobby-roster');
  const timerEl = document.getElementById('lobby-timer');
  const findBtn = document.getElementById('btn-find');
  const inviteBtn = document.getElementById('btn-invite');

  function show() {
    document.getElementById('screen-lobby').classList.remove('hidden');
  }
  function hide() {
    document.getElementById('screen-lobby').classList.add('hidden');
    stopPolling();
  }

  async function create(teamSize) {
    stopPolling();
    room = await api.createRoom({
      teamCount: 2,
      seatsPerTeam: teamSize,
      backfillAfterSeconds: 30,
      metadata: { game: 'football' },
    });
    findBtn.disabled = false;
    render();
    startPolling();
    show();
  }

  // Quick play: join an open room; if none, create our own open room.
  async function quickPlay(teamSize) {
    setStatus('Searching for a match…');
    try {
      room = await api.quickJoin();
    } catch (e) {
      if (e.status !== 404) throw e;
      room = await api.createRoom({
        teamCount: 2, seatsPerTeam: teamSize, backfillAfterSeconds: 30,
        metadata: { game: 'football' },
      });
      room = await api.openRoom(room.id);
    }
    render();
    startPolling();
    show();
    setStatus('');
  }

  async function inviteFriends() {
    const listEl = document.getElementById('invite-list');
    listEl.innerHTML = '<div class="muted">Loading friends…</div>';
    document.getElementById('screen-invite').classList.remove('hidden');
    const friends = await api.getFriends().catch(() => []);
    listEl.innerHTML = '';
    if (!friends.length) {
      listEl.innerHTML = '<div class="muted">No friends yet — add friends on StarHermit first.</div>';
      return;
    }
    for (const f of friends) {
      const row = document.createElement('div');
      row.className = 'friend-row';
      row.innerHTML = `<span>${esc(f.username)} <span class="online">${f.online ? '● online' : ''}</span></span>`;
      const btn = document.createElement('button');
      btn.textContent = 'INVITE';
      btn.onclick = async () => {
        btn.disabled = true;
        try { await api.inviteToRoom(room.id, f.userId); btn.textContent = 'SENT'; }
        catch { btn.textContent = 'ERROR'; btn.disabled = false; }
      };
      row.appendChild(btn);
      listEl.appendChild(row);
    }
  }

  async function findMatch() {
    findBtn.disabled = true;
    inviteBtn.disabled = true;
    room = await api.openRoom(room.id);
    timerEl.textContent = 'Finding players… 30s';
    startCountdown();
  }

  function startCountdown() {
    clearInterval(countdownTimer);
    let left = 30;
    countdownTimer = setInterval(async () => {
      left--;
      timerEl.textContent = `Finding players… ${left}s`;
      if (left <= 0) {
        clearInterval(countdownTimer);
        await tryStart();
      }
    }, 1000);
  }

  async function tryStart() {
    try {
      room = await api.startRoom(room.id);
      enterMatch();
    } catch { /* not host, or already started — poll will catch it */ }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      if (!room) return;
      try {
        room = await api.getRoom(room.id);
        render();
        if (room.status === 'Playing' || room.status === 'playing') {
          clearInterval(countdownTimer);
          enterMatch();
        } else if (room.status === 'Closed' || room.status === 'closed') {
          leave();
        }
      } catch { /* transient */ }
    }, 2000);
  }

  function stopPolling() {
    clearInterval(pollTimer);
    clearInterval(countdownTimer);
  }

  function render() {
    if (!room) return;
    const teamSize = room.config?.seatsPerTeam ?? room.seatsPerTeam ?? 5;
    const parts = room.participants || [];
    rosterEl.innerHTML = '';
    const cols = [[], []];
    for (let t = 0; t < 2; t++) {
      for (let s = 0; s < teamSize; s++) {
        const p = parts.find((x) => x.team === t && x.slot === s);
        cols[t].push(p || null);
      }
    }
    const me = api.getAuth();
    for (let t = 0; t < 2; t++) {
      const head = document.createElement('div');
      head.className = 'team-head';
      head.textContent = t === 0 ? 'BLUE' : 'RED';
      head.style.color = t === 0 ? '#5b9bd5' : '#e74c3c';
      rosterEl.appendChild(head);
    }
    for (let s = 0; s < teamSize; s++) {
      for (let t = 0; t < 2; t++) {
        const p = cols[t][s];
        const el = document.createElement('div');
        el.className = 'seat' + (p ? '' : ' empty');
        if (p) {
          el.textContent = p.username + (p.isAi ? ' (AI)' : '');
          if (p.isAi) el.classList.add('ai');
          if (p.userId === me.userId) el.classList.add('me');
        } else {
          el.textContent = '— open —';
        }
        rosterEl.appendChild(el);
      }
    }
    const humans = parts.filter((p) => !p.isAi).length;
    timerEl.textContent = room.status === 'Open' || room.status === 'open'
      ? timerEl.textContent || 'Finding players…'
      : `${humans} player${humans === 1 ? '' : 's'} in lobby`;
  }

  function enterMatch() {
    stopPolling();
    hide();
    onMatchReady(room);
  }

  async function leave() {
    stopPolling();
    if (room) { try { await api.leaveRoom(room.id); } catch {} }
    room = null;
    hide();
    onLeave();
  }

  // Adopt a room we joined outside the lobby flow (e.g. accepted invite).
  function adopt(r) {
    room = r;
    findBtn.disabled = false;
    render();
    startPolling();
    show();
  }

  return { create, quickPlay, inviteFriends, findMatch, leave, show, hide, adopt, get room() { return room; } };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
