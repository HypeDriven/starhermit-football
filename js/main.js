// main.js — boot, screens state machine, renderer, match lifecycle.
import * as THREE from 'three';
import * as api from './api.js?v=10';
import { createAudio } from './game/audio.js?v=10';
import { createInput } from './game/input.js?v=10';
import { createHud } from './hud.js?v=10';
import { createMatchController } from './match.js?v=10';
import { createLobby } from './lobby.js?v=10';
import { createNetClient, createGameClient } from './net.js?v=10';
import { createMenuScene } from './menuScene.js?v=10';
import { createVoice } from './voice.js?v=10';
import { createControlsScreen } from './controls.js?v=10';
import { createLeaderboardScreen } from './leaderboard.js?v=10';
import { createReplaysScreen } from './replays.js?v=10';
import { createReplayViewer } from './replayview.js?v=10';
import { createGraphics } from './graphics.js?v=10';
import { createSettingsPanel } from './settings.js?v=10';
import { createAchievementsScreen } from './achievements.js?v=10';
import { platformStrings } from './platform-i18n.js?v=10';
import { offerRelaunch } from './session-expiry.js?v=10';

const $ = (id) => document.getElementById(id);

// ── renderer ──
// Pixel ratio, shadows, tone mapping and post-processing are owned by the
// graphics settings (graphics.js / gfx.js) and applied live.
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const isMobile = matchMedia('(pointer: coarse)').matches;
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 800);
camera.position.set(0, 20, -30);
const graphics = createGraphics({ renderer, scene, camera, isTouch: isMobile });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
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
let replay = null;
let teamSize = 5;
let activeRoom = null;   // room the server says we're still a participant of
let matchRoom = null;    // room the current match is played in (for Esc-leave)

// ── screens ──
const screens = ['screen-menu', 'screen-lobby', 'screen-invite', 'screen-controls', 'screen-leaderboard', 'screen-replays', 'screen-achievements', 'screen-result'];
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
function uiConfirm({ title, text, yes, no, primaryYes = false }) {
  return new Promise((resolve) => {
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    const dlg = $('confirm-dialog');
    const yesBtn = $('btn-confirm-yes');
    const noBtn = $('btn-confirm-no');
    yesBtn.textContent = yes;
    noBtn.textContent = no;
    yesBtn.classList.toggle('danger', !primaryYes);
    yesBtn.classList.toggle('primary', primaryYes);
    noBtn.classList.toggle('primary', !primaryYes);
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

// Menu state that follows the sign-in state (launch, sign-in return, or the
// SDK signing out when token renewal is refused).
function applyAuthToMenu() {
  const online = api.getAuth().online;
  const t = platformStrings();
  $('menu-user').textContent = online
    ? `Signed in as ${api.getAuth().username}`
    : 'Offline mode — practice only (launch via StarHermit for multiplayer)';
  $('btn-quick').disabled = !online;
  $('btn-lobby').disabled = !online;
  const signIn = $('btn-signin');
  signIn.textContent = t.signIn.toLocaleUpperCase();
  signIn.classList.toggle('hidden', !api.canSignIn());
  const invite = $('btn-invite-link');
  invite.textContent = t.invite.toLocaleUpperCase();
  invite.classList.toggle('hidden', !online);
  for (const id of ['btn-solo', 'btn-leaderboard', 'btn-replays', 'btn-achievements']) $(id).classList.toggle('hidden', !online);
  $('btn-controls').classList.toggle('hidden', input.isTouch || !online);
}

function setupMenu() {
  applyAuthToMenu();

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
  // Ranked solo vs AI — an online platform match, so it needs a launch token.
  const soloBtn = $('btn-solo');
  soloBtn.onclick = async () => {
    audio.ui(); audio.resume();
    if (!(await confirmLeaveActiveRoom())) return;
    try {
      showScreen('screen-lobby');
      await lobby.soloVsAi(teamSize);
    } catch (e) { showScreen('screen-menu'); setStatus(`Could not start match: ${e.message}`); }
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
  controlsBtn.onclick = () => { audio.ui(); showScreen('screen-controls'); controlsScreen.open(); };

  // Platform leaderboard (rating + ranked entries) — needs a launch token.
  const lbBtn = $('btn-leaderboard');
  lbBtn.onclick = () => { audio.ui(); showScreen('screen-leaderboard'); leaderboardScreen.open(); };

  // Archived replays of my online matches — also platform-only.
  const replaysBtn = $('btn-replays');
  replaysBtn.onclick = () => { audio.ui(); showScreen('screen-replays'); replaysScreen.open(); };

  // Server-declared achievements with my unlock state — platform-only.
  $('btn-achievements').onclick = () => { audio.ui(); showScreen('screen-achievements'); achievementsScreen.open(); };
  // Sign in (only offered on <slug>.starhermit.com without a token) and the
  // share link that friends the recipient and invites them back.
  $('btn-signin').onclick = () => { audio.ui(); api.signIn(); };
  $('btn-invite-link').onclick = async () => {
    audio.ui();
    const link = api.inviteLink();
    if (!link) return;
    const t = platformStrings();
    try { await navigator.clipboard.writeText(link); setStatus(t.inviteCopied); }
    catch { setStatus(t.inviteFailed); }
  };

  $('btn-settings').onclick = () => { audio.ui(); settingsPanel.open(); };
  $('btn-rejoin').onclick = () => { audio.ui(); rejoinActiveRoom(); };
  $('btn-invite').onclick = () => { audio.ui(); lobby.inviteFriends(); };
  $('btn-share').onclick = () => { audio.ui(); lobby.copyInviteLink(); };
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

  // gameplay transport: server-authoritative games socket (SDK connect; each
  // reconnect uses the current, renewed launch token).
  const gameNet = createGameClient({ sessionId });
  try {
    await gameNet.connect({
      onSnapshot: (snap) => m.onSnapshot(snap),
      onEvent: (ev) => m.onNetEvent(ev),
      onAchievement: (a) => { if (a?.name) hud.banner(`Achievement unlocked: ${a.name}`, 4000); },
      onClose: () => { if (match && match.phase !== 'done') { setStatus('Connection lost'); backToMenu(); } },
      // token renewal refused: the SDK signed out (the auth listener shows the
      // relaunch prompt) and the socket stopped for good
      onAuthLost: () => { if (match) backToMenu(); },
    });
  } catch (e) {
    setStatus(`Could not connect: ${e.message}`);
    return backToMenu();
  }

  // realtime rooms socket stays for roster pushes (name/AI flag changes)
  const lobbyNet = createNetClient({ roomId: room.id });
  lobbyNet.connect({
    onRoster: (parts) => m.applyRoster(parts),
  }).catch(() => { /* ancillary — snapshots carry the same data */ });

  await m.startFromRoom({
    room, teamSize: ts, myUserId: me.userId, sessionId,
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

// ── replay lifecycle ──
// Third render-loop mode alongside menu backdrop and match: the menu scene is
// stopped and the viewer owns the scene until exit, which returns to the list.
function openReplay(sessionId) {
  menuScene.stop();
  showScreen(null);
  replay = createReplayViewer({ scene, camera, hud, onExit: exitReplay });
  replay.load(sessionId).catch((e) => {
    console.error('replay load failed', e);
    exitReplay();
  });
}

function exitReplay() {
  if (replay) { replay.dispose(); replay = null; }
  menuScene.start();
  showScreen('screen-replays');
}

// ── in-match menu (Esc / ☰): pause (practice), help, sound, restart, leave ──
function setMatchMenu(open) {
  const el = $('leave-confirm');
  el.classList.toggle('hidden', !open);
  if (!match) return;
  const practice = match.mode === 'practice';
  match.paused = open && practice;
  $('match-menu-title').textContent = practice ? 'PRACTICE PAUSED' : 'MATCH MENU';
  $('match-menu-note').textContent = practice
    ? 'The practice match waits while this menu is open.'
    : 'Online play continues; an AI player takes over if you leave.';
  $('btn-match-restart').classList.toggle('hidden', !practice);
  $('btn-match-sound').textContent = `SOUND: ${audio.isMuted() ? 'OFF' : 'ON'}`;
  $('btn-leave-yes').textContent = practice ? 'BACK TO MENU' : 'LEAVE MATCH';
  if (open) $('btn-leave-no').focus();
}
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (settingsPanel.isOpen()) { settingsPanel.close(); return; } // Esc backs out of Settings first
  if (document.activeElement?.matches?.('input, textarea')) return; // chat input handles Esc itself
  // First Escape releases desktop mouse-look. A second Escape opens the menu.
  if (document.pointerLockElement === canvas) return;
  if (!match || match.phase === 'done') return;
  setMatchMenu($('leave-confirm').classList.contains('hidden'));
});
$('btn-match-menu').onclick = () => { if (match && match.phase !== 'done') { audio.ui(); setMatchMenu(true); } };
$('btn-leave-no').onclick = () => { audio.ui(); setMatchMenu(false); };
$('btn-match-settings').onclick = () => { audio.ui(); settingsPanel.open(); };
$('btn-match-sound').onclick = () => { audio.setMuted(!audio.isMuted()); $('btn-match-sound').textContent = `SOUND: ${audio.isMuted() ? 'OFF' : 'ON'}`; };
$('btn-match-restart').onclick = () => { audio.ui(); setMatchMenu(false); disposeMatch(); startPractice(); };
$('btn-leave-yes').onclick = async () => {
  audio.ui();
  const room = matchRoom;
  setMatchMenu(false);
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
const leaderboardScreen = createLeaderboardScreen({ audio, onBack: () => showScreen('screen-menu') });
const settingsPanel = createSettingsPanel({ graphics, audio });
const achievementsScreen = createAchievementsScreen({ audio, onBack: () => showScreen('screen-menu') });
const replaysScreen = createReplaysScreen({ audio, onWatch: openReplay, onBack: () => showScreen('screen-menu') });
showScreen('screen-menu');
api.resolveUsername().finally(() => {
  setupMenu();
  refreshActiveRoom();
  resumeLaunchSession();
  $('loading').classList.add('hidden');
});

// Renewal refused (or signed out): drop to offline practice, re-offer sign-in.
api.onAuthChange?.((state) => {
  auth.online = api.getAuth().online;
  if (state.signedIn) return;
  applyAuthToMenu();
  $('btn-rejoin').classList.add('hidden');
  activeRoom = null;
  setStatus(platformStrings().signedOut);
  if (state.reason === 'expired') promptRelaunch();
});

// Launch token expired and can no longer be renewed: offer a fresh launch
// from StarHermit (the button click carries the gesture the launcher frame needs).
async function promptRelaunch() {
  const t = platformStrings();
  const up = (x) => x.toLocaleUpperCase();
  const r = await offerRelaunch(
    (o) => uiConfirm({ ...o, title: up(o.title), yes: up(o.yes), no: up(o.no), primaryYes: true }), t);
  if (r === 'refused') setStatus(t.relaunchFailed);
}

// Invite-accept launches carry #session_id: rejoin that match's room when it is live.
async function resumeLaunchSession() {
  const sid = api.launchSessionId();
  if (!sid || !auth.online) return;
  try {
    const detail = await api.getSession(sid);
    const roomId = detail?.roomId ?? detail?.realtimeRoomId;
    if (!roomId) return;
    const room = await api.getRoom(roomId);
    if (room && (room.status === 'Playing' || room.status === 'playing') && room.gameSessionId === sid) {
      activeRoom = room;
      audio.resume();
      onMatchReady(room, { isRejoin: true });
    }
  } catch { /* not resumable: the menu stands */ }
}

// Player preferences in the platform settings KV (graphics, sound, voice):
// platform values win over local defaults at launch; every change is patched.
if (auth.online) {
  api.getSettings().then((p) => {
    if (p?.graphics && typeof p.graphics === 'object') graphics.adopt(p.graphics);
    if (typeof p?.muted === 'boolean') baseSetMuted(p.muted);
    if (typeof p?.voice === 'boolean') { baseSetVoice(p.voice); $('opt-voice').checked = p.voice; }
  }).catch(() => {});
  graphics.onPersist = (saved) => api.patchSettings({ graphics: saved });
}
const baseSetMuted = audio.setMuted.bind(audio);
audio.setMuted = (m) => { baseSetMuted(m); api.patchSettings({ muted: !!m }); };
const baseSetVoice = voice.setEnabled.bind(voice);
voice.setEnabled = (v) => { baseSetVoice(v); api.patchSettings({ voice: !!v }); };

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
  } else if (replay) {
    // a viewer error must never wedge the menu/match modes — bail out cleanly
    try { replay.update(dt); }
    catch (e) { console.error('replay error', e); exitReplay(); }
  } else {
    menuScene.update(dt);
  }
  graphics.render(dt);
}
loop();

// audio unlock on first gesture
addEventListener('pointerdown', () => audio.resume(), { once: true });
addEventListener('keydown', () => audio.resume(), { once: true });

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
