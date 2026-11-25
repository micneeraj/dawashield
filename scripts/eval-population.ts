// Full-population checks. Ground truth comes from the CDSCO dataset itself
// (public/data/nsq.json), NOT from labels the author wrote.
//   1. Full-population: every official record, run with its own batch + medicine + company. Expected RED.
//   2. Negative control: seeded synthetic batches that appear nowhere in the dataset, with a company
//      not in the dataset. Expected GREY.
// Usage: npx tsx scripts/eval-population.ts   (writes docs/EVAL-POPULATION.md and prints JSON)
import { readFileSync, writeFileSync } from "node:fs";
import { matchMedicine } from "../src/lib/match";
import type { AlertRecord, MatchInput } from "../src/lib/types";

const records: AlertRecord[] = JSON.parse(readFileSync("public/data/nsq.json", "utf8"));
const meta = JSON.parse(readFileSync("public/data/meta.json", "utf8"));

// ---- 1. Full population ----
const reds: number[] = [];
const notRed: { i: number; batch: string; name: string; company: string; got: string; reason: string }[] = [];
records.forEach((r, i) => {
  const company = r.manufacturerName || r.manufacturer;
  const input: MatchInput = { name: r.brand || r.name, batch: r.batch, manufacturer: company };
  const res = matchMedicine(input, records);
  if (res.level === "RED") reds.push(i);
  else notRed.push({ i, batch: r.batch, name: input.name ?? "", company, got: res.level, reason: res.reason });
});

// ---- 2. Negative control (seeded, reproducible) ----
// Small seeded PRNG (mulberry32) so the same seed gives the same 2,000 strings.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 20261125;
const N = 2000;
const rand = rng(SEED);
const datasetBatches = new Set(records.map((r) => r.batch.toUpperCase().replace(/[^A-Z0-9]/g, "")));
const companies = new Set(records.map((r) => (r.manufacturerName || r.manufacturer).toLowerCase()));
const decoyCompanies = ["Zzyzx Remedies Pvt Ltd", "Quorvex Pharma Labs", "Nimbuspath Biologicals", "Kestrelon Health Care", "Vorlandic Formulations", "Pemblewick Drugs Co"]
  .filter((c) => !companies.has(c.toLowerCase()));

// Same character pattern as real batches: take a real batch's shape (letters vs digits per position).
const shapes = records.map((r) => r.batch.toUpperCase().replace(/[^A-Z0-9]/g, "")).filter((b) => b.length >= 4 && b.length <= 12);
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O to avoid look-alike digits
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const negatives: { batch: string; name: string; company: string; got: string; reason: string }[] = [];
let produced = 0;
while (negatives.length < N) {
  const shape = pick(shapes);
  let b = "";
  for (const ch of shape) {
    if (/[A-Z]/.test(ch)) b += pick([...ALPHA]);
    else b += String(Math.floor(rand() * 10));
  }
  if (datasetBatches.has(b)) continue; // must appear nowhere in the dataset
  produced++;
  const r = pick(records);
  const company = pick(decoyCompanies);
  const res = matchMedicine({ name: r.brand || r.name, batch: b, manufacturer: company }, records);
  negatives.push({ batch: b, name: r.brand || r.name, company, got: res.level, reason: res.reason });
}
const notGrey = negatives.filter((n) => n.got !== "GREY");

const out = {
  dataset: { records: records.length, latestMonth: meta.latestMonth },
  fullPopulation: { total: records.length, red: reds.length, notRed: notRed.length, notRedList: notRed.slice(0, 200) },
  negativeControl: { seed: SEED, total: negatives.length, grey: negatives.length - notGrey.length, notGrey: notGrey.length, notGreyList: notGrey.slice(0, 200), generatedAttempts: produced },
};
writeFileSync("src/content/eval-population.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify({ fullPopulation: { total: out.fullPopulation.total, red: out.fullPopulation.red, notRed: out.fullPopulation.notRed }, negativeControl: { total: out.negativeControl.total, grey: out.negativeControl.grey, notGrey: out.negativeControl.notGrey, seed: SEED } }, null, 1));
