// StarHermit Football — the game's entry: boot, the screens state machine (menu → lobby → match →
// result, leaderboard, replays and the replay viewer, achievements), the
// in-match menu, SETTINGS, the scene camera and the match lifecycle, on the
// StarHermit runtime's host API v1. The match simulation is server.js, shared
// with the platform (see sim.ts); the strings are the game's tables (see
// i18n.ts).
import { frame, onFixedUpdate, onRender, onStart, onUpdate, openMenu, setFixedRate } from "starhermit:engine";
import type { JsonValue } from "starhermit:engine";
import { ACESFilmicToneMapping, PerspectiveCamera, renderer, scene } from "starhermit:scene";
import { createImageBitmap } from "starhermit:canvas";
import type { ImageBitmap, OffscreenCanvas } from "starhermit:canvas";
import type { CanvasTexture } from "starhermit:scene";
import { canvasTexture, makeCanvas } from "./world/resources.ts";
import { exitPointerLock, gamepads, onKey, onPointerButton, onTouch, pointerLocked, primaryPointer } from "starhermit:input";
import { settings } from "starhermit:storage";
import type { Room, RoomInvite } from "starhermit:platform";
import * as draw from "starhermit:draw";
import * as ui from "starhermit:ui";
import { createAudio } from "./audio.ts";
import { ACCENT, BORDER, MUTED, TEXT, createHud } from "./hud.ts";
import { T, loadLanguages, platformStrings, refreshLanguage, upper } from "./i18n.ts";
import { createInput } from "./input.ts";
import { resultTitle, statsLines } from "./logic/format.ts";
import type { MatchStats } from "./logic/format.ts";
import { isPlaying, seatsPerTeam } from "./logic/lobby.ts";
import { MatchController } from "./match.ts";
import type { MatchResult } from "./match.ts";
import { MenuScene } from "./menuScene.ts";
import { GameClient, RosterClient } from "./net.ts";
import { P, copyText, displayNameNow, errorMessage, inviteLinkNow, me } from "./platform.ts";
import { loadingFraction } from "./progress.ts";
import { pollQuality } from "./quality.ts";
import { ReplayViewer } from "./replayView.ts";
import { AchievementsScreen } from "./screens/achievements.ts";
import { ControlsScreen } from "./screens/controls.ts";
import { LeaderboardScreen } from "./screens/leaderboard.ts";
import { Lobby } from "./screens/lobby.ts";
import { ReplaysScreen } from "./screens/replays.ts";
import { SettingsPanel } from "./screens/settings.ts";
import { sim } from "./sim.ts";
import { createVoice } from "./voice.ts";

// ── renderer ──
// Resolution and frame pacing are the runtime's; the game sets tone mapping
// (ACES filmic), and the stadium sets shadows, reflections and the
// post effects (ambient occlusion, bloom, grade, anti-aliasing) per quality
// tier.
const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 800);
camera.position.set(0, 20, -30);
renderer.camera = camera;
renderer.shadowMap.enabled = true;
renderer.bloom = null;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// ── services ──
const audio = createAudio();
const input = createInput();
const hud = createHud();
const voice = createVoice();
const menuScene = new MenuScene(scene, camera);

type Screen = "menu" | "lobby" | "controls" | "leaderboard" | "replays" | "achievements" | "result" | "none";

let match: MatchController | null = null;
let replay: ReplayViewer | null = null;
let teamSize = 5;
let screen: Screen = "menu";
let status = "";
let booted = false;
let activeRoom: Room | null = null; // the room the server says we are still in
let matchRoom: Room | null = null; // the room the current match is played in (Esc-leave)
let matchMenu = false;
let invites: RoomInvite[] = [];
let result: { title: string; score: string; stats: MatchStats | null; rank: string } | null = null;
let rankSeq = 0;

interface Confirm {
  title: string;
  text: string;
  yes: string;
  no: string;
  primaryYes: boolean;
  /** Runs inside the yes button's frame (a press: sign-in needs one). */
  onYes?: () => void;
  resolve(ok: boolean): void;
}
let confirm: Confirm | null = null;

const TEAM_SIZES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];

function showScreen(s: Screen): void {
  screen = s;
}

function setStatus(t: string): void {
  status = t;
}

// ── active room (rejoin / leave prompts) ──
async function refreshActiveRoom(): Promise<void> {
  if (!me()) {
    activeRoom = null;
    return;
  }
  try {
    activeRoom = await P.rooms.mine();
  } catch {
    activeRoom = null;
  }
}

/** The in-game modal confirm. */
function uiConfirm(c: Omit<Confirm, "resolve" | "primaryYes"> & { primaryYes?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    confirm?.resolve(false);
    confirm = { ...c, primaryYes: !!c.primaryYes, resolve };
  });
}

/** The runtime's Account dialog, from a press's frame; the Options menu
 * where a build refuses it. */
function signIn(): void {
  try {
    P.requestSignIn().catch(() => openMenu());
  } catch {
    openMenu();
  }
}

/** Guards anything that starts a new game while the server still has us
 * in a room. */
async function confirmLeaveActiveRoom(): Promise<boolean> {
  if (!activeRoom) return true;
  const playing = isPlaying(activeRoom);
  const ok = await uiConfirm(playing
    ? { title: T("LEAVE MATCH?"), text: T("You are in a match right now. An AI player will take over your footballer."), yes: T("LEAVE MATCH"), no: T("CANCEL") }
    : { title: T("LEAVE LOBBY?"), text: T("You already have a lobby open. Leave it and continue?"), yes: T("LEAVE LOBBY"), no: T("CANCEL") });
  if (!ok) return false;
  try {
    await P.rooms.leave(activeRoom.id);
  } catch {
    // already gone
  }
  activeRoom = null;
  return true;
}

function rejoinActiveRoom(): void {
  const room = activeRoom;
  if (!room) return;
  if (!isPlaying(room)) {
    // still in the lobby stage — reopen the lobby screen
    showScreen("lobby");
    lobby.adopt(room);
    return;
  }
  audio.resume();
  void onMatchReady(room, true);
}

async function refreshIncomingInvites(): Promise<void> {
  if (!me()) {
    invites = [];
    return;
  }
  try {
    invites = (await P.rooms.invites()).slice(0, 4);
  } catch {
    // offline or no invites
  }
}

function acceptInvite(inv: RoomInvite): void {
  audio.resume();
  P.rooms.acceptInvite(inv.id)
    .then((room) => {
      showScreen("lobby");
      lobby.adopt(room);
    })
    .catch((e: unknown) => setStatus(errorMessage(e)));
}

// ── session expiry and updated terms ──
// The runtime holds the StarHermit session; when it expires (or StarHermit
// needs the player to accept updated terms) online play stops and the
// prompt offers the way back — the runtime's Account dialog — or offline
// practice.
let relaunchShowing = false;
async function promptRelaunch(kind: "expired" | "terms" = "expired"): Promise<void> {
  if (relaunchShowing) return;
  relaunchShowing = true;
  const t = platformStrings();
  try {
    const terms = kind === "terms";
    await uiConfirm({
      title: upper(terms ? t["termsTitle"]! : t["expiredTitle"]!),
      text: terms ? t["termsText"]! : t["expiredText"]!,
      yes: upper(t["relaunch"]!),
      no: upper(t["playOffline"]!),
      primaryYes: true,
      onYes: signIn,
    });
  } finally {
    relaunchShowing = false;
  }
}

// ── match lifecycle ──
function ensureMatch(): MatchController {
  if (match) return match;
  menuScene.stop(); // the real match takes over the stadium
  const m = new MatchController({ scene, camera, audio, input, hud });
  m.onFullTime = (r) => showResult(r);
  m.onFailed = (message) => {
    setStatus(T("Could not start match: {error}", { error: message }));
    backToMenu();
  };
  match = m;
  return m;
}

function startPractice(): void {
  showScreen("none");
  const mine = me();
  ensureMatch().startPractice(teamSize, mine ? displayNameNow(mine.userId) ?? mine.displayName : "You");
}

async function onMatchReady(room: Room, isRejoin = false): Promise<void> {
  // room.status === playing with the frozen roster (AI seats backfilled)
  const ts = seatsPerTeam(room, teamSize);
  const mine = me();
  // The platform runs the authoritative match as a scripted game session.
  const sessionId = room.gameSessionId;
  if (!sessionId) {
    setStatus(T("Match session unavailable — the server could not start the game."));
    showScreen("menu");
    return;
  }
  showScreen("none");
  matchRoom = room;
  const m = ensureMatch();
  const gameNet = new GameClient(sessionId);
  try {
    await gameNet.connect({
      onSnapshot: (snap) => m.onSnapshot(snap),
      onEvent: (ev) => m.onNetEvent(ev),
      onAchievement: (a: JsonValue) => {
        const name = a && typeof a === "object" && !Array.isArray(a) ? a["name"] : null;
        if (typeof name === "string" && name) hud.banner(T("Achievement unlocked: {name}", { name }), 4000);
      },
      onClose: () => {
        if (match && match.phase !== "done") {
          setStatus(T("Connection lost"));
          backToMenu();
        }
      },
      // the StarHermit session ended: the match ends back at the menu
      // (onSessionEnded says why and prompts)
      onAuthLost: () => {
        if (match) backToMenu();
      },
      onTermsRequired: () => {
        if (match) backToMenu();
        void promptRelaunch("terms");
      },
      // the session is gone, finished elsewhere or on another build
      onUnavailable: () => {
        if (match) backToMenu();
        setStatus(T("This match is no longer available."));
      },
      onResumed: () => m.onResumed(),
    });
  } catch (e) {
    setStatus(T("Could not connect: {error}", { error: errorMessage(e) }));
    backToMenu();
    return;
  }
  if (match !== m) {
    gameNet.close();
    return;
  }
  // the realtime rooms socket stays for roster pushes (names, AI flags)
  const rosterNet = new RosterClient();
  rosterNet.connect(room.id, (parts) => m.applyRoster(parts));
  m.startFromRoom({ room, teamSize: ts, myUserId: mine?.userId ?? null, sessionId, net: gameNet, rosterNet, isRejoin });
  // voice chat (best-effort; honors the menu checkbox)
  voice.joinMatch(sessionId);
}

function showResult(r: MatchResult): void {
  disposeMatch();
  menuScene.start();
  result = { title: resultTitle(r.winner, r.myTeam), score: `${r.score[0]} – ${r.score[1]}`, stats: r.stats, rank: "" };
  void showMatchRank(r);
  showScreen("result");
}

/** Online matches: server.js posts each finisher's team goals to the
 * match-goals board; show the signed-in player's rank there. */
async function showMatchRank(r: MatchResult): Promise<void> {
  const seq = ++rankSeq;
  const mine = me();
  if (!r.online || !mine || !result) return;
  const t = platformStrings();
  if (r.winner === -1 && r.abandoned) {
    result.rank = t["lbNotPosted"]!;
    return;
  }
  result.rank = t["lbPosting"]!;
  let rank: number | null = null;
  for (let i = 0; i < 8 && rank === null && seq === rankSeq; i++) {
    if (i) await new Promise<void>((res) => setTimeout(() => res(), 1500));
    try {
      const board = (await P.leaderboards.list()).find((b) => b.key === "match-goals");
      if (!board) continue;
      const page = await P.leaderboards.entries(board.id, { pageSize: 100 });
      rank = page.items.find((e) => e.userId === mine.userId)?.rank ?? null;
    } catch {
      // try again
    }
  }
  if (seq !== rankSeq || !result) return;
  result.rank = rank !== null ? t["lbRank"]!.replace("{rank}", String(rank)) : t["lbNotPosted"]!;
}

function backToMenu(): void {
  disposeMatch();
  menuScene.start();
  if (lobby.room) void lobby.leave();
  showScreen("menu");
  void refreshIncomingInvites();
  void refreshActiveRoom();
}

function disposeMatch(): void {
  const m = match;
  match = null; // null first: the games client's final close must not reenter
  matchRoom = null;
  voice.leaveMatch();
  matchMenu = false;
  m?.dispose();
}

// ── replay lifecycle ──
// A third mode beside the menu backdrop and a match: the viewer owns the
// scene until exit, which returns to the list.
function openReplay(sessionId: string): void {
  menuScene.stop();
  showScreen("none");
  const viewer = new ReplayViewer(scene, camera, hud, exitReplay);
  replay = viewer;
  viewer.load(sessionId).catch((e: unknown) => {
    console.error("replay load failed", e instanceof Error ? e.message : String(e));
    exitReplay();
  });
}

function exitReplay(): void {
  replay?.dispose();
  replay = null;
  menuScene.start();
  showScreen("replays");
}

// ── screens ──
const lobby = new Lobby({
  // the lobby keeps its room through the match; back to the menu leaves it
  onMatchReady: (room) => void onMatchReady(room),
  onStarting: () => {
    audio.resume();
    audio.crowd.matchStart();
  },
  onLeave: () => showScreen("menu"),
  setStatus,
  audio,
});
const controlsScreen = new ControlsScreen(audio, () => showScreen("menu"));
const leaderboardScreen = new LeaderboardScreen(audio, () => showScreen("menu"));
const replaysScreen = new ReplaysScreen(audio, openReplay, () => showScreen("menu"));
const achievementsScreen = new AchievementsScreen(audio, () => showScreen("menu"));
const settingsPanel = new SettingsPanel(audio);

// ── in-match menu (Esc / ☰ / a pad's Start): pause (practice), help,
// sound, settings, restart, leave ──
function setMatchMenu(open: boolean): void {
  matchMenu = open;
  if (match) match.paused = open && match.matchMode === "practice";
}

function toggleMatchMenu(): void {
  if (!match || match.phase === "done" || match.phase === "loading") return;
  // open on the next frame, so this key is not also the dialog's Back
  const open = !matchMenu;
  setTimeout(() => {
    if (match && match.phase !== "done") setMatchMenu(open);
  }, 0);
}

onKey((e) => {
  if (e.code !== "Escape" || !e.pressed || e.repeat) return;
  if (settingsPanel.open) return; // its dialog backs out first
  if (ui.capturingKeys()) return; // the chat field handles Escape itself
  // The first Escape releases the mouse camera; a second opens the menu.
  if (pointerLocked()) {
    exitPointerLock();
    return;
  }
  if (!matchMenu) toggleMatchMenu();
});
input.setPointerFilter((x, y) => hud.hit(x, y) !== null);
function hudPress(x: number, y: number): void {
  const hit = hud.hit(x, y);
  if (hit === "mic") {
    audio.ui();
    voice.toggleMute();
  } else if (hit === "menu" && match && match.phase !== "done") {
    audio.ui();
    setMatchMenu(true);
  }
}
onPointerButton((e) => {
  if (e.pressed && e.button === 0) hudPress(e.x, e.y);
});
onTouch((e) => {
  if (e.phase === "start") hudPress(e.x, e.y);
});
// a gamepad's Start opens the match menu (there is no Escape on a pad)
let startHeld = false;
function pollStartButton(): void {
  let held = false;
  try {
    for (const pad of gamepads()) if (pad.connected && pad.buttons[9]?.pressed) held = true;
  } catch {
    held = false;
  }
  if (held && !startHeld && match && !matchMenu) toggleMatchMenu();
  startHeld = held;
}

// ── UI ──

/** The logo (weight 800, letter spacing 0.12 em, FOOTBALL in the accent, a
 * green glow), drawn once at 64 px. */
let logo: CanvasTexture | null = null;
function logoTexture(): CanvasTexture {
  if (logo) return logo;
  const size = 64;
  const pad = 24; // room for the glow
  const first = "STARHERMIT ";
  const [c, ctx] = makeCanvas(1200, size + pad * 2);
  const style = (): void => {
    ctx.font = `800 ${size}px sans-serif`;
    ctx.letterSpacing = `${0.12 * size}px`;
  };
  style();
  c.width = Math.min(1200, Math.ceil(ctx.measureText(first).width + ctx.measureText("FOOTBALL").width) + pad * 2);
  style(); // resizing resets the context
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(39,174,96,0.6)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = TEXT;
  ctx.fillText(first, pad, pad + size / 2);
  ctx.fillStyle = ACCENT;
  ctx.fillText("FOOTBALL", pad + ctx.measureText(first).width, pad + size / 2);
  logo = canvasTexture(c);
  return logo;
}

/** Muted text as one label, or wrapped at word breaks into several when it is
 * wider than the window (a phone in portrait). */
function mutedLines(text: string): void {
  const f = frame();
  const room = (f.width / f.scale) * 0.94;
  if (ui.measureText(text).width / f.scale <= room) {
    ui.label(text, { tone: "muted" });
    return;
  }
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ui.measureText(next).width / f.scale > room) {
      ui.label(line, { tone: "muted" });
      line = word;
    } else line = next;
  }
  if (line) ui.label(line, { tone: "muted" });
}

function menuUi(): void {
  const mine = me();
  const online = !!mine;
  const t = platformStrings();
  {
    // clamp(2rem, 7vw, 4rem), within the window
    const f = frame();
    const vw = f.width / f.scale;
    const lg = logoTexture();
    const px = Math.max(32, Math.min(64, vw * 0.07)); // the font size
    const w = Math.min((lg.width * px) / 64, vw * 0.94);
    ui.image("STARHERMIT FOOTBALL", lg, { width: w, height: (w * lg.height) / lg.width });
  }
  mutedLines(online
    ? T("Signed in as {name}", { name: displayNameNow(mine.userId) ?? mine.displayName })
    : T("Offline mode — practice only (launch via StarHermit for multiplayer)"));
  ui.column("menu-buttons", () => {
    // signing in is the runtime's (its Options menu)
    if (!online && ui.button(upper(t["signIn"]!), { tone: "accent" })) {
      audio.ui();
      signIn();
    }
    if (activeRoom) {
      if (ui.id("rejoin").button(isPlaying(activeRoom) ? T("REJOIN MATCH") : T("RETURN TO LOBBY"), { tone: "accent" })) {
        audio.ui();
        rejoinActiveRoom();
      }
    }
    if (ui.button(T("QUICK PLAY"), { disabled: !online, tone: "accent" })) {
      audio.ui();
      audio.resume();
      void confirmLeaveActiveRoom().then(async (ok) => {
        if (!ok) return;
        try {
          showScreen("lobby");
          await lobby.quickPlay(teamSize);
        } catch (e) {
          showScreen("menu");
          setStatus(T("Quick play failed: {error}", { error: errorMessage(e) }));
        }
      });
    }
    if (ui.button(T("CREATE LOBBY"), { disabled: !online })) {
      audio.ui();
      audio.resume();
      void confirmLeaveActiveRoom().then(async (ok) => {
        if (!ok) return;
        try {
          showScreen("lobby");
          await lobby.create(teamSize);
        } catch (e) {
          showScreen("menu");
          setStatus(T("Could not create lobby: {error}", { error: errorMessage(e) }));
        }
      });
    }
    if (ui.button(T("PRACTICE vs AI"))) {
      audio.ui();
      audio.resume();
      void confirmLeaveActiveRoom().then((ok) => {
        if (ok) startPractice();
      });
    }
    if (online && ui.button(T("RANKED vs AI"))) {
      audio.ui();
      audio.resume();
      void confirmLeaveActiveRoom().then(async (ok) => {
        if (!ok) return;
        try {
          showScreen("lobby");
          await lobby.soloVsAi(teamSize);
        } catch (e) {
          showScreen("menu");
          setStatus(T("Could not start match: {error}", { error: errorMessage(e) }));
        }
      });
    }
    // the runtime's bindings exist offline too; touch layouts have nothing
    // to rebind
    if (primaryPointerOf() !== "coarse" && ui.button(T("CONTROLS"))) {
      audio.ui();
      showScreen("controls");
    }
    if (online && ui.button(T("LEADERBOARD"))) {
      audio.ui();
      showScreen("leaderboard");
      void leaderboardScreen.open();
    }
    if (online && ui.button(T("REPLAYS"))) {
      audio.ui();
      showScreen("replays");
      void replaysScreen.open();
    }
    if (online && ui.button(T("ACHIEVEMENTS"))) {
      audio.ui();
      showScreen("achievements");
      void achievementsScreen.open();
    }
    // the share link that friends the recipient and invites them back
    if (online && ui.button(upper(t["invite"]!))) {
      audio.ui();
      const link = inviteLinkNow();
      setStatus(link && copyText(link) ? t["inviteCopied"]! : t["inviteFailed"]!);
    }
    if (ui.button(T("SETTINGS"))) {
      audio.ui();
      settingsPanel.show();
    }
  }, { spacing: 10, width: 320 });
  ui.row("team-size", () => {
    const size = ui.cycle(T("Team size"), teamSize - 1, TEAM_SIZES);
    if (size !== teamSize - 1) teamSize = size + 1;
    ui.label(T("per side"));
  }, { spacing: 8, align: "center" });
  const voiceOn = ui.checkbox(T("Voice chat"), voice.isEnabled());
  if (voiceOn !== voice.isEnabled()) voice.setEnabled(voiceOn);
  for (const inv of invites) {
    ui.row(`invite-${inv.id}`, () => {
      ui.label(T("{name} invited you to a match", { name: inv.fromUsername || T("A friend") }));
      if (ui.id(`join-${inv.id}`).button(T("JOIN"), { tone: "accent" })) {
        audio.ui();
        acceptInvite(inv);
      }
    }, { spacing: 12, align: "center" });
  }
  if (status) ui.label(status, { tone: "muted" });
}

function primaryPointerOf(): string {
  try {
    return primaryPointer();
  } catch {
    return "none";
  }
}

function resultUi(): void {
  const r = result;
  ui.heading(r ? T(r.title) : T("FULL TIME"));
  ui.heading(r?.score ?? "");
  for (const line of statsLines(r?.stats ?? null, T)) ui.label(line, { color: "#b9c6d2" });
  if (r?.rank) ui.label(r.rank, { color: "#ffd76a" });
  if (ui.button(T("MAIN MENU"), { tone: "accent" })) {
    audio.ui();
    backToMenu();
  }
}

function matchMenuUi(): void {
  const m = match;
  if (!m) return;
  const practice = m.matchMode === "practice";
  let keep = false;
  let leave = false;
  let restart = false;
  const open = ui.dialog("match-menu", practice ? T("PRACTICE PAUSED") : T("MATCH MENU"), true, () => {
    ui.label(practice ? T("The practice match waits while this menu is open.") : T("Online play continues; an AI player takes over if you leave."), { tone: "muted" });
    ui.paragraph(T("Move: WASD / arrows or the joystick · Shoot: left mouse or SHOOT · Pass: right mouse or PASS · Tackle: middle mouse or TACKLE · Click the pitch for mouse camera."), 420);
    if (ui.button(T("KEEP PLAYING"), { tone: "accent" })) keep = true;
    if (practice && ui.button(T("RESTART PRACTICE"))) restart = true;
    if (ui.button(audio.isMuted() ? T("SOUND: OFF") : T("SOUND: ON"))) audio.setMuted(!audio.isMuted());
    if (ui.button(T("SETTINGS"))) {
      audio.ui();
      settingsPanel.show();
    }
    if (ui.button(practice ? T("BACK TO MENU") : T("LEAVE MATCH"), { tone: "danger" })) leave = true;
  });
  if (keep || (!open && !settingsPanel.open)) {
    if (keep) audio.ui();
    setMatchMenu(false);
  } else if (restart) {
    audio.ui();
    setMatchMenu(false);
    disposeMatch();
    startPractice();
  } else if (leave) {
    audio.ui();
    const room = matchRoom;
    setMatchMenu(false);
    void (async () => {
      if (room) {
        try {
          await P.rooms.leave(room.id);
        } catch {
          // already gone
        }
      }
      activeRoom = null;
      backToMenu();
    })();
  }
}

function confirmUi(): void {
  if (!confirm) return;
  const c = confirm;
  let answer: boolean | null = null;
  const open = ui.dialog("confirm", c.title, true, () => {
    ui.paragraph(c.text, 420);
    ui.row("confirm-buttons", () => {
      if (ui.id("confirm-yes").button(c.yes, { tone: c.primaryYes ? "accent" : "danger" })) {
        answer = true;
        c.onYes?.();
      }
      if (ui.id("confirm-no").button(c.no, c.primaryYes ? {} : { tone: "accent" })) answer = false;
    }, { spacing: 12 });
  });
  if (answer === null && !open) answer = false;
  if (answer !== null) {
    audio.ui();
    confirm = null;
    c.resolve(answer);
  }
}

function fullViewport(): void {
  const f = frame();
  const sa = f.safeArea;
  ui.setViewport({ x: sa.left, y: sa.top, width: f.width - sa.left - sa.right, height: f.height - sa.top - sa.bottom });
}

/** The overlays above every mode: SETTINGS, then confirmations. */
function overlaysUi(): void {
  settingsPanel.drawUi();
  confirmUi();
}

/** The menu screens: centered over a dimmed backdrop. */
function screensUi(): void {
  const f = frame();
  draw.rect(0, 0, f.width, f.height, [5 / 255, 7 / 255, 12 / 255, 0.35]);
  fullViewport();
  const width = (f.width - f.safeArea.left - f.safeArea.right) / f.scale;
  const height = (f.height - f.safeArea.top - f.safeArea.bottom) / f.scale;
  ui.column("screen", () => {
    switch (screen) {
      case "menu":
        menuUi();
        break;
      case "lobby":
        lobby.drawUi();
        break;
      case "controls":
        controlsScreen.drawUi();
        break;
      case "leaderboard":
        leaderboardScreen.drawUi();
        break;
      case "replays":
        replaysScreen.drawUi();
        break;
      case "achievements":
        achievementsScreen.drawUi();
        break;
      case "result":
        resultUi();
        break;
      case "none":
        break;
    }
    overlaysUi();
  }, { align: "center", justify: "center", width, height, spacing: 16 });
}

/** The loading screen: the logo over the key art (cover-fitted) under
 * a dark veil, the plain colour while the image decodes or if it fails. */
let keyArt: ImageBitmap | null = null;
let veil: OffscreenCanvas | null = null;
function loadingScreen(text: string): void {
  const f = frame();
  const s = f.scale;
  draw.rect(0, 0, f.width, f.height, "#05070c");
  if (keyArt) {
    const k = Math.max(f.width / keyArt.width, f.height / keyArt.height);
    const w = keyArt.width * k;
    const h = keyArt.height * k;
    draw.image(keyArt, (f.width - w) / 2, (f.height - h) / 2, w, h);
  }
  if (!veil) {
    // linear-gradient(rgba(5,7,12,0.55), rgba(5,7,12,0.85))
    const [c, g] = makeCanvas(1, 64);
    const lg = g.createLinearGradient(0, 0, 0, 64);
    lg.addColorStop(0, "rgba(5,7,12,0.55)");
    lg.addColorStop(1, "rgba(5,7,12,0.85)");
    g.fillStyle = lg;
    g.fillRect(0, 0, 1, 64);
    veil = c;
  }
  draw.image(veil, 0, 0, f.width, f.height);
  const logo = 22.4 * s; // .small-logo 1.4rem
  draw.text("STARHERMIT FOOTBALL", f.width / 2, f.height / 2 - logo * 1.2, { size: logo, color: TEXT, align: "center", letterSpacing: 0.12 * logo, weight: "800" });
  draw.text(text, f.width / 2, f.height / 2 + logo * 0.4, { size: 16 * s, color: MUTED, align: "center" });
  // how far the build has got (the native loading screen's addition)
  const bw = 200 * s;
  const bh = 4 * s;
  const bx = f.width / 2 - bw / 2;
  const by = f.height / 2 + logo * 0.4 + 30 * s;
  draw.rect(bx, by, bw, bh, [1, 1, 1, 0.12]);
  draw.rect(bx, by, bw * loadingFraction(), bh, ACCENT);
}

// ── lifecycle ──
onStart(() => {
  setFixedRate(60);
  createImageBitmap("assets/keyart-night-stadium.webp")
    .then((img) => {
      keyArt = img;
    })
    .catch(() => {
      // the plain colour stays
    });
  loadLanguages(); // the game's string tables and language resolver
  sim(); // evaluate server.js once: the shared simulation
  // The synthesis graph, its noise buffer and the clips build in an entry
  // of their own; the runtime's mixer needs no gesture to start.
  setTimeout(() => audio.resume(), 0);
  ui.setTheme({
    accent: ACCENT,
    text: TEXT,
    muted: MUTED,
    panel: [10 / 255, 14 / 255, 20 / 255, 0.82],
    control: [10 / 255, 14 / 255, 20 / 255, 0.82],
    hovered: [39 / 255, 174 / 255, 96 / 255, 0.25],
    pressed: ACCENT,
    field: "#0a0e14",
    focus: ACCENT,
    outline: BORDER,
  });
  // idle stadium backdrop behind the menu: an AI-vs-AI exhibition match
  menuScene.start();
  try {
    // signed out (or renewal refused): drop to offline practice
    P.onPlayerChange((player) => {
      refreshLanguage();
      if (!player) {
        activeRoom = null;
        invites = [];
        setStatus(platformStrings()["signedOut"]!);
        return;
      }
      void refreshActiveRoom();
      void refreshIncomingInvites();
      inviteLinkNow();
    });
  } catch {
    // no platform session in this runtime
  }
  try {
    // why the session ended: an expired or revoked session and updated terms
    // prompt; signing out or playing elsewhere only says so
    P.onSessionEnded((reason) => {
      if (match && matchRoom) backToMenu();
      if (reason === "expired" || reason === "revoked") void promptRelaunch("expired");
      else if (reason === "terms-required") void promptRelaunch("terms");
    });
  } catch {
    // no platform session in this runtime
  }
  // the player's game settings arriving from the account (mute, voice)
  try {
    settings.onChange((key, value) => {
      if (key === "muted" && typeof value === "boolean" && value !== audio.isMuted()) audio.setMuted(value);
      if (key === "voice" && typeof value === "boolean" && value !== voice.isEnabled()) voice.setEnabled(value);
    });
  } catch {
    // settings unavailable
  }
  void refreshActiveRoom();
  void refreshIncomingInvites();
  inviteLinkNow();
  // pending room invites from friends (accept from the menu); invites are
  // pull-only, so poll while the menu is showing
  setInterval(() => {
    if (screen === "menu" && !match && !replay && me()) void refreshIncomingInvites();
  }, 5000);
});

onFixedUpdate((step) => {
  if (match) match.fixedStep(step);
  else if (!replay) menuScene.fixedStep(step);
});

onUpdate((delta) => {
  const dt = Math.min(delta, 0.1);
  pollQuality();
  pollStartButton();
  if (match) {
    match.update(dt);
    voice.updatePositions(dt, match.sim?.players ?? null, match.myPlayerId);
  } else if (replay) {
    // a viewer error must never wedge the menu or match modes — bail out
    try {
      replay.update(dt);
    } catch (e) {
      console.error("replay error", e instanceof Error ? e.message : String(e));
      exitReplay();
    }
  } else {
    menuScene.update(dt);
  }
  if (!booted && (menuScene.running || menuScene.failed)) booted = true;
  hud.setMic(!!match && voice.active, voice.muted);
});

onRender(() => {
  if (!booted && !match && !replay) {
    loadingScreen(T("Loading…"));
    return;
  }
  hud.draw();
  if (match) {
    if (match.phase === "loading") loadingScreen(T("Loading…"));
    const chat = match.chat;
    chat?.draw();
    fullViewport();
    if (chat && chat.visible && !matchMenu) ui.area(chat.fieldRect(), () => chat.field());
    if (matchMenu) matchMenuUi();
    overlaysUi();
    return;
  }
  if (replay) {
    replay.drawUi();
    fullViewport();
    overlaysUi();
    return;
  }
  screensUi();
});
