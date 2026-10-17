// The ambient backdrop behind the main menu (the browser's js/menuScene.js):
// a full AI-vs-AI match in the night stadium while the camera drifts
// cinematically around the pitch. The same shared sim (server.js) and the
// same stadium and player builders as a real match, stepped at the fixed
// rate with AI on every seat. No audio, no HUD.
import type { PerspectiveCamera, Scene } from "starhermit:scene";
import { sim as footballSim } from "./sim.ts";
import type { FootballSimApi, RosterSeat, SimEvent, SimInput, SimState } from "./sim.ts";
import { makeBall, rollBall } from "./world/ball.ts";
import type { Prop } from "./world/ball.ts";
import { HAIRS, TEAM_KITS, kitFor } from "./world/kits.ts";
import { createPlayerMesh } from "./world/player.ts";
import type { PlayerView } from "./world/player.ts";
import { buildStadium } from "./world/stadium.ts";
import { currentQuality } from "./quality.ts";
import type { Stadium } from "./world/stadium.ts";

const TEAM_SIZE = 5;

export class MenuScene {
  /** server.js loads on first use (onStart), not while modules evaluate. */
  private get S(): FootballSimApi {
    return footballSim();
  }
  private stadium: Stadium | null = null;
  private state: SimState | null = null;
  private views: PlayerView[] = [];
  private ball: Prop | null = null;
  private readonly spin = { x: 0, z: 0 };
  private camT = Math.random() * 100; // randomize the starting camera leg
  private wanted = false;
  /** The last build failed (the menu shows without its backdrop). */
  failed = false;
  private generation = 0;
  private readonly lookTarget = { x: 0, y: 1, z: 0 };
  private readonly inputs = new Map<number, SimInput>();

  constructor(private readonly scene: Scene, private readonly camera: PerspectiveCamera) {}

  /** Whether the backdrop is built and playing. */
  get running(): boolean {
    return this.wanted && !!this.stadium;
  }

  /** Whether a start is still building the stadium. */
  get loading(): boolean {
    return this.wanted && !this.stadium;
  }

  private newMatch(): void {
    this.S.clearAiPlans(this.state);
    const roster: RosterSeat[] = [];
    for (let i = 0; i < TEAM_SIZE * 2; i++) roster.push({ userId: null, name: this.S.takeAiName(), isAi: true });
    this.state = this.S.createMatch({ teamSize: TEAM_SIZE, roster, seed: (Math.random() * 1e9) | 0 });
    this.S.resetKickoff(this.state, Math.random() < 0.5 ? 0 : 1);
    this.buildViews();
  }

  private buildViews(): void {
    for (const v of this.views) v.dispose();
    this.views = [];
    for (const p of this.state!.players) {
      const view = createPlayerMesh({
        kit: kitFor(p.team, p.role, p.slot),
        skin: Math.random(),
        hair: HAIRS[(Math.random() * HAIRS.length) | 0]!,
        name: p.name,
        nameColor: TEAM_KITS[p.team === 1 ? 1 : 0].plate,
        isYou: false,
      });
      this.scene.add(view.group);
      this.views[p.id] = view;
    }
  }

  start(): void {
    if (this.wanted) return;
    this.wanted = true;
    const generation = ++this.generation;
    const alive = (): boolean => this.wanted && generation === this.generation;
    void buildStadium(this.scene, this.S.pitchFor(TEAM_SIZE), currentQuality(), alive).then((stadium) => {
      if (!stadium) return;
      if (!alive()) {
        stadium.dispose();
        return;
      }
      this.stadium = stadium;
      stadium.crowd.setExcitement(0.55);
      this.ball = makeBall(this.S.BALL_R);
      this.scene.add(this.ball.mesh);
      this.newMatch();
    }).catch((e: unknown) => {
      this.failed = true;
      console.error("menu backdrop build failed:", e instanceof Error ? e.message : String(e));
    });
  }

  stop(): void {
    if (!this.wanted) return;
    this.wanted = false;
    this.generation++;
    for (const v of this.views) v.dispose();
    this.views = [];
    this.ball?.dispose();
    this.ball = null;
    this.stadium?.dispose();
    this.stadium = null;
    this.S.clearAiPlans(this.state);
    this.state = null;
  }

  private handleEvent(ev: SimEvent): void {
    const crowd = this.stadium?.crowd;
    if (!crowd) return;
    switch (ev.type) {
      case "goal":
        crowd.pulse(1);
        break;
      case "woodwork":
        crowd.pulse(0.5);
        break;
      case "halftime":
      case "fulltime":
        crowd.pulse(0.7);
        break;
    }
  }

  /** One fixed step of the exhibition, AI on every seat. */
  fixedStep(step: number): void {
    const st = this.state;
    if (!this.running || !st) return;
    const inputs = this.inputs;
    inputs.clear();
    for (const p of st.players) inputs.set(p.id, this.S.computeAiInput(st, p, step));
    for (const ev of this.S.stepMatch(st, inputs, step)) this.handleEvent(ev);
  }

  update(dt: number): void {
    const st = this.state;
    if (!this.running || !st) return;
    if (st.phase === "end") {
      this.newMatch(); // full time → kick off a fresh exhibition
      return;
    }
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i]!;
      const v = this.views[i];
      if (!v) continue;
      v.place(p.x, 0, p.z, p.facing);
      v.update(dt, p);
    }
    rollBall(this.ball!.mesh, st.ball.x, st.ball.y, st.ball.z, st.ball.vx, st.ball.vz, dt, this.spin);

    // slow cinematic drift around the pitch, always easing toward the ball
    this.camT += dt;
    const a = this.camT * 0.055;
    const r = 58 + 16 * Math.sin(this.camT * 0.041);
    const h = 13 + 7 * Math.sin(this.camT * 0.031 + 1.3);
    this.camera.position.set(Math.cos(a) * r, Math.max(4, h), Math.sin(a) * r * 0.72);
    const lt = this.lookTarget;
    lt.x += (st.ball.x * 0.55 - lt.x) * Math.min(1, dt * 0.8);
    lt.z += (st.ball.z * 0.55 - lt.z) * Math.min(1, dt * 0.8);
    lt.y = 1;
    this.camera.lookAt(lt.x, lt.y, lt.z);
    if (this.camera.fov !== 55) this.camera.fov = 55;
    this.stadium!.update(dt, this.camera.position);
  }
}
