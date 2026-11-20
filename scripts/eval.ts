// Evaluation harness: npm run eval
//   a) Matching: labelled cases from the 55 hand-verified records + generated hard
//      cases (format variants, misspellings, company variants, OCR swaps 0/O 1/I 5/S)
//      + negatives. Reports precision, recall, false-GREY rate.
//   b) Speech: garbled Hindi/English transcripts -> correct medicine; top-1 / top-3.
//   c) Photo: strip images in data/eval_images (see its README); per-field accuracy.
// Writes docs/EVAL.md and src/content/eval-results.json (shown on "How it works").
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { matchMedicine } from "../src/lib/match";
import { normalizeBatch } from "../src/lib/normalize";
import { buildDictionary, matchSpoken } from "../src/lib/phonetic";
import { COMMON_300, COMMON_MEDICINES } from "../src/content/common-medicines";
import type { AlertRecord, MatchInput } from "../src/lib/types";

const records: AlertRecord[] = JSON.parse(readFileSync("public/data/nsq.json", "utf8"));
const meta = JSON.parse(readFileSync("public/data/meta.json", "utf8"));

// ---------- CSV ----------
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { cur.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; cur.push(f); rows.push(cur); cur = []; f = ""; }
    else f += c;
  }
  if (f || cur.length) { cur.push(f); rows.push(cur); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

// ---------- a) Matching ----------
type Expect = "flag" | "grey";
interface Case { group: string; input: MatchInput; expect: Expect; wantRed?: boolean }

const verified = parseCsv(readFileSync("data/verified_records.csv", "utf8"));
const byKey = new Map(records.map((r) => [`${r.batchNorm}|${r.month}|${r.type}`, r]));
const base = verified.map((v) => byKey.get(`${v.batch_norm}|${v.month}|${v.type}`)).filter((r): r is AlertRecord => !!r);

const OCR: Record<string, string> = { "0": "O", O: "0", "1": "I", I: "1", "5": "S", S: "5" };
const firstWord = (n: string) => n.split(/[\s,(]+/).find((w) => w.length >= 4) ?? n;
const misspell = (w: string) => (w.length > 5 ? w.slice(0, 3) + w.slice(4) : w); // drop one letter
const companyVariant = (c: string) => {
  const s = c.replace(/\bPharmaceuticals?\b/i, "Pharma").replace(/\bLaboratories\b/i, "Labs").replace(/\s*(Pvt\.?|Private)\s*(Ltd\.?|Limited)?/i, " ");
  return s === c ? `M/s ${c} Pvt. Ltd.` : s;
};
const ocrSwap = (b: string): string | null => {
  const i = [...b].findIndex((ch) => OCR[ch]);
  return i < 0 ? null : b.slice(0, i) + OCR[b[i]] + b.slice(i + 1);
};

const cases: Case[] = [];
for (const r of base) {
  const name = firstWord(r.brand || r.name);
  const co = r.manufacturerName || r.manufacturer;
  const hasCo = !/investigation/i.test(co);
  cases.push({ group: "exact name + batch", input: { name: r.name, batch: r.batch }, expect: "flag", wantRed: true });
  cases.push({ group: "format variant (B.No., spaces, hyphens, lowercase)", input: { name, batch: `B.No. ${r.batch.toLowerCase().replace(/(.{2})/, "$1 - ")}` }, expect: "flag", wantRed: true });
  cases.push({ group: "misspelt medicine name", input: { name: misspell(name), batch: r.batch }, expect: "flag", wantRed: true });
  if (hasCo) {
    cases.push({ group: "batch + exact company", input: { batch: r.batch, manufacturer: co }, expect: "flag", wantRed: true });
    cases.push({ group: "batch + company spelling variant", input: { batch: r.batch, manufacturer: companyVariant(co) }, expect: "flag", wantRed: true });
  }
  const sw = ocrSwap(r.batchNorm);
  if (sw && !records.some((x) => x.batchNorm === sw)) cases.push({ group: "OCR swap (0/O, 1/I, 5/S)", input: { name, batch: sw }, expect: "flag" });
}
// Negatives: same medicines, batch numbers that are not on any list.
const allBatches = new Set(records.map((r) => r.batchNorm));
for (const r of base) {
  let b = r.batchNorm.split("").reverse().join("") + "7Q";
  let k = 0;
  while (allBatches.has(b)) b = `${b}${k++}`;
  cases.push({ group: "negative: unlisted batch", input: { name: firstWord(r.name), batch: b }, expect: "grey" });
  cases.push({ group: "negative: unlisted batch + unrelated company", input: { batch: `ZX${b}`, manufacturer: "Zzyzx Remedies Pvt Ltd" }, expect: "grey" });
}

let tp = 0, fp = 0, fn = 0, tn = 0, redOk = 0, redWant = 0;
const groups = new Map<string, { n: number; ok: number }>();
const misses: string[] = [];
const t0 = performance.now();
for (const c of cases) {
  const r = matchMedicine(c.input, records);
  const flagged = r.level !== "GREY";
  const ok = (c.expect === "flag") === flagged;
  if (c.expect === "flag") { if (flagged) tp++; else fn++; } else { if (flagged) fp++; else tn++; }
  if (c.wantRed) { redWant++; if (r.level === "RED") redOk++; }
  const g = groups.get(c.group) ?? { n: 0, ok: 0 };
  g.n++; if (ok && (!c.wantRed || r.level === "RED")) g.ok++;
  groups.set(c.group, g);
  if (!ok && misses.length < 15) misses.push(`${c.group}: ${JSON.stringify(c.input)} -> ${r.level}/${r.reason}`);
}
const matchMs = (performance.now() - t0) / cases.length;
const matching = {
  cases: cases.length, verifiedRecords: base.length,
  precision: tp / Math.max(1, tp + fp), recall: tp / Math.max(1, tp + fn), falseGreyRate: fn / Math.max(1, tp + fn),
  redWhenExact: redOk / Math.max(1, redWant), msPerCheck: Math.round(matchMs * 100) / 100,
  groups: [...groups.entries()].map(([g, v]) => ({ group: g, cases: v.n, accuracy: v.ok / v.n })),
};

// ---------- b) Speech ----------
const speechCases: { heard: string; want: string }[] = JSON.parse(readFileSync("eval/speech_cases.json", "utf8"));
const dict = buildDictionary(records, [...COMMON_MEDICINES, ...COMMON_300]);
let top1 = 0, top3 = 0;
const speechMiss: string[] = [];
for (const c of speechCases) {
  const got = matchSpoken(c.heard, dict, 4).map((m) => m.entry.name.toLowerCase());
  const w = c.want.toLowerCase();
  if (got[0] === w) top1++;
  if (got.slice(0, 3).includes(w)) top3++;
  else speechMiss.push(`${c.heard} -> ${got.join(" | ") || "(none)"} (want ${c.want})`);
}
const speech = { cases: speechCases.length, top1: top1 / speechCases.length, top3: top3 / speechCases.length, dictionary: dict.length };

// ---------- c) Photo ----------
const IMG_DIR = "data/eval_images";
const images = existsSync(IMG_DIR) ? readdirSync(IMG_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)) : [];
let photo: { images: number; fields: Record<string, number> | null; note: string } = { images: images.length, fields: null, note: "" };
if (!images.length) {
  photo.note = "No strip images in data/eval_images yet (see its README).";
} else {
  try {
    const out = execFileSync(process.execPath, ["scripts/eval-photo.mjs"], { encoding: "utf8", timeout: 20 * 60_000 });
    const res = JSON.parse(out.trim().split("\n").pop()!);
    photo = { images: images.length, fields: res.fields, note: res.note ?? "" };
  } catch (e) {
    photo.note = `Photo eval failed to run: ${(e as Error).message.split("\n")[0]}`;
  }
}

// ---------- write ----------
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const results = { generatedAt: new Date().toISOString().slice(0, 10), datasetVersion: meta.version, records: records.length, matching, speech, photo };
writeFileSync("src/content/eval-results.json", JSON.stringify(results, null, 2) + "\n");

const md = `# DawaShield evaluation

Generated by \`npm run eval\` on ${results.generatedAt} against dataset \`${meta.version}\` (${records.length.toLocaleString("en-IN")} CDSCO records, latest alert month ${meta.latestMonth}).

## a) Matching (rule-based engine, no AI)

Test set: built from the **${base.length} hand-verified records** in \`data/verified_records.csv\`, plus generated hard cases and negatives — **${cases.length} labelled cases**.

| Metric | Value |
|---|---|
| Precision (flagged that should be flagged) | **${pct(matching.precision)}** |
| Recall (should be flagged and was) | **${pct(matching.recall)}** |
| False-GREY rate (should be flagged, shown GREY) | **${pct(matching.falseGreyRate)}** |
| RED when batch and medicine/company are exact | ${pct(matching.redWhenExact)} |
| Time per check (${records.length.toLocaleString("en-IN")} records, laptop) | ${matching.msPerCheck} ms |

"Flagged" = RED or AMBER. OCR-swap cases are expected AMBER ("possible match"), never RED.

| Case group | Cases | Correct |
|---|---|---|
${matching.groups.map((g) => `| ${g.group} | ${g.cases} | ${pct(g.accuracy)} |`).join("\n")}

${misses.length ? "Misses:\n\n" + misses.map((m) => "- `" + m + "`").join("\n") : "No misses."}

**Limits.** The generated cases are derived from real records, so they test robustness to spelling/format/OCR noise, not completely unseen data. Negatives are synthetic unlisted batch numbers.

## b) Hindi / English speech matching (offline, no AI)

${speech.cases} garbled speech-to-text transcripts (mostly Devanagari, e.g. "पैरासाइट परासीईटीअमोल") mapped to the intended medicine, matched against a ${speech.dictionary.toLocaleString("en-IN")}-name dictionary (all record names + ~300 common Indian names).

| Metric | Value |
|---|---|
| Top-1 accuracy | **${pct(speech.top1)}** |
| Top-3 accuracy (user picks from big buttons) | **${pct(speech.top3)}** |

${speechMiss.length ? "Not in top 3:\n\n" + speechMiss.map((m) => "- " + m).join("\n") : "All cases in the top 3."}

**Limits.** Transcripts were written to imitate real Chrome hi-IN output; they are not recordings from real users.

## c) Photo reading

${photo.images ? `${photo.images} images evaluated. ${photo.fields ? "Per-field accuracy:\n\n| Field | Accuracy |\n|---|---|\n" + Object.entries(photo.fields).map(([k, v]) => `| ${k} | ${pct(v)} |`).join("\n") : ""} ${photo.note}` : photo.note + " Add photos and labels, then run `npm run eval` again."}

## How to reproduce

\`\`\`
npm run eval
\`\`\`
`;
writeFileSync("docs/EVAL.md", md);
console.log(JSON.stringify({ matching: { cases: matching.cases, precision: pct(matching.precision), recall: pct(matching.recall), falseGrey: pct(matching.falseGreyRate), red: pct(matching.redWhenExact) }, speech: { top1: pct(speech.top1), top3: pct(speech.top3) }, photo }, null, 1));
if (misses.length) console.log("misses:\n" + misses.join("\n"));
if (speechMiss.length) console.log("speech misses:\n" + speechMiss.join("\n"));
