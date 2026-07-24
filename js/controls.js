// controls.js — in-game control remapping (spec.md §5.6 / §8.8). One row per
// manifest-declared action: click the keycap to capture a new key, duplicates
// highlight red, SAVE PUTs the overrides to the platform, RESET ALL DELETEs
// them. Pure DOM + api.js, same shape as lobby.js.
import * as api from './api.js';

const KEY_LABELS = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
  AltLeft: 'L-ALT', AltRight: 'R-ALT', Space: 'SPACE', Enter: 'ENTER', Tab: 'TAB',
};

function keyLabel(code) {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  return code.toUpperCase();
}

export function createControlsScreen({ input, audio, onBack }) {
  const screen = document.getElementById('screen-controls');
  const listEl = document.getElementById('controls-list');
  const hintEl = document.getElementById('controls-hint');
  const saveBtn = document.getElementById('btn-controls-save');
  const resetBtn = document.getElementById('btn-controls-reset');
  const backBtn = document.getElementById('btn-controls-back');

  let actions = [];     // [{ action, label, defaultCodes, codes }] in manifest order
  let capturing = null; // action id waiting for a keypress
  let busy = false;

  async function open() {
    screen.classList.remove('hidden');
    capturing = null;
    hintEl.textContent = '';
    listEl.innerHTML = '<div class="muted">Loading controls…</div>';
    try {
      const dto = await api.getControls();
      // Sprint is automatic on desktop. Hide a stale server-side declaration
      // too, so older deployment metadata cannot put Shift back in this UI.
      actions = (dto.actions || [])
        .filter((a) => a.action !== 'sprint')
        .map((a) => ({ ...a, codes: [...a.codes] }));
      render();
      hintEl.textContent = 'Click a key to rebind it. Esc cancels. In a match, click the pitch for mouse camera; left mouse shoots, right passes, middle tackles.';
    } catch (e) {
      listEl.innerHTML = '';
      hintEl.textContent = e.status === 404
        ? 'This game declares no remappable controls.'
        : `Could not load controls: ${e.message}`;
    }
  }

  function close() {
    capturing = null;
    screen.classList.add('hidden');
    onBack();
  }

  // codes bound to 2+ actions in the current (unsaved) effective map
  function conflictedCodes() {
    const owners = new Map();
    for (const a of actions) for (const c of a.codes) owners.set(c, (owners.get(c) || 0) + 1);
    return new Set([...owners].filter(([, n]) => n > 1).map(([c]) => c));
  }

  function isDefault(a) {
    return a.codes.length === a.defaultCodes.length && a.codes.every((c, i) => c === a.defaultCodes[i]);
  }

  function render() {
    const conflicts = conflictedCodes();
    listEl.innerHTML = '';
    for (const a of actions) {
      const row = document.createElement('div');
      row.className = 'control-row';

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = a.label;
      row.appendChild(label);

      const keys = document.createElement('button');
      keys.className = 'keys';
      if (capturing === a.action) {
        keys.classList.add('capturing');
        keys.textContent = 'PRESS A KEY…';
      } else {
        keys.textContent = a.codes.map(keyLabel).join(' / ');
        if (a.codes.some((c) => conflicts.has(c))) row.classList.add('conflict');
      }
      keys.onclick = () => {
        audio.ui();
        capturing = capturing === a.action ? null : a.action;
        render();
      };
      row.appendChild(keys);

      const reset = document.createElement('button');
      reset.className = 'row-reset';
      reset.textContent = 'default';
      reset.disabled = isDefault(a);
      reset.onclick = () => {
        audio.ui();
        a.codes = [...a.defaultCodes];
        capturing = null;
        render();
      };
      row.appendChild(reset);

      listEl.appendChild(row);
    }
    saveBtn.disabled = busy || conflicts.size > 0;
    if (conflicts.size > 0) hintEl.textContent = 'Two actions share a key — rebind one of them to save.';
  }

  // capture the next keypress while a row is armed
  addEventListener('keydown', (e) => {
    if (!capturing || screen.classList.contains('hidden')) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // don't let the gameplay key handler see this press
    if (e.code === 'Escape') { capturing = null; render(); return; }
    if (!/^[A-Za-z0-9]{1,32}$/.test(e.code)) return; // platform stores [A-Za-z0-9] codes only
    const a = actions.find((x) => x.action === capturing);
    a.codes = [e.code];
    capturing = null;
    render();
    hintEl.textContent = 'Click a key to rebind it. Esc cancels. Mouse: left shoots, right passes, middle tackles.';
  }, true); // capture phase: runs before input.js's gameplay listener

  saveBtn.onclick = async () => {
    audio.ui();
    if (busy) return;
    busy = true;
    saveBtn.disabled = true;
    hintEl.textContent = 'Saving…';
    try {
      // only send actions that differ from the manifest defaults;
      // an all-defaults save clears the override row server-side
      const bindings = {};
      for (const a of actions) if (!isDefault(a)) bindings[a.action] = a.codes;
      const dto = await api.putControls(bindings);
      actions = (dto.actions || [])
        .filter((a) => a.action !== 'sprint')
        .map((a) => ({ ...a, codes: [...a.codes] }));
      input.setBindings(actions);
      hintEl.textContent = 'Saved.';
    } catch (e) {
      hintEl.textContent = `Could not save: ${e.message}`;
    }
    busy = false;
    render();
  };

  resetBtn.onclick = async () => {
    audio.ui();
    if (busy) return;
    busy = true;
    hintEl.textContent = 'Resetting…';
    try {
      await api.resetControls();
      for (const a of actions) a.codes = [...a.defaultCodes];
      input.setBindings(actions);
      hintEl.textContent = 'Reset to defaults.';
    } catch (e) {
      hintEl.textContent = `Could not reset: ${e.message}`;
    }
    busy = false;
    capturing = null;
    render();
  };

  backBtn.onclick = () => { audio.ui(); close(); };

  return { open };
}
