// main.js — boot, screens state machine, renderer, match lifecycle.
import * as THREE from 'three';
import * as api from './api.js';
import { createAudio } from './game/audio.js';
import { createInput } from './game/input.js';
import { createHud } from './hud.js';
import { createMatchController } from './match.js';
import { createLobby } from './lobby.js';
import { createNetClient, createGameClient } from './net.js';
import { createMenuScene } from './menuScene.js';
import { createVoice } from './voice.js';
import { createControlsScreen } from './controls.js';

const $ = (id) => document.getElementById(id);

// ── renderer ──
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const isMobile = matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 800);
camera.position.set(0, 20, -30);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── services ──
const audio = createAudio();
const input = createInput();
const hud = createHud();
const auth = api.initAuth();
const menuScene = createMenuScene({ scene, camera });
const voice = createVoice();

let match = null;
let lobby = null;
let teamSize = 5;
let activeRoom = null;   // room the server says we're still a participant of
let matchRoom = null;    // room the current match is played in (for Esc-leave)

// ── screens ──
const screens = ['screen-menu', 'screen-lobby', 'screen-invite', 'screen-controls', 'screen-result'];
function showScreen(id) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== id);
  if (!id) for (const s of screens) $(s).classList.add('hidden');
}
function setStatus(t) { $('menu-status').textContent = t; }

// ── active room (rejoin / leave prompts) ──
async function refreshActiveRoom() {
  if (!auth.online) { activeRoom = null; }
  else {
    try { activeRoom = await api.getMyRoom(); }
    catch { activeRoom = null; }
  }
  const btn = $('btn-rejoin');
  if (activeRoom) {
    const playing = activeRoom.status === 'Playing' || activeRoom.status === 'playing';
    btn.textContent = playing ? 'REJOIN MATCH' : 'RETURN TO LOBBY';
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

// In-game modal confirm (replaces window.confirm — no browser chrome).
function uiConfirm({ title, text, yes, no }) {
  return new Promise((resolve) => {
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    const dlg = $('confirm-dialog');
    const yesBtn = $('btn-confirm-yes');
    const noBtn = $('btn-confirm-no');
    yesBtn.textContent = yes;
    noBtn.textContent = no;
    const done = (v) => {
      dlg.classList.add('hidden');
      yesBtn.onclick = noBtn.onclick = null;
      resolve(v);
    };
    yesBtn.onclick = () => { audio.ui(); done(true); };
    noBtn.onclick = () => { audio.ui(); done(false); };
    dlg.classList.remove('hidden');
  });
}

// Guard for anything that starts a new game while the server still has us in a room.
async function confirmLeaveActiveRoom() {
  if (!activeRoom) return true;
  const playing = activeRoom.status === 'Playing' || activeRoom.status === 'playing';
  const ok = await uiConfirm(playing
    ? { title: 'LEAVE MATCH?', text: 'You are in a match right now. An AI player will take over your footballer.', yes: 'LEAVE MATCH', no: 'CANCEL' }
    : { title: 'LEAVE LOBBY?', text: 'You already have a lobby open. Leave it and continue?', yes: 'LEAVE LOBBY', no: 'CANCEL' });
  if (!ok) return false;
  try { await api.leaveRoom(activeRoom.id); } catch { /* already gone */ }
  activeRoom = null;
  $('btn-rejoin').classList.add('hidden');
  return true;
}

function rejoinActiveRoom() {
  if (!activeRoom) return;
  const room = activeRoom;
  const playing = room.status === 'Playing' || room.status === 'playing';
  if (!playing) {
    // still in lobby stage — just reopen the lobby screen
    showScreen('screen-lobby');
    lobby.adopt(room);
    return;
  }
  audio.resume();
  onMatchReady(room, { isRejoin: true });
}

function setupMenu() {
  $('menu-user').textContent = auth.online
    ? `Signed in as ${api.getAuth().username}`
    : 'Offline mode — practice only (launch via StarHermit for multiplayer)';
  $('btn-quick').disabled = !auth.online;
  $('btn-lobby').disabled = !auth.online;

  const sel = $('team-size');
  for (let i = 1; i <= 11; i++) {
    const o = document.createElement('option');
    o.value = i; o.textContent = i;
    if (i === 5) o.selected = true;
    sel.appendChild(o);
  }
  sel.onchange = () => { teamSize = +sel.value; };

  const optVoice = $('opt-voice');
  optVoice.checked = voice.isEnabled();
  optVoice.onchange = () => voice.setEnabled(optVoice.checked);

  $('btn-practice').onclick = async () => {
    audio.ui(); audio.resume();
    if (!(await confirmLeaveActiveRoom())) return;
    startPractice();
  };
  $('btn-lobby').onclick = async () => {
    audio.ui(); audio.resume();
    if (!(await confirmLeaveActiveRoom())) return;
    try {
      showScreen('screen-lobby');
      await lobby.create(teamSize);
    } catch (e) { showScreen('screen-menu'); setStatus(`Could not create lobby: ${e.message}`); }
  };
  $('btn-quick').onclick = async () => {
    audio.ui(); audio.resume();
    if (!(await confirmLeaveActiveRoom())) return;
    try {
      showScreen('screen-lobby');
      await lobby.quickPlay(teamSize);
    } catch (e) { showScreen('screen-menu'); setStatus(`Quick play failed: ${e.message}`); }
  };
  // Remappable desktop controls (spec §5.6/§8.8): saved per user on the platform,
  // so the button needs a launch token; touch layouts have nothing to remap.
  const controlsBtn = $('btn-controls');
  if (input.isTouch || !auth.online) controlsBtn.classList.add('hidden');
  controlsBtn.onclick = () => { audio.ui(); showScreen('screen-controls'); controlsScreen.open(); };

  $('btn-rejoin').onclick = () => { audio.ui(); rejoinActiveRoom(); };
  $('btn-invite').onclick = () => { audio.ui(); lobby.inviteFriends(); };
  $('btn-invite-back').onclick = () => { audio.ui(); $('screen-invite').classList.add('hidden'); };
  $('btn-find').onclick = () => { audio.ui(); lobby.findMatch().catch((e) => setStatus(e.message)); };
  $('btn-leave').onclick = () => { audio.ui(); lobby.leave(); };
  $('btn-result-menu').onclick = () => { audio.ui(); backToMenu(); };

  // pending room invites from friends (accept from the menu). Invites are
  // pull-only (no push channel, spec §8) — poll while the menu is showing so
  // an invite sent after boot still appears.
  if (auth.online) {
    refreshIncomingInvites();
    setInterval(() => {
      if (!document.hidden && !$('screen-menu').classList.contains('hidden')) refreshIncomingInvites();
    }, 5000);
  }
}

let invitesSig = null;
async function refreshIncomingInvites() {
  const box = $('menu-invites');
  try {
    const invites = await api.getRoomInvites();
    const shown = (invites || []).slice(0, 4);
    // don't rebuild the rows (and yank buttons out from under a click) unless changed
    const sig = shown.map((inv) => inv.id ?? inv.inviteId).join(',');
    if (sig === invitesSig) return;
    invitesSig = sig;
    box.innerHTML = '';
    for (const inv of shown) {
      const row = document.createElement('div');
      row.className = 'invite-row';
      row.innerHTML = `<span>${esc(inv.fromUsername || 'A friend')} invited you to a match</span>`;
      const btn = document.createElement('button');
      btn.textContent = 'JOIN';
      btn.onclick = async () => {
        audio.resume();
        try {
          const room = await api.acceptRoomInvite(inv.id ?? inv.inviteId);
          showScreen('screen-lobby');
          lobby.adopt(room);
        } catch (e) { setStatus(e.message); }
      };
      row.appendChild(btn);
      box.appendChild(row);
    }
  } catch { /* offline or no invites */ }
}

// ── match lifecycle ──
function ensureMatch() {
  if (match) return match;
  menuScene.stop(); // the real match takes over the stadium
  match = createMatchController({ renderer, scene, camera, audio, input, hud });
  match.onFullTime = (result) => showResult(result);
  return match;
}

function startPractice() {
  showScreen(null);
  ensureMatch().startPractice({ teamSize, myName: api.getAuth().username });
}

async function onMatchReady(room, { isRejoin = false } = {}) {
  // room.status === Playing with frozen roster (AI seats backfilled)
  const cfg = room.config || room;
  const ts = cfg.seatsPerTeam ?? teamSize;
  const me = api.getAuth();

  // The platform runs the authoritative match as a scripted game session.
  const sessionId = room.gameSessionId;
  if (!sessionId) {
    setStatus('Match session unavailable — the server could not start the game.');
    showScreen('screen-menu');
    return;
  }

  showScreen(null);
  matchRoom = room;
  const m = ensureMatch();

  // gameplay transport: server-authoritative games socket
  const gameNet = createGameClient({ sessionId, getToken: () => me.token });
  try {
    await gameNet.connect({
      onSnapshot: (snap) => m.onSnapshot(snap),
      onEvent: (ev) => m.onNetEvent(ev),
      onClose: () => { if (match && match.phase !== 'done') { setStatus('Connection lost'); backToMenu(); } },
    });
  } catch (e) {
    setStatus(`Could not connect: ${e.message}`);
    return backToMenu();
  }

  // realtime rooms socket stays for roster pushes (name/AI flag changes)
  const lobbyNet = createNetClient({ roomId: room.id, getToken: () => me.token });
  lobbyNet.connect({
    onRoster: (parts) => m.applyRoster(parts),
  }).catch(() => { /* ancillary — snapshots carry the same data */ });

  await m.startFromRoom({
    room, teamSize: ts, myUserId: me.userId,
    netClient: gameNet, lobbyNetClient: lobbyNet, isRejoin,
  });

  // voice chat (best-effort; honors the menu checkbox)
  voice.joinMatch({ sessionId });
}

function showResult(result) {
  disposeMatch();
  menuScene.start();
  const { score, stats, myTeam, winner } = result;
  $('result-title').textContent =
    winner === -1 ? 'DRAW' : (winner === myTeam ? 'VICTORY' : 'DEFEAT');
  $('result-score').textContent = `${score[0]} – ${score[1]}`;
  if (stats) {
    const poss = stats.possession[0] + stats.possession[1] || 1;
    $('result-stats').innerHTML =
      `Possession: ${Math.round(100 * stats.possession[0] / poss)}% – ${Math.round(100 * stats.possession[1] / poss)}%<br>` +
      `Shots: ${stats.shots[0]} – ${stats.shots[1]}`;
  } else {
    $('result-stats').innerHTML = '';
  }
  showScreen('screen-result');
}

function backToMenu() {
  disposeMatch();
  menuScene.start();
  if (lobby?.room) lobby.leave();
  showScreen('screen-menu');
  refreshIncomingInvites();
  refreshActiveRoom();
}

function disposeMatch() {
  const m = match;
  match = null; // null first: the games client's final onClose must not reenter
  matchRoom = null;
  voice.leaveMatch();
  $('leave-confirm').classList.add('hidden');
  if (m) m.dispose();
}

// ── in-match leave (Esc) ──
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // First Escape releases desktop mouse-look. A second Escape opens leave.
  if (document.pointerLockElement === canvas) return;
  if (!match || match.phase === 'done' || !matchRoom) return;
  $('leave-confirm').classList.toggle('hidden');
});
$('btn-leave-no').onclick = () => { audio.ui(); $('leave-confirm').classList.add('hidden'); };
$('btn-leave-yes').onclick = async () => {
  audio.ui();
  const room = matchRoom;
  $('leave-confirm').classList.add('hidden');
  if (room) { try { await api.leaveRoom(room.id); } catch { /* already gone */ } }
  activeRoom = null;
  backToMenu();
};

// ── boot ──
lobby = createLobby({
  onMatchReady,
  onStarting: () => { audio.resume(); audio.crowd.matchStart(); },
  onLeave: () => showScreen('screen-menu'),
  setStatus,
});
const controlsScreen = createControlsScreen({ input, audio, onBack: () => showScreen('screen-menu') });
showScreen('screen-menu');
api.resolveUsername().finally(() => {
  setupMenu();
  refreshActiveRoom();
  $('loading').classList.add('hidden');
});

// apply the player's saved bindings at launch (spec §5.6); 404 = game declares
// no controls, offline = defaults — either way the built-in keymap stands
if (auth.online && !input.isTouch) {
  api.getControls().then((c) => input.setBindings(c.actions)).catch(() => {});
}

// idle stadium backdrop behind the menu: an AI-vs-AI exhibition match with a
// drifting cinematic camera (see menuScene.js). Runs whenever no match is live.
menuScene.start();
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (match) {
    match.update(dt);
    voice.updatePositions(dt, match.sim?.players, match.myPlayerId);
  } else {
    menuScene.update(dt);
  }
  renderer.render(scene, camera);
}
loop();

// audio unlock on first gesture
addEventListener('pointerdown', () => audio.resume(), { once: true });
addEventListener('keydown', () => audio.resume(), { once: true });

// refresh launch token before its 60-minute expiry
if (auth.online) setInterval(() => api.remintLaunchToken().catch(() => {}), 45 * 60 * 1000);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
