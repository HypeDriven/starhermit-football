import { test } from "node:test";
import assert from "node:assert/strict";
import { fallbackName, formatClock, formatReplayDate, formatReplayDateEnglish, halvedSides, oneLine, playersInLobby, resultTitle, sidesLine, statsLines } from "../src/logic/format.ts";

test("the match clock shows each half's own time", () => {
  assert.equal(formatClock(0, 1, 180), "1st 00:00");
  assert.equal(formatClock(135.7, 1, 180), "1st 02:15");
  assert.equal(formatClock(200, 2, 180), "2nd 00:20");
  assert.equal(formatClock(999, 2, 180), "2nd 03:00", "caps at full time");
});

test("replay dates read like the browser's short form", () => {
  const ms = Date.UTC(2026, 9, 17, 14, 5);
  assert.equal(formatReplayDateEnglish(ms, 0), "Oct 17, 02:05 PM");
  assert.equal(formatReplayDateEnglish(ms, 120), "Oct 17, 04:05 PM");
  assert.equal(formatReplayDateEnglish(Date.UTC(2026, 0, 1, 0, 30), 0), "Jan 1, 12:30 AM");
  assert.equal(formatReplayDateEnglish(null, 0), "—");
  assert.ok(formatReplayDate(ms, "en-US").includes("Oct"));
  assert.equal(formatReplayDate(undefined, "en-US"), "—");
});

test("text goes through the translator with the browser's keys", () => {
  const seen: string[] = [];
  const t = (key: string): string => { seen.push(key); return `<${key}>`; };
  assert.equal(formatClock(10, 1, 180, t), "<1st {time}>");
  statsLines({ possession: [1, 1], shots: [0, 0] }, t);
  playersInLobby(2, t);
  assert.deepEqual(seen, ["1st {time}", "Possession: {a}% – {b}%", "Shots: {a} – {b}", "{n} players in lobby"]);
});

test("result screen text", () => {
  assert.deepEqual(statsLines({ possession: [30, 10], shots: [4, 1] }), ["Possession: 75% – 25%", "Shots: 4 – 1"]);
  assert.deepEqual(statsLines({ possession: [0, 0], shots: [0, 0] }), ["Possession: 0% – 0%", "Shots: 0 – 0"]);
  assert.deepEqual(statsLines(null), []);
  assert.equal(resultTitle(-1, 0), "DRAW");
  assert.equal(resultTitle(1, 1), "VICTORY");
  assert.equal(resultTitle(0, 1), "DEFEAT");
  assert.equal(playersInLobby(1), "1 player in lobby");
  assert.equal(playersInLobby(3), "3 players in lobby");
});

test("replay sides", () => {
  assert.equal(sidesLine([["Ada", "Bo"], []]), "Ada, Bo vs —");
  assert.equal(halvedSides(["A", "B", "C"]), "A, B vs C");
  assert.equal(halvedSides(["A"]), "A");
  assert.equal(halvedSides([]), "—");
  assert.equal(fallbackName("0123456789abcdef"), "Player 012345");
});

test("other players' text shows on one line", () => {
  assert.equal(oneLine("hi\nthere\u0007"), "hi there ");
  assert.equal(oneLine("x".repeat(500)).length, 300);
});
