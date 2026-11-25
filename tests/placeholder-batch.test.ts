import { describe, expect, it } from "vitest";
import { matchMedicine } from "../src/lib/match";
import { manufacturerEntity, normalizeBatch } from "../src/lib/normalize";
import type { AlertRecord } from "../src/lib/types";

// A record whose batch was not printed (placeholder): the pipeline stores batchNorm "".
const UNSPECIFIED: AlertRecord = {
  id: "ph1",
  type: "NSQ",
  name: "Codeine Phosphate & Triprolidine Hydrochloride Syrup",
  brand: "",
  batch: "Not Mention",
  batchNorm: "",
  batchUnspecified: true,
  manufacturer: "Wings Biotech LLP, Baddi",
  manufacturerName: "Wings Biotech LLP",
  manufacturerEntity: manufacturerEntity("Wings Biotech LLP, Baddi"),
  reason: "Content of Triprolidine Hydrochloride",
  lab: "Lucknow",
  month: "2026-10",
  sourceUrl: "https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug",
  status: "pending",
} as AlertRecord;

describe("placeholder batch values never produce an exact-batch match", () => {
  for (const typed of ["Not Mention", "NOT MENTIONED", "NIL", "NA", "Not applicable"]) {
    it(`typed "${typed}" against an unspecified-batch record is not RED`, () => {
      const r = matchMedicine(
        { name: UNSPECIFIED.name, batch: typed, manufacturer: "Wings Biotech LLP" },
        [UNSPECIFIED],
      );
      expect(r.level).not.toBe("RED");
      expect(r.reason).not.toBe("exact");
    });
  }

  it("the normalised placeholder is not treated as a real batch", () => {
    expect(normalizeBatch("Not Mention")).toBe("NOTMENTION");
    expect(UNSPECIFIED.batchNorm).toBe("");
  });

  it("a real printed batch still matches exactly", () => {
    const real: AlertRecord = { ...UNSPECIFIED, id: "r1", batch: "GT60004", batchNorm: "GT60004", batchUnspecified: false, name: "Cefixime Tablets 200mg", manufacturer: "Omega Pharma", manufacturerName: "Omega Pharma", manufacturerEntity: manufacturerEntity("Omega Pharma") } as AlertRecord;
    const r = matchMedicine({ name: "Cefixime Tablets 200mg", batch: "GT60004", manufacturer: "Omega Pharma" }, [real]);
    expect(r.level).toBe("RED");
  });
});
