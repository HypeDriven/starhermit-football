// The lobby (the browser's js/lobby.js): create / invite / open / quick-join
// against the platform's realtime rooms (spec.md §8), polled every 2 s,
// drawn with the engine's UI. main.ts drives the transitions.
import * as ui from "starhermit:ui";
import type { Friend, Room } from "starhermit:platform";
import type { Audio } from "../audio.ts";
import { playersInLobby } from "../logic/format.ts";
import { amHost, humanCount, isPlaying, seatGrid, seatsPerTeam, statusOf } from "../logic/lobby.ts";
import { P, avatarNow, copyText, displayNameNow, errorMessage, inviteLinkNow, me } from "../platform.ts";
import { T } from "../i18n.ts";
import { crest } from "../world/crest.ts";
import { sim } from "../sim.ts";

export interface LobbyHooks {
  onMatchReady(room: Room): void;
  onStarting(room: Room): void;
  onLeave(): void;
  setStatus(text: string): void;
  audio: Audio;
}

interface InviteRow {
  friend: Friend;
  state: "idle" | "sending" | "sent" | "error";
}

export class Lobby {
  room: Room | null = null;
  private pollTimer: number | undefined;
  private countdownTimer: number | undefined;
  private entered = false; // guards a double enterMatch (poll + tryStart race)
  private timerText = "";
  private finding = false;
  private requestedSize = 5;
  private inviteOpen = false;
  private invites: InviteRow[] | null = null;
  private inviteNote = "";

  constructor(private readonly h: LobbyHooks) {}

  private teamSize(): number {
    return seatsPerTeam(this.room, this.requestedSize);
  }

  // A room can report Playing before the platform binds gameSessionId (an
  // Open room auto-starts the moment every seat is taken), so hand off to
  // the poller, which gives the binding a few polls before entering.
  private enterWhenReady(): void {
    if (this.room?.gameSessionId) {
      this.enterMatch();
      return;
    }
    this.timerText = T("Starting match…");
    this.startPolling();
  }

  async create(teamSize: number): Promise<void> {
    this.stopPolling();
    this.entered = false;
    this.requestedSize = teamSize;
    this.finding = false;
    this.timerText = "";
    this.room = await P.rooms.create({ teamCount: 2, seatsPerTeam: teamSize, backfillAfterSeconds: 30, metadata: { game: "football" } });
    this.startPolling();
  }

  /** Join an open room; if there is none, open one of our own. */
  async quickPlay(teamSize: number): Promise<void> {
    this.h.setStatus(T("Searching for a match…"));
    this.entered = false;
    this.requestedSize = teamSize;
    this.finding = false;
    this.timerText = "";
    // any open room of the game, as the browser's quick-join asks
    let room = await P.rooms.quickJoin();
    if (!room) {
      room = await P.rooms.create({ teamCount: 2, seatsPerTeam: teamSize, backfillAfterSeconds: 30, metadata: { game: "football" } });
      room = await P.rooms.open(room.id);
    }
    this.room = room;
    if (isPlaying(room)) this.enterWhenReady();
    else this.startPolling();
    this.h.setStatus("");
  }

  /** Ranked solo vs AI: every seat but mine is an AI seated at creation, so
   * starting the room begins the match at once — a real platform match:
   * server-authoritative, rated and archived as a replay. */
  async soloVsAi(teamSize: number): Promise<void> {
    this.stopPolling();
    this.entered = false;
    this.requestedSize = teamSize;
    this.timerText = T("Starting match…");
    let room = await P.rooms.create({
      teamCount: 2, seatsPerTeam: teamSize, backfillAfterSeconds: 30,
      aiPlayers: 2 * teamSize - 1, metadata: { game: "football" },
    });
    this.room = room;
    room = await P.rooms.start(room.id);
    this.room = room;
    this.enterWhenReady();
  }

  inviteFriends(): void {
    this.inviteOpen = true;
    this.invites = null;
    this.inviteNote = T("Loading friends…");
    P.friends.list()
      .then((friends) => {
        this.invites = friends.map((friend) => ({ friend, state: "idle" }));
        this.inviteNote = friends.length ? "" : T("No friends yet — add friends on StarHermit first.");
      })
      .catch(() => {
        this.invites = [];
        this.inviteNote = T("No friends yet — add friends on StarHermit first.");
      });
  }

  private sendInvite(row: InviteRow): void {
    const room = this.room;
    if (!room || row.state === "sending" || row.state === "sent") return;
    row.state = "sending";
    P.rooms.invite(room.id, row.friend.userId)
      .then(() => { row.state = "sent"; })
      .catch(() => { row.state = "error"; });
  }

  /** Anyone who opens the link can sign in, auto-friend the sharer and get
   * a game invite back. Called from the button's frame, which counts as the
   * press the clipboard needs; the link is fetched ahead (platform.ts). */
  copyInviteLink(): void {
    const url = me() ? inviteLinkNow() : null;
    if (!url) {
      this.timerText = me() ? T("Could not copy the invite link.") : T("Sign in via StarHermit to share an invite link.");
      return;
    }
    this.timerText = copyText(url)
      ? T("Invite link copied — send it to anyone to play together.")
      : T("Could not copy the invite link.");
  }

  async findMatch(): Promise<void> {
    const room = this.room;
    if (!room) return;
    this.finding = true;
    try {
      this.room = await P.rooms.open(room.id);
    } catch (e) {
      this.finding = false;
      throw e;
    }
    if (isPlaying(this.room)) {
      this.enterWhenReady();
      return;
    }
    this.timerText = T("Finding players… {n}s", { n: 30 });
    this.startCountdown();
  }

  private startCountdown(): void {
    clearInterval(this.countdownTimer);
    let left = 30;
    this.countdownTimer = setInterval(() => {
      left--;
      this.timerText = T("Finding players… {n}s", { n: left });
      if (left <= 0) {
        clearInterval(this.countdownTimer);
        void this.tryStart();
      }
    }, 1000);
  }

  private async tryStart(): Promise<void> {
    const room = this.room;
    if (!room) return;
    try {
      this.room = await P.rooms.start(room.id);
      this.enterMatch();
    } catch {
      // not host, or already started — the poll catches it
    }
  }

  private startPolling(): void {
    this.stopPolling();
    let playingPolls = 0;
    this.pollTimer = setInterval(() => {
      const room = this.room;
      if (!room) return;
      P.rooms.get(room.id)
        .then((fresh) => {
          if (!fresh || !this.room || fresh.id !== this.room.id) return;
          this.room = fresh;
          if (isPlaying(fresh)) {
            clearInterval(this.countdownTimer);
            // the server binds gameSessionId in a separate step from flipping
            // the room to Playing — give it a few polls first
            if (fresh.gameSessionId || ++playingPolls >= 5) this.enterMatch();
            else this.timerText = T("Starting match…");
          } else if (statusOf(fresh) === "closed") {
            void this.leave();
          } else if (statusOf(fresh) === "lobby") {
            this.timerText = ""; // the browser's render shows the head count again
          }
        })
        .catch(() => {
          // transient
        });
    }, 2000);
  }

  private stopPolling(): void {
    clearInterval(this.pollTimer);
    clearInterval(this.countdownTimer);
    this.pollTimer = undefined;
    this.countdownTimer = undefined;
  }

  /** Click an open seat → move my participant there (host only). */
  private async moveTo(team: number, slot: number): Promise<void> {
    const room = this.room;
    const mine = me();
    const part = room?.participants.find((p) => p.userId === mine?.userId);
    if (!room || !part) return;
    try {
      this.room = await P.rooms.seat(room.id, [{ participantId: part.id, team, slot }]);
    } catch (e) {
      this.h.setStatus(errorMessage(e));
    }
  }

  private enterMatch(): void {
    if (this.entered || !this.room) return;
    this.entered = true;
    this.stopPolling();
    this.inviteOpen = false;
    const room = this.room;
    this.h.onStarting(room);
    this.h.onMatchReady(room);
  }

  async leave(): Promise<void> {
    this.stopPolling();
    const room = this.room;
    this.room = null;
    this.inviteOpen = false;
    if (room) {
      try {
        await P.rooms.leave(room.id);
      } catch {
        // already gone
      }
    }
    this.h.onLeave();
  }

  /** Adopt a room joined outside the lobby flow (an accepted invite). */
  adopt(r: Room): void {
    this.room = r;
    this.entered = false;
    this.finding = statusOf(r) === "open";
    this.timerText = "";
    if (isPlaying(r)) this.enterWhenReady();
    else this.startPolling();
  }

  /** Forget the room without leaving it (the match took it over). */
  release(): void {
    this.stopPolling();
    this.room = null;
    this.inviteOpen = false;
  }

  // ── UI ──────────────────────────────────────────────────────────────────

  private roster(): void {
    const room = this.room!;
    const teamSize = this.teamSize();
    const cols = seatGrid(room.participants, teamSize);
    const mine = me();
    const status = statusOf(room);
    const host = amHost(room, mine?.userId ?? null);
    const canMove = (status === "lobby" || status === "open") && host;
    const S = sim();
    ui.row("roster", () => {
      for (let t = 0; t < 2; t++) {
        ui.column(`team-${t}`, () => {
          ui.row(`team-head-${t}`, () => {
            ui.image("", crest(t).texture, { width: 24, height: 24 });
            ui.label(T(t === 0 ? "BLUE" : "RED"), { color: t === 0 ? "#5b9bd5" : "#e74c3c" });
          }, { spacing: 7, align: "center", justify: "center" });
          for (let s = 0; s < teamSize; s++) {
            const p = cols[t]![s] ?? null;
            const role = S.roleForSlot(s, teamSize);
            ui.row(`seat-${t}-${s}`, () => {
              // profile picture on the slot's outboard side (left for blue)
              const avatar = p && !p.isAi && p.userId ? avatarNow(p.userId) : null;
              if (t === 0 && avatar) ui.image("", avatar, { width: 22, height: 22 });
              ui.label(role, { color: "#6c7d8d" });
              if (!p) {
                if (canMove) {
                  if (ui.id(`move-${t}-${s}`).button(T("— open —"), { tone: "muted" })) {
                    this.h.audio.ui();
                    void this.moveTo(t, s);
                  }
                } else {
                  ui.label(T("— open —"), { color: "#4a5866" });
                }
              } else {
                let who: string;
                if (p.isAi || !p.userId) who = p.isAi ? T("{name} (AI)", { name: p.username }) : p.username;
                else who = displayNameNow(p.userId) ?? "…"; // humans: the profile nickname
                const isMe = !!mine && p.userId === mine.userId;
                ui.label(who, { color: isMe ? "#f1c40f" : p.isAi ? "#7fb3d3" : "#c7d2dc" });
              }
              if (t === 1 && avatar) ui.image("", avatar, { width: 22, height: 22 });
            }, { spacing: 6, align: "center" });
          }
        }, { spacing: 4, width: 260 });
      }
    }, { spacing: 32 });
  }

  /** The lobby screen and, over it, the invite dialog. */
  drawUi(): void {
    const room = this.room;
    ui.heading(T("LOBBY"));
    if (!room) {
      ui.label(this.timerText || "…", { tone: "muted" });
      return;
    }
    const mine = me();
    const host = amHost(room, mine?.userId ?? null);
    const status = statusOf(room);
    ui.panel("roster-panel", () => this.roster(), { padding: 16 });
    ui.column("lobby-buttons", () => {
      // invites make sense until the match starts
      if (ui.button(T("INVITE FRIENDS"), { disabled: this.finding && status === "lobby" || status === "playing" || status === "closed" })) {
        this.h.audio.ui();
        this.inviteFriends();
      }
      if (ui.button(T("COPY INVITE LINK"))) {
        this.h.audio.ui();
        this.copyInviteLink();
      }
      // open/start are host-only, and an already-Open room is matching
      if (ui.button(T("FIND MATCH"), { disabled: !host || status !== "lobby" || this.finding, tone: "accent" })) {
        this.h.audio.ui();
        this.findMatch().catch((e: unknown) => this.h.setStatus(errorMessage(e)));
      }
      if (!host) ui.label(T("Only the lobby host can start matchmaking"), { tone: "muted" });
      if (ui.button(T("LEAVE"), { tone: "danger" })) {
        this.h.audio.ui();
        void this.leave();
      }
    }, { spacing: 10, width: 320 });
    const humans = humanCount(room.participants);
    ui.label(status === "open" ? this.timerText || T("Finding players…") : this.timerText || playersInLobby(humans, T), { tone: "muted" });

    let closeInvite = false;
    const stillOpen = ui.dialog("invite", T("INVITE FRIENDS"), this.inviteOpen, () => {
      if (this.inviteNote) ui.label(this.inviteNote, { tone: "muted" });
      if (this.invites && this.invites.length) {
        ui.scrollArea("invite-list", { width: 360, height: 300 }, () => {
          for (const row of this.invites!) {
            ui.row(`friend-${row.friend.userId}`, () => {
              ui.label(row.friend.username);
              if (row.friend.online) ui.label(`● ${T("online")}`, { tone: "accent" });
              const label = row.state === "sent" ? T("SENT") : row.state === "error" ? T("ERROR") : T("INVITE");
              if (ui.id(`invite-${row.friend.userId}`).button(label, { disabled: row.state === "sending" || row.state === "sent" })) {
                this.h.audio.ui();
                this.sendInvite(row);
              }
            }, { spacing: 12, align: "center" });
          }
        });
      }
      if (ui.button(T("BACK"))) {
        this.h.audio.ui();
        closeInvite = true;
      }
    });
    this.inviteOpen = stillOpen && !closeInvite;
  }
}
