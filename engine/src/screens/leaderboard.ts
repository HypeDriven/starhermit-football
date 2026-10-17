// The platform leaderboard (the browser's js/leaderboard.js): my rating from
// the game info and the ranked entries, paged, with a friends-only filter.
import * as ui from "starhermit:ui";
import type { GameStats, LeaderboardEntry } from "starhermit:platform";
import type { Audio } from "../audio.ts";
import { P, displayNameNow, errorMessage } from "../platform.ts";
import { T } from "../i18n.ts";

const PAGE_SIZE = 20;

export class LeaderboardScreen {
  private boardId: string | null = null; // this game's leaderboard (null: none)
  private page = 1;
  private total = 0;
  private busy = false;
  private friendsOnly = false;
  private rating: GameStats | null | undefined; // undefined while loading
  private items: LeaderboardEntry[] | null = null;
  private hint = "";
  private listNote = "";

  constructor(private readonly audio: Audio, private readonly onBack: () => void) {}

  async open(): Promise<void> {
    this.page = 1;
    this.total = 0;
    this.hint = "";
    this.rating = undefined;
    this.items = null;
    this.listNote = "";
    try {
      const info = await P.gameInfo();
      this.boardId = info.leaderboardId || null;
      this.rating = info.me;
      await this.load();
    } catch (e) {
      this.rating = null;
      this.items = [];
      this.hint = T("Could not load leaderboard: {error}", { error: errorMessage(e) });
    }
  }

  private async load(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.hint = "";
    try {
      if (!this.boardId) {
        this.items = [];
        this.listNote = T("No rated players yet.");
        this.total = 0;
        return;
      }
      this.listNote = T("Loading…");
      const options: { friendsOnly?: boolean; page: number; pageSize: number } = { page: this.page, pageSize: PAGE_SIZE };
      if (this.friendsOnly) options.friendsOnly = true;
      const data = await P.leaderboards.entries(this.boardId, options);
      this.total = data.total ?? 0;
      this.items = data.items ?? [];
      this.listNote = this.items.length ? "" : T("No rated players yet.");
    } catch (e) {
      this.items = [];
      this.listNote = "";
      this.hint = T("Could not load entries: {error}", { error: errorMessage(e) });
    } finally {
      this.busy = false;
    }
  }

  drawUi(): void {
    ui.heading(T("LEADERBOARD"));
    ui.panel("lb-rating", () => {
      ui.label(T("MY RATING"), { tone: "muted" });
      const me = this.rating;
      if (me === undefined) ui.label(T("Loading…"), { tone: "muted" });
      else if (!me || me.elo == null) ui.label(T("Unrated — finish a match to get a rating."), { tone: "muted" });
      else {
        ui.row("lb-rating-body", () => {
          ui.label(String(me.elo), { tone: "accent" });
          ui.label(T("{w}W · {l}L · {d}D", { w: me.wins ?? 0, l: me.losses ?? 0, d: me.draws ?? 0 }), { tone: "muted" });
        }, { spacing: 11, align: "center" });
      }
    }, { padding: 12, align: "center" });
    const friends = ui.checkbox(T("Friends only"), this.friendsOnly);
    if (friends !== this.friendsOnly) {
      this.audio.ui();
      this.friendsOnly = friends;
      this.page = 1;
      void this.load();
    }
    ui.scrollArea("lb-list", { width: 440, height: 300 }, () => {
      if (this.listNote) ui.label(this.listNote, { tone: "muted" });
      for (const e of this.items ?? []) {
        ui.row(`lb-${e.userId}`, () => {
          ui.column(`lb-rank-${e.userId}`, () => ui.label(`#${e.rank ?? "—"}`, { tone: "muted" }), { width: 56 });
          // entries carry only the account username — show the nickname
          ui.column(`lb-name-${e.userId}`, () => ui.label(displayNameNow(e.userId) ?? "…"), { width: 260 });
          ui.label(String(e.score), { tone: "accent" });
        });
      }
    });
    if (this.hint) ui.label(this.hint, { tone: "muted" });
    const pages = Math.max(1, Math.ceil(this.total / PAGE_SIZE));
    ui.row("lb-pager", () => {
      if (ui.button(T("PREV"), { disabled: this.busy || this.page <= 1 })) {
        this.audio.ui();
        this.page--;
        void this.load();
      }
      if (ui.button(T("NEXT"), { disabled: this.busy || this.page >= pages })) {
        this.audio.ui();
        this.page++;
        void this.load();
      }
    }, { spacing: 10 });
    if (ui.button(T("BACK")) || ui.back()) {
      this.audio.ui();
      this.onBack();
    }
  }
}
