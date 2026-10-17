import { test } from "node:test";
import assert from "node:assert/strict";
import { activeParticipants, amHost, humanCount, isPlaying, matchSeats, seatGrid, seatsPerTeam, statusOf } from "../src/logic/lobby.ts";
import type { SeatParticipant } from "../src/logic/lobby.ts";

const part = (id: string, team: number, slot: number, over: Partial<SeatParticipant> & { leftAt?: string } = {}): SeatParticipant =>
  ({ id, userId: `u-${id}`, username: `user${id}`, isAi: false, isHost: false, team, slot, ...over });

test("seats map team and slot; leavers' seats are open again", () => {
  const parts = [part("a", 0, 0, { isHost: true }), part("b", 1, 2), part("c", 0, 1, { leftAt: "2026-10-17T10:00:00Z" } as never)];
  const grid = seatGrid(parts, 3);
  assert.equal(grid[0]![0]!.id, "a");
  assert.equal(grid[0]![1], null);
  assert.equal(grid[1]![2]!.id, "b");
  assert.equal(activeParticipants(parts).length, 2);
  const seats = matchSeats(parts, 3);
  assert.equal(seats.length, 6);
  assert.deepEqual(seats[5], { userId: "u-b", name: "userb", isAi: false });
  assert.equal(seats[1], null);
  assert.equal(humanCount([...parts, part("ai", 1, 0, { isAi: true, userId: null })]), 2);
});

test("the host is hostUserId, else the active host participant", () => {
  const parts = [part("a", 0, 0, { isHost: true }), part("b", 1, 0)];
  assert.equal(amHost({ status: "lobby", participants: parts, hostUserId: "u-b" }, "u-b"), true);
  assert.equal(amHost({ status: "lobby", participants: parts }, "u-a"), true);
  assert.equal(amHost({ status: "lobby", participants: parts }, "u-b"), false);
  assert.equal(amHost(null, "u-a"), false);
});

test("the team size comes from the room's JSON, its seats, or the request", () => {
  assert.equal(seatsPerTeam({ config: { seatsPerTeam: 7 }, participants: [] }, 5), 7);
  assert.equal(seatsPerTeam({ seatsPerTeam: 3, participants: [] }, 5), 3);
  assert.equal(seatsPerTeam({ participants: [part("a", 0, 8)] }, 5), 9);
  assert.equal(seatsPerTeam({ participants: [part("a", 0, 1)] }, 5), 5);
  assert.equal(seatsPerTeam(null, 4), 4);
});

test("room status compares without case", () => {
  assert.equal(isPlaying({ status: "Playing" }), true);
  assert.equal(isPlaying({ status: "playing" }), true);
  assert.equal(statusOf({ status: "Open" }), "open");
  assert.equal(isPlaying(null), false);
});
