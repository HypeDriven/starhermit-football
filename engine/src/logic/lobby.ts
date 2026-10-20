// The lobby's view of a realtime room: seats per team and slot, who is
// host, and the room's team size.

export interface SeatParticipant {
  readonly id: string;
  readonly userId: string | null;
  readonly username: string;
  readonly isAi: boolean;
  readonly isHost: boolean;
  readonly team: number;
  readonly slot: number;
}

export interface RoomLike {
  readonly hostUserId?: string | null;
  readonly status: string;
  readonly participants: readonly SeatParticipant[];
}

/** Lobby leavers keep their participant row with `leftAt` set; their seat
 * is open again. The host API's Participant declares no `leftAt`, so it is
 * read when the platform's JSON carries it. */
export function activeParticipants<P extends SeatParticipant>(parts: readonly P[]): P[] {
  return parts.filter((p) => !(p as unknown as { leftAt?: unknown }).leftAt);
}

export function statusOf(room: { readonly status: string } | null | undefined): string {
  return String(room?.status ?? "").toLowerCase();
}

export function isPlaying(room: { readonly status: string } | null | undefined): boolean {
  return statusOf(room) === "playing";
}

export function amHost(room: RoomLike | null, myUserId: string | null): boolean {
  if (!room || !myUserId) return false;
  if (room.hostUserId) return room.hostUserId === myUserId;
  const host = activeParticipants(room.participants).find((p) => p.isHost);
  return !!host && host.userId === myUserId;
}

/** The room's seats per team. The host API's Room carries no team size, so
 * read the platform's `config.seatsPerTeam` / `seatsPerTeam` when the JSON
 * has them, else the highest seated slot, else
 * the size this client asked for. */
export function seatsPerTeam(room: unknown, fallback: number): number {
  const r = room as { config?: { seatsPerTeam?: unknown }; seatsPerTeam?: unknown; participants?: readonly SeatParticipant[] } | null;
  const declared = Number(r?.config?.seatsPerTeam ?? r?.seatsPerTeam);
  if (Number.isInteger(declared) && declared >= 1 && declared <= 11) return declared;
  let top = 0;
  for (const p of r?.participants ?? []) top = Math.max(top, (p.slot | 0) + 1);
  return Math.max(1, Math.min(11, Math.max(top, fallback)));
}

/** cols[team][slot] = participant or null. */
export function seatGrid<P extends SeatParticipant>(parts: readonly P[], teamSize: number): (P | null)[][] {
  const active = activeParticipants(parts);
  const cols: (P | null)[][] = [[], []];
  for (let t = 0; t < 2; t++) {
    for (let s = 0; s < teamSize; s++) {
      cols[t]!.push(active.find((x) => x.team === t && x.slot === s) ?? null);
    }
  }
  return cols;
}

/** Seats for the match: player id = team × teamSize + slot. */
export function matchSeats<P extends SeatParticipant>(parts: readonly P[], teamSize: number): ({ userId: string | null; name: string; isAi: boolean } | null)[] {
  const seats: ({ userId: string | null; name: string; isAi: boolean } | null)[] = new Array(teamSize * 2).fill(null);
  for (const part of activeParticipants(parts)) {
    const id = part.team * teamSize + part.slot;
    if (id < 0 || id >= seats.length) continue;
    seats[id] = { userId: part.userId, name: part.username, isAi: part.isAi };
  }
  return seats;
}

export function humanCount(parts: readonly SeatParticipant[]): number {
  return activeParticipants(parts).filter((p) => !p.isAi).length;
}
