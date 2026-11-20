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

/** The "Try a demo" batches: real RED records from the official CDSCO list,
 *  fixed so judges see a RED without anyone hand-picking at demo time. */
export const DEMO_BATCHES = ["251TTF014", "P03524", "054A003"];

export interface DemoInput { name: string; batch: string; manufacturer: string; short: string }

/** Inputs for the demo buttons, taken from the records themselves (only those present in the data). */
export function demoInputs(records: AlertRecord[]): DemoInput[] {
  const out: DemoInput[] = [];
  for (const b of DEMO_BATCHES) {
    const r = records.find((x) => x.batchNorm === b);
    if (!r) continue;
    const short = r.name.split(/\s+/)[0].replace(/[^A-Za-z]/g, "");
    out.push({ name: r.name, batch: r.batch, manufacturer: r.manufacturerName || r.manufacturer, short });
  }
  return out;
}
