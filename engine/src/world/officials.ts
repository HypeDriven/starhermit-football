// Injury / substitution ceremony extras (the browser's
// js/world/officials.js): a virtual referee, two stretcher carriers and the
// stretcher. Created when a snapshot first carries a ceremony and disposed
// when it clears. The humanoids follow snapshot entities
// [x, z, facing, anim, animSpeed, phase] with the players' conventions.
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from "starhermit:scene";
import type { Scene } from "starhermit:scene";
import type { CerEntity, CeremonySnap } from "../logic/interp.ts";
import type { PoseEntity } from "../logic/pose.ts";
import { createPlayerMesh } from "./player.ts";
import type { Kit, PlayerView } from "./player.ts";
import { ResourceBag } from "./resources.ts";

const REF_KIT: Kit = { shirt: "#161616", shorts: "#161616", socks: "#161616", number: null, gk: true };
const MEDIC_KIT: Kit = { shirt: "#f2f2f2", shorts: "#161616", socks: "#f2f2f2", number: null, gk: false };

function makeStretcher(bag: ResourceBag): Group {
  const g = new Group();
  const bedMat = bag.add(new MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.7 }));
  const poleMat = bag.add(new MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.4, metalness: 0.6 }));
  const legMat = bag.add(new MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.8 }));
  const bedGeo = bag.add(new BoxGeometry(1.9, 0.12, 0.6));
  const poleGeo = bag.add(new CylinderGeometry(0.03, 0.03, 2.3, 8));
  const legGeo = bag.add(new BoxGeometry(0.05, 0.3, 0.05));

  const bed = new Mesh(bedGeo, bedMat);
  bed.castShadow = true;
  g.add(bed);
  for (const sz of [-1, 1]) {
    const pole = new Mesh(poleGeo, poleMat);
    pole.rotation.set(0, 0, Math.PI / 2); // along x
    pole.position.set(0, 0.02, sz * 0.34);
    g.add(pole);
    for (const sx of [-1, 1]) {
      const leg = new Mesh(legGeo, legMat);
      leg.position.set(sx * 0.8, -0.18, sz * 0.24);
      g.add(leg);
    }
  }
  return g;
}

export interface CeremonyViews {
  update(dt: number, cer: CeremonySnap): void;
  dispose(): void;
}

function entity(): PoseEntity {
  return { anim: "idle", animSpeed: 0, phase: 0, kickT: 0, tackleT: 0, diveT: 0, diveDir: 0, celebrateT: 0 };
}

export function createCeremonyViews(scene: Scene): CeremonyViews {
  const bag = new ResourceBag();
  const ref = createPlayerMesh({ kit: REF_KIT, skin: 0.45, hair: "#141414", name: "REF", nameColor: "#4a4a4a" });
  const carriers: PlayerView[] = [0, 1].map((i) => {
    const v = createPlayerMesh({ kit: MEDIC_KIT, skin: 0.3 + i * 0.4, hair: i ? "#3b2314" : "#545454", name: "" });
    v.setNameVisible(false);
    return v;
  });
  const stretcher = makeStretcher(bag);

  const root = new Group();
  root.add(ref.group, carriers[0]!.group, carriers[1]!.group, stretcher);
  root.visible = false;
  scene.add(root);

  // Reused entity objects — no per-frame allocation.
  const refEnt = entity();
  const carEnts = [entity(), entity()];

  const drive = (view: PlayerView, ent: PoseEntity, e: CerEntity): void => {
    view.place(e[0], 0, e[1], e[2]);
    ent.anim = e[3];
    ent.animSpeed = e[4];
    ent.phase = e[5];
  };

  return {
    update(dt: number, cer: CeremonySnap): void {
      root.visible = true;
      drive(ref, refEnt, cer.ref);
      ref.update(dt, refEnt);
      for (let i = 0; i < 2; i++) {
        drive(carriers[i]!, carEnts[i]!, cer.ca[i]!);
        carriers[i]!.update(dt, carEnts[i]!);
      }
      stretcher.position.set(cer.st[0], cer.st[3], cer.st[1]);
      stretcher.rotation.set(0, -cer.st[2], 0);
    },
    dispose(): void {
      scene.remove(root);
      ref.dispose();
      carriers[0]!.dispose();
      carriers[1]!.dispose();
      bag.dispose();
    },
  };
}
