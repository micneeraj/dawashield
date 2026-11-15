import { describe, expect, it } from "vitest";
import { looksLikeLicence, mergeLabels, needsCheck, parseLabel, validateLabel } from "../src/lib/label";

const read = (json: object) => validateLabel(parseLabel(JSON.stringify(json))!);

// Real strip test: Orofer XT (Emcure). The model read the Mfg. Lic. No. as the
// batch and the MFD as the expiry. Real values: "B.No. E166L26..." printed
// sideways, "EXP. JUN 2028".
describe("Orofer XT strip (licence number / MFD mix-up)", () => {
  const wrongRead = {
    name: { value: "Orofer XT", source: "Orofer XT", confidence: 0.95 },
    manufacturer: { value: "Emcure Pharmaceuticals Ltd.", source: "Mfd. by: Emcure Pharmaceuticals Ltd.", confidence: 0.9 },
    batch: { value: "01/08/09/156", source: "Mfg. Lic. No. JK/01/08-09/156", confidence: 0.7 },
    expiry: { value: "Jul 2026", source: "MFD. JUL 2026", confidence: 0.8 },
  };

  it("licence number is NOT taken as batch", () => {
    const r = read(wrongRead);
    expect(r.batch.value).toBeUndefined();
    expect(r.batch.uncertain).toBe(true);
    expect(needsCheck(r.batch)).toBe(true);
  });

  it("MFD is NOT taken as expiry", () => {
    const r = read(wrongRead);
    expect(r.expiry.value).toBeUndefined();
    expect(r.expiry.uncertain).toBe(true);
  });

  it("licence pattern is rejected even without source text", () => {
    for (const v of ["JK/01/08-09/156", "01/08/09/156", "01/08-09/156", "Mfg Lic 156"]) {
      expect(looksLikeLicence(v)).toBe(true);
      expect(read({ batch: v }).batch.value).toBeUndefined();
    }
  });

  it("correct reading is kept: batch after B.No., expiry after EXP", () => {
    const r = read({
      ...wrongRead,
      batch: { value: "E166L26", source: "B.No. E166L26", confidence: 0.85 },
      expiry: { value: "JUN 2028", source: "EXP. JUN 2028", confidence: 0.9 },
      mfd: { value: "JUL 2026", source: "MFD. JUL 2026", confidence: 0.9 },
    });
    expect(r.batch.value).toBe("E166L26");
    expect(r.batch.uncertain).toBeFalsy();
    expect(r.expiry.value).toBe("JUN 2028");
    expect(r.expiry.uncertain).toBeFalsy();
  });

  it("expiry earlier than or equal to MFD is flagged uncertain", () => {
    const r = read({ expiry: { value: "JUL 2026", source: "JUL 2026" }, mfd: { value: "JUN 2028", source: "JUN 2028" }, name: "x" });
    expect(r.expiry.uncertain).toBe(true);
    const same = read({ expiry: "07/2026", mfd: "07/2026", name: "x" });
    expect(same.expiry.uncertain).toBe(true);
  });

  it("if MFD and EXP were swapped, expiry becomes the later date labelled EXP", () => {
    const r = read({ expiry: { value: "JUL 2026", source: "JUL 2026" }, mfd: { value: "JUN 2028", source: "EXP. JUN 2028" }, name: "x" });
    expect(r.expiry.value).toBe("JUN 2028");
    expect(r.expiry.uncertain).toBe(true); // still asks the user to confirm
  });

  it("two photos merge: front gives name/company, side gives batch/expiry", () => {
    const front = read({ name: wrongRead.name, manufacturer: wrongRead.manufacturer, batch: wrongRead.batch });
    const side = read({
      batch: { value: "E166L26", source: "B.No. E166L26", confidence: 0.8 },
      expiry: { value: "JUN 2028", source: "EXP. JUN 2028", confidence: 0.85 },
      mfd: { value: "JUL 2026", source: "MFD. JUL 2026" },
    });
    const m = mergeLabels(front, side)!;
    expect(m.name.value).toBe("Orofer XT");
    expect(m.manufacturer.value).toBe("Emcure Pharmaceuticals Ltd.");
    expect(m.batch.value).toBe("E166L26");
    expect(m.expiry.value).toBe("JUN 2028");
  });
});

describe("label checks keep real batches", () => {
  it("real CDSCO batch formats are not mistaken for licences", () => {
    for (const b of ["D0004/25-26", "AOT244-00B", "251TTF014", "VSR1-05", "ST 211"]) {
      expect(looksLikeLicence(b)).toBe(false);
    }
  });
  it("low confidence or missing source label is marked uncertain, not dropped", () => {
    const r = read({ batch: { value: "E166L26", source: "E166L26", confidence: 0.4 } });
    expect(r.batch.value).toBe("E166L26");
    expect(r.batch.uncertain).toBe(true);
  });
  it("null fields are missing, never guessed", () => {
    const r = read({ name: "Orofer XT", batch: null, expiry: { value: null, source: null } });
    expect(r.batch.value).toBeUndefined();
    expect(needsCheck(r.batch)).toBe(true);
    expect(needsCheck(r.expiry)).toBe(true);
  });
  it("fenced JSON still parses", () => {
    expect(parseLabel('```json\n{"batch":{"value":"E166L26","source":"B.No. E166L26"}}\n```')?.batch.value).toBe("E166L26");
  });
});
