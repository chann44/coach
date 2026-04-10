export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function getZonedParts(date: Date, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

function offsetAt(date: Date, timezone: string): number {
  const p = getZonedParts(date, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

function zonedDateToUtcTs(year: number, month: number, day: number, timezone: string): number {
  let ts = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    ts = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetAt(new Date(ts), timezone);
  }
  return ts;
}

export function dayRangeInTimezone(date: Date, timezone: string): { startTs: number; endTs: number } {
  const p = getZonedParts(date, timezone);
  const startTs = zonedDateToUtcTs(p.year, p.month, p.day, timezone);
  const nextLocalDate = new Date(Date.UTC(p.year, p.month - 1, p.day + 1, 12, 0, 0));
  const endTs = zonedDateToUtcTs(
    nextLocalDate.getUTCFullYear(),
    nextLocalDate.getUTCMonth() + 1,
    nextLocalDate.getUTCDate(),
    timezone
  );
  return { startTs, endTs };
}

export function formatLocalDateTime(date: Date, timezone: string): string {
  const p = getZonedParts(date, timezone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function dateKeyInTimezone(date: Date, timezone: string): string {
  const parts = getZonedParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function parseHHMM(hhmm: string): { hour: number; minute: number } {
  const match = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new Error(`Invalid time format: ${hhmm}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time value: ${hhmm}`);
  }
  return { hour, minute };
}

export function isWithinDailyWindow(
  date: Date,
  timezone: string,
  targetHHMM: string,
  windowMinutes = 1
): boolean {
  const target = parseHHMM(targetHHMM);
  const current = getZonedParts(date, timezone);
  const currentMins = current.hour * 60 + current.minute;
  const targetMins = target.hour * 60 + target.minute;
  return currentMins >= targetMins && currentMins < targetMins + windowMinutes;
}
