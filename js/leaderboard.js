// leaderboard.js — platform leaderboard screen: my rating (from the game info
// endpoint) and ranked entries with paging + a friends-only filter. Pure DOM +
// api.js, same shape as controls.js.
import * as api from './api.js?v=4';

const PAGE_SIZE = 20;

export function createLeaderboardScreen({ audio, onBack }) {
  const screen = document.getElementById('screen-leaderboard');
  const ratingEl = document.getElementById('lb-rating');
  const listEl = document.getElementById('lb-list');
  const hintEl = document.getElementById('lb-hint');
  const friendsEl = document.getElementById('lb-friends-only');
  const prevBtn = document.getElementById('btn-lb-prev');
  const nextBtn = document.getElementById('btn-lb-next');
  const backBtn = document.getElementById('btn-lb-back');

  let boardId = null; // leaderboard id for this game (null = game has none)
  let page = 1;
  let total = 0;
  let busy = false;

  async function open() {
    screen.classList.remove('hidden');
    page = 1;
    total = 0;
    hintEl.textContent = '';
    ratingEl.innerHTML = '<div class="muted">Loading…</div>';
    listEl.innerHTML = '';
    renderPager();
    try {
      const info = await api.getGameInfo();
      boardId = info.leaderboardId || null;
      renderRating(info.me);
      await load();
    } catch (e) {
      ratingEl.innerHTML = '';
      listEl.innerHTML = '';
      hintEl.textContent = `Could not load leaderboard: ${e.message}`;
      renderPager();
    }
  }

  function close() {
    screen.classList.add('hidden');
    onBack();
  }

  function renderRating(me) {
    ratingEl.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'lb-rating-head';
    head.textContent = 'MY RATING';
    ratingEl.appendChild(head);
    const body = document.createElement('div');
    body.className = 'lb-rating-body';
    if (!me || me.elo == null) {
      body.innerHTML = '<span class="muted">Unrated — finish a match to get a rating.</span>';
    } else {
      body.innerHTML =
        `<span class="lb-elo">${me.elo}</span>` +
        `<span class="muted small">${me.wins ?? 0}W · ${me.losses ?? 0}L · ${me.draws ?? 0}D</span>`;
    }
    ratingEl.appendChild(body);
  }

  async function load() {
    if (busy) return;
    busy = true;
    renderPager();
    hintEl.textContent = '';
    try {
      if (!boardId) {
        listEl.innerHTML = '<div class="muted">No rated players yet.</div>';
        total = 0;
        return;
      }
      listEl.innerHTML = '<div class="muted">Loading…</div>';
      const data = await api.getLeaderboardEntries(boardId, {
        friendsOnly: friendsEl.checked || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      total = data.total ?? 0;
      renderEntries(data.items || []);
    } catch (e) {
      listEl.innerHTML = '';
      hintEl.textContent = `Could not load entries: ${e.message}`;
    } finally {
      busy = false;
      renderPager();
    }
  }

  function renderEntries(items) {
    listEl.innerHTML = '';
    if (!items.length) {
      listEl.innerHTML = '<div class="muted">No rated players yet.</div>';
      return;
    }
    for (const e of items) {
      const row = document.createElement('div');
      row.className = 'lb-row';
      row.innerHTML =
        `<span class="rank">#${e.rank ?? '—'}</span>` +
        `<span class="name">${esc(e.username)}</span>` +
        `<span class="elo">${e.score}</span>`;
      listEl.appendChild(row);
    }
  }

  function renderPager() {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    prevBtn.disabled = busy || page <= 1;
    nextBtn.disabled = busy || page >= pages;
  }

  friendsEl.onchange = () => { audio.ui(); page = 1; load(); };
  prevBtn.onclick = () => { audio.ui(); if (page > 1) { page--; load(); } };
  nextBtn.onclick = () => { audio.ui(); page++; load(); };
  backBtn.onclick = () => { audio.ui(); close(); };

  return { open };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
