import { describe, expect, it } from "vitest";
import { companyKey, companyMatch, companyTokens, tokenSetRatio } from "../src/lib/entity";
import { matchMedicine } from "../src/lib/match";
import { manufacturerEntity, normalizeBatch } from "../src/lib/normalize";
import type { AlertRecord } from "../src/lib/types";

const rec = (name: string, batch: string, manufacturer: string): AlertRecord => ({
  id: batch, type: "NSQ", name, batch, batchNorm: normalizeBatch(batch), manufacturer,
  manufacturerName: manufacturer.split(",")[0], manufacturerEntity: manufacturerEntity(manufacturer),
  reason: "", lab: "", month: "2025-03", sourceUrl: "https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug", status: "verified",
});
const R = [
  rec("Telmisartan Tablets IP 40mg", "251TTF014", "Swiss Garnier Life Sciences, Mehatpur, Una (H.P.)"),
  rec("Pantoprazole tablets IP", "P03524", "Spansules formulations India Pvt.Ltd, Plot 5"),
  rec("Tranexamic Acid Tablets IP 500 mg", "054A003", "FDC Limited, Goa"),
];

describe("company normalisation", () => {
  it("drops legal suffixes, M/s, punctuation and the address", () => {
    expect(companyTokens("M/s. Spansules Formulations India Pvt. Ltd., Plot 5")).toEqual(["SPANSULES", "FORMULATIONS"]);
    expect(companyKey("FDC Limited")).toBe("FDC");
  });
  it("standardises spelling of common words", () => {
    expect(companyKey("Swiss Garnier Life Sciences")).toBe(companyKey("SWISS GARNIER LIFESCIENCES PVT LTD"));
    expect(companyKey("Sun Pharmaceutical Industries Ltd")).toBe("SUN PHARMA");
  });
  it("alias table maps known short forms", () => {
    expect(companyKey("Cadila Healthcare Ltd")).toBe("ZYDUS LIFESCIENCES");
    expect(companyKey("GSK")).toBe(companyKey("GlaxoSmithKline Pharmaceuticals Limited"));
  });
  it("under investigation is never a company", () => {
    expect(companyKey("Under Investigation")).toBe("");
  });
});

describe("company similarity", () => {
  it("token-set ratio ignores order and extra words", () => {
    expect(tokenSetRatio(["SWISS", "GARNIER"], ["GARNIER", "SWISS"])).toBe(1);
  });
  it("bands", () => {
    expect(companyMatch("Spansules Formulations", "Spansules formulations India Pvt.Ltd").band).toBe("exact");
    expect(companyMatch("Spansuls Formulations", "Spansules formulations India Pvt.Ltd").band).toBe("high");
    expect(companyMatch("Swiss Garnier Biotech", "Swiss Garnier Life Sciences").band).toBe("medium");
    expect(companyMatch("Swiss Pharma", "Garnier Pharma").band).toBe("low");
    expect(companyMatch("Acme Pharma", "Zenith Pharma").band).toBe("low");
  });
});

describe("entity-aware matching rules", () => {
  it("exact batch + exact company = RED", () => {
    expect(matchMedicine({ batch: "251TTF014", manufacturer: "Swiss Garnier Lifesciences" }, R).level).toBe("RED");
  });
  it("exact batch + high-confidence company (typo) = RED", () => {
    expect(matchMedicine({ batch: "P03524", manufacturer: "Spansuls Formulations" }, R).level).toBe("RED");
  });
  it("exact batch + medium-confidence company = AMBER possible match, never GREY", () => {
    const r = matchMedicine({ batch: "251TTF014", manufacturer: "Swiss Garnier Biotech" }, R);
    expect(r.level).toBe("AMBER");
    expect(r.reason).toBe("possible-company");
  });
  it("exact batch + different company = AMBER, never GREY", () => {
    const r = matchMedicine({ batch: "054A003", manufacturer: "Zenith Remedies" }, R);
    expect(r.level).toBe("AMBER");
    expect(r.reason).toBe("batch-other-company");
  });
  it("company has action but batch not matched = AMBER company scope, not RED", () => {
    const r = matchMedicine({ batch: "QQ12345", manufacturer: "FDC Ltd" }, R);
    expect(r.level).toBe("AMBER");
    expect(r.reason).toBe("company");
  });
  it("OCR look-alike batch (0/O, 1/I, 5/S) = AMBER near-batch", () => {
    expect(matchMedicine({ batch: "PO3S24" }, R).reason).toBe("near-batch");
    expect(matchMedicine({ batch: "O54AOO3" }, R).reason).toBe("near-batch");
  });
  it("no record = GREY", () => {
    expect(matchMedicine({ batch: "NOPE999", manufacturer: "Nobody Pharma" }, R).level).toBe("GREY");
  });
});
