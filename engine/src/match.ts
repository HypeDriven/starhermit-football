// Match orchestration (the browser's js/match.js): scene population, the
// match flow (walkout → coin flip → halves → full time), netcode, audio and
// HUD wiring.
//
// Modes:
//   'practice' — the shared sim (server.js via loadClassic) stepped locally
//                at the fixed 60 Hz rate with AI on every other seat.
//   'online'   — server-authoritative: the platform runs server.js; inputs
//                go up at 30 Hz over the games socket and server-timed
//                snapshots are adaptively interpolated. Leave/rejoin, AI
//                stand-ins and the stretcher ceremony are the server's.
import { frame } from "starhermit:engine";
import { Vector3 } from "starhermit:scene";
import type { PerspectiveCamera, Scene } from "starhermit:scene";
import type { Participant } from "starhermit:platform";
import type { Audio } from "./audio.ts";
import type { Hud } from "./hud.ts";
import type { GameInput } from "./input.ts";
import { FollowRig, ballArrow } from "./logic/camera.ts";
import type { Arrow, ArrowBox } from "./logic/camera.ts";
import {
  ceremonyAt, createJitterState, interpBall, interpPlayer, noteArrival, parseSnap, pickPair, renderTime, snapTime, trimSnaps,
} from "./logic/interp.ts";
import type { CeremonySnap, InterpPair, ParsedSnap } from "./logic/interp.ts";
import { matchSeats } from "./logic/lobby.ts";
import { nextExcitement, stepIndex } from "./logic/presence.ts";
import { dribbleLead, reconcile, stepPrediction } from "./logic/predict.ts";
import type { Prediction } from "./logic/predict.ts";
import type { InputFrame } from "./logic/steering.ts";
import type { MatchChat } from "./chat.ts";
import { createMatchChat } from "./chat.ts";
import type { GameClient, RosterClient } from "./net.ts";
import { displayNameNow } from "./platform.ts";
import { sim as footballSim } from "./sim.ts";
import type { FootballSimApi, RosterSeat, SimEvent, SimInput, SimPlayer, SimState } from "./sim.ts";
import { makeBall, makeCoin, rollBall } from "./world/ball.ts";
import type { Prop } from "./world/ball.ts";
import { HAIRS, TEAM_KITS, kitFor } from "./world/kits.ts";
import { createCeremonyViews } from "./world/officials.ts";
import type { CeremonyViews } from "./world/officials.ts";
import { createPlayerMesh } from "./world/player.ts";
import type { PlayerView } from "./world/player.ts";
import { buildStadium } from "./world/stadium.ts";
import { ARROW_HALF } from "./hud.ts";
import { T, onLanguage } from "./i18n.ts";
import { currentQuality } from "./quality.ts";
import type { Stadium } from "./world/stadium.ts";

const INPUT_HZ = 30;

export type MatchPhase = "loading" | "walkout" | "coinflip" | "play" | "done" | "idle";

export interface MatchResult {
  score: [number, number];
  stats: SimState["stats"] | null;
  myTeam: number;
  winner: number;
  online: boolean;
  abandoned: boolean;
}

export interface MatchDeps {
  scene: Scene;
  camera: PerspectiveCamera;
  audio: Audio;
  input: GameInput;
  hud: Hud;
}

export interface RoomStart {
  room: { readonly id: string; readonly participants: readonly Participant[] };
  teamSize: number;
  myUserId: string | null;
  sessionId: string;
  net: GameClient;
  rosterNet: RosterClient | null;
  isRejoin: boolean;
}

const now = (): number => performance.now() / 1000;

export class MatchController {
  onFullTime: ((result: MatchResult) => void) | null = null;
  /** The world could not be built (the host refused a resource). */
  onFailed: ((message: string) => void) | null = null;
  readonly rig = new FollowRig();
  private readonly S: FootballSimApi = footballSim();
  private stadium: Stadium | null = null;
  private ball: Prop | null = null;
  private coin: Prop | null = null;
  private readonly ballSpin = { x: 0, z: 0 };
  private mode: "practice" | "online" = "practice";
  private state: SimState | null = null;
  private views: (PlayerView | undefined)[] = [];
  private myId = 0;
  private stage: MatchPhase = "idle";
  private phaseT = 0;
  private net: GameClient | null = null;
  private rosterNet: RosterClient | null = null;
  private chatBox: MatchChat | null = null;
  private inputTimer = 0;
  private inputSeq = 0;
  private snaps: ParsedSnap[] = [];
  private readonly jitter = createJitterState();
  private localKickFeedbackAt = -Infinity;
  private prediction: Prediction | null = null;
  private cerViews: CeremonyViews | null = null;
  private curCer: CeremonySnap | null = null;
  private timers: { at: number; fn: () => void }[] = [];
  private elapsed = 0;
  private rng: () => number;
  private excitement = 0.3;
  private lastStepCount = 0;
  private kickoffTeam = 0;
  private disposed = false;
  /** Bumped by cleanup: a world build in flight for an older match stops. */
  private build = 0;
  private readonly inputs = new Map<number, SimInput>();
  private readonly walkTargets: { x: number; z: number }[] = [];
  private readonly pair: InterpPair<ParsedSnap> = { a: null as unknown as ParsedSnap, b: null as unknown as ParsedSnap, k: 1, extrap: 0 };
  private readonly ballPoint = new Vector3();
  private readonly arrowBox: ArrowBox = { halfWidth: 0, halfHeight: 0, bottomReserve: 0, scale: 1 };
  /** Practice only: the local sim stops advancing while the match menu is
   * open. */
  private pausedFlag = false;
  private unsubscribeLanguage: (() => void) | null = null;
  private readonly arrow: Arrow = { visible: false, px: 0, py: 0, angleDeg: 0 };

  constructor(private readonly d: MatchDeps) {
    this.rng = this.S.makeRng(7);
    // The game language changed: the local player's tag reads "You" in it.
    this.unsubscribeLanguage = onLanguage(() => this.views[this.myId]?.setName(T("You")));
  }

  /** The practice match waits while its menu is open. */
  get paused(): boolean {
    return this.pausedFlag;
  }

  set paused(v: boolean) {
    this.pausedFlag = !!v && this.mode === "practice";
  }

  get matchMode(): "practice" | "online" {
    return this.mode;
  }

  get phase(): MatchPhase {
    return this.stage;
  }

  get sim(): SimState | null {
    return this.state;
  }

  get myPlayerId(): number {
    return this.myId;
  }

  get chat(): MatchChat | null {
    return this.chatBox;
  }

  get online(): boolean {
    return this.mode === "online";
  }

  // ── construction ──────────────────────────────────────────────────────────

  private async buildWorld(): Promise<boolean> {
    const build = ++this.build;
    const alive = (): boolean => !this.disposed && build === this.build;
    const st = this.state!;
    const stadium = await buildStadium(this.d.scene, st.pitch, currentQuality(), alive);
    if (!stadium) return false;
    if (!alive()) {
      stadium.dispose();
      return false;
    }
    this.stadium = stadium;
    this.ball = makeBall(this.S.BALL_R);
    this.d.scene.add(this.ball.mesh);
    this.coin = makeCoin();
    this.d.scene.add(this.coin.mesh);
    return true;
  }

  /** Display names: nametags show profile nicknames, not raw usernames.
   * Until a lookup lands the server-provided name shows; AI seats keep
   * their server nickname. */
  private nameFor(userId: string | null, fallback: string): string {
    if (!userId) return fallback;
    return displayNameNow(userId) ?? fallback;
  }

  private makeViewFor(p: SimPlayer, name?: string): PlayerView {
    const isMe = p.id === this.myId;
    const view = createPlayerMesh({
      kit: kitFor(p.team, p.role, p.slot),
      skin: this.rng(),
      hair: HAIRS[Math.floor(this.rng() * HAIRS.length)]!,
      name: isMe ? T("You") : name ?? p.name,
      nameColor: TEAM_KITS[p.team === 1 ? 1 : 0].plate,
      isYou: isMe,
    });
    this.d.scene.add(view.group);
    return view;
  }

  private buildPlayers(): void {
    for (const v of this.views) v?.dispose();
    this.views = [];
    for (const p of this.state!.players) this.views[p.id] = this.makeViewFor(p);
  }

  // ── public: start modes ───────────────────────────────────────────────────

  startPractice(teamSize: number, myName: string): void {
    this.cleanup();
    this.mode = "practice";
    this.myId = 0;
    const roster: RosterSeat[] = [{ userId: null, name: myName, isAi: false }];
    for (let i = 1; i < teamSize * 2; i++) roster.push({ userId: null, name: this.S.takeAiName(), isAi: true });
    this.state = this.S.createMatch({ teamSize, roster, seed: (Math.random() * 1e9) | 0 });
    this.kickoffTeam = Math.random() < 0.5 ? 0 : 1;
    void this.beginMatch(false);
  }

  startFromRoom(o: RoomStart): void {
    this.cleanup();
    this.net = o.net;
    this.rosterNet = o.rosterNet;
    this.mode = "online";
    this.chatBox = createMatchChat(o.sessionId, o.myUserId); // best-effort
    const seats = matchSeats(o.room.participants, o.teamSize);
    this.myId = seats.findIndex((s) => !!s && !!o.myUserId && s.userId === o.myUserId);
    if (this.myId < 0) this.myId = 0;
    this.state = this.S.createMatch({ teamSize: o.teamSize, roster: seats, seed: o.room.id.length || 42 });
    this.kickoffTeam = 0; // snapshots reconcile this (snap.kt)
    void this.beginMatch(o.isRejoin);
  }

  private async beginMatch(skipIntro: boolean): Promise<void> {
    const st = this.state!;
    this.S.clearAiPlans(st);
    this.stage = "loading";
    try {
      if (!(await this.buildWorld())) return;
      this.buildPlayers();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("match world build failed:", message);
      this.onFailed?.(message);
      return;
    }
    const { audio, hud, input } = this.d;
    if (skipIntro) {
      this.stage = "play"; // online rejoin: snapshots restore everything
    } else {
      if (this.mode === "practice") {
        st.kickoffTeam = this.kickoffTeam;
        this.S.resetKickoff(st, this.kickoffTeam);
      }
      this.stage = "walkout";
      this.phaseT = 8;
      this.walkoutSetup();
    }
    hud.showHud(true);
    hud.setTeamNames(TEAM_KITS[0].label, TEAM_KITS[1].label);
    if (this.chatBox) {
      this.chatBox.start();
      this.chatBox.setVisible(true);
    }
    input.showTouchUi(true);
    audio.crowd.setExcitement(0.6);
    this.stadium!.crowd.setExcitement(0.6);
    audio.crowd.cheer(skipIntro ? 0.4 : 0.9);
    if (!skipIntro) this.stadium!.crowd.pulse(0.8);
  }

  // walkout: players start at the tunnel and walk to formation (presentation)
  private walkoutSetup(): void {
    const st = this.state!;
    this.walkTargets.length = 0;
    const tx = -st.pitch.L / 2 - 6; // tunnel x
    for (const p of st.players) {
      this.walkTargets[p.id] = { x: p.x, z: p.z };
      p.x = tx + p.team * 1.2;
      p.z = (p.slot - (st.teamSize - 1) / 2) * 1.1;
      p.anim = "walk";
      p.animSpeed = this.S.WALK_SPEED;
      p.facing = 0;
    }
    this.rig.setYaw(0);
  }

  // ── fixed-rate stepping (practice) ────────────────────────────────────────

  /** One fixed step of the local authoritative sim (practice only). */
  fixedStep(step: number): void {
    if (this.disposed || this.mode !== "practice" || this.stage !== "play" || !this.state || this.pausedFlag) return;
    const st = this.state;
    const inputs = this.collectInputs(step);
    const events = this.S.stepMatch(st, inputs, step);
    for (const ev of events) this.handleSimEvent(ev);
  }

  private collectInputs(dt: number): Map<number, SimInput> {
    const st = this.state!;
    const inputs = this.inputs;
    inputs.clear();
    const raw = this.d.input.getState(this.rig.yaw, dt);
    inputs.set(this.myId, toSimInput(raw));
    this.d.hud.setPower(raw.shootHeld ? raw.shootCharge : 0);
    for (const p of st.players) {
      if (inputs.has(p.id)) continue;
      inputs.set(p.id, this.S.computeAiInput(st, p, dt));
    }
    return inputs;
  }

  // ── main update ───────────────────────────────────────────────────────────

  update(dt: number): void {
    if (!this.state || this.disposed || this.stage === "loading" || this.stage === "idle") return;
    this.stadium!.update(dt, this.d.camera.position);
    if (this.pausedFlag && this.mode === "practice") return;
    this.d.hud.setMenuButton(this.stage !== "done");
    if (this.stage === "walkout") {
      this.updateWalkout(dt);
      this.pumpTimers(dt);
      return;
    }
    if (this.stage === "coinflip") {
      this.updateCoinflip(dt);
      this.pumpTimers(dt);
      return;
    }
    if (this.stage === "done") {
      this.updateDone(dt);
      this.pumpTimers(dt);
      return;
    }
    // ── play ──
    if (this.mode === "online") this.updateOnline(dt);
    else if (this.state.phase === "end") this.finishMatch(null);
    this.pumpTimers(dt);
    this.syncViews(dt);
    this.updateHud();
    this.updateAudio(dt);
  }

  /** Phase-agnostic delayed calls (e.g. the boo that follows an injury gasp). */
  private schedule(delayS: number, fn: () => void): void {
    this.timers.push({ at: this.elapsed + delayS, fn });
  }

  private pumpTimers(dt: number): void {
    this.elapsed += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i]!;
      if (t.at <= this.elapsed) {
        this.timers.splice(i, 1);
        t.fn();
      }
    }
  }

  private updateWalkout(dt: number): void {
    const st = this.state!;
    this.phaseT -= dt;
    // camera: slow crane from the tunnel toward the center
    const c = 1 - Math.max(0, this.phaseT) / 8;
    this.rig.frame(
      { x: 0, y: 1, z: 0 },
      { x: -st.pitch.L / 2 - 12 + c * (st.pitch.L / 2 + 4), y: 3 + c * 9, z: 18 - c * 10 },
      dt, 3,
    );
    let arrived = 0;
    for (const p of st.players) {
      const tgt = this.walkTargets[p.id]!;
      const dx = tgt.x - p.x;
      const dz = tgt.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.3) {
        p.anim = "idle";
        p.animSpeed = 0;
        arrived++;
        continue;
      }
      const spd = Math.min(this.S.WALK_SPEED * 1.4, dist * 0.8 + 0.6);
      p.x += (dx / dist) * spd * dt;
      p.z += (dz / dist) * spd * dt;
      p.facing = Math.atan2(dz, dx);
      p.phase += dt * (2.2 + spd * 1.55);
    }
    this.syncViews(dt);
    if (this.phaseT <= 0 || arrived === st.players.length) {
      this.stage = "coinflip";
      this.phaseT = 4.5;
      this.coin!.mesh.visible = true;
      this.d.audio.coin();
      this.d.audio.crowd.cheer(0.5);
    }
  }

  private updateCoinflip(dt: number): void {
    this.phaseT -= dt;
    // close-up on the center circle, coin flipping
    this.rig.frame({ x: 0, y: 1, z: 0 }, { x: -3.5, y: 2.2, z: 3.5 }, dt, 4);
    const c = Math.max(0, this.phaseT);
    const coin = this.coin!.mesh;
    coin.position.set(0, 0.6 + Math.abs(Math.sin(c * 6)) * (c > 1 ? 1.2 : 0.2), 0);
    coin.rotation.set(coin.rotation.x + dt * 14, 0, coin.rotation.z + dt * 3);
    this.syncViews(dt);
    if (this.phaseT <= 0) {
      coin.visible = false;
      this.d.hud.banner(T("{team} KICKS OFF", { team: T(TEAM_KITS[this.kickoffTeam === 1 ? 1 : 0].label) }), 2200);
      this.stage = "play";
      this.d.audio.whistle("short");
      if (this.mode === "practice") this.S.resetKickoff(this.state!, this.kickoffTeam);
    }
  }

  private updateDone(dt: number): void {
    // slow orbit around the celebrating players
    const t = now();
    this.rig.frame({ x: 0, y: 1, z: 0 }, { x: Math.sin(t * 0.15) * 24, y: 12, z: Math.cos(t * 0.15) * 24 }, dt, 1.5);
    this.syncViews(dt);
  }

  // ── online: input upstream, snapshot interpolation downstream ─────────────

  private updateOnline(dt: number): void {
    const st = this.state!;
    // Movement at 30 Hz and action edges immediately; local contact feedback
    // does not wait for the round trip (authority still decides).
    this.inputTimer -= dt;
    const raw = this.d.input.getState(this.rig.yaw, dt);
    this.d.hud.setPower(raw.shootHeld ? raw.shootCharge : 0);
    if (raw.pass || raw.shoot > 0) {
      this.localKickFeedbackAt = now();
      this.d.audio.kick(raw.shoot > 0 ? 0.4 + raw.shoot * 0.6 : 0.35);
    }
    if (this.inputTimer <= 0 || raw.pass || raw.shoot > 0 || raw.tackle) {
      this.inputTimer = 1 / INPUT_HZ;
      const cmd = toSimInput(raw);
      this.net?.sendInput({ seq: ++this.inputSeq, ...cmd });
    }
    if (this.prediction) {
      stepPrediction(this.prediction, raw, dt, this.S, st.ball.owner === this.myId, st.pitch.L, st.pitch.W);
    }
    this.applyInterp();
    const me = st.players[this.myId];
    const pred = this.prediction;
    if (me && pred) {
      me.x = pred.x;
      me.z = pred.z;
      me.vx = pred.vx;
      me.vz = pred.vz;
      if (raw.turn != null) me.facing = pred.facing;
      else if (Math.hypot(me.vx, me.vz) > 0.35) me.facing = Math.atan2(me.vz, me.vx);
    }
    if (me && now() - this.localKickFeedbackAt < 0.35) me.kickT = Math.max(me.kickT || 0, 0.2);
    // Own-ball render: glue the ball to the predicted carrier with the
    // server's dribble formula (render only, until ownership changes).
    if (me && pred && st.ball.owner === this.myId) {
      const lead = dribbleLead(me.vx, me.vz);
      st.ball.x = me.x + Math.cos(me.facing) * lead;
      st.ball.z = me.z + Math.sin(me.facing) * lead;
      st.ball.y = this.S.BALL_R;
      st.ball.vx = me.vx;
      st.ball.vy = 0;
      st.ball.vz = me.vz;
    }
  }

  private applyInterp(): void {
    const st = this.state!;
    const n = this.snaps.length;
    if (!n) return;
    const rt = renderTime(this.snaps[n - 1]!, now(), this.jitter.interpDelay);
    const pair = pickPair(this.snaps, rt, this.pair);
    if (!pair) return;
    const { a, b, k, extrap } = pair;
    for (let i = 0; i < st.players.length; i++) {
      const pa = a.pl[i];
      const pb = b.pl[i];
      if (!pa || !pb) continue;
      interpPlayer(st.players[i]!, pa, pb, k, extrap);
    }
    interpBall(st.ball, a.b, b.b, k, extrap, this.S.BALL_R, this.S.GRAVITY);
    this.curCer = ceremonyAt(a, b, k);
  }

  onSnapshot(snap: Record<string, unknown>): void {
    if (this.mode !== "online" || !this.state) return;
    const parsed = parseSnap(snap);
    if (!parsed) return;
    const st = this.state;
    const arrived = now();
    parsed.arrived = arrived;
    parsed.at = snapTime(snap["ts"], arrived);
    noteArrival(this.jitter, arrived, parsed.at);

    const authoritativeMe = parsed.pl[this.myId];
    if (authoritativeMe) {
      this.prediction = reconcile(this.prediction, authoritativeMe, this.jitter.interpDelay, Number(parsed.ack[this.myId]), this.inputSeq);
    }

    this.snaps.push(parsed);
    trimSnaps(this.snaps, parsed.at);

    // reconcile flow state
    st.score[0] = parsed.sc[0];
    st.score[1] = parsed.sc[1];
    st.time = parsed.t;
    st.half = parsed.h;
    st.phase = parsed.ph as SimState["phase"];
    this.kickoffTeam = parsed.kt;

    // names / isAi ride in the snapshot (substitutions even if the roster
    // push lags); rebuild a name tag when a player's name changes
    for (let i = 0; i < parsed.pl.length && i < st.players.length; i++) {
      const ps = parsed.pl[i]!;
      const p = st.players[i]!;
      p.isAi = !!ps.isAi;
      this.rename(i, p, this.nameFor(p.userId, ps.name));
    }

    if (this.stage !== "done" && this.stage !== "loading" && parsed.ph === "end") this.finishMatch(null);
  }

  /** Resync after an outage: drop prediction and the snapshot timeline. */
  onResumed(): void {
    this.snaps = [];
    this.prediction = null;
  }

  private rename(seat: number, p: SimPlayer, nm: string): void {
    if (!nm || nm === p.name) return;
    p.name = nm;
    const old = this.views[seat];
    if (old) {
      old.dispose();
      this.views[seat] = this.makeViewFor(p);
    }
  }

  /** The server roster changed (a leaver's seat became AI): re-apply
   * names and flags. */
  applyRoster(participants: readonly Participant[]): void {
    const st = this.state;
    if (!st) return;
    for (const part of participants) {
      if ((part as unknown as { leftAt?: unknown }).leftAt) continue;
      const seat = part.team * st.teamSize + part.slot;
      const p = st.players[seat];
      if (!p) continue;
      p.isAi = !!part.isAi;
      this.rename(seat, p, this.nameFor(part.userId, part.username));
    }
  }

  onNetEvent(ev: Record<string, unknown>): void {
    if (!ev || typeof ev !== "object" || typeof ev["type"] !== "string") return;
    this.handleSimEvent(ev as unknown as SimEvent);
  }

  // ── events → audio / banners / crowd ──────────────────────────────────────

  private handleSimEvent(ev: SimEvent): void {
    const { audio, hud } = this.d;
    const stadium = this.stadium;
    const st = this.state;
    if (!stadium || !st) return;
    switch (ev.type) {
      case "kick":
        // Our own contact already played on input; avoid a delayed echo.
        if (!(this.mode === "online" && ev.player === this.myId && now() - this.localKickFeedbackAt < 1)) audio.kick(ev.power ?? 0.4);
        break;
      case "bounce":
        if ((ev.power ?? 0) > 0.25) audio.bounce(ev.power ?? 0);
        break;
      case "steal":
      case "tackle":
        audio.tackle();
        break;
      case "dive":
        audio.dive();
        audio.crowd.anticipation();
        break;
      case "woodwork":
        audio.crowd.gasp();
        audio.crowd.ooh();
        stadium.crowd.pulse(0.5);
        break;
      case "goal": {
        const isHome = ev.team === 0;
        if (ev.ownGoal) {
          // a gasp first, then a muted cheer — the stadium isn't sure how to feel
          audio.crowd.gasp();
          audio.crowd.cheer(0.5);
          stadium.crowd.pulse(0.5);
          hud.banner(T("OWN GOAL!"), 2600);
        } else {
          audio.crowd.goal(isHome);
          stadium.crowd.pulse(1);
          hud.banner(T("GOAL!"), 2600);
        }
        audio.whistle("short");
        hud.setScore(st.score[0], st.score[1]);
        break;
      }
      case "restart": // sideline / goalline / drop-ball
        audio.whistle("short");
        break;
      case "halftime":
        audio.whistle("long");
        hud.banner(T("HALF TIME"), 3000);
        break;
      case "kickoff":
        audio.whistle("short");
        break;
      case "fulltime": {
        audio.whistle("long");
        hud.banner(T("FULL TIME"), 3200);
        const won = ev.winner === st.players[this.myId]?.team;
        if (ev.winner === -1) audio.crowd.cheer(0.5);
        else if (won) {
          audio.crowd.cheer(1);
          stadium.crowd.pulse(1);
        } else audio.crowd.cheer(0.3);
        break;
      }
      // ── ceremony / session events (server-owned) ──
      case "injury-start":
        audio.injury();
        audio.crowd.gasp();
        if (ev.kind === "leave") {
          hud.banner(T("INJURY — {name} CAN'T CONTINUE", { name: ev.name ?? "" }), 3200);
          // the crowd turns on the leaver a beat later
          this.schedule(1, () => {
            audio.crowd.boo(0.9);
            this.stadium?.crowd.boo(0.9);
          });
        }
        break;
      case "referee-whistle":
        audio.whistle("short");
        break;
      case "stretcher-load":
      case "stretcher-off":
        break; // visuals only (ceremony views)
      case "substitution":
        audio.crowd.cheer(0.8);
        stadium.crowd.pulse(0.8);
        hud.banner(T(ev.kind === "rejoin" ? "{name} IS BACK" : "{name} COMES ON", { name: ev.inName ?? "" }), 2800);
        break;
      case "abandoned-draw":
        audio.whistle("long");
        hud.banner(T("MATCH ABANDONED — DRAW"), 4200);
        this.finishMatch(-1, true);
        break;
    }
  }

  // ── crowd excitement follows the action ───────────────────────────────────

  private updateAudio(dt: number): void {
    const st = this.state!;
    this.excitement = nextExcitement(this.excitement, st.ball.x, st.pitch.L, dt);
    this.d.audio.crowd.setExcitement(this.excitement);
    this.stadium!.crowd.setExcitement(this.excitement);
    // own footsteps at cadence
    const me = st.players[this.myId];
    if (me && (me.anim === "run" || me.anim === "sprint")) {
      const steps = stepIndex(me.phase);
      if (steps !== this.lastStepCount) {
        this.lastStepCount = steps;
        this.d.audio.footstep();
        if (me.anim === "sprint") this.d.input.tick();
      }
    }
  }

  // ── view sync + HUD ───────────────────────────────────────────────────────

  private syncViews(dt: number): void {
    const st = this.state!;
    // Consume mouse look once per rendered frame (not once per fixed step),
    // so camera sensitivity is independent of frame rate.
    const lookDelta = this.d.input.consumeLookDelta(dt);
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i]!;
      const v = this.views[i];
      if (!v) continue;
      v.place(p.x, p.y || 0, p.z, p.facing);
      v.update(dt, p);
    }
    rollBall(this.ball!.mesh, st.ball.x, st.ball.y, st.ball.z, st.ball.vx, st.ball.vz, dt, this.ballSpin);

    // ceremony extras live only while the snapshot carries a ceremony
    if (this.curCer) {
      if (!this.cerViews) this.cerViews = createCeremonyViews(this.d.scene);
      this.cerViews.update(dt, this.curCer);
    } else if (this.cerViews) {
      this.cerViews.dispose();
      this.cerViews = null;
    }

    let following = false;
    if (this.stage === "play") {
      if (this.curCer) {
        // cutscene: frame the injury spot from the south sideline
        const sp = this.curCer.sp;
        this.rig.frame({ x: sp[0], y: 1, z: sp[1] }, { x: sp[0] + 3, y: 4.5, z: sp[1] + 11 }, dt, 2.5);
      } else {
        const me = st.players[this.myId];
        if (me) {
          this.rig.update(dt, me, st.ball, lookDelta.x, lookDelta.y);
          following = true;
        }
      }
    }
    this.applyCamera();
    this.updateBallArrow(following);
  }

  /** Copies the rig onto the scene camera. */
  applyCamera(): void {
    const cam = this.d.camera;
    const r = this.rig;
    cam.position.set(r.pos.x, r.pos.y, r.pos.z);
    cam.lookAt(r.look.x, r.look.y, r.look.z);
    if (Math.abs(cam.fov - r.fov) > 0.05) cam.fov = r.fov;
  }

  private updateBallArrow(following: boolean): void {
    const st = this.state!;
    const me = st.players[this.myId];
    if (!following || !me) {
      this.d.hud.setArrow(null, 0);
      return;
    }
    const b = st.ball;
    const f = frame();
    const bp = this.ballPoint.set(b.x, b.y, b.z).project(this.d.camera);
    const sc = f.scale;
    const box = this.arrowBox;
    box.halfWidth = ARROW_HALF.width * sc;
    box.halfHeight = ARROW_HALF.height * sc;
    box.scale = sc;
    // keep clear of the touch controls while they show
    box.bottomReserve = this.d.input.touchMode ? Math.min(f.height * 0.3, 190 * sc) : 0;
    ballArrow(bp, f.width, f.height, box, this.arrow);
    this.d.hud.setArrow(this.arrow.visible ? this.arrow : null, Math.hypot(b.x - me.x, b.z - me.z));
  }

  private updateHud(): void {
    const st = this.state!;
    this.d.hud.setClock(st.time, st.half, st.halfLength);
    this.d.hud.setScore(st.score[0], st.score[1]);
    this.d.hud.setMouseHint(!this.d.input.touchMode && !this.d.input.pointerLocked);
  }

  private finishMatch(winner: number | null, abandoned = false): void {
    if (this.stage === "done") return;
    const st = this.state!;
    this.stage = "done";
    this.d.hud.setPower(0);
    this.d.hud.setArrow(null, 0);
    const w = winner ?? (st.score[0] === st.score[1] ? -1 : st.score[0] > st.score[1] ? 0 : 1);
    const result: MatchResult = {
      score: [st.score[0], st.score[1]],
      stats: this.mode === "practice" ? st.stats : null, // the server owns online stats
      myTeam: st.players[this.myId]?.team ?? 0,
      winner: w,
      online: this.mode === "online",
      abandoned,
    };
    setTimeout(() => {
      if (!this.disposed) this.onFullTime?.(result);
    }, 4500);
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  private cleanup(): void {
    this.build++;
    this.chatBox?.dispose();
    this.chatBox = null;
    for (const v of this.views) v?.dispose();
    this.views = [];
    this.stadium?.dispose();
    this.stadium = null;
    this.ball?.dispose();
    this.ball = null;
    this.coin?.dispose();
    this.coin = null;
    this.cerViews?.dispose();
    this.cerViews = null;
    this.curCer = null;
    this.snaps = [];
    const fresh = createJitterState();
    Object.assign(this.jitter, fresh);
    this.localKickFeedbackAt = -Infinity;
    this.prediction = null;
    this.timers = [];
    this.elapsed = 0;
    this.inputTimer = 0;
    this.inputSeq = 0;
    this.excitement = 0.3;
    this.stage = "idle";
    this.pausedFlag = false;
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribeLanguage?.();
    this.unsubscribeLanguage = null;
    this.cleanup();
    this.net?.close();
    this.net = null;
    this.rosterNet?.close();
    this.rosterNet = null;
    this.d.input.showTouchUi(false);
    this.d.hud.showHud(false);
  }
}

function toSimInput(raw: InputFrame): SimInput {
  const out: SimInput = { mx: raw.mx, mz: raw.mz, sprint: raw.sprint, pass: raw.pass, shoot: raw.shoot, tackle: raw.tackle };
  // Desktop steering (tank controls); touch omits these and stays on mx/mz.
  if (raw.turn != null) {
    out.turn = raw.turn;
    out.fwd = raw.fwd ?? 0;
  }
  return out;
}
