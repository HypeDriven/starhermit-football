// officials.js — injury/substitution ceremony extras: a virtual referee, two
// stretcher carriers and the stretcher prop. Views are created lazily by the
// match controller when snap.cer first appears and disposed when it clears.
// All three humanoids are driven by snapshot entities [x, z, facing, anim,
// animSpeed, phase] with the same conventions as players.
import * as THREE from 'three';
import { createPlayerMesh } from './player.js';

const REF_KIT = { shirt: '#161616', shorts: '#161616', socks: '#161616', number: null, gk: true };
const MEDIC_KIT = { shirt: '#f2f2f2', shorts: '#161616', socks: '#f2f2f2', number: null, gk: false };

function makeStretcher() {
  const g = new THREE.Group();
  const bedMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.7 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.4, metalness: 0.6 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.8 });

  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.6), bedMat);
  bed.castShadow = true;
  g.add(bed);

  for (const sz of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 8), poleMat);
    pole.rotation.z = Math.PI / 2; // along x
    pole.position.set(0, 0.02, sz * 0.34);
    g.add(pole);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), legMat);
      leg.position.set(sx * 0.8, -0.18, sz * 0.24);
      g.add(leg);
    }
  }
  return g;
}

export function createCeremonyViews(scene) {
  const ref = createPlayerMesh({
    kit: REF_KIT, skin: 0.45, hair: '#141414', name: 'REF', nameColor: '#4a4a4a',
  });
  const carriers = [0, 1].map((i) => {
    const v = createPlayerMesh({
      kit: MEDIC_KIT, skin: 0.3 + i * 0.4, hair: i ? '#3b2314' : '#545454', name: '',
    });
    v.setNameVisible(false);
    return v;
  });
  const stretcher = makeStretcher();

  const root = new THREE.Group();
  root.add(ref.group, carriers[0].group, carriers[1].group, stretcher);
  root.visible = false;
  scene.add(root);

  // Reused ent objects — no per-frame allocation.
  const refEnt = { anim: 'idle', animSpeed: 0, phase: 0, kickT: 0, tackleT: 0, diveT: 0, diveDir: 0, celebrateT: 0 };
  const carEnts = [
    { ...refEnt }, { ...refEnt },
  ];

  function driveHumanoid(view, ent, e) {
    // e = [x, z, facing, anim, animSpeed, phase] (already interpolated)
    view.group.position.set(e[0], 0, e[1]);
    view.group.rotation.y = -e[2];
    ent.anim = e[3];
    ent.animSpeed = e[4];
    ent.phase = e[5];
  }

  return {
    // cer = interpolated ceremony: { ref, ca: [c0, c1], st } (server layouts)
    update(dt, cer) {
      root.visible = true;
      driveHumanoid(ref, refEnt, cer.ref);
      ref.update(dt, refEnt);
      for (let i = 0; i < 2; i++) {
        driveHumanoid(carriers[i], carEnts[i], cer.ca[i]);
        carriers[i].update(dt, carEnts[i]);
      }
      stretcher.position.set(cer.st[0], cer.st[3] ? 0.7 : 0.2, cer.st[1]);
      stretcher.rotation.y = -cer.st[2];
    },
    dispose() {
      scene.remove(root);
      ref.dispose();
      carriers[0].dispose();
      carriers[1].dispose();
      stretcher.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    },
  };
}
