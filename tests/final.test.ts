import { describe, expect, it } from "vitest";
import nsq from "../public/data/nsq.json";
import metaJson from "../public/data/meta.json";
import { RESULT, familyMessage, CLIPS } from "../src/content/messages";
import { whySummary, compareFields } from "../src/lib/why";
import { offlineFacts } from "../src/lib/status";
import { matchMedicine } from "../src/lib/match";
import type { AlertRecord, DatasetMeta } from "../src/lib/types";

const records = nsq as unknown as AlertRecord[];
const meta = metaJson as unknown as DatasetMeta;

describe("safer RED wording", () => {
  const en = `${RESULT.RED.title.en}. ${RESULT.RED.body.en}`;
  it("uses the exact required wording", () => {
    expect(en).toBe("This batch appears in an official CDSCO quality alert. Don't take the next dose until you speak to your doctor or chemist. Never stop an essential medicine suddenly.");
  });
  it("voice clip text and family message use it too, in both languages", () => {
    const clip = CLIPS.find((c) => c.clip === "red")!;
    expect(clip.text.en).toContain("Never stop an essential medicine suddenly");
    expect(clip.text.hi).toContain(RESULT.RED.body.hi);
    const fam = familyMessage("en", { level: "RED", name: "X", batch: "B", month: "June 2025", link: "u" });
    expect(fam).toContain("Don't take the next dose until you speak to your doctor or chemist");
    expect(familyMessage("hi", { level: "RED", name: "X", batch: "B", month: "m", link: "u" })).toContain("अचानक बंद न करें");
  });
});

describe("Why wording never implies an unprovided field was verified", () => {
  const r = records.find((x) => x.batch === "MT14501")!;
  it("medicine + batch given, manufacturer not", () => {
    const rows = compareFields({ name: r.name, batch: r.batch }, r);
    expect(whySummary(rows, "en")).toBe("Medicine and batch match; manufacturer not provided");
    expect(whySummary(rows, "hi")).toBe("दवा और बैच मिलते हैं; कंपनी नहीं डाला गया");
  });
  it("batch only", () => {
    expect(whySummary(compareFields({ batch: r.batch }, r), "en")).toBe("Batch matches; medicine and manufacturer not provided");
  });
});

describe("de-duplicated dataset", () => {
  it("MT14501 is one record, listed twice, entries 88 and 89", () => {
    const m = records.filter((x) => x.batch === "MT14501");
    expect(m.length).toBe(1);
    expect(m[0].listedTimes).toBe(2);
    expect(m[0].pdfEntries).toEqual([88, 89]);
    expect(matchMedicine({ name: m[0].name, batch: "MT14501" }, records).records.length).toBe(1);
  });
  it("no repeated medicine + batch + month + lab rows remain; meta counts match", () => {
    const key = (x: AlertRecord) => [x.type, x.batchNorm, x.name.replace(/\(N\/?A\)/, "").replace(/\W/g, "").slice(0, 20).toLowerCase(), x.month, x.lab].join("|");
    expect(new Set(records.map(key)).size).toBe(records.length);
    expect(meta.records).toBe(records.length);
    expect(meta.duplicatesMerged).toBe(records.reduce((n, x) => n + (x.listedTimes ?? 1) - 1, 0));
  });
});

describe("precise offline status", () => {
  it("lists data, Nano and Hindi voice separately; never claims all offline", () => {
    const f = offlineFacts("unavailable", "en");
    expect(f.map((x) => x.text)).toEqual([
      "CDSCO data: available offline",
      "On-device AI (Gemini Nano): not available on this device",
      "Hindi voice input: works offline only if the Hindi speech pack is installed in Chrome",
    ]);
    expect(offlineFacts("available", "en")[1].text).toBe("On-device AI (Gemini Nano): ready");
  });
});
