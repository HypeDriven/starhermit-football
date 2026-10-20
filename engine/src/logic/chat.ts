// In-match chat bookkeeping: messages merged by
// id across fetches, the newest tail kept, status lines after them, and a
// client-side send cap below the platform's 10 a minute.

export const MAX_SHOWN = 50;
export const MIN_SEND_GAP_MS = 1500;
export const MAX_SENDS_PER_MIN = 8;

export interface ChatLine {
  readonly id: string;
  readonly senderId: string;
  readonly content: string;
  readonly kind: string;
  readonly sentAt: number | string;
  readonly isDeleted: boolean;
}

export class ChatLog<T extends ChatLine = ChatLine> {
  private readonly byId = new Map<string, T>();
  readonly system: string[] = [];
  /** The shown tail, oldest first (rebuilt on change). */
  tail: T[] = [];

  add(m: T): void {
    if (m && m.id != null) this.byId.set(String(m.id), m);
  }

  addSystem(text: string): void {
    this.system.push(text);
    while (this.system.length > 3) this.system.shift();
  }

  /** Sorted by sentAt (then id), deleted ones dropped, the newest
   * MAX_SHOWN kept. */
  rebuild(): void {
    const sorted = [...this.byId.values()]
      .filter((m) => !m.isDeleted)
      .sort((a, b) => compareText(sentAtKey(a.sentAt), sentAtKey(b.sentAt)) || compareText(String(a.id), String(b.id)))
      .slice(-MAX_SHOWN);
    this.byId.clear();
    for (const m of sorted) this.byId.set(String(m.id), m);
    this.tail = sorted;
  }

  clear(): void {
    this.byId.clear();
    this.system.length = 0;
    this.tail = [];
  }
}

/** Sends allowed: at least 1.5 s apart and at most 8 in a sliding minute. */
export class SendLimiter {
  private readonly times: number[] = [];
  private last = -Infinity;

  /** Records and returns true when a send at `now` (ms) is allowed. */
  take(now: number): boolean {
    while (this.times.length && now - this.times[0]! > 60000) this.times.shift();
    if (now - this.last < MIN_SEND_GAP_MS || this.times.length >= MAX_SENDS_PER_MIN) return false;
    this.last = now;
    this.times.push(now);
    return true;
  }
}

/** Sorting key of a platform timestamp (ms since the epoch, or an ISO
 * string from older payloads) as text that sorts chronologically. */
export function sentAtKey(sentAt: number | string): string {
  return typeof sentAt === "number" ? String(Math.floor(sentAt)).padStart(16, "0") : String(sentAt);
}

/** Code-unit order (no locale data needed). */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
