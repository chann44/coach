import { expect, test } from "bun:test";
import { isWorkoutEvent, selectNextWorkoutEvent, shouldSendPreworkoutForEvent } from "./preworkout";

test("keyword matching accepts likely workout and rejects cancelled", () => {
  expect(isWorkoutEvent({ title: "Gym - Upper Body", startsAt: 0, endsAt: 1 })).toBe(true);
  expect(isWorkoutEvent({ title: "Tentative workout", startsAt: 0, endsAt: 1 })).toBe(false);
});

test("select next workout within 24h", () => {
  const now = Date.parse("2026-04-10T10:00:00.000Z");
  const selected = selectNextWorkoutEvent(
    [
      { title: "Gym", startsAt: now + 2 * 60_000, endsAt: now + 62 * 60_000 },
      { title: "Workout", startsAt: now + 61 * 60_000, endsAt: now + 121 * 60_000 }
    ],
    now
  );
  expect(selected?.title).toBe("Gym");
});

test("preworkout send window is 60-45 minutes", () => {
  const now = Date.parse("2026-04-10T10:00:00.000Z");
  const event = { title: "Gym", startsAt: now + 55 * 60_000, endsAt: now + 90 * 60_000 };
  expect(shouldSendPreworkoutForEvent(event, now)).toBe(true);
  expect(shouldSendPreworkoutForEvent({ ...event, startsAt: now + 61 * 60_000 }, now)).toBe(false);
});
