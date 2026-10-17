import { test } from "node:test";
import assert from "node:assert/strict";
import { ChatLog, MAX_SHOWN, SendLimiter } from "../src/logic/chat.ts";

const msg = (id: string, sentAt: number, over: Record<string, unknown> = {}) =>
  ({ id, senderId: "u", content: id, kind: "text", sentAt, isDeleted: false, ...over });

test("messages merge by id, sort by time, drop deleted and keep the tail", () => {
  const log = new ChatLog();
  log.add(msg("b", 2000));
  log.add(msg("a", 1000));
  log.add(msg("b", 2000, { content: "edited" }));
  log.add(msg("c", 1500, { isDeleted: true }));
  log.rebuild();
  assert.deepEqual(log.tail.map((m) => m.content), ["a", "edited"]);
  for (let i = 0; i < 80; i++) log.add(msg(`m${i}`, 10_000 + i));
  log.rebuild();
  assert.equal(log.tail.length, MAX_SHOWN);
  assert.equal(log.tail[log.tail.length - 1]!.id, "m79");
  log.addSystem("one");
  log.addSystem("two");
  log.addSystem("three");
  log.addSystem("four");
  assert.deepEqual(log.system, ["two", "three", "four"]);
});

test("timestamps of different magnitudes still sort by time", () => {
  const log = new ChatLog();
  log.add(msg("late", 10_000));
  log.add(msg("early", 9_000));
  log.rebuild();
  assert.deepEqual(log.tail.map((m) => m.id), ["early", "late"]);
});

test("sends are paced below the platform's limit", () => {
  const l = new SendLimiter();
  assert.equal(l.take(0), true);
  assert.equal(l.take(1000), false, "1.5 s apart");
  let t = 1500;
  let allowed = 1;
  for (let i = 0; i < 20; i++, t += 1500) if (l.take(t)) allowed++;
  assert.equal(allowed, 8, "at most 8 a minute");
  assert.equal(l.take(61_000), true, "the window slides");
});
