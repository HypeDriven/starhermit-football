// stadium.js — procedural night-match stadium world: striped pitch + line
// markings, goals with nets, two-tier seated bowl with an instanced animated
// crowd, floodlight towers with light cones and one shadow-casting spotlight,
// scrolling LED boards, tunnel, dugouts and corner flags.
//
// All geometry and textures are generated in code (canvas textures, primitive
// geometry merged by hand). No external assets.
//
// Usage:
//   import { buildStadium } from './world/stadium.js';
//   const stadium = buildStadium(scene, { pitch: { L, W, goalW, goalH, boxD, boxW } });
//   stadium.update(dt, camera);            // every frame
//   stadium.crowd.setExcitement(0..1);
//   stadium.crowd.pulse(0..1);
//   stadium.setNight(true|false);
//   stadium.dispose();

import * as THREE from 'three';

const DEFAULT_PITCH = { L: 105, W: 68, goalW: 7.32, goalH: 2.44, boxD: 16.5, boxW: 40.32 };

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

// Bowl layout constants (meters).
const STAND_GAP = 9;        // pitch edge -> stand front
const ROWS_T1 = 7;          // lower tier rows
const ROWS_T2 = 9;          // upper tier rows (scaled up on small pitches)
const ROW_DEPTH = 0.85;
const RISE_T1 = 0.5;
const RISE_T2 = 0.65;
const WALKWAY = 2.6;        // between tiers
const WALL_H = 1.1;         // front wall height
const SEAT_DX = 0.62;       // seat spacing along a row
const CROWD_FILL = 0.8;     // fraction of seats occupied

const SPOT_INTENSITY = 3.4;
const FILL_INTENSITY = 1.7;
const TOWER_H = 30;

// ── helpers ─────────────────────────────────────────────────────────────────

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function canvasTexture(canvas, srgb = true) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Merge a list of (indexed) primitive geometries into one non-indexed
// BufferGeometry with position/normal/uv attributes.
function mergeGeoms(geoms) {
  let vCount = 0;
  const parts = geoms.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) vCount += g.attributes.position.count;
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  let o3 = 0;
  let o2 = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o3);
    nor.set(g.attributes.normal.array, o3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o2);
    o3 += g.attributes.position.count * 3;
    o2 += g.attributes.position.count * 2;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

function box(list, w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  list.push(g);
}

function scaleUVs(g, sx, sy) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
}

// ── procedural textures ─────────────────────────────────────────────────────

function makeSkyTexture(night) {
  const [c, ctx] = makeCanvas(16, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  if (night) {
    g.addColorStop(0.0, '#010208');
    g.addColorStop(0.5, '#040914');
    g.addColorStop(0.78, '#0a1524');
    g.addColorStop(1.0, '#122036'); // faint horizon glow
  } else {
    g.addColorStop(0.0, '#2c4a70');
    g.addColorStop(0.6, '#54759c');
    g.addColorStop(1.0, '#a7bfd4');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  return canvasTexture(c);
}

function makeGrassTexture(L, W) {
  const w = 1024;
  const h = Math.max(2, Math.round((1024 * W) / L));
  const [c, ctx] = makeCanvas(w, h);
  const bands = 16; // mow bands along the length (x axis)
  const bw = w / bands;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = i % 2 ? '#2f6d31' : '#2a602c';
    ctx.fillRect(Math.floor(i * bw), 0, Math.ceil(bw) + 1, h);
  }
  // per-pixel grass grain noise
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 15;
    d[i] += n * 0.8;
    d[i + 1] += n * 1.2;
    d[i + 2] += n * 0.8;
  }
  ctx.putImageData(img, 0, 0);
  // sparse lighter/darker flecks for extra texture
  for (let i = 0; i < 2600; i++) {
    const a = Math.random() * 0.05;
    ctx.fillStyle = Math.random() < 0.5
      ? `rgba(255,255,240,${a})`
      : `rgba(0,20,0,${a})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  return canvasTexture(c);
}

function makeLinesTexture(p) {
  const L = p.L;
  const W = p.W;
  const goalW = p.goalW;
  const boxD = Math.min(p.boxD, L * 0.25);
  const boxW = Math.min(p.boxW, W * 0.8);
  const gbD = boxD * 0.55;                       // six-yard box
  const gbW = Math.max(goalW + 2, boxW * 0.45);
  const spotD = boxD * 0.67;                     // penalty spot distance
  const circR = Math.min(9.15, L * 0.09, W / 2 - 1.5);
  const penR = circR;

  const Wpx = 2048;
  const Hpx = Math.max(2, Math.round((2048 * W) / L));
  const [c, ctx] = makeCanvas(Wpx, Hpx);
  const s = Wpx / L; // px per meter (uniform: Hpx/Wpx == W/L)
  const X = (x) => (x + L / 2) * s;
  const Z = (z) => (z + W / 2) * s;
  const lw = Math.max(2, 0.12 * s);

  ctx.strokeStyle = '#f5f8f5';
  ctx.fillStyle = '#f5f8f5';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';

  const dot = (x, z, r) => {
    ctx.beginPath();
    ctx.arc(x, z, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const seg = (x0, z0, x1, z1) => {
    ctx.beginPath();
    ctx.moveTo(x0, z0);
    ctx.lineTo(x1, z1);
    ctx.stroke();
  };

  // boundary (inset half a line width so it stays on the plane)
  ctx.strokeRect(X(-L / 2) + lw / 2, Z(-W / 2) + lw / 2, L * s - lw, W * s - lw);
  // halfway line
  seg(X(0), Z(-W / 2), X(0), Z(W / 2));
  // center circle + spot
  ctx.beginPath();
  ctx.arc(X(0), Z(0), circR * s, 0, Math.PI * 2);
  ctx.stroke();
  dot(X(0), Z(0), lw * 0.85);

  for (const side of [-1, 1]) {
    const gx = X((side * L) / 2);
    const innerX = X(side * (L / 2 - boxD));
    const innerGbX = X(side * (L / 2 - gbD));
    // penalty box
    ctx.strokeRect(Math.min(gx, innerX), Z(-boxW / 2), boxD * s, boxW * s);
    // goal box
    ctx.strokeRect(Math.min(gx, innerGbX), Z(-gbW / 2), gbD * s, gbW * s);
    // penalty spot
    const spx = X(side * (L / 2 - spotD));
    dot(spx, Z(0), lw * 0.85);
    // penalty arc (part of the spot-circle outside the box)
    const cosA = Math.min(1, Math.max(-1, (boxD - spotD) / penR));
    const a = Math.acos(cosA);
    ctx.beginPath();
    if (side > 0) ctx.arc(spx, Z(0), penR * s, Math.PI - a, Math.PI + a);
    else ctx.arc(spx, Z(0), penR * s, -a, a);
    ctx.stroke();
  }

  // corner arcs (1 m quarter circles)
  const cr = Math.min(1, W * 0.02) * s;
  ctx.beginPath(); ctx.arc(X(-L / 2), Z(-W / 2), cr, 0, Math.PI / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(L / 2), Z(-W / 2), cr, Math.PI / 2, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(L / 2), Z(W / 2), cr, Math.PI, Math.PI * 1.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(-L / 2), Z(W / 2), cr, Math.PI * 1.5, Math.PI * 2); ctx.stroke();

  const tex = canvasTexture(c);
  return tex;
}

function makeNetTexture() {
  const [c, ctx] = makeCanvas(64, 64);
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(228,234,238,0.95)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(2, 0); ctx.lineTo(2, 64);
  ctx.moveTo(0, 2); ctx.lineTo(64, 2);
  ctx.stroke();
  const tex = canvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeLedTexture() {
  const [c, ctx] = makeCanvas(2048, 128);
  const sponsors = [
    ['STARHERMIT', '#0d1f4b', '#8fd4ff'],
    ['VELOCE', '#7a1020', '#ffd9a0'],
    ['NORDWIND', '#0b3d2e', '#c8ffe8'],
    ['KITE SPORTS', '#3d2c06', '#ffe98a'],
  ];
  const segW = 512;
  sponsors.forEach(([word, bg, fg], i) => {
    const x = i * segW;
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, bg);
    g.addColorStop(1, '#04060e');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, segW, 128);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic 900 72px Arial, Helvetica, sans-serif';
    ctx.fillText(word, x + segW / 2, 56);
    ctx.globalAlpha = 0.65;
    ctx.font = '700 22px Arial, Helvetica, sans-serif';
    ctx.fillText('OFFICIAL CLUB PARTNER', x + segW / 2, 102);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x, 0, 3, 128);
  });
  const tex = canvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(8, 1);
  return tex;
}

function makeLampTexture() {
  const [c, ctx] = makeCanvas(256, 128);
  ctx.fillStyle = '#090c11';
  ctx.fillRect(0, 0, 256, 128);
  for (let r = 0; r < 3; r++) {
    for (let col = 0; col < 6; col++) {
      const x = 24 + col * 42;
      const y = 22 + r * 42;
      const g = ctx.createRadialGradient(x, y, 1, x, y, 18);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, '#d6e6ff');
      g.addColorStop(1, 'rgba(15,25,45,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return canvasTexture(c);
}

function makeSignTexture() {
  const [c, ctx] = makeCanvas(512, 96);
  ctx.fillStyle = '#0d1f4b';
  ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = '#8fd4ff';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 504, 88);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 52px Arial, Helvetica, sans-serif';
  ctx.fillText('★ STARHERMIT FC ★', 256, 50);
  return canvasTexture(c);
}

// ── main builder ────────────────────────────────────────────────────────────

export function buildStadium(scene, opts) {
  const p = Object.assign({}, DEFAULT_PITCH, opts && opts.pitch);
  const L = p.L;
  const W = p.W;
  const goalW = Math.min(p.goalW, W - 2);
  const goalH = p.goalH;

  const root = new THREE.Group();
  root.name = 'stadium';
  scene.add(root);

  const prevBackground = scene.background;
  const prevFog = scene.fog;

  // ── sky + fog ──
  const skyTexNight = makeSkyTexture(true);
  const skyTexDay = makeSkyTexture(false);
  scene.background = new THREE.Color(0x04060d);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTexNight, side: THREE.BackSide, fog: false, depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(380, 24, 14), skyMat);
  sky.renderOrder = -10;
  root.add(sky);
  scene.fog = new THREE.Fog(0x070d18, 130, 420);

  // ── ground planes: far apron, run-off ring, pitch grass, line markings ──
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(L + 90, W + 90),
    new THREE.MeshStandardMaterial({ color: 0x0c100d, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  root.add(ground);

  const runoff = new THREE.Mesh(
    new THREE.PlaneGeometry(L + 17, W + 17),
    new THREE.MeshStandardMaterial({ color: 0x14211a, roughness: 1 })
  );
  runoff.rotation.x = -Math.PI / 2;
  runoff.position.y = -0.01;
  runoff.receiveShadow = true;
  root.add(runoff);

  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(L + 0.6, W + 0.6),
    new THREE.MeshStandardMaterial({ map: makeGrassTexture(L + 0.6, W + 0.6), roughness: 0.95 })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = 0.02;
  grass.receiveShadow = true;
  root.add(grass);

  const linesMat = new THREE.MeshStandardMaterial({
    map: makeLinesTexture(p),
    transparent: true,
    roughness: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const lines = new THREE.Mesh(new THREE.PlaneGeometry(L, W), linesMat);
  lines.rotation.x = -Math.PI / 2;
  lines.position.y = 0.045;
  lines.receiveShadow = true;
  lines.renderOrder = 1;
  root.add(lines);

  // ── goals (frames + box nets, both ends merged into two meshes) ──
  const frameGeoms = [];
  const netGeoms = [];
  const NET_DEPTH = 1.6;
  for (const sign of [1, -1]) {
    const gx = (sign * L) / 2;
    const bx = gx + sign * NET_DEPTH;
    // posts + crossbar
    for (const s of [-1, 1]) {
      const post = new THREE.CylinderGeometry(0.06, 0.06, goalH + 0.06, 12);
      post.translate(gx, (goalH + 0.06) / 2, (s * goalW) / 2);
      frameGeoms.push(post);
    }
    const bar = new THREE.CylinderGeometry(0.06, 0.06, goalW + 0.12, 12);
    bar.rotateX(Math.PI / 2);
    bar.translate(gx, goalH, 0);
    frameGeoms.push(bar);
    // box-frame net supports (back poles + top/bottom back bars)
    for (const s of [-1, 1]) {
      const pole = new THREE.CylinderGeometry(0.04, 0.04, goalH, 8);
      pole.translate(bx, goalH / 2, (s * goalW) / 2);
      frameGeoms.push(pole);
    }
    const backTop = new THREE.CylinderGeometry(0.04, 0.04, goalW, 8);
    backTop.rotateX(Math.PI / 2);
    backTop.translate(bx, goalH - 0.02, 0);
    frameGeoms.push(backTop);
    const backBot = new THREE.CylinderGeometry(0.04, 0.04, goalW, 8);
    backBot.rotateX(Math.PI / 2);
    backBot.translate(bx, 0.05, 0);
    frameGeoms.push(backBot);
    // net planes: back, top, two sides
    const back = new THREE.PlaneGeometry(goalW, goalH);
    back.rotateY(sign > 0 ? -Math.PI / 2 : Math.PI / 2);
    back.translate(bx, goalH / 2, 0);
    scaleUVs(back, goalW / 0.12, goalH / 0.12);
    netGeoms.push(back);
    const top = new THREE.PlaneGeometry(NET_DEPTH, goalW);
    top.rotateX(-Math.PI / 2);
    top.translate(gx + (sign * NET_DEPTH) / 2, goalH, 0);
    scaleUVs(top, NET_DEPTH / 0.12, goalW / 0.12);
    netGeoms.push(top);
    for (const s of [-1, 1]) {
      const sideP = new THREE.PlaneGeometry(NET_DEPTH, goalH);
      sideP.rotateY(Math.PI / 2);
      sideP.translate(gx + (sign * NET_DEPTH) / 2, goalH / 2, (s * goalW) / 2);
      scaleUVs(sideP, NET_DEPTH / 0.12, goalH / 0.12);
      netGeoms.push(sideP);
    }
  }
  const goalFrames = new THREE.Mesh(
    mergeGeoms(frameGeoms),
    new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.4, metalness: 0.15 })
  );
  goalFrames.castShadow = true;
  root.add(goalFrames);

  const netMesh = new THREE.Mesh(
    mergeGeoms(netGeoms),
    new THREE.MeshStandardMaterial({
      map: makeNetTexture(),
      color: 0xdfe6ea,
      alphaTest: 0.3,
      side: THREE.DoubleSide,
      roughness: 0.9,
    })
  );
  root.add(netMesh);

  // ── stadium bowl: two tiers on four sides + instanced seats + crowd ──
  // Small pitches get a taller, denser bowl so the crowd stays ~6-10k.
  const rowsT1 = Math.min(12, Math.max(ROWS_T1, Math.round((ROWS_T1 * 68) / W)));
  const rowsT2 = Math.min(16, Math.max(ROWS_T2, Math.round((ROWS_T2 * 68) / W)));
  const standGeoms = [];
  const seatCoords = []; // flat [x, stepTopY, z, ...]
  const v = new THREE.Vector3();
  const sides = [
    { len: L + 18, edge: W / 2 + STAND_GAP, rot: 0, tunnel: false },           // south
    { len: L + 18, edge: W / 2 + STAND_GAP, rot: Math.PI, tunnel: false },     // north
    { len: W + 18, edge: L / 2 + STAND_GAP, rot: Math.PI / 2, tunnel: false }, // east
    { len: W + 18, edge: L / 2 + STAND_GAP, rot: -Math.PI / 2, tunnel: true }, // west (tunnel)
  ];
  for (const s of sides) {
    const rows = [];
    for (let i = 0; i < rowsT1; i++) {
      rows.push({
        z: s.edge + i * ROW_DEPTH + ROW_DEPTH / 2,
        top: WALL_H + (i + 1) * RISE_T1,
        tier: 1,
      });
    }
    const z2 = s.edge + rowsT1 * ROW_DEPTH + WALKWAY;
    const base2 = WALL_H + rowsT1 * RISE_T1 + 1.5;
    for (let i = 0; i < rowsT2; i++) {
      rows.push({
        z: z2 + i * ROW_DEPTH + ROW_DEPTH / 2,
        top: base2 + (i + 1) * RISE_T2,
        tier: 2,
      });
    }
    const local = [];
    box(local, s.len, WALL_H + 0.7, 0.4, 0, (WALL_H + 0.7) / 2, s.edge - 0.2); // front wall
    for (const r of rows) box(local, s.len, r.top, ROW_DEPTH, 0, r.top / 2, r.z);
    const last = rows[rows.length - 1];
    box(local, s.len, last.top + 1.2, 0.4, 0, (last.top + 1.2) / 2, last.z + ROW_DEPTH / 2 + 0.2); // back wall
    for (const g of local) {
      g.rotateY(s.rot);
      standGeoms.push(g);
    }
    // seat positions on each step (local frame -> world)
    const nSeats = Math.floor((s.len - 2.4) / SEAT_DX);
    const x0 = (-(nSeats - 1) * SEAT_DX) / 2;
    for (const r of rows) {
      for (let k = 0; k < nSeats; k++) {
        if (k % 27 === 13) continue; // stair aisle
        const x = x0 + k * SEAT_DX;
        if (s.tunnel && r.tier === 1 && Math.abs(x) < 3.8) continue; // tunnel opening
        v.set(x, 0, r.z).applyAxisAngle(Y_AXIS, s.rot);
        seatCoords.push(v.x, r.top, v.z);
      }
    }
  }
  const stands = new THREE.Mesh(
    mergeGeoms(standGeoms),
    new THREE.MeshStandardMaterial({ color: 0x181c23, roughness: 0.95 })
  );
  root.add(stands);

  // seats
  const nSeatPos = seatCoords.length / 3;
  const seatMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.44, 0.46, 0.4),
    new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 }),
    nSeatPos
  );
  seatMesh.frustumCulled = false;
  {
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < nSeatPos; i++) {
      m4.makeTranslation(seatCoords[i * 3], seatCoords[i * 3 + 1] + 0.22, seatCoords[i * 3 + 2]);
      seatMesh.setMatrixAt(i, m4);
      if (Math.random() < 0.12) col.setHex(0x7e2233); // away-fan section splash
      else col.setHSL(0.62, 0.42, 0.15 + Math.random() * 0.08);
      seatMesh.setColorAt(i, col);
    }
    seatMesh.instanceMatrix.needsUpdate = true;
    if (seatMesh.instanceColor) seatMesh.instanceColor.needsUpdate = true;
  }
  root.add(seatMesh);

  // crowd (subset of seats), with per-instance animation data
  const crowdIdx = [];
  for (let i = 0; i < nSeatPos; i++) if (Math.random() < CROWD_FILL) crowdIdx.push(i);
  const cN = crowdIdx.length;
  const baseX = new Float32Array(cN);
  const baseY = new Float32Array(cN);
  const baseZ = new Float32Array(cN);
  const phase = new Float32Array(cN);
  const freqV = new Float32Array(cN);
  const ampV = new Float32Array(cN);
  const crowdMesh = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.17, 0.5, 3, 8),
    new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    cN
  );
  crowdMesh.frustumCulled = false;
  {
    const JACKETS = [0x22242c, 0x2e3138, 0x39404e, 0x1d2833, 0x2c3a2f, 0x41352b, 0x4b4b55, 0x2a2320];
    const SPLASH = [0xc23b3b, 0x2f5fd0, 0xe6e2d8, 0xd8a02c, 0x3f9e4d];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();
    for (let i = 0; i < cN; i++) {
      const si = crowdIdx[i];
      const x = seatCoords[si * 3];
      const y = seatCoords[si * 3 + 1] + 0.62;
      const z = seatCoords[si * 3 + 2];
      baseX[i] = x; baseY[i] = y; baseZ[i] = z;
      phase[i] = Math.random() * Math.PI * 2;
      freqV[i] = 0.85 + Math.random() * 0.3;
      ampV[i] = 0.7 + Math.random() * 0.6;
      eul.set(0, Math.random() * Math.PI * 2, 0);
      q.setFromEuler(eul);
      const s = 0.88 + Math.random() * 0.22;
      scl.set(s, s * (0.92 + Math.random() * 0.16), s);
      pos.set(x, y, z);
      m4.compose(pos, q, scl);
      crowdMesh.setMatrixAt(i, m4);
      if (Math.random() < 0.16) col.setHex(SPLASH[(Math.random() * SPLASH.length) | 0]);
      else col.setHex(JACKETS[(Math.random() * JACKETS.length) | 0]);
      crowdMesh.setColorAt(i, col);
    }
    crowdMesh.instanceMatrix.needsUpdate = true;
    if (crowdMesh.instanceColor) crowdMesh.instanceColor.needsUpdate = true;
  }
  root.add(crowdMesh);

  // ── floodlights: 4 corner towers, emissive lamp heads, light cones ──
  const poleGeoms = [];
  const headGeoms = [];
  const coneGeoms = [];
  const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [cx, cz] of corners) {
    const tx = cx * (L / 2 + 22);
    const tz = cz * (W / 2 + 22);
    const pole = new THREE.CylinderGeometry(0.45, 0.85, TOWER_H, 10);
    pole.translate(tx, TOWER_H / 2, tz);
    poleGeoms.push(pole);
    const cross = new THREE.CylinderGeometry(0.18, 0.18, 5.4, 8);
    cross.rotateX(Math.PI / 2);
    cross.rotateY(Math.atan2(tx, tz));
    cross.translate(tx, TOWER_H - 2, tz);
    poleGeoms.push(cross);
    // lamp head aimed at the pitch center
    const yaw = Math.atan2(-tx, -tz);
    const tilt = Math.atan2(TOWER_H, Math.hypot(tx, tz));
    const head = new THREE.BoxGeometry(5.2, 2.6, 0.5);
    head.rotateX(tilt * 0.85);
    head.rotateY(yaw);
    head.translate(tx, TOWER_H + 1.2, tz);
    headGeoms.push(head);
    // volumetric-style cone, apex at the head, opening toward the pitch
    const headPos = new THREE.Vector3(tx, TOWER_H + 1.2, tz);
    const target = new THREE.Vector3(cx * L * 0.15, 0, cz * W * 0.15);
    const dir = new THREE.Vector3().subVectors(target, headPos);
    const len = dir.length();
    const cone = new THREE.ConeGeometry(len * 0.3, len, 20, 1, true);
    cone.translate(0, -len / 2, 0); // apex at local origin
    cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(DOWN, dir.normalize()));
    cone.translate(headPos.x, headPos.y, headPos.z);
    coneGeoms.push(cone);
  }
  const poles = new THREE.Mesh(
    mergeGeoms(poleGeoms),
    new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.8, metalness: 0.3 })
  );
  root.add(poles);

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x11141a,
    emissive: 0xffffff,
    emissiveMap: makeLampTexture(),
    emissiveIntensity: 2.4,
    roughness: 0.6,
  });
  const heads = new THREE.Mesh(mergeGeoms(headGeoms), lampMat);
  root.add(heads);

  const coneMesh = new THREE.Mesh(
    mergeGeoms(coneGeoms),
    new THREE.MeshBasicMaterial({
      color: 0xaac8ff,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    })
  );
  coneMesh.renderOrder = 8;
  root.add(coneMesh);

  // ── lights: one shadow-casting spot + corner fills + ambient/hemisphere ──
  const spot = new THREE.SpotLight(0xf2f6ff, SPOT_INTENSITY, 0, 0.75, 0.45, 0);
  spot.position.set(L / 2 + 22, TOWER_H + 1, W / 2 + 22);
  spot.target.position.set(0, 0, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.camera.near = 20;
  spot.shadow.camera.far = 280;
  spot.shadow.bias = -0.0004;
  root.add(spot);
  root.add(spot.target);

  const fillSpots = [];
  for (const [cx, cz] of [[1, -1], [-1, 1], [-1, -1]]) {
    const f = new THREE.SpotLight(0xe8f0ff, FILL_INTENSITY, 0, 0.75, 0.6, 0);
    f.position.set(cx * (L / 2 + 22), TOWER_H + 1, cz * (W / 2 + 22));
    f.target.position.set(0, 0, 0);
    root.add(f);
    root.add(f.target);
    fillSpots.push(f);
  }
  const hemi = new THREE.HemisphereLight(0x8fb4e8, 0x0e1a12, 0.55);
  const amb = new THREE.AmbientLight(0x223048, 0.35);
  root.add(hemi);
  root.add(amb);

  // ── LED advertising boards ringing the pitch ──
  const ledTex = makeLedTexture();
  const ledGeoms = [];
  const bh = 0.9;
  const ledOff = 3.2;
  box(ledGeoms, L + 8, bh, 0.18, 0, bh / 2, W / 2 + ledOff);
  box(ledGeoms, L + 8, bh, 0.18, 0, bh / 2, -(W / 2 + ledOff));
  box(ledGeoms, 0.18, bh, W + 8, L / 2 + ledOff, bh / 2, 0);
  // west end is split to leave room for the tunnel
  const segLen = (W + 8 - 9) / 2;
  box(ledGeoms, 0.18, bh, segLen, -(L / 2 + ledOff), bh / 2, 4.5 + segLen / 2);
  box(ledGeoms, 0.18, bh, segLen, -(L / 2 + ledOff), bh / 2, -(4.5 + segLen / 2));
  const ledBoards = new THREE.Mesh(
    mergeGeoms(ledGeoms),
    new THREE.MeshBasicMaterial({ map: ledTex })
  );
  root.add(ledBoards);

  // ── tunnel behind the west (−x) goal ──
  const tunW = 6.4;
  const tunH = 3.3;
  const tunD = STAND_GAP + 4;
  const tunX = -L / 2 - 1.2 - tunD / 2;
  const tunGeoms = [];
  box(tunGeoms, tunD, tunH, 0.5, tunX, tunH / 2, -tunW / 2);
  box(tunGeoms, tunD, tunH, 0.5, tunX, tunH / 2, tunW / 2);
  box(tunGeoms, tunD + 0.4, 0.5, tunW + 0.8, tunX, tunH + 0.25, 0);
  box(tunGeoms, 0.5, tunH, tunW, tunX - tunD / 2 + 0.25, tunH / 2, 0);
  const tunnel = new THREE.Mesh(
    mergeGeoms(tunGeoms),
    new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 0.9 })
  );
  tunnel.castShadow = true;
  root.add(tunnel);
  const tunnelDark = new THREE.Mesh(
    new THREE.PlaneGeometry(tunW - 0.6, tunH - 0.3),
    new THREE.MeshBasicMaterial({ color: 0x010203 })
  );
  tunnelDark.rotateY(Math.PI / 2);
  tunnelDark.position.set(tunX - tunD / 2 + 0.56, (tunH - 0.3) / 2, 0);
  root.add(tunnelDark);
  const tunnelSign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 1.0),
    new THREE.MeshBasicMaterial({ map: makeSignTexture() })
  );
  tunnelSign.rotateY(Math.PI / 2);
  tunnelSign.position.set(-L / 2 - 1.05, tunH + 0.9, 0);
  root.add(tunnelSign);

  // ── dugouts on the south (+z) touchline ──
  const dugGeoms = [];
  for (const dx of [-7.5, 7.5]) {
    const dz = W / 2 + 5.2;
    box(dugGeoms, 5, 0.15, 1.9, dx, 0.07, dz);              // base
    box(dugGeoms, 5, 2.1, 0.12, dx, 1.05, dz + 0.9);        // back wall
    box(dugGeoms, 5.3, 0.12, 2.2, dx, 2.15, dz);            // roof
    box(dugGeoms, 0.12, 2.1, 1.9, dx - 2.5, 1.05, dz);      // side
    box(dugGeoms, 0.12, 2.1, 1.9, dx + 2.5, 1.05, dz);      // side
    box(dugGeoms, 4.6, 0.45, 0.4, dx, 0.35, dz + 0.5);      // bench
  }
  const dugouts = new THREE.Mesh(
    mergeGeoms(dugGeoms),
    new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.9 })
  );
  dugouts.castShadow = true;
  root.add(dugouts);

  // ── corner flags (poles merged; flag planes wave in update) ──
  const flagPoleGeoms = [];
  const flagMeshes = [];
  const flagBaseRot = [];
  const flagMat = new THREE.MeshBasicMaterial({ color: 0xd23c3c, side: THREE.DoubleSide });
  for (const [sx, sz] of corners) {
    const px = (sx * L) / 2;
    const pz = (sz * W) / 2;
    const pole = new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6);
    pole.translate(px, 0.8, pz);
    flagPoleGeoms.push(pole);
    const fg = new THREE.PlaneGeometry(0.42, 0.3);
    fg.translate(0.21, 0, 0); // hang off the pole
    const fm = new THREE.Mesh(fg, flagMat);
    fm.position.set(px, 1.42, pz);
    const baseRot = Math.atan2(-pz, -px) + Math.PI / 2;
    fm.rotation.y = baseRot;
    flagBaseRot.push(baseRot);
    flagMeshes.push(fm);
    root.add(fm);
  }
  const flagPoles = new THREE.Mesh(
    mergeGeoms(flagPoleGeoms),
    new THREE.MeshStandardMaterial({ color: 0xe8c93b, roughness: 0.6 })
  );
  root.add(flagPoles);

  // ── animation state + public handle ──
  let t = 0;
  let night = true;
  let excTarget = 0;
  let exc = 0;
  let pulseV = 0;
  let cursor = 0;
  const CHUNK = Math.max(1, Math.ceil(cN / 8)); // animate 1/8 of crowd per frame
  const carr = crowdMesh.instanceMatrix.array;

  function update(dt, camera) { // eslint-disable-line no-unused-vars
    const step = Math.min(dt || 0, 0.1);
    t += step;
    exc += (excTarget - exc) * Math.min(1, step * 2.5);
    pulseV *= Math.exp(-2.0 * step);
    const energy = Math.min(1, exc + pulseV);

    // crowd sway/bounce (rotating subset, cheap matrix translation writes)
    const amp = 0.02 + 0.3 * energy;
    const spd = 2.4 + 5.5 * energy;
    const sway = 0.02 * (0.3 + energy);
    const end = Math.min(cursor + CHUNK, cN);
    for (let i = cursor; i < end; i++) {
      const o = i * 16;
      const ph = phase[i];
      const j = Math.sin(t * spd * freqV[i] + ph);
      carr[o + 13] = baseY[i] + (j > 0 ? j * j : 0) * amp * ampV[i];
      carr[o + 12] = baseX[i] + Math.sin(t * 1.1 + ph * 1.7) * sway;
      carr[o + 14] = baseZ[i] + Math.cos(t * 0.9 + ph) * sway;
    }
    cursor = end >= cN ? 0 : end;
    crowdMesh.instanceMatrix.needsUpdate = true;

    // LED board scroll
    ledTex.offset.x = (t * 0.025) % 1;

    // floodlight flicker (subtle mains hum)
    if (night) {
      const fl = 0.97 + 0.03 * Math.sin(t * 43.7 + Math.sin(t * 17.3) * 2.0);
      lampMat.emissiveIntensity = 2.4 * fl;
      spot.intensity = SPOT_INTENSITY * fl;
    }

    // corner flag wave
    for (let i = 0; i < 4; i++) {
      flagMeshes[i].rotation.y = flagBaseRot[i] + Math.sin(t * 2.1 + i * 1.37) * 0.2;
      flagMeshes[i].rotation.z = Math.sin(t * 1.6 + i * 2.1) * 0.08;
    }
  }

  function setNight(isNight) {
    night = !!isNight;
    spot.visible = night;
    for (const f of fillSpots) f.visible = night;
    coneMesh.visible = night;
    lampMat.emissiveIntensity = night ? 2.4 : 0.25;
    skyMat.map = night ? skyTexNight : skyTexDay;
    skyMat.needsUpdate = true;
    scene.background.setHex(night ? 0x04060d : 0x6f87a3);
    if (scene.fog) scene.fog.color.setHex(night ? 0x070d18 : 0x7f93a8);
    hemi.intensity = night ? 0.55 : 1.05;
    amb.intensity = night ? 0.35 : 0.6;
  }

  function dispose() {
    scene.remove(root);
    scene.background = prevBackground;
    scene.fog = prevFog;
    root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          for (const k in m) {
            const val = m[k];
            if (val && val.isTexture) val.dispose();
          }
          m.dispose();
        }
      }
    });
  }

  return {
    update,
    crowd: {
      setExcitement(level) {
        excTarget = Math.min(1, Math.max(0, +level || 0));
      },
      pulse(strength) {
        pulseV = Math.max(pulseV, Math.min(1, Math.max(0, +strength || 0)));
      },
    },
    setNight,
    dispose,
  };
}
