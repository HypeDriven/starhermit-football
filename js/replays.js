// replays.js — archived replays of my online matches: date, sides, score, and
// a WATCH button that opens the 3D replay viewer. Pure DOM + api.js, same
// shape as leaderboard.js.
import * as api from './api.js?v=6';

export function createReplaysScreen({ audio, onWatch, onBack }) {
  const screen = document.getElementById('screen-replays');
  const listEl = document.getElementById('replays-list');
  const hintEl = document.getElementById('replays-hint');
  const backBtn = document.getElementById('btn-replays-back');

  async function open() {
    screen.classList.remove('hidden');
    hintEl.textContent = '';
    listEl.innerHTML = '<div class="muted">Loading…</div>';
    try {
      const items = await api.getMyReplays(20);
      render(items || []);
    } catch (e) {
      listEl.innerHTML = '';
      hintEl.textContent = `Could not load replays: ${e.message}`;
    }
  }

  function close() {
    screen.classList.add('hidden');
    onBack();
  }

  function render(items) {
    listEl.innerHTML = '';
    if (!items.length) {
      listEl.innerHTML = '<div class="muted">No replays yet — finish an online match.</div>';
      return;
    }
    for (const r of items) {
      const row = document.createElement('div');
      row.className = 'replay-row';
      const when = r.finishedAt ? new Date(r.finishedAt) : null;
      const date = when && !isNaN(when)
        ? when.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';
      const score = r.result && r.result.score ? `${r.result.score[0]} – ${r.result.score[1]}` : '–';
      row.innerHTML =
        `<span class="date">${esc(date)}</span>` +
        `<span class="names">…</span>` +
        `<span class="score">${esc(score)}</span>`;
      const namesEl = row.querySelector('.names');
      sidesFor(r).then((sides) => {
        if (!namesEl.isConnected) return;
        namesEl.textContent = sides;
        namesEl.title = sides;
      });
      const btn = document.createElement('button');
      btn.textContent = 'WATCH';
      btn.onclick = () => { audio.ui(); onWatch(r.sessionId); };
      row.appendChild(btn);
      listEl.appendChild(row);
    }
  }

  // The list payload's players[] has no team assignment and an undocumented
  // ordering — halving it mis-splits unbalanced human teams. The archived
  // session state knows the truth: seats map pid → userId/name and
  // replay.teamSize splits the teams. Fall back to the halving heuristic
  // only when the detail fetch fails.
  async function sidesFor(r) {
    try {
      const d = await api.getReplay(r.sessionId);
      const st = d?.state;
      const ts = st?.replay?.teamSize;
      if (ts && st.seats) {
        const teams = [[], []];
        for (let pid = 0; pid < ts * 2; pid++) {
          const seat = st.seats[pid];
          if (!seat) continue;
          const name = seat.userId
            ? await api.getDisplayName(seat.userId)
            : `${seat.name} (AI)`;
          teams[pid < ts ? 0 : 1].push(name);
        }
        if (teams[0].length || teams[1].length) {
          return `${teams[0].join(', ') || '—'} vs ${teams[1].join(', ') || '—'}`;
        }
      }
    } catch { /* fall through to the heuristic */ }
    const names = await Promise.all(
      (r.players || []).map((p) => api.getDisplayName(p.userId)));
    const mid = Math.ceil(names.length / 2);
    return names.length > 1
      ? `${names.slice(0, mid).join(', ')} vs ${names.slice(mid).join(', ')}`
      : (names[0] || '—');
  }

  backBtn.onclick = () => { audio.ui(); close(); };

  return { open };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
