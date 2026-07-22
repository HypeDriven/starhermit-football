// main.js — boot, screens state machine, renderer, match lifecycle.
import * as THREE from 'three';
import * as api from './api.js';
import { createAudio } from './game/audio.js';
import { createInput } from './game/input.js';
import { createHud } from './hud.js';
import { createMatchController } from './match.js';
import { createLobby } from './lobby.js';
import { createNetClient } from './net.js';

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

let match = null;
let lobby = null;
let teamSize = 5;

// ── screens ──
const screens = ['screen-menu', 'screen-lobby', 'screen-invite', 'screen-result'];
function showScreen(id) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== id);
  if (!id) for (const s of screens) $(s).classList.add('hidden');
}
function setStatus(t) { $('menu-status').textContent = t; }

function setupMenu() {
  $('menu-user').textContent = auth.online
    ? `Signed in as ${auth.username}`
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

  $('btn-practice').onclick = () => { audio.ui(); audio.resume(); startPractice(); };
  $('btn-lobby').onclick = async () => {
    audio.ui(); audio.resume();
    try {
      showScreen('screen-lobby');
      await lobby.create(teamSize);
    } catch (e) { showScreen('screen-menu'); setStatus(`Could not create lobby: ${e.message}`); }
  };
  $('btn-quick').onclick = async () => {
    audio.ui(); audio.resume();
    try {
      showScreen('screen-lobby');
      await lobby.quickPlay(teamSize);
    } catch (e) { showScreen('screen-menu'); setStatus(`Quick play failed: ${e.message}`); }
  };
  $('btn-invite').onclick = () => { audio.ui(); lobby.inviteFriends(); };
  $('btn-invite-back').onclick = () => { audio.ui(); $('screen-invite').classList.add('hidden'); };
  $('btn-find').onclick = () => { audio.ui(); lobby.findMatch().catch((e) => setStatus(e.message)); };
  $('btn-leave').onclick = () => { audio.ui(); lobby.leave(); };
  $('btn-result-menu').onclick = () => { audio.ui(); backToMenu(); };

  // pending room invites from friends (accept from the menu)
  if (auth.online) refreshIncomingInvites();
}

async function refreshIncomingInvites() {
  const box = $('menu-invites');
  try {
    const invites = await api.getRoomInvites();
    box.innerHTML = '';
    for (const inv of (invites || []).slice(0, 4)) {
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
  match = createMatchController({ renderer, scene, camera, audio, input, hud });
  match.onFullTime = (result) => showResult(result);
  return match;
}

function startPractice() {
  showScreen(null);
  ensureMatch().startPractice({ teamSize, myName: auth.username });
}

async function onMatchReady(room) {
  // room.status === Playing with frozen roster (AI seats backfilled)
  showScreen(null);
  const cfg = room.config || room;
  const ts = cfg.seatsPerTeam ?? teamSize;
  const me = api.getAuth();
  const isHost = (room.hostUserId ?? room.host?.userId) === me.userId;

  const net = createNetClient({ roomId: room.id, getToken: () => me.token });
  const m = ensureMatch();
  try {
    await net.connect({
      onSnapshot: (snap) => m.onSnapshot(snap),
      onInput: (inp, fromId) => m.onRemoteInput(inp, fromId),
      onEvent: (ev) => m.onNetEvent(ev),
      onRoster: () => {},
      onClose: () => { if (m.phase !== 'done') { setStatus('Connection lost'); backToMenu(); } },
    });
  } catch (e) {
    setStatus(`Could not connect: ${e.message}`);
    return backToMenu();
  }

  // participant id → seat mapping for the host
  const seatMap = new Map();
  for (const p of room.participants || []) {
    seatMap.set(p.id, p.team * ts + p.slot);
  }
  m.setParticipantSeats(seatMap);
  m.startFromRoom({ room, teamSize: ts, myUserId: me.userId, netClient: net, isHost });

  // host reports the result
  if (isHost) {
    const prev = m.onFullTime;
    m.onFullTime = (result) => {
      api.submitResult(room.id, {
        teamScores: result.score,
        metadata: { possession: result.stats.possession, shots: result.stats.shots },
      }).catch(() => {});
      prev(result);
    };
  }
}

function showResult(result) {
  disposeMatch();
  const { score, stats, myTeam, winner } = result;
  $('result-title').textContent =
    winner === -1 ? 'DRAW' : (winner === myTeam ? 'VICTORY' : 'DEFEAT');
  $('result-score').textContent = `${score[0]} – ${score[1]}`;
  const poss = stats.possession[0] + stats.possession[1] || 1;
  $('result-stats').innerHTML =
    `Possession: ${Math.round(100 * stats.possession[0] / poss)}% – ${Math.round(100 * stats.possession[1] / poss)}%<br>` +
    `Shots: ${stats.shots[0]} – ${stats.shots[1]}`;
  showScreen('screen-result');
}

function backToMenu() {
  disposeMatch();
  if (lobby?.room) lobby.leave();
  showScreen('screen-menu');
  refreshIncomingInvites();
}

function disposeMatch() {
  if (match) { match.dispose(); match = null; }
}

// ── boot ──
lobby = createLobby({ onMatchReady, onLeave: () => showScreen('screen-menu'), setStatus });
setupMenu();
showScreen('screen-menu');
$('loading').classList.add('hidden');

// idle stadium backdrop behind the menu
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (match) match.update(dt);
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
