// The match ball (a canvas-drawn pentagon pattern on a sphere) and the
// kickoff coin, as match.js, menuScene.js and replayview.js build them.
import { CylinderGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, SphereGeometry } from "starhermit:scene";
import { ResourceBag, canvasTexture, makeCanvas } from "./resources.ts";

export interface Prop {
  readonly mesh: Mesh;
  dispose(): void;
}

export function makeBall(radius: number): Prop {
  const bag = new ResourceBag();
  const [cv, g] = makeCanvas(128, 128);
  g.fillStyle = "#f4f4f4";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#1c1c1c";
  for (let i = 0; i < 9; i++) {
    const x = (i % 3) * 43 + 21;
    const y = Math.floor(i / 3) * 43 + 21;
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
      if (k) g.lineTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11);
      else g.moveTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11);
    }
    g.fill();
  }
  const tex = bag.add(canvasTexture(cv));
  tex.anisotropy = 4;
  const mesh = new Mesh(
    bag.add(new SphereGeometry(radius, 24, 18)),
    // glossy match ball: clearcoat catches the floodlights (and the stadium reflections)
    bag.add(new MeshPhysicalMaterial({ map: tex, roughness: 0.5, clearcoat: 0.9, clearcoatRoughness: 0.12 })),
  );
  mesh.castShadow = true;
  return { mesh, dispose: () => { mesh.removeFromParent(); bag.dispose(); } };
}

export function makeCoin(): Prop {
  const bag = new ResourceBag();
  const mesh = new Mesh(
    bag.add(new CylinderGeometry(0.12, 0.12, 0.02, 24)),
    // gold: it shines with the stadium environment (Reflections)
    bag.add(new MeshStandardMaterial({ color: 0xf7d774, metalness: 0.9, roughness: 0.25 })),
  );
  mesh.visible = false;
  return { mesh, dispose: () => { mesh.removeFromParent(); bag.dispose(); } };
}

/** The ball rolls with its ground velocity (the browser's rotation rule). */
export function rollBall(mesh: Mesh, x: number, y: number, z: number, vx: number, vz: number, dt: number, spin: { x: number; z: number }): void {
  mesh.position.set(x, y, z);
  spin.x += vx * dt * 2;
  spin.z -= vz * dt * 2;
  mesh.rotation.set(spin.x, 0, spin.z);
}
