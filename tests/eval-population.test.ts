import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Pins the full-population and negative-control results written by scripts/eval-population.ts.
const p = JSON.parse(readFileSync(resolve(__dirname, "../src/content/eval-population.json"), "utf8"));

describe("full-population check (CDSCO records as ground truth)", () => {
  it("every record with a printed batch is found as RED", () => {
    // Compared with the published dataset itself, so the check follows the data as it is refreshed.
    const nsq = JSON.parse(readFileSync(resolve(__dirname, "../public/data/nsq.json"), "utf8"));
    expect(p.fullPopulation.total).toBe(nsq.length);
    expect(p.fullPopulation.exactBatchTestable + p.fullPopulation.unspecifiedBatch.total).toBe(nsq.length);
    expect(p.fullPopulation.exactRed).toBe(p.fullPopulation.exactBatchTestable);
    expect(p.fullPopulation.exactNotRed).toBe(0);
  });

  it("records with no printed batch never produce an exact-batch RED", () => {
    expect(p.fullPopulation.unspecifiedBatch.redMustBeZero).toBe(0);
    expect(p.fullPopulation.unspecifiedBatch.byLevel.RED ?? 0).toBe(0);
  });
});

describe("negative control (batches absent from the dataset)", () => {
  it("2,000 seeded synthetic batches, all GREY", () => {
    expect(p.negativeControl.seed).toBe(20261125);
    expect(p.negativeControl.total).toBe(2000);
    expect(p.negativeControl.grey).toBe(2000);
    expect(p.negativeControl.notGrey).toBe(0);
  });
});
