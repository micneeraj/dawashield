import { describe, expect, it } from "vitest";
import { matchMedicine, searchNames } from "../src/lib/match";
import { manufacturerEntity, normalizeBatch, transliterate } from "../src/lib/normalize";
import type { AlertRecord } from "../src/lib/types";

// Real rows from the official CDSCO NSQ/spurious portal, alert month Sep-2026.
function rec(p: Partial<AlertRecord> & Pick<AlertRecord, "name" | "batch" | "manufacturer">): AlertRecord {
  return {
    id: p.batch,
    type: "NSQ",
    batchNorm: normalizeBatch(p.batch),
    manufacturerName: p.manufacturer.split(",")[0].trim(),
    manufacturerEntity: manufacturerEntity(p.manufacturer),
    reason: "",
    lab: "",
    month: "2026-09",
    sourceUrl: "https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug",
    status: "verified",
    ...p,
  } as AlertRecord;
}

const RECORDS: AlertRecord[] = [
  rec({
    name: "Alprazolam Tablets IP 0.5 mg", brand: "Alzomac-0.5 Tablets", batch: "60098",
    manufacturer: "Uniza Lifecare Pvt. Ltd.  , Sr. No. 919/7, Kadi-Detroj Road, Balasar, Gujarat-382715",
    expDate: "Jan-2028",
  }),
  rec({
    name: "Paracetamol Paediatric Oral Suspension IP", brand: "Aqua P Mol 125 60 ml", batch: "PAMLA002",
    manufacturer: "Laborate Pharmaceuticals India Ltd.  , (Unit-II) 31, Rajban Road, Nariwala, Paonta Sahib (H.P.)",
    expDate: "Jul-2027",
  }),
  rec({
    type: "SPURIOUS", name: "Lactic Acid Bacillus Tablets (120 M)", brand: "Sporlac-DS", batch: "BDS25003",
    manufacturer: "Under Investigation", expDate: "Jan-2027",
  }),
];

describe("normalizeBatch", () => {
  it.each([
    ["B.No: 45A-2", "45A2"],
    ["BATCH NO. 45A 2", "45A2"],
    ["Batch: 45a/2", "45A2"],
    ["LOT 45A.2", "45A2"],
    ["B NO 45A-2", "45A2"],
    ["  45a2 ", "45A2"],
  ])("%s -> %s", (input, want) => expect(normalizeBatch(input)).toBe(want));
});

describe("matchMedicine", () => {
  it("exact batch + medicine = RED", () => {
    const r = matchMedicine({ name: "Paracetamol", batch: "PAMLA002" }, RECORDS);
    expect(r.level).toBe("RED");
    expect(r.reason).toBe("exact");
    expect(r.records[0].batch).toBe("PAMLA002");
  });

  it("brand name also matches = RED", () => {
    expect(matchMedicine({ name: "Alzomac", batch: "60098" }, RECORDS).level).toBe("RED");
  });

  it("prefix and format variants still RED", () => {
    for (const b of ["B.No: PAMLA-002", "batch no pamla 002", "Lot PAMLA/002", "B NO.PAMLA.002"]) {
      expect(matchMedicine({ name: "Paracetamol", batch: b }, RECORDS).level).toBe("RED");
    }
  });

  it("misspelt medicine name still RED", () => {
    expect(matchMedicine({ name: "Paracetmol", batch: "PAMLA002" }, RECORDS).level).toBe("RED");
    expect(matchMedicine({ name: "alprazolm", batch: "60098" }, RECORDS).level).toBe("RED");
  });

  it("batch one character off, same medicine = AMBER", () => {
    const r = matchMedicine({ name: "Paracetamol", batch: "PAMLA003" }, RECORDS);
    expect(r.level).toBe("AMBER");
    expect(r.reason).toBe("near-batch");
  });

  it("one character off but different medicine is not a near match", () => {
    expect(matchMedicine({ name: "Cetirizine", batch: "PAMLA003" }, RECORDS).level).toBe("GREY");
  });

  it("same batch, different medicine = AMBER (confirm), never RED", () => {
    const r = matchMedicine({ name: "Cetirizine", batch: "PAMLA002" }, RECORDS);
    expect(r.level).toBe("AMBER");
    expect(r.reason).toBe("batch-other-name");
  });

  it("unknown medicine = GREY", () => {
    const r = matchMedicine({ name: "Telmisartan", batch: "TX12345" }, RECORDS);
    expect(r.level).toBe("GREY");
    expect(r.records).toHaveLength(0);
  });

  it("empty input = GREY", () => {
    expect(matchMedicine({}, RECORDS).level).toBe("GREY");
  });

  it("expired batch on the alert list is still RED (expiry never hides an alert)", () => {
    const r = matchMedicine({ name: "Sporlac", batch: "BDS25003" }, RECORDS);
    expect(r.level).toBe("RED");
    expect(r.records[0].type).toBe("SPURIOUS");
  });

  it("company has an alert but batch not listed = AMBER company", () => {
    const r = matchMedicine(
      { name: "Some other tablet", batch: "ZZ9999", manufacturer: "M/s Laborate Pharmaceuticals India Limited" },
      RECORDS,
    );
    expect(r.level).toBe("AMBER");
    expect(r.reason).toBe("company");
  });

  it("similarly named company is NOT the same entity", () => {
    const r = matchMedicine({ name: "Some tablet", batch: "ZZ9999", manufacturer: "Laborate Pharma" }, RECORDS);
    expect(r.level).toBe("GREY");
  });

  it("'Under Investigation' never becomes a company match", () => {
    const r = matchMedicine({ name: "X", batch: "ZZ9999", manufacturer: "Under Investigation" }, RECORDS);
    expect(r.level).toBe("GREY");
  });

  it("no batch but medicine has alerts = AMBER (ask for batch)", () => {
    expect(matchMedicine({ name: "Paracetamol" }, RECORDS).reason).toBe("name-no-batch");
  });

  it("short batches never produce near matches", () => {
    const short = [rec({ name: "Paracetamol Tablets", batch: "A12", manufacturer: "X Ltd" })];
    expect(matchMedicine({ name: "Paracetamol", batch: "A13" }, short).level).toBe("GREY");
  });
});

describe("search", () => {
  it("finds medicines from a Hindi transcript via transliteration", () => {
    expect(transliterate("डोलो")).toBe("dolo");
    const names = searchNames(transliterate("डोलो"), RECORDS, ["Dolo 650", "Crocin"]);
    expect(names).toContain("Dolo 650");
  });
});
