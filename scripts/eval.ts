// Evaluation harness: npm run eval
//   a) Matching: labelled cases, each tagged REAL (a real CDSCO record or a real
//      strip) or GENERATED (a variant derived from a real record). Expected result
//      is one of RED / AMBER / GREY / CAN'T READ. Reports false-RED rate,
//      false-GREY rate and a 4x4 confusion table, plus adversarial groups:
//      same batch across companies, similar batches, same company + different
//      medicine (the Dolo case), incomplete batch, wrong expiry extraction.
//   b) Speech: garbled Hindi/English transcripts + GENERATED garbled transcripts
//      in Punjabi, Gujarati, Marathi, Kannada and Tamil; top-1 / top-3 per language.
//   c) Photo: strip images in data/eval_images with labels.csv; per-field accuracy,
//      correctly-refused rate, flagged batches caught without manual correction.
// Writes docs/EVAL.md and src/content/eval-results.json (shown in the app).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { matchMedicine, sameMedicine } from "../src/lib/match";
import { buildDictionary, matchSpoken } from "../src/lib/phonetic";
import { nameTokens } from "../src/lib/normalize";
import { companyMatch, isConfident } from "../src/lib/entity";
import { transliterateName, type Regional } from "../src/lib/indic";
import { COMMON_300, COMMON_MEDICINES } from "../src/content/common-medicines";
import type { AlertRecord, Level, MatchInput } from "../src/lib/types";

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
type Origin = "real" | "generated";
interface Case { group: string; origin: Origin; input: MatchInput & { expiry?: string }; expect: Level }

const verified = parseCsv(readFileSync("data/verified_records.csv", "utf8"));
const byKey = new Map(records.map((r) => [`${r.batchNorm}|${r.month}|${r.type}`, r]));
const base = verified.map((v) => byKey.get(`${v.batch_norm}|${v.month}|${v.type}`)).filter((r): r is AlertRecord => !!r);

const OCR: Record<string, string> = { "0": "O", O: "0", "1": "I", I: "1", "5": "S", S: "5" };
const firstWord = (n: string) => { const t = nameTokens(n).find((w) => /^[A-Z]{4,}$/.test(w)); return t ? t[0] + t.slice(1).toLowerCase() : n; };
const misspell = (w: string) => (w.length > 5 ? w.slice(0, 3) + w.slice(4) : w);
const companyVariant = (c: string) => {
  const s = c.replace(/\bPharmaceuticals?\b/i, "Pharma").replace(/\bLaboratories\b/i, "Labs").replace(/\s*(Pvt\.?|Private)\s*(Ltd\.?|Limited)?/i, " ");
  return s === c ? `M/s ${c} Pvt. Ltd.` : s;
};
const ocrSwap = (b: string): string | null => {
  const i = [...b].findIndex((ch) => OCR[ch]);
  return i < 0 ? null : b.slice(0, i) + OCR[b[i]] + b.slice(i + 1);
};
const allBatches = new Set(records.map((r) => r.batchNorm));
const unlisted = (seed: string) => {
  let b = seed.split("").reverse().join("") + "7Q";
  let k = 0;
  while (allBatches.has(b)) b = `${b}${k++}`;
  return b;
};
const coOf = (r: AlertRecord) => r.manufacturerName || r.manufacturer;
const hasCo = (r: AlertRecord) => !/investigation/i.test(coOf(r)) && !!r.manufacturerEntity;
// A common medicine that is clearly NOT this record's medicine.
const companyRecords = (r: AlertRecord) => records.filter((x) => isConfident(companyMatch(coOf(r), coOf(x))));
const otherMedicine = (r: AlertRecord) => { const mine = companyRecords(r); return ["Azithral 500", "Telma 40", "Pan 40", "Glycomet 500", "Thyronorm 50", "Dolo 650", "Shelcal 500"].find((n) => !mine.some((x) => sameMedicine(n, x))); };

const cases: Case[] = [];
const add = (c: Case) => cases.push(c);

// The real strip that caused the false scare.
add({ group: "same company, different medicine (Dolo case)", origin: "real", input: { name: "Dolo-650", batch: "DOBS4518", manufacturer: "Micro Labs Limited" }, expect: "GREY" });

for (const r of base) {
  const name = firstWord(r.brand || r.name);
  const co = coOf(r);
  if (hasCo(r)) {
    add({ group: "exact batch + company as listed", origin: "real", input: { name: r.name, batch: r.batch, manufacturer: co }, expect: "RED" });
    add({ group: "format variant (B.No., spaces, hyphens, lowercase) + company", origin: "generated", input: { name, batch: `B.No. ${r.batch.toLowerCase().replace(/(.{2})/, "$1 - ")}`, manufacturer: co }, expect: "RED" });
    add({ group: "misspelt medicine + company spelling variant", origin: "generated", input: { name: misspell(name), batch: r.batch, manufacturer: companyVariant(co) }, expect: "RED" });
    add({ group: "exact batch, no company given", origin: "generated", input: { name, batch: r.batch }, expect: "AMBER" });
    add({ group: "same batch number, different company", origin: "generated", input: { name, batch: r.batch, manufacturer: "Zzyzx Remedies Pvt Ltd" }, expect: "AMBER" });
    const other = otherMedicine(r);
    if (other) add({ group: "same company, different medicine (Dolo case)", origin: "generated", input: { name: other, batch: unlisted(r.batchNorm), manufacturer: co }, expect: "GREY" });
    add({ group: "same company + same medicine, other batch", origin: "generated", input: { name, batch: unlisted(r.batchNorm), manufacturer: co }, expect: "AMBER" });
    add({ group: "wrong expiry extraction (expiry never changes the colour)", origin: "generated", input: { name, batch: r.batch, manufacturer: co, expiry: "13/2099" }, expect: "RED" });
  } else {
    add({ group: "exact batch + medicine, record names no company (spurious)", origin: "real", input: { name: r.brand || r.name, batch: r.batch }, expect: "RED" });
  }
  const sw = ocrSwap(r.batchNorm);
  if (sw && !allBatches.has(sw)) add({ group: "similar batch: OCR look-alike (0/O, 1/I, 5/S)", origin: "generated", input: { name, batch: sw }, expect: "AMBER" });
  if (r.batchNorm.length >= 5) {
    const last = r.batchNorm.slice(-1);
    const near = r.batchNorm.slice(0, -1) + (last === "9" ? "8" : /\d/.test(last) ? String(+last + 1) : "X");
    if (!allBatches.has(near)) add({ group: "similar batch: one character off, same medicine", origin: "generated", input: { name, batch: near }, expect: "AMBER" });
  }
  if (r.batchNorm.length >= 6) {
    const part = r.batchNorm.slice(0, -2);
    if (!allBatches.has(part)) add({ group: "incomplete batch (last 2 characters missing)", origin: "generated", input: { name, batch: part }, expect: "AMBER" });
  }
  add({ group: "photo / voice too uncertain", origin: "generated", input: { name, batch: r.batch, unreadable: true }, expect: "UNREADABLE" });
  add({ group: "negative: unlisted batch, unrelated company", origin: "generated", input: { name: firstWord(r.name), batch: `ZX${unlisted(r.batchNorm)}`, manufacturer: "Zzyzx Remedies Pvt Ltd" }, expect: "GREY" });
}
// Real batch-number collisions across companies in the dataset.
const byBatch = new Map<string, AlertRecord[]>();
for (const r of records) if (r.batchNorm.length >= 2) byBatch.set(r.batchNorm, [...(byBatch.get(r.batchNorm) ?? []), r]);
const collisions = [...byBatch.values()].filter((a) => a.length > 1 && new Set(a.map((x) => x.manufacturerEntity)).size > 1 && a.every((x) => x.manufacturerEntity)).slice(0, 25);
for (const group of collisions) {
  const a = group[0];
  const nm = firstWord(a.brand || a.name);
  add({ group: "same batch number at two listed companies: right company", origin: "real", input: { name: nm, batch: a.batch, manufacturer: coOf(a) }, expect: sameMedicine(nm, a) ? "RED" : "AMBER" });
  add({ group: "same batch number at two listed companies: unknown third company", origin: "real", input: { name: nm, batch: a.batch, manufacturer: "Zzyzx Remedies Pvt Ltd" }, expect: "AMBER" });
}

const LEVELS: Level[] = ["RED", "AMBER", "GREY", "UNREADABLE"];
const confusion: Record<string, Record<string, number>> = Object.fromEntries(LEVELS.map((e) => [e, Object.fromEntries(LEVELS.map((g) => [g, 0]))]));
const groups = new Map<string, { n: number; ok: number; origin: Origin }>();
const misses: string[] = [];
let falseRed = 0, notRed = 0, falseGrey = 0, shouldFlag = 0;
const t0 = performance.now();
for (const c of cases) {
  const r = matchMedicine(c.input, records);
  confusion[c.expect][r.level]++;
  if (c.expect !== "RED") { notRed++; if (r.level === "RED") falseRed++; }
  if (c.expect !== "GREY") { shouldFlag++; if (r.level === "GREY") falseGrey++; }
  const ok = r.level === c.expect;
  const g = groups.get(c.group) ?? { n: 0, ok: 0, origin: c.origin };
  g.n++; if (ok) g.ok++;
  groups.set(c.group, g);
  if (!ok && misses.length < 20) misses.push(`[${c.origin}] ${c.group}: ${JSON.stringify(c.input)} -> ${r.level}/${r.reason} (want ${c.expect})`);
}
const msPerCheck = Math.round(((performance.now() - t0) / cases.length) * 100) / 100;
const correct = LEVELS.reduce((n, l) => n + confusion[l][l], 0);
const matching = {
  cases: cases.length, real: cases.filter((c) => c.origin === "real").length, generated: cases.filter((c) => c.origin === "generated").length,
  verifiedRecords: base.length, accuracy: correct / cases.length,
  falseRedRate: falseRed / Math.max(1, notRed), falseRed, notRed,
  falseGreyRate: falseGrey / Math.max(1, shouldFlag), falseGrey, shouldFlag,
  confusion, msPerCheck,
  groups: [...groups.entries()].map(([g, v]) => ({ group: g, origin: v.origin, cases: v.n, accuracy: v.ok / v.n })),
};

// ---------- b) Speech ----------
const dict = buildDictionary(records, [...COMMON_MEDICINES, ...COMMON_300]);
function speechScore(list: { heard: string; want: string }[]) {
  let top1 = 0, top3 = 0;
  const miss: string[] = [];
  for (const c of list) {
    const got = matchSpoken(c.heard, dict, 4).map((m) => m.entry.name.toLowerCase());
    const w = c.want.toLowerCase();
    if (got[0] === w) top1++;
    if (got.slice(0, 3).includes(w)) top3++;
    else miss.push(`${c.heard} -> ${got.join(" | ") || "(none)"} (want ${c.want})`);
  }
  return { cases: list.length, top1: top1 / Math.max(1, list.length), top3: top3 / Math.max(1, list.length), miss };
}
const hiEn = speechScore(JSON.parse(readFileSync("eval/speech_cases.json", "utf8")));

// GENERATED garbled transcripts for the 5 online regional languages, from real medicine names.
const REGIONAL: Regional[] = ["pa", "gu", "mr", "kn", "ta"];
const FILLER: Record<Regional, string[]> = {
  pa: ["ਦਵਾਈ", "ਗੋਲੀ", "ਮੇਰੀ"], gu: ["દવા", "ગોળી", "મારી"], mr: ["औषध", "गोळी", "माझी"], kn: ["ಔಷಧಿ", "ಮಾತ್ರೆ", "ನನ್ನ"], ta: ["மருந்து", "மாத்திரை", "என்"],
};
const SPEECH_NAMES = ["Paracetamol", "Dolo 650", "Crocin", "Pantoprazole", "Telma", "Azithromycin", "Amlodipine", "Metformin", "Cetirizine", "Montelukast",
  "Ibuprofen", "Omeprazole", "Atorvastatin", "Glycomet", "Thyronorm", "Combiflam", "Ecosprin", "Losartan", "Amoxicillin", "Levocetirizine", "Ondansetron", "Domperidone", "Calpol", "Shelcal"];
const VOWEL_SIGN = /[ा-ौਾ-ੌા-ૌா-ௌಾ-ೌ]/;
const garble = (s: string, i: number, lang: Regional): string => {
  const chars = [...s];
  switch (i % 5) {
    case 0: return s; // clean transliteration
    case 1: return chars.filter((ch, k) => !(k > 1 && k % 2 === 0 && VOWEL_SIGN.test(ch))).join(""); // some vowel signs lost
    case 2: { const m = Math.ceil(chars.length / 2); return chars.slice(0, m).join("") + " " + chars.slice(m).join(""); } // split into two words
    case 3: return `${FILLER[lang][i % 3]} ${s} ${FILLER[lang][(i + 1) % 3]}`; // said with filler words
    default: return s.replace(/[्੍્்್]/g, ""); // virama dropped
  }
};
const regionalCases: Record<string, { heard: string; want: string; generated: true }[]> = {};
for (const lang of REGIONAL) {
  regionalCases[lang] = SPEECH_NAMES.map((want, i) => {
    const spoken = want.replace(/\s+\d+$/, "");
    return { heard: garble(transliterateName(spoken, lang), i, lang) + (/\d$/.test(want) ? ` ${want.split(" ").pop()}` : ""), want, generated: true as const };
  });
}
writeFileSync("eval/speech_cases_regional.json", JSON.stringify({ note: "GENERATED: real medicine names transliterated into each script, then garbled (lost vowel signs, split words, filler words, dropped virama). Not recordings of real users.", cases: regionalCases }, null, 1) + "\n");
const regional = Object.fromEntries(REGIONAL.map((l) => [l, speechScore(regionalCases[l])]));
const LANG_LABEL: Record<Regional, string> = { pa: "Punjabi", gu: "Gujarati", mr: "Marathi", kn: "Kannada", ta: "Tamil" };
const speech = {
  dictionary: dict.length,
  perLanguage: [
    { lang: "hi/en", label: "Hindi + English", cases: hiEn.cases, top1: hiEn.top1, top3: hiEn.top3, generated: false },
    ...REGIONAL.map((l) => ({ lang: l, label: LANG_LABEL[l], cases: regional[l].cases, top1: regional[l].top1, top3: regional[l].top3, generated: true })),
  ],
  // kept for older readers of eval-results.json
  cases: hiEn.cases, top1: hiEn.top1, top3: hiEn.top3,
};

// ---------- c) Photo ----------
const IMG_DIR = "data/eval_images";
const images = existsSync(IMG_DIR) ? readdirSync(IMG_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)) : [];
type Photo = { images: number; fields: Record<string, number> | null; refused: { ok: number; of: number } | null; caught: { ok: number; of: number } | null; note: string };
let photo: Photo = { images: images.length, fields: null, refused: null, caught: null, note: "" };
if (!images.length) {
  photo.note = "No labelled strip photos in data/eval_images yet, so real-photo accuracy is not yet measured.";
} else {
  try {
    const out = execFileSync(process.execPath, ["scripts/eval-photo.mjs"], { encoding: "utf8", timeout: 30 * 60_000 });
    const res = JSON.parse(out.trim().split("\n").pop()!);
    photo = { images: res.images ?? images.length, fields: res.fields, refused: res.refused, caught: res.caught, note: res.note ?? "" };
  } catch (e) {
    photo.note = `Photo eval failed to run: ${(e as Error).message.split("\n")[0]}`;
  }
}

// ---------- test count (for the Transparency page) ----------
let tests: { passed: number; total: number } | null = null;
try {
  try { execFileSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--reporter=json"], { timeout: 5 * 60_000, stdio: "ignore" }); } catch { /* failures still write the report */ }
  const j = JSON.parse(readFileSync(".vitest/json/output.json", "utf8"));
  tests = { passed: j.numPassedTests, total: j.numTotalTests };
} catch { /* leave null */ }

// ---------- write ----------
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const results = {
  generatedAt: new Date().toISOString().slice(0, 10), datasetVersion: meta.version, records: records.length, latestMonth: meta.latestMonth,
  verified: meta.verified, tests, matching, speech, photo,
};
writeFileSync("src/content/eval-results.json", JSON.stringify(results, null, 2) + "\n");

const LABEL: Record<Level, string> = { RED: "RED", AMBER: "AMBER", GREY: "GREY", UNREADABLE: "CAN'T READ" };

/** Full-population and negative-control results, written by scripts/eval-population.ts. */
function populationSection(): string {
  const path = "src/content/eval-population.json";
  if (!existsSync(path)) return "## Full-population check and negative control\n\nNot run yet: run `npm run eval:population`.";
  const p = JSON.parse(readFileSync(path, "utf8"));
  const fp = p.fullPopulation, nc = p.negativeControl;
  const fpList = fp.notRedList.length ? fp.notRedList.map((x: { batch: string; name: string; company: string; got: string; reason: string }) => `- batch \`${x.batch}\`, ${x.name}, ${x.company}: shown ${x.got} (${x.reason})`).join("\n") : "None. Every official record came out RED.";
  const ncList = nc.notGreyList.length ? nc.notGreyList.map((x: { batch: string; name: string; company: string; got: string; reason: string }) => `- batch \`${x.batch}\`, ${x.name}, ${x.company}: shown ${x.got} (${x.reason})`).join("\n") : "None. Every negative came out GREY.";
  return `## Full-population check (ground truth: the CDSCO dataset itself)

**Ground truth comes from the official CDSCO records in the dataset itself, not from labels the author wrote.** Each of the ${fp.total.toLocaleString("en-IN")} records is run through the matcher with its own batch, medicine and company. Expected: RED for every one. The record itself is in the dataset, so this checks that the dataset's own records are found and shown as RED. It is a consistency check, not a test on unseen data.

| Metric | Value |
|---|---|
| Official records checked | ${fp.total.toLocaleString("en-IN")} |
| Shown RED | **${fp.red.toLocaleString("en-IN")}** |
| Not RED | ${fp.notRed} |

Records that did not come out RED:

${fpList}

## Negative control (ground truth: batches that appear nowhere in the dataset)

**Ground truth here is also taken from the dataset:** each batch string is checked against every batch in the dataset and rejected if it appears there. The companies are not in the dataset. Generated with a fixed seed (\`${nc.seed}\`) so the run is reproducible. Expected: GREY for every one.

| Metric | Value |
|---|---|
| Synthetic batches | ${nc.total.toLocaleString("en-IN")} |
| Shown GREY | **${nc.grey.toLocaleString("en-IN")}** |
| Not GREY | ${nc.notGrey} |

Batches that were not GREY:

${ncList}
`;
}
const speechMisses = [...hiEn.miss.map((m) => `- hi/en: ${m}`), ...REGIONAL.flatMap((l) => regional[l].miss.map((m) => `- ${l}: ${m}`))];
const md = `# DawaShield evaluation

Generated by \`npm run eval\` on ${results.generatedAt} against dataset \`${meta.version}\` (${records.length.toLocaleString("en-IN")} CDSCO records, latest alert month ${meta.latestMonth}). Unit tests: ${tests ? `**${tests.passed} / ${tests.total} passed**` : "not run"}.

${populationSection()}

## Stress set: author-labelled robustness testing (${cases.length} cases)

**Ground truth here is written by the author**, not taken from CDSCO. It tests how the matcher copes with spelling, format, OCR and company-name noise. It does not measure accuracy on unseen real data.

## a) Matching (deterministic rules, no AI)

**${cases.length} labelled cases**: ${matching.real} **real** (a real CDSCO record as listed, real batch-number collisions in the data, or the real Dolo-650 strip) and ${matching.generated} **generated** variants derived from the ${base.length} hand-verified records in \`data/verified_records.csv\`.

| Metric | Value |
|---|---|
| **False-RED rate** (should not be RED, shown RED) | **${pct(matching.falseRedRate)}** (${falseRed} of ${notRed}) |
| **False-GREY rate** (should be RED / AMBER / CAN'T READ, shown GREY) | **${pct(matching.falseGreyRate)}** (${falseGrey} of ${shouldFlag}) |
| Exact colour correct | ${pct(matching.accuracy)} |
| Time per check (${records.length.toLocaleString("en-IN")} records, laptop) | ${msPerCheck} ms |

### Confusion table (rows = expected, columns = what the app showed)

| Expected \\ Shown | RED | AMBER | GREY | CAN'T READ |
|---|---|---|---|---|
${LEVELS.map((e) => `| **${LABEL[e]}** | ${LEVELS.map((g) => (e === g ? `**${confusion[e][g]}**` : String(confusion[e][g]))).join(" | ")} |`).join("\n")}

### Case groups

| Case group | Real or generated | Cases | Correct |
|---|---|---|---|
${matching.groups.map((g) => `| ${g.group} | ${g.origin} | ${g.cases} | ${pct(g.accuracy)} |`).join("\n")}

${misses.length ? "Misses:\n\n" + misses.map((m) => "- `" + m + "`").join("\n") : "No misses."}

**Limits.** Generated cases are derived from real records, so they test robustness to spelling, format, OCR and company-name noise, not completely unseen data. Negatives use synthetic unlisted batch numbers. "Wrong expiry extraction" checks that a misread expiry never changes the colour (expiry is shown separately and never decides RED / AMBER / GREY).

## b) Speech matching (offline matcher, no AI)

Dictionary: ${dict.length.toLocaleString("en-IN")} names (every record name + ~300 common Indian names).

| Language | Cases | Top-1 | Top-3 (user picks from big buttons) | Source |
|---|---|---|---|---|
${speech.perLanguage.map((s) => `| ${s.label} | ${s.cases} | **${pct(s.top1)}** | **${pct(s.top3)}** | ${s.generated ? "GENERATED" : "hand-written"} |`).join("\n")}

The Punjabi, Gujarati, Marathi, Kannada and Tamil cases are **generated** (\`eval/speech_cases_regional.json\`): real medicine names transliterated into each script, then garbled (lost vowel signs, split words, filler words, dropped virama). They are not recordings of real users. The Hindi/English cases imitate real Chrome hi-IN output but are not real recordings either.

${speechMisses.length ? "Not in top 3:\n\n" + speechMisses.join("\n") : "All cases in the top 3."}

## c) Photo reading

${photo.images && photo.fields ? `${photo.images} labelled photos, read by the live app in a headless browser.

| Field | Accuracy |
|---|---|
${Object.entries(photo.fields).map(([k, v]) => `| ${k} | ${pct(v)} |`).join("\n")}

| | |
|---|---|
| Correctly refused to read | ${photo.refused ? `${photo.refused.ok} / ${photo.refused.of}` : "no unreadable photos labelled"} |
| Flagged batches caught from the photo without manual correction | ${photo.caught ? `${photo.caught.ok} / ${photo.caught.of}` : "no flagged-batch photos labelled"} |

${photo.note}` : photo.note}

Add a photo with one command, then re-run the eval:

\`\`\`
npm run add-photo -- path/to/strip.jpg "Dolo 650" DOBS4518 "06/2028" "Micro Labs"
npm run add-photo -- blurry.jpg "" UNREADABLE      # a photo the app should refuse to read
npm run eval
\`\`\`

Labels live in \`data/eval_images/labels.csv\` (\`file,medicine,batch,expiry,company\`).

## What we cannot yet prove

- Real-photo accuracy (needs a labelled set of real strip photos).
- Real-user voice accuracy (all speech cases are written or generated, not recorded).
- Regional-language accuracy with real speakers (the Punjabi, Gujarati, Marathi, Kannada and Tamil cases are generated).

## How to reproduce

\`\`\`
npm run eval
\`\`\`
`;
// Keep the voice loop section written by scripts/voice-report.mjs (live browser test).
const prevEval = existsSync("docs/EVAL.md") ? readFileSync("docs/EVAL.md", "utf8") : "";
const voiceBlock = /<!-- voice-loop -->[\s\S]*<!-- \/voice-loop -->/.exec(prevEval)?.[0];
writeFileSync("docs/EVAL.md", voiceBlock ? `${md.trimEnd()}

${voiceBlock}
` : md);
console.log(JSON.stringify({
  matching: { cases: cases.length, real: matching.real, generated: matching.generated, falseRed: pct(matching.falseRedRate), falseGrey: pct(matching.falseGreyRate), accuracy: pct(matching.accuracy), confusion },
  speech: speech.perLanguage.map((s) => `${s.lang}: top1 ${pct(s.top1)} top3 ${pct(s.top3)} (${s.cases})`), tests, photo,
}, null, 1));
if (misses.length) console.log("misses:\n" + misses.join("\n"));
if (speechMisses.length) console.log("speech misses:\n" + speechMisses.join("\n"));
