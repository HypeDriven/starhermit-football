// input.js — unified desktop keyboard + mobile touch controls.
// Produces the sim input shape each frame. Movement is camera-relative:
// call getState(camYaw) with the follow camera's yaw each frame.

export function createInput() {
  const keys = new Set();
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  // ── keyboard ──
  // Actions the sim understands; the manifest declares the same ids (starhermit.txt
  // control.* lines), so platform bindings map 1:1 onto these.
  const ACTIONS = new Set(['up', 'down', 'left', 'right', 'sprint', 'pass', 'shoot', 'tackle']);
  const DEFAULT_KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'sprint', ShiftRight: 'sprint',
    Space: 'pass', KeyJ: 'shoot', KeyK: 'tackle',
  };
  let keymap = { ...DEFAULT_KEYMAP };

  // Rebuild the code→action map from the platform's effective bindings
  // (GET /api/v1/games/<slug>/controls → actions: [{ action, codes }]).
  function setBindings(actions) {
    const map = {};
    for (const a of actions || []) {
      if (!ACTIONS.has(a.action)) continue;
      for (const code of a.codes || []) map[code] = a.action;
    }
    if (Object.keys(map).length) keymap = map;
  }

  let passEdge = false, tackleEdge = false;
  let shootHeld = false, shootCharge = 0, shootReleased = 0;

  addEventListener('keydown', (e) => {
    const k = keymap[e.code];
    if (!k) return;
    e.preventDefault();
    if (keys.has(k)) return;
    keys.add(k);
    if (k === 'pass') passEdge = true;
    if (k === 'tackle') tackleEdge = true;
    if (k === 'shoot') { shootHeld = true; shootCharge = 0; }
  });
  addEventListener('keyup', (e) => {
    const k = keymap[e.code];
    if (!k) return;
    keys.delete(k);
    if (k === 'shoot' && shootHeld) { shootHeld = false; shootReleased = Math.max(0.15, shootCharge); }
  });

  // ── touch ──
  const joy = { active: false, id: -1, x: 0, y: 0, cx: 0, cy: 0 };
  const touch = { sprint: false };
  if (isTouch) setupTouch();

  function setupTouch() {
    const joyEl = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    const R = 48; // max knob travel px

    joyEl.addEventListener('pointerdown', (e) => {
      joy.active = true; joy.id = e.pointerId;
      const r = joyEl.getBoundingClientRect();
      joy.cx = r.left + r.width / 2; joy.cy = r.top + r.height / 2;
      joyEl.setPointerCapture(e.pointerId);
      moveJoy(e);
    });
    joyEl.addEventListener('pointermove', (e) => { if (joy.active && e.pointerId === joy.id) moveJoy(e); });
    const end = (e) => {
      if (e.pointerId !== joy.id) return;
      joy.active = false; joy.x = 0; joy.y = 0; touch.sprint = false;
      knob.style.transform = 'translate(-50%,-50%)';
    };
    joyEl.addEventListener('pointerup', end);
    joyEl.addEventListener('pointercancel', end);

    function moveJoy(e) {
      let dx = e.clientX - joy.cx, dy = e.clientY - joy.cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      joy.x = dx / R; joy.y = dy / R;
      touch.sprint = Math.hypot(joy.x, joy.y) > 0.92;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }

    bindButton('btn-pass', () => { passEdge = true; }, null);
    bindButton('btn-tackle', () => { tackleEdge = true; }, null);
    bindButton('btn-shoot',
      () => { shootHeld = true; shootCharge = 0; },
      () => { if (shootHeld) { shootHeld = false; shootReleased = Math.max(0.15, shootCharge); } });
  }

  function bindButton(id, onDown, onUp) {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown(); });
    if (onUp) {
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      el.addEventListener('pointerleave', onUp);
    }
  }

  // ── frame state ──
  function getState(camYaw, dt) {
    // shoot charge builds while held
    if (shootHeld) shootCharge = Math.min(1, shootCharge + dt * 1.4);

    // raw stick: keyboard digital or touch analog
    let rx = 0, ry = 0;
    if (keys.has('left')) rx -= 1;
    if (keys.has('right')) rx += 1;
    if (keys.has('up')) ry -= 1;
    if (keys.has('down')) ry += 1;
    if (joy.active) { rx = joy.x; ry = joy.y; }

    // rotate screen-space stick into world space by camera yaw
    // camera yaw: world direction the camera faces (x,z). Screen up = camera forward.
    const fx = Math.cos(camYaw), fz = Math.sin(camYaw);       // camera forward
    const sx = -fz, sz = fx;                                   // camera right (screen right)
    let mx = fx * -ry + sx * rx;
    let mz = fz * -ry + sz * rx;
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }

    const state = {
      mx, mz,
      sprint: keys.has('sprint') || touch.sprint,
      pass: passEdge,
      tackle: tackleEdge,
      shoot: shootReleased,
      shootHeld,
      shootCharge,
    };
    passEdge = false;
    tackleEdge = false;
    shootReleased = 0;
    return state;
  }

  return {
    isTouch,
    setBindings,
    getState,
    showTouchUi(show) {
      if (!isTouch) return;
      document.getElementById('touch-ui').classList.toggle('hidden', !show);
    },
  };
}
