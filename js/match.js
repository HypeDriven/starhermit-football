// match.js — match orchestration: scene population, match flow (walkout →
// coin flip → halves → full time), netcode, audio & HUD wiring.
//
// Modes:
//   'practice' — local authoritative sim (offline vs AI).
//   'online'   — server-authoritative: the platform runs server.js; we send
//                inputs at 20 Hz over the games socket and interpolate the
//                15 Hz snapshots 100 ms behind. Leave/rejoin/AI stand-ins and
//                the stretcher ceremony are owned by the server.
import * as THREE from 'three';
import {
  createMatch, stepMatch, takeAiName, makeRng, resetKickoff,
  WALK_SPEED, BALL_R,
} from './game/sim.js';
import { computeAiInput, clearAiPlans } from './game/ai.js';
import { buildStadium } from './world/stadium.js';
import { createPlayerMesh } from './world/player.js';
import { createCeremonyViews } from './world/officials.js';
import { createFollowCamera } from './game/camera.js';

const TEAM_KITS = [
  { shirt: '#1f5fb4', shorts: '#f2f2f2', socks: '#1f5fb4', gk: '#e67e22', plate: '#1f5fb4', label: 'BLUE' },
  { shirt: '#c0392b', shorts: '#232323', socks: '#c0392b', gk: '#8e44ad', plate: '#c0392b', label: 'RED' },
];
const HAIRS = ['#1a1a1a', '#3b2314', '#6e4a21', '#b99256', '#545454', '#8a3b12'];
const INPUT_HZ = 20, FIXED_DT = 1 / 60;
const INTERP_DELAY = 0.1;   // render this far behind the newest snapshot
const SNAP_BUF = 1.5;       // seconds of snapshots to keep

export function createMatchController({ renderer, scene, camera, audio, input, hud }) {
  const followCam = createFollowCamera(camera);
  let stadium = null;
  let ballMesh = null;
  let coin = null;

  // match state
  let mode = 'practice';        // 'practice' | 'online'
  let sim = null;               // authoritative sim (practice); structural copy driven by snapshots (online)
  let views = [];               // PlayerView per player id
  let myPlayerId = 0;
  let phase = 'idle';           // 'walkout' | 'coinflip' | 'play' | 'done'
  let phaseT = 0;
  let acc = 0;
  let net = null;               // games-socket client (online)
  let lobbyNet = null;          // realtime-rooms client (roster pushes)
  let inputTimer = 0, inputSeq = 0;
  let snaps = [];               // parsed snapshot buffer, oldest first
  let cerViews = null;          // referee + carriers + stretcher (lazy)
  let curCer = null;            // interpolated ceremony for views/camera
  let timers = [];              // {at, fn} on the match-local clock
  let elapsed = 0;
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

  function makeViewFor(p, name) {
    const kit = TEAM_KITS[p.team];
    const isMe = p.id === myPlayerId;
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
      name: isMe ? 'You' : name ?? p.name,
      nameColor: kit.plate,
      isYou: isMe,
    });
    scene.add(view.group);
    return view;
  }

  function buildPlayers(rosterPlayers) {
    for (const v of views) v.dispose();
    views = [];
    for (const p of rosterPlayers) views[p.id] = makeViewFor(p);
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

  function startFromRoom({ room, teamSize, myUserId, netClient, lobbyNetClient, isRejoin = false }) {
    cleanup();
    net = netClient;
    lobbyNet = lobbyNetClient ?? null;
    mode = 'online';
    // roster: sort participants into team/slot seats
    const seats = new Array(teamSize * 2).fill(null);
    for (const part of room.participants) {
      if (part.leftAt) continue; // lobby leavers; their seat was AI-backfilled
      const id = part.team * teamSize + part.slot;
      seats[id] = { userId: part.userId, name: part.username, isAi: part.isAi };
    }
    // map my user → player id
    myPlayerId = seats.findIndex((s) => s && s.userId === myUserId);
    if (myPlayerId < 0) myPlayerId = 0;
    const seed = room.seed ?? room.id?.length ?? 42;
    sim = createMatch({ teamSize, roster: seats, seed });
    kickoffTeam = room.kickoffTeam ?? 0; // snapshots reconcile this (snap.kt)
    beginMatch(isRejoin);
  }

  function beginMatch(skipIntro = false) {
    clearAiPlans(sim);
    buildWorld(sim.pitch);
    buildPlayers(sim.players);
    if (skipIntro) {
      phase = 'play'; // online rejoin: snapshots restore everything
    } else {
      if (mode === 'practice') resetKickoffSim();
      phase = 'walkout';
      phaseT = 8;
      walkoutSetup();
    }
    hud.showHud(true);
    hud.setTeamNames(TEAM_KITS[0].label, TEAM_KITS[1].label);
    input.showTouchUi(true);
    audio.crowd.setExcitement(0.6);
    stadium.crowd.setExcitement(0.6);
    audio.crowd.cheer(skipIntro ? 0.4 : 0.9);
    if (!skipIntro) stadium.crowd.pulse(0.8);
  }

  function resetKickoffSim() {
    sim.kickoffTeam = kickoffTeam;
    resetKickoff(sim, kickoffTeam);
  }

  // walkout: players start at the tunnel and walk to formation (presentation)
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

    if (phase === 'walkout') { updateWalkout(dt); pumpTimers(dt); return; }
    if (phase === 'coinflip') { updateCoinflip(dt); pumpTimers(dt); return; }
    if (phase === 'done') { updateDone(dt); pumpTimers(dt); return; }

    // ── play ──
    if (mode === 'online') updateOnline(dt);
    else updateAuthoritative(dt);

    pumpTimers(dt);
    syncViews(dt);
    updateHud();
    updateAudio(dt);
  }

  // Phase-agnostic delayed calls (e.g. the boo that follows an injury gasp).
  function schedule(delayS, fn) {
    timers.push({ at: elapsed + delayS, fn });
  }
  function pumpTimers(dt) {
    elapsed += dt;
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].at <= elapsed) {
        const t = timers[i];
        timers.splice(i, 1);
        t.fn();
      }
    }
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
      if (mode === 'practice') resetKickoff(sim, kickoffTeam);
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

  // ── authoritative stepping (practice) ─────────────────────────────────────

  function updateAuthoritative(dt) {
    acc = Math.min(acc + dt, 0.25);
    while (acc >= FIXED_DT) {
      acc -= FIXED_DT;
      const inputs = collectInputs(FIXED_DT);
      const events = stepMatch(sim, inputs, FIXED_DT);
      for (const ev of events) handleSimEvent(ev);
    }
    if (sim.phase === 'end' && phase !== 'done') finishMatch();
  }

  function collectInputs(dt) {
    const inputs = new Map();
    // me
    const raw = input.getState(followCam.yaw, dt);
    inputs.set(myPlayerId, toSimInput(raw));
    hud.setPower(raw.shootHeld ? raw.shootCharge : 0);
    // AI seats
    for (const p of sim.players) {
      if (inputs.has(p.id)) continue;
      inputs.set(p.id, computeAiInput(sim, p, dt));
    }
    return inputs;
  }

  function toSimInput(raw) {
    return {
      mx: raw.mx, mz: raw.mz, sprint: raw.sprint,
      pass: raw.pass, shoot: raw.shoot, tackle: raw.tackle,
    };
  }

  // ── online: input upstream, snapshot interpolation downstream ─────────────

  function updateOnline(dt) {
    // send inputs (20 Hz, immediately on action edges)
    inputTimer -= dt;
    const raw = input.getState(followCam.yaw, dt);
    hud.setPower(raw.shootHeld ? raw.shootCharge : 0);
    if (inputTimer <= 0 || raw.pass || raw.shoot > 0 || raw.tackle) {
      inputTimer = 1 / INPUT_HZ;
      net?.sendInput({ seq: ++inputSeq, ...toSimInput(raw) });
    }
    applyInterp();
  }

  function applyInterp() {
    const n = snaps.length;
    if (!n) return;
    const rt = performance.now() / 1000 - INTERP_DELAY;
    let a = snaps[0], b = snaps[n - 1], k = 1;
    if (rt <= a.at) { a = b; }
    else if (rt >= b.at) { a = b; }
    else {
      for (let i = n - 1; i > 0; i--) {
        if (snaps[i - 1].at <= rt) { a = snaps[i - 1]; b = snaps[i]; break; }
      }
      k = (rt - a.at) / Math.max(1e-3, b.at - a.at);
    }

    for (let i = 0; i < sim.players.length; i++) {
      const pa = a.pl[i], pb = b.pl[i];
      if (!pa || !pb) continue;
      const p = sim.players[i];
      p.x = pa.x + (pb.x - pa.x) * k;
      p.z = pa.z + (pb.z - pa.z) * k;
      p.vx = pb.vx; p.vz = pb.vz;
      p.facing = pb.facing; p.anim = pb.anim; p.animSpeed = pb.animSpeed;
      p.phase = pa.phase + (pb.phase - pa.phase) * k;
      p.kickT = pb.kickT; p.tackleT = pb.tackleT; p.stunT = pb.stunT;
      p.diveT = pb.diveT; p.diveDir = pb.diveDir; p.celebrateT = pb.celebrateT;
    }
    const ba = a.b, bb = b.b;
    sim.ball.x = ba.x + (bb.x - ba.x) * k;
    sim.ball.y = ba.y + (bb.y - ba.y) * k;
    sim.ball.z = ba.z + (bb.z - ba.z) * k;
    sim.ball.vx = bb.vx; sim.ball.vz = bb.vz;
    sim.ball.owner = bb.owner;

    // ceremony: interpolate when both snapshots carry the same one
    if (!b.cer) {
      curCer = null;
    } else if (a.cer && a.cer.k === b.cer.k && a.cer.v === b.cer.v) {
      curCer = lerpCer(a.cer, b.cer, k);
    } else {
      curCer = b.cer;
    }
  }

  function lerpEnt(ea, eb, k) {
    return [
      ea[0] + (eb[0] - ea[0]) * k,
      ea[1] + (eb[1] - ea[1]) * k,
      eb[2], eb[3], eb[4],
      ea[5] + (eb[5] - ea[5]) * k,
    ];
  }

  function lerpCer(ca, cb, k) {
    return {
      k: cb.k, t: cb.t, v: cb.v, vn: cb.vn, rn: cb.rn, sp: cb.sp,
      ref: lerpEnt(ca.ref, cb.ref, k),
      ca: [lerpEnt(ca.ca[0], cb.ca[0], k), lerpEnt(ca.ca[1], cb.ca[1], k)],
      st: [
        ca.st[0] + (cb.st[0] - ca.st[0]) * k,
        ca.st[1] + (cb.st[1] - ca.st[1]) * k,
        cb.st[2], cb.st[3],
      ],
    };
  }

  function onSnapshot(snap) {
    if (mode !== 'online' || !sim) return;
    const parsed = parseSnap(snap);
    parsed.at = performance.now() / 1000;
    snaps.push(parsed);
    while (snaps.length > 2 && snaps[0].at < parsed.at - SNAP_BUF) snaps.shift();

    // reconcile flow state
    sim.score[0] = parsed.sc[0]; sim.score[1] = parsed.sc[1];
    sim.time = parsed.t;
    sim.half = parsed.h;
    sim.phase = parsed.ph;
    kickoffTeam = parsed.kt;

    // names/isAi ride in the snapshot — covers substitutions even if the
    // roster push lags; rebuild the name tag when a player's name changes
    for (let i = 0; i < parsed.pl.length && i < sim.players.length; i++) {
      const ps = parsed.pl[i], p = sim.players[i];
      p.isAi = !!ps.isAi;
      if (ps.name && ps.name !== p.name) {
        p.name = ps.name;
        const old = views[i];
        if (old) { old.dispose(); views[i] = makeViewFor(p); }
      }
    }

    if (phase !== 'done' && parsed.ph === 'end') finishMatch();
  }

  function parseSnap(snap) {
    const pl = snap.pl.map((e) => ({
      id: e[0], team: e[1], x: e[2], z: e[3], vx: e[4], vz: e[5], facing: e[6],
      anim: e[7], animSpeed: e[8], phase: e[9], kickT: e[10], tackleT: e[11],
      stunT: e[12], diveT: e[13], diveDir: e[14], celebrateT: e[15],
      isAi: e[16], name: e[17],
    }));
    const b = snap.b;
    return {
      at: 0, t: snap.t, h: snap.h, ph: snap.ph, sc: snap.sc, kt: snap.kt,
      b: { x: b[0], y: b[1], z: b[2], vx: b[3], vy: b[4], vz: b[5], owner: b[6] >= 0 ? b[6] : null },
      pl, cer: snap.cer || null,
    };
  }

  // Server roster changed (e.g. a leaver's seat became AI): re-apply
  // names/flags. Snapshots carry the same data, so this is a fast-path backup.
  function applyRoster(participants) {
    if (!sim) return;
    for (const part of participants) {
      if (part.leftAt) continue;
      const seat = part.team * sim.teamSize + part.slot;
      const p = sim.players[seat];
      if (!p) continue;
      p.isAi = !!part.isAi;
      if (part.username && part.username !== p.name) {
        p.name = part.username;
        // rebuild the view so the name tag shows the new name
        const old = views[seat];
        if (old) { old.dispose(); views[seat] = makeViewFor(p); }
      }
    }
  }

  function handleNetEvent(ev) {
    if (!ev || typeof ev !== 'object') return;
    handleSimEvent(ev);
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
        if (ev.ownGoal) {
          // a gasp first, then a muted cheer — the stadium isn't sure how to feel
          audio.crowd.gasp();
          audio.crowd.cheer(0.5);
          stadium.crowd.pulse(0.5);
          hud.banner('OWN GOAL!', 2600);
        } else {
          audio.crowd.goal(isHome);
          stadium.crowd.pulse(1);
          hud.banner('GOAL!', 2600);
        }
        audio.whistle('short');
        hud.setScore(sim.score[0], sim.score[1]);
        break;
      }
      case 'restart': audio.whistle('short'); break; // sideline/goalline/drop-ball
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
      // ── ceremony / session events (server-owned) ──
      case 'injury-start': {
        audio.injury();
        audio.crowd.gasp();
        if (ev.kind === 'leave') {
          hud.banner(`INJURY — ${ev.name} CAN'T CONTINUE`, 3200);
          // the crowd turns on the leaver a beat later
          schedule(1, () => { audio.crowd.boo(0.9); stadium?.crowd.boo(0.9); });
        }
        break;
      }
      case 'referee-whistle': audio.whistle('short'); break;
      case 'stretcher-load': break; // visuals only (ceremony views)
      case 'stretcher-off': break;
      case 'substitution': {
        audio.crowd.cheer(0.8);
        stadium.crowd.pulse(0.8);
        hud.banner(ev.kind === 'rejoin' ? `${ev.inName} IS BACK` : `${ev.inName} COMES ON`, 2800);
        break;
      }
      case 'abandoned-draw': {
        audio.whistle('long');
        hud.banner('MATCH ABANDONED — DRAW', 4200);
        finishMatch(-1);
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

    // ceremony extras live only while the snapshot carries a ceremony
    if (curCer) {
      if (!cerViews) cerViews = createCeremonyViews(scene);
      cerViews.update(dt, curCer);
    } else if (cerViews) {
      cerViews.dispose();
      cerViews = null;
    }

    if (phase === 'play') {
      if (curCer) {
        // cutscene: frame the injury spot from the south sideline
        const sp = curCer.sp;
        followCam.frame(
          { x: sp[0], y: 1, z: sp[1] },
          { x: sp[0] + 3, y: 4.5, z: sp[1] + 11 },
          dt, 2.5,
        );
      } else {
        followCam.update(dt, sim.players[myPlayerId], sim.ball);
      }
    }
  }

  function updateHud() {
    hud.setClock(sim.time, sim.half, sim.halfLength);
    hud.setScore(sim.score[0], sim.score[1]);
  }

  function finishMatch(winner = null) {
    if (phase === 'done') return;
    phase = 'done';
    hud.setPower(0);
    const w = winner ?? (sim.score[0] === sim.score[1] ? -1 : (sim.score[0] > sim.score[1] ? 0 : 1));
    setTimeout(() => {
      onFullTime?.({
        score: [...sim.score],
        stats: mode === 'practice' ? sim.stats : null, // server owns online stats
        myTeam: sim.players[myPlayerId].team,
        winner: w,
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
    if (cerViews) { cerViews.dispose(); cerViews = null; }
    curCer = null;
    snaps = [];
    timers = [];
    elapsed = 0;
    inputTimer = 0; inputSeq = 0;
    acc = 0; excitement = 0.3;
  }

  function dispose() {
    disposed = true;
    cleanup();
    net?.close();
    net = null;
    lobbyNet?.close();
    lobbyNet = null;
    input.showTouchUi(false);
    hud.showHud(false);
  }

  return {
    startPractice,
    startFromRoom,
    update,
    dispose,
    onSnapshot,
    onNetEvent: (ev) => handleNetEvent(ev),
    applyRoster,
    set onFullTime(cb) { onFullTime = cb; },
    get phase() { return phase; },
    get sim() { return sim; },
    get myPlayerId() { return myPlayerId; },
  };
}
