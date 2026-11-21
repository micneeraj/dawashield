// One command to add a labelled strip photo to the photo eval:
//   npm run add-photo -- path/to/photo.jpg "Dolo 650" DOBS4518 "06/2028" "Micro Labs"
//   npm run add-photo -- blurry.jpg "" UNREADABLE          (a photo the app should refuse)
// Copies the photo into data/eval_images and appends one row to labels.csv
// (file,medicine,batch,expiry,company). Then run: npm run eval
import { appendFileSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const [src, medicine = "", batch = "", expiry = "", company = ""] = process.argv.slice(2);
if (!src || !existsSync(src) || !/\.(jpe?g|png|webp)$/i.test(src)) {
  console.error('Usage: npm run add-photo -- <photo.jpg> "<medicine>" <batch|UNREADABLE> "<expiry MM/YYYY>" "<company>"');
  process.exit(1);
}
const DIR = "data/eval_images";
const csv = path.join(DIR, "labels.csv");
const file = path.basename(src).replace(/[^\w.-]+/g, "_");
copyFileSync(src, path.join(DIR, file));
if (!existsSync(csv)) writeFileSync(csv, "file,medicine,batch,expiry,company\n");
const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
appendFileSync(csv, [file, medicine, batch, expiry, company].map(q).join(",") + "\n");
console.log(`Added ${file}. Run: npm run eval`);
