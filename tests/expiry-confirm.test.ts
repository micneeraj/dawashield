import { describe, expect, it } from "vitest";
import { isPastOrToday, parseExpiry } from "../src/lib/expiry";
import { compareReads, expiryAsk, expiryForCheck, expiryNeedsConfirm, expiryNotAfterMfd, parseLabel, validateLabel } from "../src/lib/label";

const NOW = new Date(2026, 10, 15, 12, 0, 0);
const read = (o: object) => validateLabel(parseLabel(JSON.stringify(o))!);
const base = { name: { value: "Orofer XT", source: "Orofer XT", confidence: 0.97 }, batch: { value: "E166L26", source: "B.No. E166L26", confidence: 0.97 } };
// Live failure: far Orofer XT photo, model read EXP as "JUN.2025" (strip: EXP JUN 2028, MFD.JUL.2026), both reads agreed, high confidence.
const junWithMfd = { ...base, expiry: { value: "JUN.2025", source: "EXP.JUN.2025", confidence: 0.98 }, mfd: { value: "JUL.2026", source: "MFD.JUL.2026", confidence: 0.98 } };
const junNoMfd = { ...base, expiry: { value: "JUN.2025", source: "EXP.JUN.2025", confidence: 0.98 } };
const ask = (v: string, r: ReturnType<typeof read> | null, o = { confirmed: false, edited: false }) => expiryAsk(v, r, o, NOW);

describe("date formats parse to the same month", () => {
  it.each(["JUN.2025", "JUN 2025", "06/2025", "06/25", "Jun-25", "EXP.JUN.2025", "JUN. 2025", "JUN.2025.", "Exp: Jun.25", "jun'25"])("%s -> June 2025", (v) => {
    const d = parseExpiry(v)!;
    expect(d).not.toBeNull();
    expect([d.getFullYear(), d.getMonth()]).toEqual([2025, 5]);
  });
});

describe('"JUN.2025" read with high confidence', () => {
  it("WITH MFD: amber + question, even when both reads agree", () => {
    const r = compareReads(read(junWithMfd), read(junWithMfd))!;
    expect(expiryNotAfterMfd(r.expiry.value, r.mfd.value)).toBe(true);
    expect(r.expiry.uncertain).toBe(true);
    expect(expiryNeedsConfirm(r, NOW)).toBe(true);
    expect(ask("JUN.2025", r)).toBe(true);
  });
  it("WITHOUT MFD: amber + question", () => {
    const r = compareReads(read(junNoMfd), read(junNoMfd))!;
    expect(expiryNeedsConfirm(r, NOW)).toBe(true);
    expect(ask("JUN.2025", r)).toBe(true);
  });
  it("no expired warning until the user taps Yes", () => {
    expect(expiryForCheck("JUN.2025", { confirmed: false }, NOW)).toBeUndefined();
    expect(ask("JUN.2025", read(junWithMfd), { confirmed: true, edited: false })).toBe(false);
    expect(expiryForCheck("JUN.2025", { confirmed: true }, NOW)).toBe("JUN.2025");
  });
  it("a past date the user typed still asks", () => {
    expect(ask("06/25", read(junWithMfd), { confirmed: false, edited: true })).toBe(true);
  });
  it("past date asks even with a reading that looks perfect", () => {
    expect(ask("JUN.2025", null)).toBe(true);
  });
});

describe("today / past / future", () => {
  it("expiry month ending today counts as today -> asks", () => {
    const lastDay = new Date(2026, 10, 30, 9);
    expect(isPastOrToday("11/2026", lastDay)).toBe(true);
    expect(isPastOrToday("11/2026", NOW)).toBe(false);
  });
  it("unreadable date asks", () => expect(ask("JUN.2O25", read(junWithMfd))).toBe(true));
  it("correct read JUN 2028 with MFD JUL 2026: no question, green", () => {
    const r = read({ ...base, expiry: { value: "JUN 2028", source: "EXP. JUN 2028", confidence: 0.9 }, mfd: { value: "JUL.2026", source: "MFD.JUL.2026", confidence: 0.9 } });
    expect(expiryNeedsConfirm(r, NOW)).toBe(false);
    expect(ask("JUN 2028", r)).toBe(false);
    expect(expiryForCheck("JUN 2028", { confirmed: false }, NOW)).toBe("JUN 2028");
  });
  it("EXP equal to MFD asks", () => {
    const r = read({ ...base, expiry: { value: "JUL 2027", source: "EXP JUL 2027" }, mfd: { value: "JUL 2027", source: "MFD JUL 2027" } });
    expect(ask("JUL 2027", r)).toBe(true);
  });
});
