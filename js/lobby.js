// lobby.js — lobby screen: create/invite/open/quick-join against the
// platform's Realtime Rooms API (spec.md §8). Pure DOM + api.js; main.js
// drives the transitions.
import * as api from './api.js?v=6';
import { roleForSlot } from './game/sim.js?v=6';

const ROLE_NAMES = { GK: 'Goalkeeper', DF: 'Defender', MF: 'Midfielder', FW: 'Forward' };

export function createLobby({ onMatchReady, onStarting, onLeave, setStatus }) {
  let room = null;
  let pollTimer = null;
  let countdownTimer = null;
  let entered = false; // guards double enterMatch (poll + tryStart race)

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

  // open/seats/start are host-only on the platform — the UI must not offer
  // them to guests (hostUserId on the room; IsHost participant as fallback).
  function amHost() {
    if (!room) return false;
    const me = api.getAuth();
    if (room.hostUserId) return room.hostUserId === me.userId;
    const host = (room.participants || []).find((p) => p.isHost && !p.leftAt);
    return !!host && host.userId === me.userId;
  }

  // A room can report Playing before the platform binds gameSessionId (the
  // bridge is best-effort at start, and an Open room now auto-starts the
  // moment every seat is taken — so quick-join/invite-accept/open responses
  // can already be Playing). Entering without the session id fails with
  // "match session unavailable", so hand off to the poller, which gives the
  // binding a few polls to appear before entering.
  function enterWhenReady() {
    if (room.gameSessionId) { enterMatch(); return; }
    timerEl.textContent = 'Starting match…';
    startPolling();
  }

  async function create(teamSize) {
    stopPolling();
    entered = false;
    room = await api.createRoom({
      teamCount: 2,
      seatsPerTeam: teamSize,
      backfillAfterSeconds: 30,
      metadata: { game: 'football' },
    });
    render();
    startPolling();
    show();
  }

  // Quick play: join an open room; if none, create our own open room.
  async function quickPlay(teamSize) {
    setStatus('Searching for a match…');
    entered = false;
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
    show();
    if (room.status === 'Playing' || room.status === 'playing') enterWhenReady();
    else startPolling();
    setStatus('');
  }

  // Ranked solo vs AI: every seat but mine is an AI seated at creation
  // (aiPlayers), so starting the room begins the match immediately — no
  // backfill wait. Unlike offline practice this is a real platform match:
  // server-authoritative, rated, and archived as a replay.
  async function soloVsAi(teamSize) {
    stopPolling();
    entered = false;
    timerEl.textContent = 'Starting match…';
    room = await api.createRoom({
      teamCount: 2,
      seatsPerTeam: teamSize,
      backfillAfterSeconds: 30,
      aiPlayers: 2 * teamSize - 1,
      metadata: { game: 'football' },
    });
    render();
    show();
    room = await api.startRoom(room.id);
    enterWhenReady();
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

  // Anyone who opens the link can sign in, auto-friend the sharer and get a
  // game invite back — a way to recruit players outside the friends list.
  async function copyInviteLink() {
    const { userId, slug } = api.getAuth();
    if (!userId || !slug) {
      timerEl.textContent = 'Sign in via StarHermit to share an invite link.';
      return;
    }
    const url = `https://dashboard.starhermit.com/game-invite/${userId}/${slug}`;
    try {
      await copyText(url);
      timerEl.textContent = 'Invite link copied — send it to anyone to play together.';
    } catch {
      timerEl.textContent = 'Could not copy the invite link.';
    }
  }

  async function findMatch() {
    findBtn.disabled = true;
    inviteBtn.disabled = true;
    room = await api.openRoom(room.id);
    if (room.status === 'Playing' || room.status === 'playing') {
      enterWhenReady();
      return;
    }
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
    let playingPolls = 0;
    pollTimer = setInterval(async () => {
      if (!room) return;
      try {
        room = await api.getRoom(room.id);
        render();
        if (room.status === 'Playing' || room.status === 'playing') {
          clearInterval(countdownTimer);
          // The server binds gameSessionId in a separate step from flipping the
          // room to Playing — give it a few polls to appear before entering
          // (entering without it shows "match session unavailable").
          if (room.gameSessionId || ++playingPolls >= 5) enterMatch();
          else timerEl.textContent = 'Starting match…';
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
    // leavers keep their participant row (leftAt set) — their seat is open again
    const parts = (room.participants || []).filter((p) => !p.leftAt);
    rosterEl.innerHTML = '';
    const cols = [[], []];
    for (let t = 0; t < 2; t++) {
      for (let s = 0; s < teamSize; s++) {
        const p = parts.find((x) => x.team === t && x.slot === s);
        cols[t].push(p || null);
      }
    }
    const me = api.getAuth();
    const status = (room.status || '').toLowerCase();
    const canMove = (status === 'lobby' || status === 'open') && amHost();
    // open/start are host-only — a guest's FIND MATCH would just 403; and in
    // an already-Open room matchmaking is running, so the button stays off
    const host = amHost();
    findBtn.disabled = !host || status !== 'lobby';
    findBtn.title = host ? '' : 'Only the lobby host can start matchmaking';
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
        el.className = 'seat ' + (t === 0 ? 'blue' : 'red') + (p ? '' : ' empty');

        // profile picture — outboard side of the slot (left for blue, right
        // for red); AI and open seats keep the cell so the columns line up
        const av = document.createElement('span');
        av.className = 'avatar';
        if (p && !p.isAi && p.userId) {
          api.getUserAvatarUrl(p.userId).then((url) => {
            if (!url || !av.isConnected) return;
            const img = document.createElement('img');
            img.src = url;
            img.alt = '';
            av.appendChild(img);
          });
        }
        el.appendChild(av);

        // which position this slot plays (same slot→role rule as the sim)
        const role = roleForSlot(s, teamSize);
        const pos = document.createElement('span');
        pos.className = 'pos';
        pos.textContent = role;
        pos.title = ROLE_NAMES[role] || role;
        el.appendChild(pos);

        const who = document.createElement('span');
        if (p) {
          if (p.isAi || !p.userId) {
            who.textContent = p.username + (p.isAi ? ' (AI)' : '');
          } else {
            // humans: resolve the profile nickname, never the raw username
            who.textContent = '…';
            api.getDisplayName(p.userId).then((n) => { if (who.isConnected) who.textContent = n; });
          }
          if (p.isAi) el.classList.add('ai');
          if (p.userId === me.userId) el.classList.add('me');
        } else {
          who.textContent = '— open —';
          if (canMove) {
            el.classList.add('clickable');
            el.title = `Move me here to play ${ROLE_NAMES[role] || role}`;
            el.onclick = () => moveTo(t, s);
          }
        }
        el.appendChild(who);
        rosterEl.appendChild(el);
      }
    }
    const humans = parts.filter((p) => !p.isAi).length;
    timerEl.textContent = room.status === 'Open' || room.status === 'open'
      ? timerEl.textContent || 'Finding players…'
      : `${humans} player${humans === 1 ? '' : 's'} in lobby`;
  }

  // Click an open seat → move my participant there. The seats endpoint is
  // host-only on the platform, so render() only offers this to the host.
  async function moveTo(team, slot) {
    const me = api.getAuth();
    const mine = (room?.participants || []).find((p) => p.userId === me.userId && !p.leftAt);
    if (!mine) return;
    try {
      room = await api.setSeats(room.id, [{ participantId: mine.id, team, slot }]);
      render();
    } catch (e) {
      setStatus(e.message);
    }
  }

  function enterMatch() {
    if (entered) return;
    entered = true;
    stopPolling();
    onStarting?.(room);
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
    entered = false;
    render();
    show();
    if (room.status === 'Playing' || room.status === 'playing') enterWhenReady();
    else startPolling();
  }

  return { create, quickPlay, soloVsAi, inviteFriends, findMatch, leave, show, hide, adopt, copyInviteLink, get room() { return room; } };
}

// navigator.clipboard requires a secure context; fall back to the old
// textarea + execCommand path when it's missing or rejects.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch { /* non-secure context or denied — fall back below */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy failed');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
