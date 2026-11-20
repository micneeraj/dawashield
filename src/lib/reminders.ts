// Shared, plain-code reminder logic. Used by the app (calendar file, local
// reminders) and by the daily GitHub Action that sends push notifications.
import { parseExpiry } from "./expiry";

/** "MM/YYYY", "Jun 2028", "2028-06" -> "2028-06" (or "" if unreadable). */
export function expiryMonth(raw: string | null | undefined): string {
  const d = parseExpiry(raw);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Last valid day of an expiry month "2028-06" -> 30 Jun 2028 (UTC date). */
export function expiryEnd(month: string): Date | null {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2], 0));
}

/** The day to remind: 5 days before the last valid day. */
export function reminderDay(month: string): Date | null {
  const end = expiryEnd(month);
  return end ? new Date(end.getTime() - 5 * 86_400_000) : null;
}

/** Should today's daily run send the expiry reminder? True on the reminder day
 *  or any later day up to expiry (so a missed run still reminds), once. */
export function expiryReminderDue(month: string, today: Date, alreadySent: boolean): boolean {
  if (alreadySent) return false;
  const day = reminderDay(month), end = expiryEnd(month);
  if (!day || !end) return false;
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return t >= day.getTime() && t <= end.getTime();
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** An .ics calendar file: an all-day event 5 days before expiry, with an alarm. */
export function expiryIcs(o: { title: string; description: string; month: string; uid: string; now?: Date }): string | null {
  const day = reminderDay(o.month);
  if (!day) return null;
  const next = new Date(day.getTime() + 86_400_000);
  const stamp = (o.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DawaShield//Expiry reminder//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${o.uid}@dawashield`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(day)}`,
    `DTEND;VALUE=DATE:${ymd(next)}`,
    `SUMMARY:${esc(o.title)}`,
    `DESCRIPTION:${esc(o.description)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(o.title)}`,
    "TRIGGER:PT9H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** Trigger a download of the .ics file in the browser. */
export function downloadIcs(filename: string, ics: string): void {
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
