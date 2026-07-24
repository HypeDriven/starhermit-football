// input.js — unified desktop keyboard + mobile touch controls.
// Produces the sim input shape each frame. Movement is camera-relative:
// call getState(camYaw) with the follow camera's yaw each frame.

export function createInput() {
  const keys = new Set();
  const downCodes = new Set();
  // Use the primary pointer, not mere touch capability: hybrid laptops expose
  // ontouchstart but should retain desktop mouse/keyboard controls.
  const isTouch = matchMedia('(pointer: coarse)').matches;
  let gameplayActive = false;

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
  let keyboardX = 0, keyboardY = 0, keyboardMoveYaw = null, needsMoveYaw = true;
  let sprintToggle = localStorage.getItem('starhermit-football-toggle-sprint') === 'true';
  let sprintLatched = false;

  function releaseShoot() {
    if (!shootHeld) return;
    shootHeld = false;
    shootReleased = Math.max(0.15, shootCharge);
  }
  function cancelShoot() {
    shootHeld = false;
    shootCharge = 0;
    shootReleased = 0;
  }

  addEventListener('keydown', (e) => {
    const k = keymap[e.code];
    if (!k) return;
    e.preventDefault();
    if (downCodes.has(e.code)) return;
    downCodes.add(e.code);
    keys.add(k);
    if (k === 'pass') passEdge = true;
    if (k === 'tackle') tackleEdge = true;
    if (k === 'shoot') { shootHeld = true; shootCharge = 0; }
    if (k === 'sprint' && sprintToggle) sprintLatched = !sprintLatched;
  });
  addEventListener('keyup', (e) => {
    const k = keymap[e.code];
    if (!k) return;
    e.preventDefault();
    downCodes.delete(e.code);
    // An action can have alternate bindings; keep it down until all of its
    // physical keys are released.
    if (![...downCodes].some((code) => keymap[code] === k)) keys.delete(k);
    if (k === 'shoot' && !keys.has('shoot')) releaseShoot();
  });

  function clearDesktopInput() {
    keys.clear();
    downCodes.clear();
    keyboardX = keyboardY = 0;
    keyboardMoveYaw = null;
    needsMoveYaw = true;
    sprintLatched = false;
    passEdge = tackleEdge = false;
    cancelShoot();
  }
  addEventListener('blur', clearDesktopInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearDesktopInput(); });

  // ── touch ──
  const joy = { active: false, id: -1, x: 0, y: 0, cx: 0, cy: 0 };
  const touch = { sprint: false };
  let lookDX = 0, lookDY = 0;
  if (isTouch) setupTouch();
  else setupMouse();

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

  function setupMouse() {
    const canvas = document.getElementById('gl');
    const hint = document.getElementById('mouse-hint');

    // First click captures the mouse for a conventional desktop third-person
    // camera. Once captured: mouse aims, left shoots, right passes, middle tackles.
    canvas.addEventListener('mousedown', (e) => {
      if (!gameplayActive) return;
      e.preventDefault();
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
        return; // the capture click must not also fire a shot
      }
      if (e.button === 0) { shootHeld = true; shootCharge = 0; }
      else if (e.button === 1) tackleEdge = true;
      else if (e.button === 2) passEdge = true;
    });
    addEventListener('mouseup', (e) => {
      if (document.pointerLockElement === canvas && e.button === 0) releaseShoot();
    });
    addEventListener('mousemove', (e) => {
      if (gameplayActive && document.pointerLockElement === canvas) {
        lookDX += e.movementX || 0;
        lookDY += e.movementY || 0;
      }
    });
    canvas.addEventListener('contextmenu', (e) => { if (gameplayActive) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      hint.classList.toggle('hidden', locked || !gameplayActive);
      if (!locked) {
        lookDX = lookDY = 0;
        cancelShoot();
      }
    });
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

    // Touch is naturally analog. Smooth keyboard axes so starts, stops and
    // diagonal changes do not hammer the simulation with instantaneous turns.
    const targetX = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    const targetY = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
    const hasKeyboardMove = targetX !== 0 || targetY !== 0;
    if (hasKeyboardMove && needsMoveYaw) {
      keyboardMoveYaw = camYaw;
      needsMoveYaw = false;
    }
    if (!hasKeyboardMove) {
      needsMoveYaw = true;
      sprintLatched = false;
    }
    const steerK = 1 - Math.exp(-16 * Math.max(0, dt));
    keyboardX += (targetX - keyboardX) * steerK;
    keyboardY += (targetY - keyboardY) * steerK;
    if (!hasKeyboardMove && Math.hypot(keyboardX, keyboardY) < 0.03) {
      keyboardX = keyboardY = 0;
      keyboardMoveYaw = null;
    }

    let rx = keyboardX, ry = keyboardY;
    let movementYaw = keyboardMoveYaw ?? camYaw;
    if (joy.active) { rx = joy.x; ry = joy.y; movementYaw = camYaw; }

    // Keyboard movement keeps the camera basis captured from the beginning of
    // the key hold. The autonomous ball camera can no longer bend a held W/A/S/D
    // direction underneath the player; release and press again to re-align it.
    const fx = Math.cos(movementYaw), fz = Math.sin(movementYaw);
    const sx = -fz, sz = fx;                                   // camera right (screen right)
    let mx = fx * -ry + sx * rx;
    let mz = fz * -ry + sz * rx;
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }

    const state = {
      mx, mz,
      sprint: (sprintToggle ? sprintLatched : keys.has('sprint')) || touch.sprint,
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
    consumeLookDelta() {
      const delta = { x: lookDX, y: lookDY };
      lookDX = lookDY = 0;
      return delta;
    },
    get sprintToggle() { return sprintToggle; },
    setSprintToggle(enabled) {
      sprintToggle = !!enabled;
      sprintLatched = false;
      localStorage.setItem('starhermit-football-toggle-sprint', String(sprintToggle));
    },
    showTouchUi(show) {
      gameplayActive = show;
      if (isTouch) {
        document.getElementById('touch-ui').classList.toggle('hidden', !show);
      } else {
        const canvas = document.getElementById('gl');
        document.getElementById('mouse-hint').classList.toggle(
          'hidden', !show || document.pointerLockElement === canvas);
        if (!show && document.pointerLockElement === canvas) document.exitPointerLock?.();
      }
    },
  };
}
