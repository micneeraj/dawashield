// Photo eval: runs every labelled image in data/eval_images through the real app's
// photo screen (live site, real Firebase AI Logic + App Check) with headless
// Chromium, reads the fields shown on the confirm screen, taps Confirm, and scores:
//   - per-field accuracy (medicine, batch, expiry, company)
//   - "correctly refused to read": photos labelled unreadable (batch = UNREADABLE)
//     that the app refused (Can't read clearly, or asked for a closer photo)
//   - "flagged batches caught from photo without manual correction": photos whose
//     labelled batch is on the CDSCO list and whose result was RED or AMBER
//     straight from the photo, with no field edited
// Labels: data/eval_images/labels.csv  (file,medicine,batch,expiry,company)
// Add a photo with one command: npm run add-photo -- <photo> "<medicine>" <batch> "<expiry>" "<company>"
// Prints one JSON line.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const DIR = "data/eval_images";
const SITE = process.env.EVAL_SITE || "https://dawashield-hybrid-3023.web.app";
const norm = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function parseCsv(text) {
  const rows = [];
  let cur = [], f = "", q = false;
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
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

function loadLabels() {
  const csv = path.join(DIR, "labels.csv");
  const out = {};
  if (existsSync(csv)) for (const r of parseCsv(readFileSync(csv, "utf8"))) if (r.file) out[r.file] = { name: r.medicine, batch: r.batch, expiry: r.expiry, manufacturer: r.company };
  // An older labels.json is still read, so nothing already labelled is lost.
  const js = path.join(DIR, "labels.json");
  if (existsSync(js)) for (const [k, v] of Object.entries(JSON.parse(readFileSync(js, "utf8")))) out[k] ??= v;
  return out;
}

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function month(s) {
  const t = String(s ?? "").toUpperCase();
  let m = t.match(/(\d{1,2})\s*[/.-]\s*(\d{2,4})/);
  if (m) return `${(+m[2] < 100 ? 2000 + +m[2] : +m[2])}-${+m[1]}`;
  m = t.match(/([A-Z]{3})[A-Z]*[\s.\-/']*(\d{2,4})/);
  if (m && MON.includes(m[1])) return `${(+m[2] < 100 ? 2000 + +m[2] : +m[2])}-${MON.indexOf(m[1]) + 1}`;
  return norm(t);
}
const contains = (a, b) => !!norm(a) && !!norm(b) && (norm(a).includes(norm(b)) || norm(b).includes(norm(a)));
const same = { batch: (a, b) => norm(a) === norm(b), expiry: (a, b) => month(a) === month(b), name: contains, manufacturer: contains };

const labels = loadLabels();
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && labels[f]) : [];
if (!files.length) {
  console.log(JSON.stringify({ images: 0, fields: null, refused: null, caught: null, note: "No labelled photos in data/eval_images/labels.csv yet." }));
  process.exit(0);
}
const listed = new Set(JSON.parse(readFileSync("public/data/nsq.json", "utf8")).map((r) => r.batchNorm));
const score = {}, total = {};
let refuseOk = 0, refuseN = 0, caught = 0, flaggedN = 0, failed = 0;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
await page.addInitScript(() => {
  try { for (const [k, v] of [["ds-first-run-v2", "1"], ["ds-lang", "en"], ["ds-muted", "1"], ["ds-lang-picked", "1"]]) localStorage.setItem(k, v); } catch { /* ignore */ }
});
for (const f of files) {
  const want = labels[f];
  const shouldRefuse = /^UNREADABLE$/i.test(want.batch ?? "");
  const isFlagged = !shouldRefuse && listed.has(norm(want.batch));
  if (shouldRefuse) refuseN++;
  if (isFlagged) flaggedN++;
  const fieldsToScore = Object.keys(same).filter((k) => want[k] && !(k === "batch" && shouldRefuse));
  try {
    await page.goto(SITE, { waitUntil: "networkidle" });
    await page.getByTestId("photo-btn").click();
    await page.getByTestId("photo-input").setInputFiles(path.join(DIR, f));
    const which = await Promise.race([
      page.getByTestId("confirm-screen").waitFor({ timeout: 120_000 }).then(() => "confirm"),
      page.getByTestId("closer-photo").waitFor({ timeout: 120_000 }).then(() => "closer"),
    ]);
    if (which === "closer") {
      if (shouldRefuse) refuseOk++;
      for (const k of fieldsToScore) total[k] = (total[k] ?? 0) + 1;
      continue;
    }
    for (const k of fieldsToScore) {
      const got = await page.getByTestId(`input-${k}`).inputValue().catch(() => "");
      total[k] = (total[k] ?? 0) + 1;
      if (same[k](got, want[k])) score[k] = (score[k] ?? 0) + 1;
    }
    await page.getByTestId("confirm-screen").evaluate((form) => form.requestSubmit());
    await page.getByTestId("result").waitFor({ timeout: 15_000 });
    const level = await page.getByTestId("result").getAttribute("data-level");
    if (shouldRefuse && level === "UNREADABLE") refuseOk++;
    if (isFlagged && (level === "RED" || level === "AMBER")) caught++;
  } catch {
    failed++;
    for (const k of fieldsToScore) total[k] = (total[k] ?? 0) + 1;
  }
}
await browser.close();
const fields = Object.fromEntries(Object.keys(total).map((k) => [k, (score[k] ?? 0) / total[k]]));
console.log(JSON.stringify({
  images: files.length, fields,
  refused: refuseN ? { ok: refuseOk, of: refuseN } : null,
  caught: flaggedN ? { ok: caught, of: flaggedN } : null,
  note: failed ? `${failed} image(s) could not be read (counted as wrong).` : "",
}));
