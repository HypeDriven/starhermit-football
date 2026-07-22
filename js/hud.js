// hud.js — DOM HUD: score bar, match clock, power bar, event banners.
export function createHud() {
  const hudEl = document.getElementById('hud');
  const homeName = document.getElementById('score-home-name');
  const awayName = document.getElementById('score-away-name');
  const homeEl = document.getElementById('score-home');
  const awayEl = document.getElementById('score-away');
  const clockEl = document.getElementById('match-clock');
  const powerBar = document.getElementById('power-bar');
  const powerFill = document.getElementById('power-fill');
  const bannerEl = document.getElementById('event-banner');
  let bannerTimer = null;

  return {
    showHud(show) { hudEl.classList.toggle('hidden', !show); },
    setTeamNames(h, a) { homeName.textContent = h; awayName.textContent = a; },
    setScore(h, a) { homeEl.textContent = h; awayEl.textContent = a; },
    setClock(time, half, halfLength) {
      const t = Math.min(time, halfLength * 2);
      const shown = half === 1 ? t : t - halfLength;
      const mm = String(Math.floor(shown / 60)).padStart(2, '0');
      const ss = String(Math.floor(shown % 60)).padStart(2, '0');
      clockEl.textContent = `${half === 1 ? '1st' : '2nd'} ${mm}:${ss}`;
    },
    setPower(v) {
      powerBar.classList.toggle('hidden', v <= 0);
      powerFill.style.width = `${Math.round(v * 100)}%`;
    },
    banner(text, ms = 2500) {
      bannerEl.textContent = text;
      bannerEl.classList.remove('hidden');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => bannerEl.classList.add('hidden'), ms);
    },
  };
}
