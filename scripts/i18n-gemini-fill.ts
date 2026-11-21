// Fill UI strings that are new since the last reviewed translation (Sarvam has no
// credits), with Gemini Flash-Lite at build time. Never used for safety strings:
// those must go through the reviewed pipeline (scripts/i18n-build.ts).
// Additions are listed in i18n/review/gemini-added.json for human review.
// Run: npx tsx --env-file=.env scripts/i18n-gemini-fill.ts
import { readFileSync, writeFileSync } from "node:fs";
import { collectStrings } from "./i18n-strings";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("Set GEMINI_API_KEY in .env"); process.exit(1); }
const NAMES: Record<string, string> = { pa: "Punjabi (Gurmukhi)", gu: "Gujarati", mr: "Marathi", kn: "Kannada", ta: "Tamil" };
let added: Record<string, Record<string, string>> = {};
try { added = JSON.parse(readFileSync("i18n/review/gemini-added.json", "utf8")).added ?? {}; } catch { /* first run */ }

for (const lang of Object.keys(NAMES)) {
  const p = `public/i18n/${lang}.json`;
  const d = JSON.parse(readFileSync(p, "utf8"));
  const missing = collectStrings().filter((s) => !s.text.includes("{") && !(s.text in d.exact));
  const safety = missing.filter((s) => s.safety);
  if (safety.length) console.warn(`${lang}: ${safety.length} safety strings missing; NOT machine-filled:`, safety.map((s) => s.text));
  const todo = missing.filter((s) => !s.safety).map((s) => s.text);
  if (!todo.length) continue;
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Translate each English app UI string into simple, polite ${NAMES[lang]} for elderly users in India. Keep brand names (DawaShield, Google Gemini, CDSCO) and numbers unchanged. Reply ONLY with a JSON object mapping each English string to its translation.\n${JSON.stringify(todo)}` }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    }),
  });
  if (!r.ok) { console.error(lang, r.status, (await r.text()).slice(0, 200)); continue; }
  const j = await r.json();
  const map = JSON.parse(j.candidates[0].content.parts[0].text) as Record<string, string>;
  added[lang] ??= {};
  for (const t of todo) if (typeof map[t] === "string" && map[t].trim()) { d.exact[t] = map[t].trim(); added[lang][t] = d.exact[t]; }
  writeFileSync(p, JSON.stringify(d));
  console.log(lang, Object.keys(added[lang]).length, "of", todo.length);
}
writeFileSync("i18n/review/gemini-added.json", JSON.stringify({ note: "Machine translation (Gemini Flash-Lite), not yet human-reviewed. Non-safety UI strings only.", when: new Date().toISOString(), added }, null, 1) + "\n");
