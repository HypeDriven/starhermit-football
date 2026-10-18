// The match ball (a canvas-drawn pentagon pattern on a sphere) and the
// kickoff coin, as match.js, menuScene.js and replayview.js build them.
import { CylinderGeometry, Mesh, MeshStandardMaterial, SphereGeometry } from "starhermit:scene";
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
  // The browser's glossy MeshPhysicalMaterial (clearcoat 0.9) has no host
  // counterpart; the standard material keeps its roughness.
  const mesh = new Mesh(
    bag.add(new SphereGeometry(radius, 24, 18)),
    bag.add(new MeshStandardMaterial({ map: tex, roughness: 0.5 })),
  );
  mesh.castShadow = true;
  return { mesh, dispose: () => { mesh.removeFromParent(); bag.dispose(); } };
}

export function makeCoin(): Prop {
  const bag = new ResourceBag();
  const mesh = new Mesh(
    bag.add(new CylinderGeometry(0.12, 0.12, 0.02, 24)),
    // The browser's gold (metalness 0.9, roughness 0.25) shines with the
    // environment map Reflections adds; the host has no environment, where
    // such a metal shows almost black, so the coin is less metallic with a
    // faint gold glow standing in for the reflection.
    bag.add(new MeshStandardMaterial({ color: 0xf7d774, metalness: 0.45, roughness: 0.3, emissive: 0x4a3810 })),
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
