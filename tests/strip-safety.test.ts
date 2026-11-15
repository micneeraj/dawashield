import { describe, expect, it } from "vitest";
import { compareReads, expiryForCheck, expiryNeedsConfirm, needsCheck, needsCloserPhoto, parseLabel, parseStripRead, preferCrop, sameValue, validateLabel } from "../src/lib/label";
import { cropRect, cropZoom, fullScale, isSmallBox, MIN_LONG_SIDE } from "../src/lib/image";

const read = (o: object) => validateLabel(parseLabel(JSON.stringify(o))!);
const NOW = new Date(2026, 10, 15);

// Real live-site failure: far, sideways Orofer XT photo. Strip says B.No. E166L26, EXP. JUN 2028.
const good = { name: { value: "Orofer XT", source: "Orofer XT", confidence: 0.95 }, batch: { value: "E166L26", source: "B.No. E166L26", confidence: 0.8 }, expiry: { value: "JUN 2028", source: "EXP. JUN 2028", confidence: 0.8 }, mfd: { value: "JUL 2026", source: "MFD. JUL 2026", confidence: 0.8 } };
const bad = { ...good, batch: { value: "E166L23", source: "B.No. E166L23", confidence: 0.8 }, expiry: { value: "JUN 2025", source: "EXP. JUN 2025", confidence: 0.8 }, mfd: {} };

describe("1. full resolution + zoomed crop", () => {
  it("never downscales a normal phone photo; big photos stay >= 2000px", () => {
    expect(fullScale(4000, 3000) * 4000).toBeGreaterThanOrEqual(MIN_LONG_SIDE);
    expect(fullScale(3000, 2000)).toBe(1);
    expect(fullScale(1200, 900)).toBe(1);
  });
  it("small B.No/EXP box triggers a crop, zoomed toward 2000px", () => {
    expect(isSmallBox([400, 600, 480, 700])).toBe(true);
    expect(isSmallBox([100, 100, 900, 900])).toBe(false);
    const r = cropRect([400, 600, 480, 700], 4000, 3000);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(4000);
    expect(r.w).toBeGreaterThan(400); // padded beyond the box
    expect(cropZoom(r.w, r.h)).toBeGreaterThan(1);
  });
  it("crop read is used for batch and expiry", () => {
    const out = preferCrop(read(bad), read(good))!;
    expect(out.batch.value).toBe("E166L26");
    expect(out.expiry.value).toBe("JUN 2028");
    expect(out.name.value).toBe("Orofer XT");
  });
  it("parses image_quality and box", () => {
    const s = parseStripRead(JSON.stringify({ ...good, image_quality: "too small", batch_expiry_box: [400, 600, 480, 700] }))!;
    expect(s.quality).toBe("too_small");
    expect(s.box).toEqual([400, 600, 480, 700]);
  });
});

describe("2. two independent reads", () => {
  it("reads that differ on batch and expiry mark both uncertain (amber)", () => {
    const out = compareReads(read(good), read(bad))!;
    expect(out.batch.uncertain).toBe(true);
    expect(out.expiry.uncertain).toBe(true);
    expect(needsCheck(out.batch)).toBe(true);
    expect(needsCheck(out.expiry)).toBe(true);
  });
  it("agreeing reads stay confident", () => {
    const out = compareReads(read(good), read({ ...good, expiry: { value: "06/2028", source: "EXP 06/2028", confidence: 0.9 } }))!;
    expect(out.batch.uncertain).toBeFalsy();
    expect(out.expiry.uncertain).toBeFalsy();
  });
  it("same-value compare ignores spacing and date format", () => {
    expect(sameValue("batch", "E166 L26", "e166l26")).toBe(true);
    expect(sameValue("batch", "E166L26", "E166L23")).toBe(false);
    expect(sameValue("expiry", "JUN 2028", "06/2028")).toBe(true);
  });
  it("only one read succeeded -> batch/expiry uncertain", () => {
    const out = compareReads(read(good), null)!;
    expect(out.batch.uncertain).toBe(true);
    expect(out.expiry.uncertain).toBe(true);
  });
});

describe("3. expiry safety", () => {
  it("past expiry needs confirmation and is not passed to the check until confirmed", () => {
    const r = read(bad);
    expect(expiryNeedsConfirm(r, NOW)).toBe(true);
    expect(expiryForCheck("JUN 2025", { needsConfirm: true, confirmed: false, edited: false }, NOW)).toBeUndefined();
    expect(expiryForCheck("JUN 2025", { needsConfirm: true, confirmed: true, edited: false }, NOW)).toBe("JUN 2025");
    expect(expiryForCheck("JUN 2025", { needsConfirm: true, confirmed: false, edited: true }, NOW)).toBe("JUN 2025");
  });
  it("missing MFD needs confirmation even for a future date (but future date still counts)", () => {
    const r = read({ ...good, mfd: {} });
    expect(expiryNeedsConfirm(r, NOW)).toBe(true);
    expect(expiryForCheck("JUN 2028", { needsConfirm: true, confirmed: false, edited: false }, NOW)).toBe("JUN 2028");
  });
  it("future expiry with MFD needs no extra confirmation", () => {
    expect(expiryNeedsConfirm(read(good), NOW)).toBe(false);
  });
});

describe("4. blurry / small text -> ask for a closer photo", () => {
  it("bad quality with missing batch or expiry asks for a closer photo", () => {
    expect(needsCloserPhoto({ reading: read({ ...good, batch: null }), quality: "blurry" })).toBe(true);
    expect(needsCloserPhoto({ reading: read({ ...good, expiry: null }), quality: "too_small" })).toBe(true);
    expect(needsCloserPhoto({ reading: null, quality: "too_small" })).toBe(true);
  });
  it("a clear read does not", () => {
    expect(needsCloserPhoto({ reading: read(good), quality: "ok" })).toBe(false);
  });
  it("too_small reply with no fields is still understood (not a parse failure)", () => {
    const s = parseStripRead(JSON.stringify({ image_quality: "too_small" }))!;
    expect(s).not.toBeNull();
    expect(needsCloserPhoto(s)).toBe(true);
  });
});
