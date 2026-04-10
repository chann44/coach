import type { Database } from "bun:sqlite";
import type { CoachConfig } from "../config";
import { getUpcomingEvents } from "../integrations/calendar/osascript";
import { wasNudgeSent } from "../memory/nudges";
import { dateKeyInTimezone, isWithinDailyWindow } from "../time";
import { selectNextWorkoutEvent, shouldSendPreworkoutForEvent } from "./preworkout";

export type NudgeKind = "morning" | "protein" | "winddown" | "preworkout";

export async function getDueNudges(
  db: Database,
  config: CoachConfig,
  now = new Date()
): Promise<{ dateKey: string; due: NudgeKind[] }> {
  const dateKey = dateKeyInTimezone(now, config.timezone);
  const due: NudgeKind[] = [];

  if (userMessagedInLast30Mins(db, now.getTime())) {
    return { dateKey, due };
  }

  if (
    !wasNudgeSent(db, "morning", dateKey) &&
    isWithinDailyWindow(now, config.timezone, config.schedule.morning_briefing)
  ) {
    due.push("morning");
  }

  if (
    !wasNudgeSent(db, "protein", dateKey) &&
    isWithinDailyWindow(now, config.timezone, config.schedule.protein_check)
  ) {
    due.push("protein");
  }

  if (
    !wasNudgeSent(db, "winddown", dateKey) &&
    isWithinDailyWindow(now, config.timezone, config.schedule.wind_down)
  ) {
    due.push("winddown");
  }

  if (!wasNudgeSent(db, "preworkout", dateKey)) {
    const events = await getUpcomingEvents(24);
    const event = selectNextWorkoutEvent(events, now.getTime());
    if (event && shouldSendPreworkoutForEvent(event, now.getTime())) {
      due.push("preworkout");
    }
  }

  return { dateKey, due };
}

function userMessagedInLast30Mins(db: Database, nowTs: number): boolean {
  const threshold = nowTs - 30 * 60_000;
  const row = db
    .query("SELECT 1 FROM conversations WHERE role = 'user' AND ts >= ?1 LIMIT 1")
    .get(threshold);
  return !!row;
}
