// Expiry parsing and status. A strip printed "EXP 01/2028" is usable until the
// last day of January 2028.

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Returns the last day the medicine is valid, or null if unreadable. */
export function parseExpiry(raw: string | null | undefined): Date | null {
  const s = String(raw ?? "").toUpperCase().replace(/EXP(IRY)?\.?\s*(DATE)?\s*[:.]?/g, "").trim();
  if (!s) return null;
  let y: number | undefined, m: number | undefined;
  let mm = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (mm) [y, m] = [+mm[1], +mm[2]];
  if (!y) {
    mm = s.match(/^([A-Z]{3})[A-Z]*[\s\-./']*(\d{2,4})$/);
    if (mm && MON.includes(mm[1])) [m, y] = [MON.indexOf(mm[1]) + 1, +mm[2]];
  }
  if (!y) {
    mm = s.match(/^(?:\d{1,2}[\s\-./])?(\d{1,2})[\s\-./](\d{2,4})$/);
    if (mm) [m, y] = [+mm[1], +mm[2]];
  }
  if (!y || !m || m < 1 || m > 12) return null;
  if (y < 100) y += 2000;
  if (y < 2000 || y > 2100) return null;
  return new Date(y, m, 0, 23, 59, 59); // day 0 of next month = last day of month
}

export type ExpiryStatus = "valid" | "soon" | "expired" | "unknown";

export function expiryStatus(raw: string | null | undefined, now = new Date()): ExpiryStatus {
  const d = parseExpiry(raw);
  if (!d) return "unknown";
  const days = (d.getTime() - now.getTime()) / 86_400_000;
  if (days < 0) return "expired";
  if (days <= 30) return "soon";
  return "valid";
}

/** The reminder date: about 5 days before expiry. */
export function reminderDate(raw: string | null | undefined): Date | null {
  const d = parseExpiry(raw);
  return d ? new Date(d.getTime() - 5 * 86_400_000) : null;
}

export function formatExpiry(raw: string | null | undefined, lang: "hi" | "en"): string {
  const d = parseExpiry(raw);
  if (!d) return raw || "—";
  return d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { month: "short", year: "numeric" });
}
