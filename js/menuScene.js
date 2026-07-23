// menuScene.js — ambient multiplayer-football backdrop behind the main menu.
// A full AI-vs-AI match plays in the night stadium while the camera drifts
// cinematically around the pitch. Runs the same shared sim (server.js) and
// the same stadium/player builders as a real match, stepped locally with AI
// inputs on every seat. No audio, no HUD — pure spectacle behind the DOM menu.
import * as THREE from 'three';
import { createMatch, stepMatch, takeAiName, pitchFor, resetKickoff, BALL_R } from './game/sim.js';
import { computeAiInput, clearAiPlans } from './game/ai.js';
import { buildStadium } from './world/stadium.js';
import { createPlayerMesh } from './world/player.js';

const TEAM_KITS = [
  { shirt: '#1f5fb4', shorts: '#f2f2f2', socks: '#1f5fb4', gk: '#e67e22', plate: '#1f5fb4' },
  { shirt: '#c0392b', shorts: '#232323', socks: '#c0392b', gk: '#8e44ad', plate: '#c0392b' },
];
const HAIRS = ['#1a1a1a', '#3b2314', '#6e4a21', '#b99256', '#545454', '#8a3b12'];
const TEAM_SIZE = 5;
const FIXED_DT = 1 / 60;

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

export function createMenuScene({ scene, camera }) {
  let stadium = null;
  let sim = null;
  let views = [];
  let ballMesh = null;
  let acc = 0;
  let camT = Math.random() * 100; // randomize the starting camera leg
  let running = false;
  const lookTarget = new THREE.Vector3(0, 1, 0);

  function newMatch() {
    clearAiPlans(sim);
    const roster = [];
    for (let i = 0; i < TEAM_SIZE * 2; i++) roster.push({ userId: null, name: takeAiName(), isAi: true });
    sim = createMatch({ teamSize: TEAM_SIZE, roster, seed: (Math.random() * 1e9) | 0 });
    resetKickoff(sim, Math.random() < 0.5 ? 0 : 1);
    buildViews();
  }

  function buildViews() {
    for (const v of views) v.dispose();
    views = [];
    for (const p of sim.players) {
      const kit = TEAM_KITS[p.team];
      const view = createPlayerMesh({
        kit: {
          shirt: p.role === 'GK' ? kit.gk : kit.shirt,
          shorts: kit.shorts,
          socks: p.role === 'GK' ? kit.gk : kit.socks,
          number: p.slot + 1,
          gk: p.role === 'GK',
        },
        skin: Math.random(),
        hair: HAIRS[(Math.random() * HAIRS.length) | 0],
        name: p.name,
        nameColor: kit.plate,
        isYou: false,
      });
      scene.add(view.group);
      views[p.id] = view;
    }
  }

  function start() {
    if (running) return;
    running = true;
    stadium = buildStadium(scene, { pitch: pitchFor(TEAM_SIZE) });
    stadium.crowd.setExcitement(0.55);
    ballMesh = makeBall();
    scene.add(ballMesh);
    newMatch();
  }

  function stop() {
    if (!running) return;
    running = false;
    for (const v of views) v.dispose();
    views = [];
    if (ballMesh) { scene.remove(ballMesh); ballMesh = null; }
    if (stadium) { stadium.dispose(); stadium = null; }
    clearAiPlans(sim);
    sim = null;
  }

  function handleEvent(ev) {
    if (!stadium) return;
    switch (ev.type) {
      case 'goal': stadium.crowd.pulse(1); break;
      case 'woodwork': stadium.crowd.pulse(0.5); break;
      case 'halftime': case 'fulltime': stadium.crowd.pulse(0.7); break;
    }
  }

  function update(dt) {
    if (!running || !sim) return;

    // fixed-step the shared sim with AI on every seat
    acc = Math.min(acc + dt, 0.25);
    while (acc >= FIXED_DT) {
      acc -= FIXED_DT;
      const inputs = new Map();
      for (const p of sim.players) inputs.set(p.id, computeAiInput(sim, p, FIXED_DT));
      const events = stepMatch(sim, inputs, FIXED_DT);
      for (const ev of events) handleEvent(ev);
    }
    if (sim.phase === 'end') newMatch(); // full time → kick off a fresh exhibition

    // sync views
    for (let i = 0; i < sim.players.length; i++) {
      const p = sim.players[i];
      const v = views[i];
      if (!v) continue;
      v.group.position.set(p.x, 0, p.z);
      v.group.rotation.y = -p.facing;
      v.update(dt, p);
    }
    ballMesh.position.set(sim.ball.x, sim.ball.y, sim.ball.z);
    ballMesh.rotation.x += sim.ball.vx * dt * 2;
    ballMesh.rotation.z -= sim.ball.vz * dt * 2;

    // slow cinematic drift around the pitch, always easing toward the ball
    camT += dt;
    const a = camT * 0.055;
    const r = 58 + 16 * Math.sin(camT * 0.041);
    const h = 13 + 7 * Math.sin(camT * 0.031 + 1.3);
    camera.position.set(Math.cos(a) * r, Math.max(4, h), Math.sin(a) * r * 0.72);
    lookTarget.x += (sim.ball.x * 0.55 - lookTarget.x) * Math.min(1, dt * 0.8);
    lookTarget.z += (sim.ball.z * 0.55 - lookTarget.z) * Math.min(1, dt * 0.8);
    lookTarget.y = 1;
    camera.lookAt(lookTarget);

    stadium.update(dt, camera);
  }

  return { start, stop, update, get running() { return running; } };
}
