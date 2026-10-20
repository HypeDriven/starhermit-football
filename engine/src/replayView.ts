// Render-only 3D playback of an archived online match. Loads the replay log embedded in the archived session
// state (replays.get → state.replay) and plays it on a virtual 30 Hz tick
// clock, interpolating between the 2 fps keyframes with the live snapshot
// rules. No net, no input, no audio. A bar at the bottom plays, pauses,
// seeks and exits.
import { frame } from "starhermit:engine";
import type { PerspectiveCamera, Scene } from "starhermit:scene";
import * as draw from "starhermit:draw";
import * as ui from "starhermit:ui";
import type { Hud } from "./hud.ts";
import { panel } from "./hud.ts";
import { FollowRig } from "./logic/camera.ts";
import { interpPlayer } from "./logic/interp.ts";
import type { BallEntity, InterpEntity } from "./logic/interp.ts";
import { TICK_HZ, eventIndexAfter, frameBlend, parseReplay, replayState, seekFrame } from "./logic/replay.ts";
import type { ReplayFrame, ReplayLog } from "./logic/replay.ts";
import { P, errorMessage } from "./platform.ts";
import { sim as footballSim } from "./sim.ts";
import { makeBall, rollBall } from "./world/ball.ts";
import type { Prop } from "./world/ball.ts";
import { HAIRS, TEAM_KITS, kitFor } from "./world/kits.ts";
import { createPlayerMesh } from "./world/player.ts";
import type { PlayerView } from "./world/player.ts";
import { buildStadium } from "./world/stadium.ts";
import { currentQuality } from "./quality.ts";
import { T } from "./i18n.ts";
import type { Stadium } from "./world/stadium.ts";

function entity(): InterpEntity {
  return {
    x: 0, y: 0, z: 0, vx: 0, vz: 0, facing: 0,
    anim: "idle", animSpeed: 0, phase: 0, kickT: 0, tackleT: 0, stunT: 0,
    diveT: 0, diveDir: 0, celebrateT: 0,
  };
}

export class ReplayViewer {
  private readonly S = footballSim();
  private readonly rig = new FollowRig();
  private readonly rng = this.S.makeRng(7);
  private stadium: Stadium | null = null;
  private ball: Prop | null = null;
  private readonly spin = { x: 0, z: 0 };
  private views: (PlayerView | undefined)[] = [];
  private players: (InterpEntity | undefined)[] = [];
  private readonly ballEnt: BallEntity;
  private log: ReplayLog | null = null;
  private vt = 0;
  private tEnd = 0;
  private playing = false;
  private frameIdx = 0;
  private evIdx = 0;
  private camA = Math.random() * Math.PI * 2;
  private disposed = false;
  private ready = false;
  private message: string | null = null;
  private unavailable = false;

  constructor(
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly hud: Hud,
    private readonly onExit: () => void,
  ) {
    this.ballEnt = { x: 0, y: this.S.BALL_R, z: 0, vx: 0, vy: 0, vz: 0, owner: null };
  }

  async load(sessionId: string): Promise<void> {
    this.message = T("Loading replay…");
    let data: unknown;
    try {
      data = await P.replays.get(sessionId);
    } catch (e) {
      this.fail(T("Replay unavailable.") + ` (${errorMessage(e)})`);
      return;
    }
    if (this.disposed) return;
    const log = parseReplay(replayState(data));
    if (!log) {
      this.fail(T("Replay unavailable."));
      return;
    }
    try {
      await this.build(log);
    } catch (e) {
      console.error("replay build failed", e instanceof Error ? e.message : String(e));
      this.fail(T("Replay unavailable."));
    }
  }

  private fail(text: string): void {
    this.message = text;
    this.unavailable = true;
  }

  private async build(log: ReplayLog): Promise<void> {
    const teamSize = log.teamSize;
    const stadium = await buildStadium(this.scene, this.S.pitchFor(teamSize), currentQuality(), () => !this.disposed);
    if (!stadium) return;
    if (this.disposed) {
      stadium.dispose();
      return;
    }
    this.stadium = stadium;
    stadium.crowd.setExcitement(0.5);
    this.ball = makeBall(this.S.BALL_R);
    this.scene.add(this.ball.mesh);

    for (const seat of log.roster) {
      const slot = seat.pid % teamSize;
      const role = this.S.roleForSlot(slot, teamSize);
      const view = createPlayerMesh({
        kit: kitFor(seat.team, role, slot),
        skin: this.rng(),
        hair: HAIRS[Math.floor(this.rng() * HAIRS.length)]!,
        name: seat.name,
        nameColor: TEAM_KITS[seat.team === 1 ? 1 : 0].plate,
        isYou: false,
      });
      this.scene.add(view.group);
      this.views[seat.pid] = view;
      this.players[seat.pid] = entity();
    }

    this.log = log;
    this.vt = log.frames[0]!.t;
    this.tEnd = log.frames[log.frames.length - 1]!.t;
    this.frameIdx = 0;
    this.evIdx = 0;
    this.hud.showHud(true);
    this.hud.setTeamNames(TEAM_KITS[0].label, TEAM_KITS[1].label);
    this.hud.setPower(0);
    this.message = null;
    this.playing = true;
    this.ready = true;
  }

  private handleEv(ev: Record<string, unknown>): void {
    const crowd = this.stadium?.crowd;
    if (!crowd) return;
    switch (ev["type"]) {
      case "goal":
        this.hud.banner(T(ev["ownGoal"] ? "OWN GOAL!" : "GOAL!"), 2600);
        crowd.pulse(ev["ownGoal"] ? 0.5 : 1);
        break;
      case "halftime":
        this.hud.banner(T("HALF TIME"), 3000);
        crowd.pulse(0.5);
        break;
      case "fulltime":
        this.hud.banner(T("FULL TIME"), 3200);
        crowd.pulse(0.7);
        break;
      // kickoff: the visuals already show the reset; no banner
    }
  }

  private seekTo(v: number): void {
    const log = this.log!;
    this.vt = Math.max(log.frames[0]!.t, Math.min(this.tEnd, v));
    // events behind the playhead are skipped, not re-fired
    this.evIdx = eventIndexAfter(log.evs, this.vt);
  }

  private togglePlay(): void {
    if (!this.ready || !this.log) return;
    if (!this.playing && this.vt >= this.tEnd) this.seekTo(this.log.frames[0]!.t); // replay from the top
    this.playing = !this.playing;
  }

  update(dt: number): void {
    const log = this.log;
    if (!this.ready || this.disposed || !log) return;
    this.stadium!.update(dt, this.camera.position);
    if (this.playing) {
      this.vt += dt * TICK_HZ;
      if (this.vt >= this.tEnd) {
        this.vt = this.tEnd;
        this.playing = false;
      }
    }
    const frames = log.frames;
    this.frameIdx = seekFrame(frames, this.frameIdx, this.vt);
    const a: ReplayFrame = frames[this.frameIdx]!;
    const b: ReplayFrame = frames[Math.min(this.frameIdx + 1, frames.length - 1)]!;
    const k = frameBlend(a, b, this.vt);

    // fire events the playhead crossed
    while (this.evIdx < log.evs.length && log.evs[this.evIdx]!.t <= this.vt) this.handleEv(log.evs[this.evIdx++]!.ev);

    // the live interpolation rules, minus extrapolation (the playhead stays
    // inside the recorded range)
    for (let i = 0; i < this.players.length; i++) {
      const pa = a.pl[i];
      const pb = b.pl[i];
      const p = this.players[i];
      if (!pa || !pb || !p) continue;
      interpPlayer(p, pa, pb, k, 0);
    }
    const ba = a.b;
    const bb = b.b;
    const ball = this.ballEnt;
    ball.x = ba.x + (bb.x - ba.x) * k;
    ball.y = Math.max(this.S.BALL_R, ba.y + (bb.y - ba.y) * k);
    ball.z = ba.z + (bb.z - ba.z) * k;
    ball.vx = bb.vx;
    ball.vy = bb.vy;
    ball.vz = bb.vz;
    ball.owner = bb.owner;

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const v = this.views[i];
      if (!v || !p) continue;
      v.place(p.x, p.y || 0, p.z, p.facing);
      v.update(dt, p);
    }
    rollBall(this.ball!.mesh, ball.x, ball.y, ball.z, ball.vx, ball.vz, dt, this.spin);

    // score and clock from the current frame pair
    this.hud.setScore(b.sc[0], b.sc[1]);
    this.hud.setClock(a.sec + (b.sec - a.sec) * k, b.half, log.halfLength);

    // slow orbit following the ball
    this.camA += dt * 0.045;
    this.rig.frame(
      { x: ball.x, y: 1, z: ball.z },
      { x: ball.x + Math.cos(this.camA) * 21, y: 10, z: ball.z + Math.sin(this.camA) * 21 },
      dt, 2,
    );
    this.camera.position.set(this.rig.pos.x, this.rig.pos.y, this.rig.pos.z);
    this.camera.lookAt(this.rig.look.x, this.rig.look.y, this.rig.look.z);
  }

  /** The message box and the play / seek / exit bar. */
  drawUi(): void {
    const f = frame();
    const s = f.scale;
    if (this.message) {
      const size = 14 * s;
      const tw = draw.measureText(this.message, { size }).width;
      const w = tw + 2.8 * 16 * s;
      const h = size + 2 * 16 * s;
      const x = f.width / 2 - w / 2;
      const y = f.height * 0.38 - h / 2;
      panel(x, y, w, h, 10 * s, s);
      draw.text(this.message, f.width / 2, y + (h - size) / 2, { size, color: "#c7d2dc", align: "center" });
    }
    if (!this.ready && !this.unavailable) return;
    const width = Math.min(560 * s, f.width * 0.92);
    const height = 64 * s;
    ui.setViewport({ x: (f.width - width) / 2, y: f.height - Math.max(18 * s, f.safeArea.bottom) - height, width, height });
    ui.panel("replay-bar", () => {
      ui.row("replay-row", () => {
        if (this.ready && this.log) {
          if (ui.id("replay-play").button(T(this.playing ? "PAUSE" : "PLAY"))) this.togglePlay();
          const shown = Math.round(this.vt);
          const v = ui.slider("Seek", shown, { min: this.log.frames[0]!.t, max: this.tEnd, step: 1, width: 240 });
          if (v !== shown) this.seekTo(v);
          if (this.log.truncated) ui.label(T("replay truncated"), { tone: "muted" });
        }
        if (ui.id("replay-exit").button(T("EXIT"))) this.onExit();
      }, { spacing: 12, align: "center" });
    });
    if (ui.back()) this.onExit();
  }

  dispose(): void {
    this.disposed = true;
    this.ready = false;
    for (const v of this.views) v?.dispose();
    this.views = [];
    this.players = [];
    this.ball?.dispose();
    this.ball = null;
    this.stadium?.dispose();
    this.stadium = null;
    this.log = null;
    this.hud.showHud(false);
  }
}
