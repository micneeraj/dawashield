// One-tap demo: a real, verified CDSCO alert whose batch is still in date
// (expiry after December 2026), picked from the loaded dataset. Plain code.
import { parseExpiry } from "./expiry";
import type { AlertRecord } from "./types";

export const DEMO_AFTER = new Date(2026, 11, 31, 23, 59, 59);

/** Verified records whose own expiry is after Dec 2026, most recent alert first. */
export function inDateVerified(records: AlertRecord[], after = DEMO_AFTER): AlertRecord[] {
  return records
    .filter((r) => r.status === "verified" && r.batch && (parseExpiry(r.expDate)?.getTime() ?? 0) > after.getTime())
    .sort((a, b) => b.month.localeCompare(a.month) || a.batch.localeCompare(b.batch));
}

/** The record the "Try a real flagged batch" chip fills: prefer a named manufacturer. */
export function demoRecord(records: AlertRecord[]): AlertRecord | undefined {
  const list = inDateVerified(records);
  return list.find((r) => !/under investigation/i.test(r.manufacturerName || r.manufacturer)) ?? list[0];
}
