// Cabinet banner summary. Plain code.
import { expiryStatus } from "./expiry";
import type { CabinetItem } from "./db";

export interface CabinetSummary {
  flagged: CabinetItem[]; // last check RED or AMBER
  newlyFlagged: CabinetItem[]; // colour changed to RED/AMBER at a re-check
  expiring: CabinetItem[]; // expired or expiring soon
  lastCheckAt: string | null; // most recent check time
}

export function cabinetSummary(items: CabinetItem[], now = new Date()): CabinetSummary {
  const flagged = items.filter((i) => i.lastCheck && i.lastCheck.level !== "GREY");
  const newlyFlagged = flagged.filter((i) => !!i.changedAt);
  const expiring = items.filter((i) => ["soon", "expired"].includes(expiryStatus(i.expiry, now)));
  const times = items.map((i) => i.lastCheck?.at).filter((x): x is string => !!x).sort();
  return { flagged, newlyFlagged, expiring, lastCheckAt: times.length ? times[times.length - 1] : null };
}
