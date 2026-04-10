import { $ } from "bun";

export interface CalendarEvent {
  title: string;
  startsAt: number;
  endsAt: number;
}

let cache: { value: CalendarEvent[]; expiresAt: number } | null = null;

export async function getUpcomingEvents(hoursAhead = 8, ttlMs = 5 * 60_000): Promise<CalendarEvent[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }

  const script = `
tell application "Calendar"
  set nowDate to current date
  set futureDate to nowDate + (${hoursAhead} * hours)
  set output to ""
  repeat with cal in calendars
    try
      set evs to (every event of cal whose start date >= nowDate and start date <= futureDate)
      repeat with e in evs
        set output to output & (summary of e) & "|" & ((start date of e) as string) & "|" & ((end date of e) as string) & "\n"
      end repeat
    end try
  end repeat
  return output
end tell
`;

  const result = await $`osascript -e ${script}`.text();
  const events = parseEvents(result);
  cache = { value: events, expiresAt: now + ttlMs };
  return events;
}

function parseEvents(raw: string): CalendarEvent[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, start, end] = line.split("|");
      return {
        title: title ?? "",
        startsAt: Date.parse(start ?? ""),
        endsAt: Date.parse(end ?? "")
      };
    })
    .filter((event) => Number.isFinite(event.startsAt) && Number.isFinite(event.endsAt));
}
