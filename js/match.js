// match.js — match orchestration: scene population, match flow (walkout →
// coin flip → halves → full time), host/guest netcode, audio & HUD wiring.
import * as THREE from 'three';
import {
  createMatch, stepMatch, emptyInput, takeAiName, makeRng,
  SPRINT_SPEED, RUN_SPEED, WALK_SPEED, BALL_R, attackSign,
} from './game/sim.js';
import { computeAiInput, clearAiPlans } from './game/ai.js';
import { buildStadium } from './world/stadium.js';
import { createPlayerMesh } from './world/player.js';
import { createFollowCamera } from './game/camera.js';

const TEAM_KITS = [
  { shirt: '#1f5fb4', shorts: '#f2f2f2', socks: '#1f5fb4', gk: '#e67e22', plate: '#1f5fb4', label: 'BLUE' },
  { shirt: '#c0392b', shorts: '#232323', socks: '#c0392b', gk: '#8e44ad', plate: '#c0392b', label: 'RED' },
];
const HAIRS = ['#1a1a1a', '#3b2314', '#6e4a21', '#b99256', '#545454', '#8a3b12'];
const SNAP_HZ = 15, INPUT_HZ = 20, FIXED_DT = 1 / 60;

export function createMatchController({ renderer, scene, camera, audio, input, hud }) {
  const followCam = createFollowCamera(camera);
  let stadium = null;
  let ballMesh = null;
  let coin = null;

  // match state
  let mode = 'practice';        // 'practice' | 'host' | 'guest'
  let sim = null;               // authoritative sim (practice/host); guests keep a light copy
  let views = [];               // PlayerView per player id
  let myPlayerId = 0;
  let phase = 'idle';           // 'walkout' | 'coinflip' | 'play' | 'done'
  let phaseT = 0;
  let acc = 0;
  let net = null;               // NetClient (host/guest)
  let guestInputs = new Map();  // host: playerId -> latest input
  let snapTimer = 0, inputTimer = 0;
  let interp = null;            // guest interpolation buffer
  let predict = null;           // guest local prediction of own player
  let rng = makeRng(7);
  let excitement = 0.3;
  let lastStepCount = 0;
  let onFullTime = null;
  let kickoffTeam = 0;
  let disposed = false;

  // ── construction ──────────────────────────────────────────────────────────

  function buildWorld(pitch) {
    stadium = buildStadium(scene, { pitch });
    ballMesh = makeBall();
    scene.add(ballMesh);
    coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.02, 24),
      new THREE.MeshStandardMaterial({ color: 0xf7d774, metalness: 0.9, roughness: 0.25 }),
    );
    coin.visible = false;
    scene.add(coin);
  }

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

  function buildPlayers(rosterPlayers, myId, myName) {
    for (const v of views) v.dispose();
    views = [];
    for (const p of rosterPlayers) {
      const kit = TEAM_KITS[p.team];
      const isMe = p.id === myId;
      const view = createPlayerMesh({
        kit: {
          shirt: p.role === 'GK' ? kit.gk : kit.shirt,
          shorts: kit.shorts,
          socks: p.role === 'GK' ? kit.gk : kit.socks,
          number: p.slot + 1,
          gk: p.role === 'GK',
        },
        skin: rng(),
        hair: HAIRS[Math.floor(rng() * HAIRS.length)],
        name: isMe ? 'You' : p.name,
        nameColor: kit.plate,
        isYou: isMe,
      });
      scene.add(view.group);
      views[p.id] = view;
    }
  }

  // ── public: start modes ───────────────────────────────────────────────────

  function startPractice({ teamSize, myName }) {
    cleanup();
    mode = 'practice';
    myPlayerId = 0;
    const roster = [{ userId: null, name: myName, isAi: false }];
    for (let i = 1; i < teamSize * 2; i++) roster.push({ userId: null, name: takeAiName(), isAi: true });
    sim = createMatch({ teamSize, roster, seed: (Math.random() * 1e9) | 0 });
    kickoffTeam = Math.random() < 0.5 ? 0 : 1;
    beginMatch();
  }

  function startFromRoom({ room, teamSize, myUserId, netClient, isHost }) {
    cleanup();
    net = netClient;
    mode = isHost ? 'host' : 'guest';
    // roster: sort participants into team/slot seats
    const seats = new Array(teamSize * 2).fill(null);
    for (const part of room.participants) {
      const id = part.team * teamSize + part.slot;
      seats[id] = {
        userId: part.userId, name: part.username, isAi: part.isAi,
        participantId: part.id,
      };
    }
    // map my user → player id
    myPlayerId = seats.findIndex((s) => s && s.userId === myUserId);
    if (myPlayerId < 0) myPlayerId = 0;
    const seed = room.seed ?? room.id?.length ?? 42;
    sim = createMatch({ teamSize, roster: seats, seed });
    kickoffTeam = room.kickoffTeam ?? (seed % 2);
    beginMatch();
  }

  function beginMatch() {
    clearAiPlans();
    buildWorld(sim.pitch);
    buildPlayers(sim.players, myPlayerId);
    resetKickoffSim();
    phase = 'walkout';
    phaseT = 8;
    walkoutSetup();
    hud.showHud(true);
    hud.setTeamNames(TEAM_KITS[0].label, TEAM_KITS[1].label);
    input.showTouchUi(true);
    audio.crowd.setExcitement(0.6);
    stadium.crowd.setExcitement(0.6);
    audio.crowd.cheer(0.9);
    stadium.crowd.pulse(0.8);
  }

  function resetKickoffSim() {
    sim.kickoffTeam = kickoffTeam;
    const { resetKickoff } = simInternals;
    resetKickoff(sim, kickoffTeam);
  }

  // walkout: players start at the tunnel and walk to formation
  const walkTargets = [];
  function walkoutSetup() {
    walkTargets.length = 0;
    const tx = -sim.pitch.L / 2 - 6; // tunnel x
    for (const p of sim.players) {
      walkTargets[p.id] = { x: p.x, z: p.z };
      p.x = tx + (p.team * 1.2);
      p.z = (p.slot - (sim.teamSize - 1) / 2) * 1.1;
      p.anim = 'walk'; p.animSpeed = WALK_SPEED;
      p.facing = 0;
    }
    followCam.setYaw(0);
  }

  // ── main update ───────────────────────────────────────────────────────────

  function update(dt) {
    if (!sim || disposed) return;
    stadium.update(dt, camera);

    if (phase === 'walkout') return updateWalkout(dt);
    if (phase === 'coinflip') return updateCoinflip(dt);
    if (phase === 'done') return updateDone(dt);

    // ── play ──
    if (mode === 'guest') updateGuest(dt);
    else updateAuthoritative(dt);

    syncViews(dt);
    updateHud();
    updateAudio(dt);
  }

  function updateWalkout(dt) {
    phaseT -= dt;
    // camera: slow crane from tunnel toward center
    const c = 1 - Math.max(0, phaseT) / 8;
    followCam.frame(
      { x: 0, y: 1, z: 0 },
      { x: -sim.pitch.L / 2 - 12 + c * (sim.pitch.L / 2 + 4), y: 3 + c * 9, z: 18 - c * 10 },
      dt, 3,
    );
    let arrived = 0;
    for (const p of sim.players) {
      const tgt = walkTargets[p.id];
      const dx = tgt.x - p.x, dz = tgt.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) { p.anim = 'idle'; p.animSpeed = 0; arrived++; continue; }
      const spd = Math.min(WALK_SPEED * 1.4, d * 0.8 + 0.6);
      p.x += (dx / d) * spd * dt;
      p.z += (dz / d) * spd * dt;
      p.facing = Math.atan2(dz, dx);
      p.phase += dt * (2.2 + spd * 1.55);
    }
    syncViews(dt);
    if (phaseT <= 0 || arrived === sim.players.length) {
      phase = 'coinflip';
      phaseT = 4.5;
      coin.visible = true;
      audio.crowd.cheer(0.5);
    }
  }

  function updateCoinflip(dt) {
    phaseT -= dt;
    // close-up on center circle, coin flipping
    followCam.frame({ x: 0, y: 1, z: 0 }, { x: -3.5, y: 2.2, z: 3.5 }, dt, 4);
    const c = Math.max(0, phaseT);
    coin.position.set(0, 0.6 + Math.abs(Math.sin(c * 6)) * (c > 1 ? 1.2 : 0.2), 0);
    coin.rotation.x += dt * 14;
    coin.rotation.z += dt * 3;
    syncViews(dt);
    if (phaseT <= 0) {
      coin.visible = false;
      const label = TEAM_KITS[kickoffTeam].label;
      hud.banner(`${label} KICKS OFF`, 2200);
      phase = 'play';
      audio.whistle('short');
      if (mode !== 'guest') {
        const { resetKickoff } = simInternals;
        resetKickoff(sim, kickoffTeam);
      }
    }
  }

  function updateDone(dt) {
    // slow orbit around the celebrating players
    const t = performance.now() / 1000;
    followCam.frame(
      { x: 0, y: 1, z: 0 },
      { x: Math.sin(t * 0.15) * 24, y: 12, z: Math.cos(t * 0.15) * 24 },
      dt, 1.5,
    );
    syncViews(dt);
  }

  // ── authoritative stepping (practice + host) ──────────────────────────────

  function updateAuthoritative(dt) {
    acc = Math.min(acc + dt, 0.25);
    while (acc >= FIXED_DT) {
      acc -= FIXED_DT;
      const inputs = collectInputs(FIXED_DT);
      const events = stepMatch(sim, inputs, FIXED_DT);
      for (const ev of events) {
        handleSimEvent(ev);
        if (mode === 'host') net?.sendMatchEvent(ev);
      }
    }
    if (mode === 'host') {
      snapTimer -= dt;
      if (snapTimer <= 0) {
        snapTimer = 1 / SNAP_HZ;
        net?.sendSnapshot(makeSnapshot());
      }
    }
    if (sim.phase === 'end' && phase !== 'done') finishMatch();
  }

  function collectInputs(dt) {
    const inputs = new Map();
    // me
    const raw = input.getState(followCam.yaw, dt);
    inputs.set(myPlayerId, toSimInput(raw));
    hud.setPower(raw.shootHeld ? raw.shootCharge : 0);
    if (mode === 'host') {
      // guests' inputs arrive over the wire
      for (const [pid, inp] of guestInputs) inputs.set(pid, inp);
    }
    // AI seats
    for (const p of sim.players) {
      if (inputs.has(p.id)) continue;
      if (p.isAi || mode === 'practice') inputs.set(p.id, computeAiInput(sim, p, dt));
    }
    return inputs;
  }

  function toSimInput(raw) {
    return {
      mx: raw.mx, mz: raw.mz, sprint: raw.sprint,
      pass: raw.pass, shoot: raw.shoot, tackle: raw.tackle,
    };
  }

  // ── guest: prediction + interpolation ─────────────────────────────────────

  function updateGuest(dt) {
    // send inputs
    inputTimer -= dt;
    const raw = input.getState(followCam.yaw, dt);
    hud.setPower(raw.shootHeld ? raw.shootCharge : 0);
    if (inputTimer <= 0 || raw.pass || raw.shoot > 0 || raw.tackle) {
      inputTimer = 1 / INPUT_HZ;
      net?.sendInput(toSimInput(raw));
    }

    // own player: local kinematic prediction + gentle reconcile to snapshots
    const me = sim.players[myPlayerId];
    if (predict && me) {
      const speed = raw.sprint ? SPRINT_SPEED : (Math.hypot(raw.mx, raw.mz) > 0.45 ? RUN_SPEED : WALK_SPEED);
      const m = Math.hypot(raw.mx, raw.mz);
      const tx = m > 0.01 ? raw.mx / Math.max(m, 1) * speed * Math.min(1, m * 1.6) : 0;
      const tz = m > 0.01 ? raw.mz / Math.max(m, 1) * speed * Math.min(1, m * 1.6) : 0;
      predict.vx += clampNum(tx - predict.vx, -22 * dt, 22 * dt);
      predict.vz += clampNum(tz - predict.vz, -22 * dt, 22 * dt);
      predict.x += predict.vx * dt;
      predict.z += predict.vz * dt;
      if (Math.hypot(predict.vx, predict.vz) > 0.4) predict.facing = Math.atan2(predict.vz, predict.vx);
      predict.phase += dt * (2.2 + Math.hypot(predict.vx, predict.vz) * 1.55);
      // reconcile: snap if far off
      const err = Math.hypot(predict.x - me.x, predict.z - me.z);
      if (err > 2.5) { predict.x = me.x; predict.z = me.z; predict.vx = me.vx; predict.vz = me.vz; }
      else { predict.x += (me.x - predict.x) * Math.min(1, dt * 4); predict.z += (me.z - predict.z) * Math.min(1, dt * 4); }
      me.x = predict.x; me.z = predict.z; me.vx = predict.vx; me.vz = predict.vz;
      me.facing = predict.facing; me.phase = predict.phase;
      me.anim = animForSpeed(Math.hypot(predict.vx, predict.vz));
      me.animSpeed = Math.hypot(predict.vx, predict.vz);
    }

    // interpolate everyone + ball from snapshot buffer
    if (interp && interp.a && interp.b) {
      const t = (performance.now() / 1000 - interp.b.at) / Math.max(1e-3, interp.b.at - interp.a.at);
      const k = Math.min(1.25, Math.max(0, t));
      for (let i = 0; i < sim.players.length; i++) {
        if (i === myPlayerId && predict) continue;
        const pa = interp.a.players[i], pb = interp.b.players[i];
        if (!pa || !pb) continue;
        const p = sim.players[i];
        p.x = pa.x + (pb.x - pa.x) * k;
        p.z = pa.z + (pb.z - pa.z) * k;
        p.vx = pb.vx; p.vz = pb.vz;
        p.facing = pb.facing; p.anim = pb.anim; p.animSpeed = pb.animSpeed;
        p.phase = pa.phase + (pb.phase - pa.phase) * k;
        p.kickT = pb.kickT; p.tackleT = pb.tackleT; p.diveT = pb.diveT;
        p.diveDir = pb.diveDir; p.celebrateT = pb.celebrateT;
      }
      const ba = interp.a.ball, bb = interp.b.ball;
      sim.ball.x = ba.x + (bb.x - ba.x) * k;
      sim.ball.y = ba.y + (bb.y - ba.y) * k;
      sim.ball.z = ba.z + (bb.z - ba.z) * k;
      sim.ball.owner = bb.owner;
    }
  }

  function onSnapshot(snap) {
    if (mode !== 'guest') return;
    const now = performance.now() / 1000;
    interp = { a: interp?.b ?? snap0(snap, now), b: snap0(snap, now), };
    // reconcile score/clock
    sim.score = snap.score;
    sim.time = snap.time;
    sim.half = snap.half;
    if (sim.phase !== 'end' && snap.phase === 'end') finishMatch();
    // reconcile own player target
    const meSnap = snap.players[myPlayerId];
    if (meSnap) {
      const me = sim.players[myPlayerId];
      me.x = meSnap.x; me.z = meSnap.z; me.vx = meSnap.vx; me.vz = meSnap.vz;
      if (!predict) predict = { ...meSnap };
      // hard states override prediction
      if (meSnap.stunT > 0 || meSnap.tackleT > 0) { predict.x = meSnap.x; predict.z = meSnap.z; }
    }
  }

  function snap0(snap, at) { return { ...snap, at }; }

  function makeSnapshot() {
    return {
      time: sim.time, half: sim.half, phase: sim.phase, score: sim.score,
      ball: { x: sim.ball.x, y: sim.ball.y, z: sim.ball.z, owner: sim.ball.owner },
      players: sim.players.map((p) => ({
        x: r2(p.x), z: r2(p.z), vx: r2(p.vx), vz: r2(p.vz),
        facing: r2(p.facing), anim: p.anim, animSpeed: r2(p.animSpeed), phase: r2(p.phase),
        kickT: r2(p.kickT), tackleT: r2(p.tackleT), stunT: r2(p.stunT),
        diveT: r2(p.diveT), diveDir: r2(p.diveDir), celebrateT: r2(p.celebrateT),
      })),
    };
  }

  function onRemoteInput(inp, fromId) {
    if (mode !== 'host') return;
    // host maps sender participant → seat
    const seat = seatByParticipant(fromId);
    if (seat != null) guestInputs.set(seat, inp);
  }

  let participantSeats = null;
  function seatByParticipant(pid) {
    if (!participantSeats) return null;
    return participantSeats.get(pid) ?? null;
  }

  // ── events → audio / banners / crowd ──────────────────────────────────────

  function handleSimEvent(ev) {
    switch (ev.type) {
      case 'kick': audio.kick(ev.power); break;
      case 'bounce': if (ev.power > 0.25) audio.bounce(ev.power); break;
      case 'steal': case 'tackle': audio.tackle(); break;
      case 'dive': audio.tackle(); audio.crowd.anticipation(); break;
      case 'woodwork': audio.crowd.gasp(); audio.crowd.ooh(); stadium.crowd.pulse(0.5); break;
      case 'goal': {
        const isHome = ev.team === 0;
        audio.crowd.goal(isHome);
        audio.whistle('short');
        stadium.crowd.pulse(1);
        hud.banner('GOAL!', 2600);
        hud.setScore(sim.score[0], sim.score[1]);
        break;
      }
      case 'restart': audio.whistle('short'); break;
      case 'halftime': audio.whistle('long'); hud.banner('HALF TIME', 3000); break;
      case 'kickoff': audio.whistle('short'); break;
      case 'fulltime': {
        audio.whistle('long');
        hud.banner('FULL TIME', 3200);
        const won = ev.winner === sim.players[myPlayerId].team;
        if (ev.winner === -1) audio.crowd.cheer(0.5);
        else if (won) { audio.crowd.cheer(1); stadium.crowd.pulse(1); }
        else audio.crowd.cheer(0.3);
        break;
      }
    }
  }

  // ── crowd excitement follows the action ───────────────────────────────────

  function updateAudio(dt) {
    const b = sim.ball;
    const halfL = sim.pitch.L / 2;
    const danger = 1 - Math.min(1, (halfL - Math.abs(b.x)) / (sim.pitch.L * 0.3));
    const target = 0.3 + danger * 0.55;
    excitement += (target - excitement) * Math.min(1, dt * 1.5);
    audio.crowd.setExcitement(excitement);
    stadium.crowd.setExcitement(excitement);

    // own footsteps at cadence
    const me = sim.players[myPlayerId];
    if (me && (me.anim === 'run' || me.anim === 'sprint')) {
      const steps = Math.floor(me.phase / Math.PI);
      if (steps !== lastStepCount) {
        lastStepCount = steps;
        audio.footstep();
        if (navigator.vibrate && me.anim === 'sprint') navigator.vibrate(4);
      }
    }
  }

  // ── view sync + HUD ───────────────────────────────────────────────────────

  function syncViews(dt) {
    for (let i = 0; i < sim.players.length; i++) {
      const p = sim.players[i];
      const v = views[i];
      if (!v) continue;
      v.group.position.set(p.x, 0, p.z);
      v.group.rotation.y = -p.facing; // model faces +x at rotation 0; yaw is CCW around +y
      v.update(dt, p);
    }
    ballMesh.position.set(sim.ball.x, sim.ball.y, sim.ball.z);
    ballMesh.rotation.x += sim.ball.vx * dt * 2;
    ballMesh.rotation.z -= sim.ball.vz * dt * 2;
    if (phase === 'play') followCam.update(dt, sim.players[myPlayerId], sim.ball);
  }

  function updateHud() {
    hud.setClock(sim.time, sim.half, sim.halfLength);
    hud.setScore(sim.score[0], sim.score[1]);
  }

  function finishMatch() {
    phase = 'done';
    hud.setPower(0);
    if (mode === 'host') net?.sendMatchEvent({ type: 'fulltime', score: sim.score });
    setTimeout(() => {
      onFullTime?.({
        score: [...sim.score],
        stats: sim.stats,
        myTeam: sim.players[myPlayerId].team,
        winner: sim.score[0] === sim.score[1] ? -1 : (sim.score[0] > sim.score[1] ? 0 : 1),
      });
    }, 4500);
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  function cleanup() {
    disposed = false;
    for (const v of views) v.dispose();
    views = [];
    if (stadium) { stadium.dispose(); stadium = null; }
    if (ballMesh) { scene.remove(ballMesh); ballMesh = null; }
    if (coin) { scene.remove(coin); coin = null; }
    guestInputs.clear();
    participantSeats = null;
    interp = null; predict = null;
    acc = 0; excitement = 0.3;
  }

  function dispose() {
    disposed = true;
    cleanup();
    net?.close();
    net = null;
    input.showTouchUi(false);
    hud.showHud(false);
  }

  return {
    startPractice,
    startFromRoom,
    update,
    dispose,
    onSnapshot,
    onRemoteInput,
    onNetEvent: (ev) => handleSimEvent(ev),
    setParticipantSeats: (map) => { participantSeats = map; },
    set onFullTime(cb) { onFullTime = cb; },
    get phase() { return phase; },
    get sim() { return sim; },
    get myPlayerId() { return myPlayerId; },
  };
}

// sim's resetKickoff is exported; re-exported here as a tiny indirection so the
// controller reads naturally.
import { resetKickoff as _resetKickoff } from './game/sim.js';
const simInternals = { resetKickoff: _resetKickoff };

function r2(v) { return Math.round(v * 100) / 100; }
function clampNum(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function animForSpeed(spd) {
  if (spd > SPRINT_SPEED * 0.75) return 'sprint';
  if (spd > WALK_SPEED + 0.4) return 'run';
  if (spd > 0.4) return 'walk';
  return 'idle';
}
