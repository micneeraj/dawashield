import nsq from "../public/data/nsq.json";
import metaJson from "../public/data/meta.json";
import { describe, expect, it } from "vitest";
import { matchMedicine } from "../src/lib/match";
import { demoRecord, inDateVerified } from "../src/lib/demo";
import { explainResult } from "../src/lib/why";
import { STATUS_LABEL, nanoText, statusKind } from "../src/lib/status";
import { RECOVERY, photoErrorKey, speechErrorKey } from "../src/lib/errors";
import { cabinetSummary } from "../src/lib/cabinet";
import { ERRORS, RECOVERY_LABEL } from "../src/content/messages";
import type { AlertRecord, DatasetMeta } from "../src/lib/types";
import type { CabinetItem } from "../src/lib/db";

const records = (nsq as unknown as AlertRecord[]).map((r, i) => ({ ...r, id: r.id ?? String(i) }));
const meta = metaJson as unknown as DatasetMeta;

describe("demo: verified, in-date RED batches", () => {
  const list = inDateVerified(records);
  it("at least 3 verified records expire after Dec 2026", () => expect(list.length).toBeGreaterThanOrEqual(3));
  it("every one of the first 3 gives RED when checked", () => {
    for (const r of list.slice(0, 3)) expect(matchMedicine({ name: r.name, batch: r.batch }, records).level).toBe("RED");
  });
  it("the one-tap chip picks a named manufacturer", () => {
    const d = demoRecord(records)!;
    expect(d.status).toBe("verified");
    expect(d.manufacturerName).not.toMatch(/under investigation/i);
  });
});

describe("status pill (real state only)", () => {
  it("offline or last answer on-device -> Offline ready · On this device", () => {
    expect(statusKind(false, null)).toBe("device");
    expect(statusKind(false, "cloud")).toBe("device");
    expect(statusKind(true, "device")).toBe("device");
    expect(STATUS_LABEL.device.en).toBe("Offline ready · On this device");
  });
  it("last answer in cloud -> Cloud AI", () => expect(statusKind(true, "cloud")).toBe("cloud"));
  it("Nano never shown as bare 'unavailable'", () => {
    for (const v of ["unavailable", "no", ""]) {
      expect(nanoText(v, v, "en")).toBe("On-device AI needs desktop Chrome with Gemini Nano. Using cloud AI for now.");
      expect(nanoText(v, v, "hi")).not.toMatch(/unavailable/i);
    }
    expect(nanoText("available", "available", "en")).toMatch(/ready/);
  });
});

describe("why this result (plain code)", () => {
  const r = inDateVerified(records)[0];
  it("RED: tick on name and batch", () => {
    const input = { name: r.name, batch: r.batch };
    const w = explainResult(input, matchMedicine(input, records), meta);
    expect(w.level).toBe("RED");
    expect(w.rows.find((x) => x.field === "name")!.status).toBe("match");
    expect(w.rows.find((x) => x.field === "batch")!.status).toBe("match");
    expect(w.rows.find((x) => x.field === "manufacturer")!.status).toBe("missing");
  });
  it("AMBER near batch: name matches, batch different", () => {
    const near = r.batch.slice(0, -1) + (r.batch.endsWith("9") ? "8" : "9");
    const input = { name: r.name, batch: near };
    const res = matchMedicine(input, records);
    expect(res.level).toBe("AMBER");
    const w = explainResult(input, res, meta);
    expect(w.rows.find((x) => x.field === "name")!.status).toBe("match");
    expect(w.rows.find((x) => x.field === "batch")!.status).toBe("different");
  });
  it("GREY: shows what was searched", () => {
    const w = explainResult({ name: "Zzqx", batch: "ZZQ0001" }, matchMedicine({ name: "Zzqx", batch: "ZZQ0001" }, records), meta);
    expect(w.level).toBe("GREY");
    expect(w.rows).toEqual([]);
    expect(w.search.records).toBe(meta.records);
    expect(w.search.to).toBe(meta.latestMonth);
    expect(w.search.statesMissing.length).toBe(meta.statesPendingLatestMonth.length);
  });
});

describe("errors: human message + recovery", () => {
  it("speech codes map to messages", () => {
    expect(speechErrorKey("not-allowed")).toBe("micDenied");
    expect(speechErrorKey("no-speech")).toBe("micNoSpeech");
    expect(speechErrorKey("network")).toBe("micNetwork");
    expect(speechErrorKey("audio-capture")).toBe("micUnavailable");
  });
  it("photo errors map to messages", () => {
    expect(photoErrorKey(new Error("unreadable-model-output"), true)).toBe("photoUnreadable");
    expect(photoErrorKey(new Error("Failed to fetch"), true)).toBe("network");
    expect(photoErrorKey(new Error("x"), false)).toBe("network");
    expect(photoErrorKey(new Error("timeout"), true)).toBe("timeout");
    expect(photoErrorKey(new Error("closer-photo-needed"), true)).toBe("closerPhoto");
  });
  it("every error has Hindi + English text and at least one recovery", () => {
    for (const [k, acts] of Object.entries(RECOVERY)) {
      const m = ERRORS[k as keyof typeof ERRORS];
      expect(m.hi.length).toBeGreaterThan(10);
      expect(m.en.length).toBeGreaterThan(10);
      expect(acts.length).toBeGreaterThan(0);
      for (const a of acts) expect(RECOVERY_LABEL[a].hi && RECOVERY_LABEL[a].en).toBeTruthy();
    }
  });
});

describe("cabinet banner", () => {
  const base = { name: "X", batch: "B1", addedAt: "2026-11-01T00:00:00Z" };
  const chk = (level: "RED" | "AMBER" | "GREY", at: string) => ({ level, reason: "none" as const, recordIds: [], version: "v", at });
  it("all clear when nothing flagged; last check is the latest", () => {
    const s = cabinetSummary([{ ...base, lastCheck: chk("GREY", "2026-11-10T00:00:00Z") }, { ...base, lastCheck: chk("GREY", "2026-11-12T00:00:00Z") }] as CabinetItem[]);
    expect(s.flagged.length).toBe(0);
    expect(s.lastCheckAt).toBe("2026-11-12T00:00:00Z");
  });
  it("newly flagged counted separately; expiry reminders separate", () => {
    const s = cabinetSummary([
      { ...base, lastCheck: chk("RED", "2026-11-12T00:00:00Z"), changedAt: "2026-11-12T00:00:00Z" },
      { ...base, expiry: "10/2026", lastCheck: chk("GREY", "2026-11-12T00:00:00Z") },
    ] as CabinetItem[], new Date(2026, 10, 15));
    expect(s.newlyFlagged.length).toBe(1);
    expect(s.expiring.length).toBe(1);
  });
});
