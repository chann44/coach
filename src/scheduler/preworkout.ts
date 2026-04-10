import type { CalendarEvent } from "../integrations/calendar/osascript";

const POSITIVE_KEYWORDS = [
  "gym",
  "workout",
  "training",
  "lift",
  "strength",
  "run",
  "cardio",
  "swim",
  "yoga",
  "pilates"
];

const NEGATIVE_KEYWORDS = ["cancelled", "maybe", "tentative"];

export function isWorkoutEvent(event: CalendarEvent): boolean {
  const text = event.title.toLowerCase();
  if (NEGATIVE_KEYWORDS.some((word) => text.includes(word))) return false;
  return POSITIVE_KEYWORDS.some((word) => text.includes(word));
}

export function selectNextWorkoutEvent(events: CalendarEvent[], now = Date.now()): CalendarEvent | null {
  const dayAhead = now + 24 * 60 * 60 * 1000;
  const workoutEvents = events
    .filter((event) => event.startsAt > now && event.startsAt <= dayAhead)
    .filter(isWorkoutEvent)
    .sort((a, b) => a.startsAt - b.startsAt);
  return workoutEvents[0] ?? null;
}

export function shouldSendPreworkoutForEvent(event: CalendarEvent, now = Date.now()): boolean {
  const minutesUntilStart = (event.startsAt - now) / 60_000;
  return minutesUntilStart <= 60 && minutesUntilStart >= 45;
}
