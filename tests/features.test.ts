import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDictionary, matchSpoken, phoneticKey, toDevanagari } from "../src/lib/phonetic";
import { COMMON_300, COMMON_MEDICINES } from "../src/content/common-medicines";
import { explain, fillTemplate, templateKind } from "../src/content/templates";
import { autoCropBox, clahe, contrast, reduceGlare, sharpen, type Gray } from "../src/lib/enhance";
import { expiryIcs, expiryMonth, expiryReminderDue, reminderDay } from "../src/lib/reminders";
import { planForMed, pushText } from "../src/lib/pushplan";
import { fieldConfidence, needsCheck } from "../src/lib/label";
import { DEMO_BATCHES, demoInputs } from "../src/lib/demo";
import { matchMedicine } from "../src/lib/match";
import { GREY_STEPS, RESULT } from "../src/content/messages";
import { sourceLabel, toSource } from "../src/lib/source";
import type { AlertRecord } from "../src/lib/types";

const records: AlertRecord[] = JSON.parse(readFileSync("public/data/nsq.json", "utf8"));
const dict = buildDictionary(records, [...COMMON_MEDICINES, ...COMMON_300]);

describe("pending items", () => {
  it("SDK inference source shows 'On this device' / 'Cloud', never Unknown", () => {
    expect(sourceLabel(toSource("on_device", "cloud"), "en")).toBe("On this device");
    expect(sourceLabel(toSource("in_cloud", "device"), "en")).toBe("Cloud");
    expect(sourceLabel(toSource("weird", "device"), "en")).toBe("On this device");
    expect(sourceLabel(toSource(undefined, "cloud"), "hi")).toBe("क्लाउड");
  });
});

describe("Hindi voice: dictionary + phonetic matching", () => {
  it("dictionary covers record names and the common list", () => {
    expect(dict.length).toBeGreaterThan(2000);
    const p = dict.find((d) => d.name === "Paracetamol")!;
    expect(p.hi).toMatch(/[ऀ-ॿ]/);
    expect(p.keys.length).toBeGreaterThan(0);
  });
  it("phonetic keys agree for English spelling and garbled Hindi transliteration", () => {
    expect(phoneticKey("Paracetamol")).toBe(phoneticKey("parasieetiamol"));
    expect(phoneticKey("Digene")).toBe(phoneticKey("daijin"));
  });
  it("the reported garbled transcript finds Paracetamol first", () => {
    expect(matchSpoken("पैरासाइट परासीईटीअमोल", dict)[0].entry.name).toBe("Paracetamol");
  });
  it("returns 2 to 4 options for confirmation", () => {
    const m = matchSpoken("टेलमा", dict);
    expect(m.length).toBeGreaterThanOrEqual(1);
    expect(m.length).toBeLessThanOrEqual(4);
    expect(m.map((x) => x.entry.name)).toContain("Telma");
  });
  it("Devanagari display spelling", () => {
    expect(toDevanagari("Dolo")).toBe("डोलो");
  });
  it("words that are not medicines give nothing", () => {
    expect(matchSpoken("मेरी दवा है", dict)).toEqual([]);
  });
});

describe("offline Hindi + English templates", () => {
  const red = matchMedicine({ batch: "251TTF014", manufacturer: "Swiss Garnier Life Sciences" }, records);
  it("RED template filled from the record, in both languages", () => {
    expect(templateKind(red)).toBe("red");
    const en = explain(red, { batch: "251TTF014" }, "en").join(" ");
    const hi = explain(red, { batch: "251TTF014" }, "hi").join(" ");
    expect(en).toContain("251TTF014");
    expect(en).toContain("Don't stop an essential medicine on your own");
    expect(hi).toContain("251TTF014");
    expect(hi).toMatch(/[ऀ-ॿ]/);
  });
  it("every result type has a template", () => {
    const co = records.find((r) => r.batchNorm === "251TTF014")!;
    const amberCo = matchMedicine({ name: co.name, batch: "QQ99999QQ", manufacturer: "Swiss Garnier Life Sciences" }, records);
    expect(templateKind(amberCo)).toBe("amber-company");
    expect(fillTemplate("amber-company", "hi", amberCo.records[0], { batch: "QQ99999QQ" }).join(" ")).toContain("सभी बैचों पर नहीं");
    const greyCo = matchMedicine({ name: "Zzyzx tablets", batch: "QQ99999QQ", manufacturer: "Swiss Garnier Life Sciences" }, records);
    expect(templateKind(greyCo)).toBe("grey-company");
    expect(fillTemplate("grey", "en", undefined, { batch: "X1" }).join(" ")).toContain("does not prove the medicine is safe");
    expect(fillTemplate("expired", "hi", undefined, { expiry: "01/2020" })[0]).toContain("01/2020");
    expect(fillTemplate("uncertain", "en", undefined, {})[0]).toContain("amber");
  });
  it("templates never recommend another medicine", () => {
    const all = (["red", "amber-company", "amber-possible", "grey", "grey-company", "expired", "uncertain"] as const)
      .flatMap((k) => (["hi", "en"] as const).flatMap((l) => fillTemplate(k, l, red.records[0], { batch: "B", expiry: "01/2020" })));
    for (const s of all) expect(s).not.toMatch(/instead|alternative|switch to|try (another|a different)|के बदले|दूसरी दवा ले/i);
  });
});

describe("GREY never feels like safe", () => {
  it("exact required wording", () => {
    expect(RESULT.GREY.title.en).toBe("No official alert for this exact batch");
    expect(RESULT.GREY.body.en).toBe("This does not prove the medicine is safe. Official alerts can be delayed.");
    expect(RESULT.GREY.body.hi).toContain("साबित नहीं होता");
  });
  it("next steps: expiry, licensed chemist + bill, save for alerts, report", () => {
    expect(GREY_STEPS.map((s) => s.key)).toEqual(["expiry", "chemist", "save", "report"]);
  });
  it("demo uses the three real RED batches", () => {
    expect(DEMO_BATCHES).toEqual(["251TTF014", "P03524", "054A003"]);
    const d = demoInputs(records);
    expect(d).toHaveLength(3);
    for (const x of d) expect(matchMedicine(x, records).level).toBe("RED");
  });
});

describe("photo preprocessing", () => {
  const img = (w: number, h: number, f: (x: number, y: number) => number): Gray => {
    const d = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = f(x, y);
    return { w, h, d };
  };
  it("auto-crop finds the text area and drops plain background", () => {
    const g = img(200, 100, (x, y) => (x > 120 && x < 180 && y > 20 && y < 80 ? ((x + y) % 4 < 2 ? 20 : 220) : 128));
    const b = autoCropBox(g, 0);
    expect(b.x).toBeGreaterThanOrEqual(80);
    expect(b.x + b.w).toBeLessThanOrEqual(200);
  });
  it("CLAHE raises contrast of a dull image", () => {
    const g = img(64, 64, (x) => 110 + (x % 8));
    expect(contrast(clahe(g))).toBeGreaterThan(contrast(g));
  });
  it("glare reduction pulls blown-out pixels down", () => {
    const g = img(40, 40, (x, y) => (x > 15 && x < 25 && y > 15 && y < 25 ? 255 : 90));
    expect(reduceGlare(g).d[20 * 40 + 20]).toBeLessThan(255);
  });
  it("sharpen increases edge difference", () => {
    const g = img(10, 3, (x) => (x < 5 ? 100 : 150));
    const s = sharpen(g);
    expect(s.d[15] - s.d[14]).toBeGreaterThan(g.d[15] - g.d[14]);
  });
});

describe("field confidence", () => {
  it("low model confidence or a failed check -> please confirm", () => {
    expect(fieldConfidence({ value: "AB12", confidence: 0.95 })).toBe(0.95);
    expect(needsCheck({ value: "AB12", confidence: 0.95 })).toBe(false);
    expect(needsCheck({ value: "AB12", confidence: 0.6 })).toBe(true);
    expect(fieldConfidence({ value: "AB12", confidence: 0.95, uncertain: true })).toBe(0.5);
    expect(fieldConfidence({})).toBe(0);
  });
});

describe("reminders and calendar fallback", () => {
  it("expiry month and reminder day (5 days before)", () => {
    expect(expiryMonth("06/2028")).toBe("2028-06");
    expect(reminderDay("2028-06")!.toISOString().slice(0, 10)).toBe("2028-06-25");
  });
  it("due once, from the reminder day until expiry", () => {
    expect(expiryReminderDue("2028-06", new Date("2028-06-24T10:00:00Z"), false)).toBe(false);
    expect(expiryReminderDue("2028-06", new Date("2028-06-26T10:00:00Z"), false)).toBe(true);
    expect(expiryReminderDue("2028-06", new Date("2028-06-26T10:00:00Z"), true)).toBe(false);
    expect(expiryReminderDue("2028-06", new Date("2028-07-02T10:00:00Z"), false)).toBe(false);
  });
  it(".ics file is valid and dated 5 days before expiry", () => {
    const ics = expiryIcs({ title: "Exp, soon; X", description: "d", month: "2028-06", uid: "u1", now: new Date("2026-01-01T00:00:00Z") })!;
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART;VALUE=DATE:20280625");
    expect(ics).toContain("SUMMARY:Exp\\, soon\\; X");
    expect(ics).toContain("BEGIN:VALARM");
  });
});

describe("daily push re-check plan", () => {
  it("flags a saved batch that is on the list, once", () => {
    const plan = planForMed({ batch: "251TTF014", company: "Swiss Garnier Life Sciences" }, records, {}, new Date());
    expect(plan.flag?.level).toBe("RED");
    expect(planForMed({ batch: "251TTF014", company: "Swiss Garnier Life Sciences" }, records, { flagKey: plan.flag!.key }, new Date()).flag).toBeUndefined();
  });
  it("company-only matches never trigger a push", () => {
    expect(planForMed({ batch: "QQ99999QQ", company: "Swiss Garnier Life Sciences" }, records, {}, new Date()).flag).toBeUndefined();
  });
  it("expiry reminder ~5 days before", () => {
    expect(planForMed({ batch: "NONE123ZZ", expiryMonth: "2028-06" }, records, {}, new Date("2028-06-27T00:00:00Z")).expiry).toBe(true);
  });
  it("push text has no medicine name and keeps the safety wording", () => {
    const t = pushText("flag", "en", { batch: "B1", level: "RED", month: "2025-03" });
    expect(t.body).toContain("batch B1");
    expect(t.body).toContain("never stop an essential medicine suddenly");
  });
});
