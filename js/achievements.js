// achievements.js — platform achievements screen: the game's catalog (declared
// by server.js, unlocked only by the server) with my unlock state. Pure DOM +
// api.js, same shape as leaderboard.js.
import * as api from './api.js?v=10';
import { platformStrings } from './platform-i18n.js?v=10';

export function createAchievementsScreen({ audio, onBack }) {
  const screen = document.getElementById('screen-achievements');
  const listEl = document.getElementById('ach-list');
  const hintEl = document.getElementById('ach-hint');
  const t = platformStrings();
  document.getElementById('ach-title').textContent = t.achievements.toLocaleUpperCase();
  const backBtn = document.getElementById('btn-ach-back');
  backBtn.textContent = t.back.toLocaleUpperCase();

  async function open() {
    screen.classList.remove('hidden');
    hintEl.textContent = '';
    listEl.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'muted';
    loading.textContent = t.achLoading;
    listEl.appendChild(loading);
    try {
      render(await api.getAchievements());
    } catch {
      listEl.innerHTML = '';
      hintEl.textContent = t.achFailed;
    }
  }

  function render(items) {
    listEl.innerHTML = '';
    const list = Array.isArray(items) ? items : (items?.items || []);
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = t.achEmpty;
      listEl.appendChild(empty);
      return;
    }
    for (const a of list) {
      const got = !!(a.unlocked || a.unlockedAt || a.achieved || a.earnedAt);
      const row = document.createElement('div');
      row.className = `ach-row${got ? '' : ' locked'}`;
      const icon = document.createElement('span');
      icon.className = 'ach-icon';
      icon.textContent = got ? '🏆' : '○';
      const text = document.createElement('div');
      text.className = 'ach-text';
      const name = document.createElement('div');
      name.className = 'ach-name';
      name.textContent = a.name || a.title || a.key || '';
      const desc = document.createElement('div');
      desc.className = 'ach-desc';
      desc.textContent = a.description || a.desc || '';
      text.append(name, desc);
      const state = document.createElement('span');
      state.className = 'ach-state';
      state.textContent = got ? t.achUnlocked : t.achLocked;
      row.append(icon, text, state);
      listEl.appendChild(row);
    }
  }

  backBtn.onclick = () => { audio.ui(); screen.classList.add('hidden'); onBack(); };
  return { open };
}
