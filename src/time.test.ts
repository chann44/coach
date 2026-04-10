import { expect, test } from "bun:test";
import { dateKeyInTimezone, isWithinDailyWindow } from "./time";

test("date key uses user timezone not UTC", () => {
  const utcDate = new Date("2026-01-01T00:30:00.000Z");
  expect(dateKeyInTimezone(utcDate, "America/Los_Angeles")).toBe("2025-12-31");
  expect(dateKeyInTimezone(utcDate, "Asia/Kolkata")).toBe("2026-01-01");
});

test("window check works on exact minute", () => {
  const date = new Date("2026-01-01T01:30:00.000Z");
  expect(isWithinDailyWindow(date, "UTC", "01:30")).toBe(true);
  expect(isWithinDailyWindow(date, "UTC", "01:29")).toBe(false);
});
