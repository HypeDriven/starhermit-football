// replays.js — archived replays of my online matches: date, sides, score, and
// a WATCH button that opens the 3D replay viewer. Pure DOM + api.js, same
// shape as leaderboard.js.
import * as api from './api.js?v=4';

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
      const names = (r.players || []).map((p) => p.username || 'Player');
      // players[] carries no team assignment — show the two halves of the list
      // as the two sides (platform returns them in roster order).
      const mid = Math.ceil(names.length / 2);
      const sides = names.length > 1
        ? `${names.slice(0, mid).join(', ')} vs ${names.slice(mid).join(', ')}`
        : (names[0] || '—');
      const score = r.result && r.result.score ? `${r.result.score[0]} – ${r.result.score[1]}` : '–';
      row.innerHTML =
        `<span class="date">${esc(date)}</span>` +
        `<span class="names" title="${esc(sides)}">${esc(sides)}</span>` +
        `<span class="score">${esc(score)}</span>`;
      const btn = document.createElement('button');
      btn.textContent = 'WATCH';
      btn.onclick = () => { audio.ui(); onWatch(r.sessionId); };
      row.appendChild(btn);
      listEl.appendChild(row);
    }
  }

  backBtn.onclick = () => { audio.ui(); close(); };

  return { open };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
