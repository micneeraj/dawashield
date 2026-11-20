// Photo eval: runs every image in data/eval_images through the real app's photo
// screen (live site, real Firebase AI Logic + App Check) with headless Chromium,
// reads the fields shown on the confirm screen and scores them against labels.json.
// Prints one JSON line: {"fields": {...accuracy}, "note": "..."}.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const DIR = "data/eval_images";
const SITE = process.env.EVAL_SITE || "https://dawashield-hybrid-3023.web.app";
const labels = existsSync(path.join(DIR, "labels.json")) ? JSON.parse(readFileSync(path.join(DIR, "labels.json"), "utf8")) : {};
const files = readdirSync(DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && labels[f]);
const norm = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function month(s) {
  const t = String(s ?? "").toUpperCase();
  let m = t.match(/(\d{1,2})\s*[/.-]\s*(\d{2,4})/);
  if (m) return `${(+m[2] < 100 ? 2000 + +m[2] : +m[2])}-${+m[1]}`;
  m = t.match(/([A-Z]{3})[A-Z]*[\s.\-/']*(\d{2,4})/);
  if (m && MON.includes(m[1])) return `${(+m[2] < 100 ? 2000 + +m[2] : +m[2])}-${MON.indexOf(m[1]) + 1}`;
  return norm(t);
}
const same = { batch: (a, b) => norm(a) === norm(b), expiry: (a, b) => month(a) === month(b), name: (a, b) => norm(a).includes(norm(b)) || norm(b).includes(norm(a)), manufacturer: (a, b) => norm(a).includes(norm(b)) || norm(b).includes(norm(a)) };

if (!files.length) {
  console.log(JSON.stringify({ fields: null, note: "Images found but none listed in labels.json." }));
  process.exit(0);
}
const score = {}, total = {};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
await page.addInitScript(() => { try { localStorage.setItem("ds-first-run-v2", "1"); localStorage.setItem("ds-lang", "en"); localStorage.setItem("ds-muted", "1"); } catch { /* ignore */ } });
let failed = 0;
for (const f of files) {
  try {
    await page.goto(SITE, { waitUntil: "networkidle" });
    await page.getByTestId("photo-btn").click();
    await page.getByTestId("photo-input").setInputFiles(path.join(DIR, f));
    await page.getByTestId("confirm-screen").waitFor({ timeout: 120_000 });
    for (const [k, want] of Object.entries(labels[f])) {
      if (!same[k]) continue;
      const got = await page.getByTestId(`input-${k}`).inputValue().catch(() => "");
      total[k] = (total[k] ?? 0) + 1;
      if (same[k](got, want)) score[k] = (score[k] ?? 0) + 1;
    }
  } catch {
    failed++;
    for (const k of Object.keys(labels[f])) if (same[k]) total[k] = (total[k] ?? 0) + 1;
  }
}
await browser.close();
const fields = Object.fromEntries(Object.keys(total).map((k) => [k, (score[k] ?? 0) / total[k]]));
console.log(JSON.stringify({ fields, note: failed ? `${failed} image(s) could not be read (counted as wrong).` : "" }));
