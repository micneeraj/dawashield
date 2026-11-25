// Regression tests for the result decision table (Part A).
// Includes the exact false scare seen on a real Dolo-650 strip.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchMedicine, recordsAreThisMedicine, sameMedicine } from "../src/lib/match";
import { manufacturerEntity, normalizeBatch } from "../src/lib/normalize";
import { ACTION, AMBER_REASON, GREY_NOTE, INFO_TOOL, RED_TYPE, RESULT, actionKey, fillNote, spokenClip, CLIPS } from "../src/content/messages";
import { officialLink, nextUpdateExpected, CDSCO_ALERTS_PAGE } from "../src/lib/format";
import { photoUnreadable, spokenBatchUnreadable } from "../src/lib/label";
import type { AlertRecord } from "../src/lib/types";

const records: AlertRecord[] = JSON.parse(readFileSync("public/data/nsq.json", "utf8"));

function rec(p: Partial<AlertRecord> & Pick<AlertRecord, "name" | "batch" | "manufacturer">): AlertRecord {
  return {
    id: p.batch, type: "NSQ", batchNorm: normalizeBatch(p.batch), manufacturerName: p.manufacturer.split(",")[0].trim(),
    manufacturerEntity: manufacturerEntity(p.manufacturer), reason: "Assay", lab: "CDL, Kolkata", month: "2026-03",
    sourceUrl: "https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug", status: "verified", ...p,
  } as AlertRecord;
}

describe("the real Dolo-650 / Micro Labs false scare", () => {
  // Strip: Dolo-650, Micro Labs, batch DOBS4518 (not listed).
  // List: a DIFFERENT Micro Labs medicine, Amlodipine (Amlong-2.5) batch AMAS0249, March 2026.
  const dolo = { name: "Dolo-650", batch: "DOBS4518", manufacturer: "Micro Labs Limited" };
  it("the Amlodipine record really is in the dataset, and DOBS4518 is not", () => {
    expect(records.some((r) => r.batchNorm === "AMAS0249" && /micro labs/i.test(r.manufacturer))).toBe(true);
    expect(records.some((r) => r.batchNorm === "DOBS4518")).toBe(false);
  });
  it("is GREY with a company note, not AMBER or RED", () => {
    const r = matchMedicine(dolo, records);
    expect(r.level).toBe("GREY");
    expect(r.reason).toBe("company-other-medicine");
    expect(r.records[0].batchNorm).toBe("AMAS0249");
    expect(recordsAreThisMedicine(r)).toBe(false);
  });
  it("the note names the other medicine and says the alert is for a different medicine", () => {
    const r = matchMedicine(dolo, records);
    const note = fillNote(GREY_NOTE["company-other-medicine"].en, { medicine: r.records[0].brand || r.records[0].name, month: "March 2026" });
    expect(note).toBe("This company has a different medicine on the official list (Amlong-2.5, March 2026). This alert is for a different medicine, not your batch.");
  });
  it("spoken reply says grey + not affected", () => {
    const r = matchMedicine(dolo, records);
    expect(spokenClip(r.level, r.reason)).toBe("grey_company");
    expect(CLIPS.find((c) => c.clip === "grey_company")!.text.en.startsWith("Grey. No official alert for this exact batch.")).toBe(true);
  });
  it("same strip with photo spelling variants of the company is still GREY", () => {
    for (const m of ["MICRO LABS LTD", "Micro Labs Ltd., Bangalore", "M/s. Micro Labs Limited"]) {
      expect(matchMedicine({ ...dolo, manufacturer: m }, records).level).toBe("GREY");
    }
  });
});

describe("decision table", () => {
  const R = [
    rec({ name: "Amlodipine Tablets IP 2.5 mg", brand: "Amlong-2.5", batch: "AMAS0249", manufacturer: "Micro Labs Limited, Bangalore" }),
    rec({ name: "Paracetamol Tablets IP 650 mg", batch: "PCT7781", manufacturer: "Micro Labs Limited" }),
    rec({ name: "Telmisartan Tablets IP 40 mg", batch: "TLM2201", manufacturer: "Sun Pharmaceutical Industries Ltd" }),
    rec({ name: "Atorvastatin Tablets IP 10 mg", batch: "57", manufacturer: "Hindustan Antibiotics Ltd." }),
    rec({ name: "Balarishtam", batch: "57", manufacturer: "Sakthi Ayurveda Pharmaceuticals" }),
    rec({ type: "SPURIOUS", name: "Lactic Acid Bacillus Tablets", brand: "Sporlac-DS", batch: "BDS25003", manufacturer: "Under Investigation" }),
  ];

  it("RED: exact batch + company matched with high confidence", () => {
    const r = matchMedicine({ name: "Telma 40", batch: "TLM-2201", manufacturer: "Sun Pharma Industries" }, R);
    expect(r.level).toBe("RED");
    expect(r.reason).toBe("exact");
  });
  it("RED: record names no company (spurious) -> medicine name decides", () => {
    const r = matchMedicine({ name: "Sporlac DS", batch: "BDS25003" }, R);
    expect(r.level).toBe("RED");
    expect(r.records[0].type).toBe("SPURIOUS");
  });
  it("AMBER possible match: exact batch, company only partly matches", () => {
    const r = matchMedicine({ batch: "TLM2201", manufacturer: "Sun Moon Pharma" }, R);
    expect(r.level).toBe("AMBER");
    expect(["possible-company", "batch-other-company"]).toContain(r.reason);
  });
  it("AMBER possible match: exact batch, no company given", () => {
    const r = matchMedicine({ name: "Telmisartan", batch: "TLM2201" }, R);
    expect(r.level).toBe("AMBER");
    expect(r.reason).toBe("company-unconfirmed");
  });
  it("AMBER: same batch number at two different companies is never RED for the wrong one", () => {
    const r = matchMedicine({ name: "Atorvastatin", batch: "57", manufacturer: "Zzyzx Remedies" }, R);
    expect(r.level).toBe("AMBER");
    expect(r.reason).toBe("batch-other-company");
    const ok = matchMedicine({ name: "Atorvastatin", batch: "57", manufacturer: "Hindustan Antibiotics Limited" }, R);
    expect(ok.level).toBe("RED");
    expect(ok.records.map((x) => x.manufacturerName)).toEqual(["Hindustan Antibiotics Ltd."]);
  });
  it("AMBER: right company but a clearly different medicine on that batch", () => {
    const r = matchMedicine({ name: "Dolo 650", batch: "AMAS0249", manufacturer: "Micro Labs" }, R);
    expect(r.level).toBe("AMBER");
    expect(r.reason).toBe("batch-other-name");
  });
  it("AMBER other batches flagged: same company AND same medicine (brand -> generic), different batch", () => {
    const r = matchMedicine({ name: "Dolo 650", batch: "DOBS4518", manufacturer: "Micro Labs Ltd" }, R);
    expect(r.level).toBe("AMBER");
    expect(r.reason).toBe("other-batches");
    expect(r.records[0].batchNorm).toBe("PCT7781");
  });
  it("GREY + note: same company, different medicine", () => {
    const r = matchMedicine({ name: "Azithral 500", batch: "AZ1234", manufacturer: "Micro Labs" }, R);
    expect(r.level).toBe("GREY");
    expect(r.reason).toBe("company-other-medicine");
  });
  it("GREY: no record", () => {
    const r = matchMedicine({ name: "Crocin", batch: "QX55555", manufacturer: "GSK" }, R);
    expect(r.level).toBe("GREY");
    expect(r.reason).toBe("none");
    expect(r.records).toHaveLength(0);
  });
  it("similar batch numbers: one character off for the same medicine is AMBER, never RED", () => {
    const r = matchMedicine({ name: "Telmisartan", batch: "TLM2207", manufacturer: "Sun Pharma" }, R);
    expect(r.level).toBe("AMBER");
    expect(r.reason).toBe("near-batch");
  });
  it("incomplete batch for the same medicine is AMBER partial-batch", () => {
    const r = matchMedicine({ name: "Telmisartan", batch: "TLM22" }, R);
    expect(r.level).toBe("AMBER");
    expect(r.reason).toBe("partial-batch");
  });
  it("CAN'T READ: low confidence never becomes GREY", () => {
    const r = matchMedicine({ batch: "TLM2201", unreadable: true }, R);
    expect(r.level).toBe("UNREADABLE");
    expect(r.records).toHaveLength(0);
    expect(spokenClip(r.level, r.reason)).toBe("unreadable");
  });
  it("brand -> generic is used for 'same medicine'", () => {
    expect(sameMedicine("Dolo-650", R[1])).toBe(true);
    expect(sameMedicine("Dolo-650", R[0])).toBe(false);
  });
});

describe("result wording", () => {
  it("RED exact wording", () => {
    expect(RESULT.RED.title.en).toBe("An official alert matches this exact batch.");
    expect(RESULT.RED.body.en).toBe("Talk to your doctor or chemist before your next dose. Don't stop an essential medicine on your own.");
    expect(RESULT.RED.title.hi).toMatch(/[ऀ-ॿ]/);
  });
  it("RED says NSQ or SPURIOUS; spurious adds keep-strip line", () => {
    expect(RED_TYPE.SPURIOUS.extra!.en).toBe("Keep the strip and the bill. Don't use it. Report it to the chemist and CDSCO.");
    expect(RED_TYPE.NSQ.extra).toBeUndefined();
    expect(actionKey("RED", "exact", "SPURIOUS")).toBe("RED_SPURIOUS");
    expect(spokenClip("RED", "exact", "SPURIOUS")).toBe("red_spurious");
  });
  it("every AMBER reason has a one-line WHY in both languages", () => {
    for (const k of ["possible-company", "company-unconfirmed", "batch-other-company", "batch-other-name", "near-batch", "partial-batch", "other-batches", "name-no-batch"]) {
      expect(AMBER_REASON[k].en.startsWith("Why amber:")).toBe(true);
      expect(AMBER_REASON[k].hi.startsWith("क्यों पीला:")).toBe(true);
    }
  });
  it("GREY headline and body", () => {
    expect(RESULT.GREY.title.en).toBe("No official alert for this exact batch");
    expect(RESULT.GREY.body.en).toBe("This does not prove the medicine is safe. Official alerts can be delayed.");
  });
  it("every level has one big action", () => {
    for (const k of Object.keys(ACTION) as (keyof typeof ACTION)[]) {
      expect(ACTION[k].en.length).toBeGreaterThan(10);
      expect(ACTION[k].hi).toMatch(/[ऀ-ॿ]/);
    }
  });
  it("spoken result clips start with the colour", () => {
    for (const c of CLIPS.filter((x) => /^(red|amber|grey)/.test(x.clip) && x.clip !== "grey_steps")) expect(c.text.en).toMatch(/^(Red|Amber|Grey)\. /);
  });
  it("info-tool line says GREY can't rule out counterfeits", () => {
    expect(INFO_TOOL.en).toContain("not a quality certificate or medical advice");
    expect(INFO_TOOL.en).toContain("Counterfeits can copy real batch numbers");
  });
});

describe("freshness and official link", () => {
  it("official link is the exact monthly PDF when known, else the alerts page", () => {
    const pdf = "https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadAlertsFiles/List%20of%20spurious%20Drugs%20June-2025.pdf";
    expect(officialLink({ pdfUrl: pdf })).toEqual({ url: pdf, kind: "pdf" });
    expect(officialLink({})).toEqual({ url: CDSCO_ALERTS_PAGE, kind: "alerts" });
    expect(officialLink({ pdfUrl: "https://evil.example/x.pdf" }).kind).toBe("alerts");
  });
  it("next update: end of month M+3, or tomorrow once that has passed", () => {
    expect(nextUpdateExpected("2026-09", new Date(2026, 10, 21))!.toDateString()).toBe(new Date(2026, 11, 31).toDateString());
    expect(nextUpdateExpected("2026-06", new Date(2026, 10, 21))!.toDateString()).toBe(new Date(2026, 10, 22).toDateString());
    expect(nextUpdateExpected(null)).toBeNull();
  });
});

describe("can't-read triggers (plain code)", () => {
  const read = (v: string | undefined, confidence: number) => ({ batch: { value: v, confidence } }) as never;
  it("untouched low-confidence photo batch -> can't read", () => {
    expect(photoUnreadable(read("D0BS45l8", 0.3), { name: "Dolo", batch: "D0BS45l8" }, false)).toBe(true);
  });
  it("a batch the user corrected is trusted", () => {
    expect(photoUnreadable(read("D0BS45l8", 0.3), { name: "Dolo", batch: "DOBS4518" }, true)).toBe(false);
  });
  it("confident read is matched normally", () => {
    expect(photoUnreadable(read("DOBS4518", 0.95), { name: "Dolo", batch: "DOBS4518" }, false)).toBe(false);
  });
  it("nothing read at all -> can't read", () => {
    expect(photoUnreadable(read(undefined, 0), { name: "", batch: "" }, false)).toBe(true);
  });
  it("spoken batch with no digits or too short -> can't read", () => {
    expect(spokenBatchUnreadable("BEE")).toBe(true);
    expect(spokenBatchUnreadable("A1")).toBe(true);
    expect(spokenBatchUnreadable("DOBS4518")).toBe(false);
  });
});
