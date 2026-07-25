// replayview.js — render-only 3D playback of an archived online match.
// Loads the replay log embedded in the archived session state (api.getReplay →
// state.replay) and plays it back on a virtual 30 Hz tick clock, interpolating
// between the 2 fps keyframes with the same math as the live snapshot
// interpolation in match.js (applyInterp). No net, no input, no audio.
import * as THREE from 'three';
import * as api from './api.js?v=4';
import { pitchFor, roleForSlot, makeRng, BALL_R } from './game/sim.js?v=4';
import { buildStadium } from './world/stadium.js?v=4';
import { createPlayerMesh } from './world/player.js?v=4';
import { createFollowCamera } from './game/camera.js?v=4';
import { parsePlayerRow, parseBallRow } from './snapformat.js?v=4';

const TEAM_KITS = [
  { shirt: '#1f5fb4', shorts: '#f2f2f2', socks: '#1f5fb4', gk: '#e67e22', plate: '#1f5fb4', label: 'BLUE' },
  { shirt: '#c0392b', shorts: '#232323', socks: '#c0392b', gk: '#8e44ad', plate: '#c0392b', label: 'RED' },
];
const HAIRS = ['#1a1a1a', '#3b2314', '#6e4a21', '#b99256', '#545454', '#8a3b12'];
const TICK_HZ = 30; // server sim rate; replay frame times are ticks

// Same canvas ball as match.js/menuScene.js.
function makeBall() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#1c1c1c';
  for (let i = 0; i < 9; i++) {
    const x = (i % 3) * 43 + 21, y = Math.floor(i / 3) * 43 + 21;
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
      g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * 11, y + Math.sin(a) * 11);
    }
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 24, 18),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }),
  );
  mesh.castShadow = true;
  return mesh;
}

export function createReplayViewer({ scene, camera, hud, onExit }) {
  const uiEl = document.getElementById('replay-ui');
  const msgEl = document.getElementById('replay-msg');
  const barEl = document.getElementById('replay-bar');
  const playBtn = document.getElementById('btn-replay-play');
  const seekEl = document.getElementById('replay-seek');
  const noteEl = document.getElementById('replay-note');
  const exitBtn = document.getElementById('btn-replay-exit');

  const followCam = createFollowCamera(camera);
  const rng = makeRng(7);
  let stadium = null;
  let ballMesh = null;
  let views = [];        // PlayerView per pid
  let players = [];      // lightweight render entities per pid (same fields applyInterp drives)
  let ball = { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, owner: null };
  let frames = [];       // parsed keyframes, t ascending
  let evs = [];          // sorted by t
  let halfLength = 180;
  let vt = 0;            // virtual tick clock (float, 30 ticks/s)
  let tEnd = 0;
  let playing = false;
  let frameIdx = 0;
  let evIdx = 0;
  let seeking = false;
  let camA = Math.random() * Math.PI * 2;
  let disposed = false;
  let ready = false;

  // ── load ──────────────────────────────────────────────────────────────────

  async function load(sessionId) {
    uiEl.classList.remove('hidden');
    barEl.classList.add('hidden');
    showMsg('Loading replay…');
    exitBtn.onclick = () => onExit();

    let data;
    try {
      data = await api.getReplay(sessionId);
    } catch (e) {
      return unavailable(`Could not load replay: ${e.message}`);
    }
    const r = data && data.state && data.state.replay;
    if (!r || r.v !== 1 || !Array.isArray(r.frames) || !r.frames.length || !(r.every > 0)) {
      return unavailable('Replay unavailable.');
    }
    try {
      build(r);
    } catch (e) {
      console.error('replay build failed', e);
      return unavailable('Replay unavailable.');
    }
  }

  function showMsg(t) { msgEl.textContent = t; msgEl.classList.remove('hidden'); }

  function unavailable(text) {
    showMsg(text);
    barEl.classList.remove('hidden');
    playBtn.classList.add('hidden');
    seekEl.classList.add('hidden');
    noteEl.textContent = '';
  }

  // ── build ─────────────────────────────────────────────────────────────────

  function build(r) {
    const teamSize = Math.max(1, r.teamSize | 0);
    halfLength = r.halfLength || 180;

    stadium = buildStadium(scene, { pitch: pitchFor(teamSize) });
    stadium.crowd.setExcitement(0.5);
    ballMesh = makeBall();
    scene.add(ballMesh);

    for (const seat of r.roster || []) {
      const slot = seat.pid % teamSize;
      const role = roleForSlot(slot, teamSize);
      const kit = TEAM_KITS[seat.team] || TEAM_KITS[0];
      const view = createPlayerMesh({
        kit: {
          shirt: role === 'GK' ? kit.gk : kit.shirt,
          shorts: kit.shorts,
          socks: role === 'GK' ? kit.gk : kit.socks,
          number: slot + 1,
          gk: role === 'GK',
        },
        skin: rng(),
        hair: HAIRS[Math.floor(rng() * HAIRS.length)],
        name: seat.name,
        nameColor: kit.plate,
        isYou: false,
      });
      scene.add(view.group);
      views[seat.pid] = view;
      players[seat.pid] = {
        x: 0, y: 0, z: 0, vx: 0, vz: 0, facing: 0,
        anim: 'idle', animSpeed: 0, phase: 0, kickT: 0, tackleT: 0, stunT: 0,
        diveT: 0, diveDir: 0, celebrateT: 0,
      };
    }

    // Parse frames once (b/pl layout: see snapformat.js) and reconstruct the
    // match clock: the sim's clock only runs during open play, so accumulate
    // tick deltas over frames recorded in the 'play' phase.
    frames = r.frames.map((f) => ({
      t: f.t, sc: f.sc, ph: f.ph,
      b: parseBallRow(f.b),
      pl: f.pl.map(parsePlayerRow),
      sec: 0, half: 1,
    }));
    evs = (r.evs || []).slice().sort((a, b) => a.t - b.t);
    const htEv = evs.find((e) => e.ev && e.ev.type === 'halftime');
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      if (i > 0 && frames[i - 1].ph === 'play') f.sec = frames[i - 1].sec + (f.t - frames[i - 1].t) / TICK_HZ;
      else if (i > 0) f.sec = frames[i - 1].sec;
      f.half = htEv ? (f.t >= htEv.t ? 2 : 1) : (f.sec >= halfLength ? 2 : 1);
    }

    vt = frames[0].t;
    tEnd = frames[frames.length - 1].t;
    frameIdx = 0;
    evIdx = 0;
    seekEl.max = tEnd;
    seekEl.value = vt;
    noteEl.textContent = r.truncated ? 'replay truncated' : '';

    hud.showHud(true);
    hud.setTeamNames(TEAM_KITS[0].label, TEAM_KITS[1].label);
    hud.setPower(0);

    msgEl.classList.add('hidden');
    barEl.classList.remove('hidden');
    playing = true;
    playBtn.textContent = 'PAUSE';
    ready = true;
  }

  // ── events ────────────────────────────────────────────────────────────────

  function handleEv(ev) {
    if (!ev || !stadium) return;
    switch (ev.type) {
      case 'goal':
        hud.banner(ev.ownGoal ? 'OWN GOAL!' : 'GOAL!', 2600);
        stadium.crowd.pulse(ev.ownGoal ? 0.5 : 1);
        break;
      case 'halftime':
        hud.banner('HALF TIME', 3000);
        stadium.crowd.pulse(0.5);
        break;
      case 'fulltime':
        hud.banner('FULL TIME', 3200);
        stadium.crowd.pulse(0.7);
        break;
      // kickoff: visuals already show the reset; no banner
    }
  }

  // ── playback ──────────────────────────────────────────────────────────────

  function seekTo(v) {
    vt = Math.max(frames[0].t, Math.min(tEnd, v));
    // events behind the playhead are skipped, not re-fired
    evIdx = 0;
    while (evIdx < evs.length && evs[evIdx].t <= vt) evIdx++;
  }

  playBtn.onclick = () => {
    if (!ready) return;
    if (!playing && vt >= tEnd) seekTo(frames[0].t); // replay from the top
    playing = !playing;
    playBtn.textContent = playing ? 'PAUSE' : 'PLAY';
  };
  const onSeekInput = () => { if (ready) { seeking = true; seekTo(+seekEl.value); } };
  const onSeekChange = () => { seeking = false; };
  seekEl.addEventListener('input', onSeekInput);
  seekEl.addEventListener('change', onSeekChange);

  function update(dt) {
    if (!ready || disposed || !frames.length) return;
    stadium.update(dt, camera);

    if (playing) {
      vt += dt * TICK_HZ;
      if (vt >= tEnd) {
        vt = tEnd;
        playing = false;
        playBtn.textContent = 'PLAY';
      }
    }
    if (!seeking) seekEl.value = Math.round(vt);

    // surrounding keyframes (bidirectional so seeks work)
    while (frameIdx < frames.length - 2 && frames[frameIdx + 1].t <= vt) frameIdx++;
    while (frameIdx > 0 && frames[frameIdx].t > vt) frameIdx--;
    const a = frames[frameIdx];
    const b = frames[Math.min(frameIdx + 1, frames.length - 1)];
    const k = b.t > a.t ? Math.max(0, Math.min(1, (vt - a.t) / (b.t - a.t))) : 1;

    // fire events the playhead crossed
    while (evIdx < evs.length && evs[evIdx].t <= vt) handleEv(evs[evIdx++].ev);

    // interpolate — same field treatment as applyInterp in match.js, minus
    // extrapolation (the playhead is clamped to the recorded range)
    for (let i = 0; i < players.length; i++) {
      const pa = a.pl[i], pb = b.pl[i], p = players[i];
      if (!pa || !pb || !p) continue;
      p.x = pa.x + (pb.x - pa.x) * k;
      p.z = pa.z + (pb.z - pa.z) * k;
      p.y = (pa.y || 0) + ((pb.y || 0) - (pa.y || 0)) * k;
      p.vx = pb.vx; p.vz = pb.vz;
      const turn = Math.atan2(Math.sin(pb.facing - pa.facing), Math.cos(pb.facing - pa.facing));
      p.facing = pa.facing + turn * k;
      p.anim = pb.anim; p.animSpeed = pb.animSpeed;
      p.phase = pa.phase + (pb.phase - pa.phase) * k;
      p.kickT = pb.kickT; p.tackleT = pb.tackleT; p.stunT = pb.stunT;
      p.diveT = pb.diveT; p.diveDir = pb.diveDir; p.celebrateT = pb.celebrateT;
    }
    const ba = a.b, bb = b.b;
    ball.x = ba.x + (bb.x - ba.x) * k;
    ball.y = Math.max(BALL_R, ba.y + (bb.y - ba.y) * k);
    ball.z = ba.z + (bb.z - ba.z) * k;
    ball.vx = bb.vx; ball.vy = bb.vy; ball.vz = bb.vz;
    ball.owner = bb.owner;

    // sync views
    for (let i = 0; i < players.length; i++) {
      const p = players[i], v = views[i];
      if (!v) continue;
      v.group.position.set(p.x, p.y || 0, p.z);
      v.group.rotation.y = -p.facing; // model faces +x at rotation 0
      v.update(dt, p);
    }
    ballMesh.position.set(ball.x, ball.y, ball.z);
    ballMesh.rotation.x += ball.vx * dt * 2;
    ballMesh.rotation.z -= ball.vz * dt * 2;

    // score/clock from the current frame pair
    hud.setScore(b.sc[0], b.sc[1]);
    hud.setClock(a.sec + (b.sec - a.sec) * k, b.half, halfLength);

    // slow orbit following the ball
    camA += dt * 0.045;
    followCam.frame(
      { x: ball.x, y: 1, z: ball.z },
      { x: ball.x + Math.cos(camA) * 21, y: 10, z: ball.z + Math.sin(camA) * 21 },
      dt, 2,
    );
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  function dispose() {
    disposed = true;
    ready = false;
    for (const v of views) if (v) v.dispose();
    views = [];
    players = [];
    if (ballMesh) { scene.remove(ballMesh); ballMesh = null; }
    if (stadium) { stadium.dispose(); stadium = null; }
    frames = [];
    evs = [];
    hud.showHud(false);
    uiEl.classList.add('hidden');
    playBtn.classList.remove('hidden');
    seekEl.classList.remove('hidden');
    playBtn.onclick = null;
    exitBtn.onclick = null;
    seekEl.removeEventListener('input', onSeekInput);
    seekEl.removeEventListener('change', onSeekChange);
  }

  return { load, update, dispose };
}
