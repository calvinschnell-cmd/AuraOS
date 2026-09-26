import { KIOSK_TIMEZONE } from "@/lib/config";

/** "YYYY-MM-DD" for `date` in the kiosk's timezone. */
export function dayKey(date = new Date(), timeZone = KIOSK_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asUtc - date.getTime()) / 60000;
}

/** Instant of local midnight (start of "today") in the kiosk's timezone. */
export function dayStart(date = new Date(), timeZone = KIOSK_TIMEZONE): Date {
  const key = dayKey(date, timeZone);
  const guess = Date.parse(`${key}T00:00:00Z`);
  const offset = tzOffsetMinutes(new Date(guess), timeZone);
  return new Date(guess - offset * 60000);
}
