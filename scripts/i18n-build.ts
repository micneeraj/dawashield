// Build-time translation for the 5 online regional languages (npm run i18n).
//
//   1. Collect every English UI string and result template (scripts/i18n-strings.ts).
//   2. Translate each one with Sarvam AI (sarvam-translate:v1), en-IN -> xx-IN.
//   3. Back-translate to English and compare meaning (plain word overlap +
//      negation check). Safety strings whose meaning changes are retranslated
//      with a second model (mayura:v1, formal); the closer one is kept. A safety
//      string that still drifts is FLAGGED and shown in English instead.
//   4. Write public/i18n/<lang>.json (loaded only online, never precached),
//      public/i18n/index.json (which languages are offered) and
//      i18n/review/<lang>.csv (English, translation, back-translation, score, status).
//   5. Voice: Sarvam Bulbul clips for every fixed spoken message, compressed to
//      24 kbps mono, in public/audio/<lang>/ (lazy-loaded, never precached).
//
// The key is read from .env (SARVAM_API_KEY), used only here at build time, and
// never shipped to the browser. Medicine names, batch numbers, companies and
// dates are never translated: they are runtime values ({0} placeholders) or are
// excluded from the string list. Every result is cached in i18n/.cache.json, so
// a re-run only asks for what is new. CACHE_ONLY=1 rebuilds from the cache alone.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { SarvamAIClient } from "sarvamai";
import { collectStrings } from "./i18n-strings";
import { CLIPS } from "../src/content/messages";

const key = process.env.SARVAM_API_KEY;
if (!key && process.env.CACHE_ONLY !== "1") { console.error("Set SARVAM_API_KEY in .env"); process.exit(1); }
const client = new SarvamAIClient({ apiSubscriptionKey: key ?? "" });

const LANGS = [
  { code: "pa", bcp: "pa-IN", speaker: "harpreet_pa_narration" },
  { code: "gu", bcp: "gu-IN", speaker: "pooja_gu_customer" },
  { code: "mr", bcp: "mr-IN", speaker: "ritu_mr_narration" },
  { code: "kn", bcp: "kn-IN", speaker: "chaitra_kn_conversation" },
  { code: "ta", bcp: "ta-IN", speaker: "vijay_ta_narration" },
] as const;
const ONLY = process.env.LANG_ONLY ? new Set(process.env.LANG_ONLY.split(",")) : null;
const SKIP_TTS = process.env.SKIP_TTS === "1";

// Never sent for translation: the build credit and brand-only strings stay as written.
const KEEP_ENGLISH = (s: string) => /Neeraj Kumar/.test(s) || /^(DawaShield|CDSCO|NSQ|PDF|MM\/YYYY|Gemini Nano|Gemini Flash|WhatsApp)$/.test(s.trim());

// ---------- cache (incremental re-runs) ----------
const CACHE = "i18n/.cache.json";
mkdirSync("i18n/review", { recursive: true });
const cache: Record<string, string> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
let dirty = 0;
const saveCache = () => { writeFileSync(CACHE, JSON.stringify(cache)); dirty = 0; };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let noCredits = process.env.CACHE_ONLY === "1";
let creditNote = noCredits ? "CACHE_ONLY run" : "";

/** Translation, or null when it is not available (no credits / not cached). Never guessed. */
async function translate(text: string, src: string, tgt: string, model: "sarvam-translate:v1" | "mayura:v1"): Promise<string | null> {
  const k = `${model}|${src}|${tgt}|${text}`;
  if (cache[k] !== undefined) return cache[k];
  if (noCredits || !text) return null;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await client.text.translate({
        input: text, source_language_code: src as never, target_language_code: tgt as never, model,
        ...(model === "mayura:v1" ? { mode: "formal" as const } : {}),
      });
      const out = String(r.translated_text ?? "").trim();
      cache[k] = out;
      if (++dirty >= 25) saveCache();
      return out;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (attempt < 5 && (status === 429 || (status ?? 500) >= 500)) { await sleep(1500 * (attempt + 1)); continue; }
      // Report without request details (headers carry the key).
      const body = JSON.stringify((e as { body?: unknown }).body ?? "").slice(0, 160);
      if (status === 401 || status === 402 || status === 403) {
        if (!noCredits) console.error(`Sarvam stopped answering (${status}) ${body}. Finishing from cache; re-run npm run i18n after topping up.`);
        noCredits = true;
        creditNote = `Sarvam ${status}: ${body}`;
        return null;
      }
      console.error(`translate ${model} ${src}->${tgt} failed (${status ?? "?"}) ${body} for: ${text.slice(0, 50)}`);
      if (status === 400) { cache[k] = ""; return ""; } // rejected input: stays English, flagged
      return null;
    }
  }
}

// ---------- meaning check (plain code) ----------
const STOP = new Set("a an the of to in on for and or is are be it this that your you we our with as at by from if so do does was were has have had will can may please just".split(" "));
const SYN: [RegExp, string][] = [
  [/^(pharmacist|druggist|chemists?|pharmacy|shopkeeper)$/, "chemist"], [/^(physician|doctors?)$/, "doctor"],
  [/^(authori[sz]ed|government|govt)$/, "official"], [/^(medication|medications|medicines|drug|drugs|tablets?)$/, "medicine"],
  [/^(lot|batches)$/, "batch"], [/^(warning|warnings|alerts|notice)$/, "alert"], [/^(dosage|doses)$/, "dose"],
  [/^(halt|discontinue|quit|stopping)$/, "stop"], [/^(photograph|picture|image|photos)$/, "photo"], [/^(firm|manufacturer|companies)$/, "company"],
];
const canon = (w: string) => SYN.find(([re]) => re.test(w))?.[1] ?? w;
const words = (s: string) => s.toLowerCase().replace(/\{\d+\}/g, " ").replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)).map(canon);
const NEG = /\b(not|no|never|nothing|none|without|cannot)\b|n't\b/i;
function meaningScore(orig: string, back: string): { score: number; negationOk: boolean } {
  const a = [...new Set(words(orig))], b = words(back);
  const hit = a.filter((w) => b.some((v) => v === w || (w.length >= 5 && v.length >= 5 && v.slice(0, 5) === w.slice(0, 5)))).length;
  return { score: a.length ? hit / a.length : 1, negationOk: NEG.test(orig) === NEG.test(back) };
}
const placeholdersOk = (src: string, out: string) => !!out && (src.match(/\{\d+\}/g) ?? []).every((p) => out.includes(p));
const SAFETY_MIN = 0.5;

// ---------- run ----------
const strings = collectStrings().filter((s) => !KEEP_ENGLISH(s.text));
const clipTexts = CLIPS.map((c) => ({ clip: c.clip, text: c.text.en }));
console.log(`${strings.length} UI strings (${strings.filter((s) => s.safety).length} safety), ${clipTexts.length} voice clips`);

async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

type Status = "ok" | "retranslated" | "FLAGGED" | "missing";
interface Row { en: string; tr: string; back: string; score: number; negationOk: boolean; safety: boolean; status: Status; model: string }
interface Attempt { tr: string; back: string; model: string; score: number; negationOk: boolean; ph: boolean }
const csvCell = (v: string | number | boolean) => { const t = String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
interface LangSummary { strings: number; translated: number; safety: number; safetyTranslated: number; flagged: string[]; retranslated: number; missing: number; clips: number; available: boolean }
const summary: Record<string, LangSummary> = {};
const good = (s: Status) => s === "ok" || s === "retranslated";

for (const L of LANGS) {
  if (ONLY && !ONLY.has(L.code)) continue;
  const attempt = async (text: string, model: "sarvam-translate:v1" | "mayura:v1"): Promise<Attempt | null> => {
    const tr = await translate(text, "en-IN", L.bcp, model);
    const back = tr ? await translate(tr, L.bcp, "en-IN", "sarvam-translate:v1") : null;
    if (tr == null || back == null) return null; // not available: never shipped unverified
    return { tr, back, model, ...meaningScore(text, back), ph: placeholdersOk(text, tr) };
  };

  const rows = await pool(strings, 6, async (s): Promise<Row> => {
    const bad = (x: Attempt) => !x.ph || (s.safety && (!x.negationOk || x.score < SAFETY_MIN));
    let best = await attempt(s.text, "sarvam-translate:v1");
    if (!best) return { en: s.text, tr: s.text, back: "", score: 0, negationOk: false, safety: s.safety, status: "missing", model: "" };
    let status: Status = "ok";
    if (bad(best)) {
      const alt = await attempt(s.text, "mayura:v1").catch(() => null);
      if (alt && (!bad(alt) || (alt.ph && alt.negationOk && alt.score > best.score))) best = alt;
      status = bad(best) ? "FLAGGED" : "retranslated";
    }
    // A safety string whose meaning still drifts after retranslation is shown in English.
    return { en: s.text, tr: status === "FLAGGED" ? s.text : best.tr, back: best.back, score: Math.round(best.score * 100) / 100, negationOk: best.negationOk, safety: s.safety, status, model: best.model };
  });
  saveCache();

  // Spoken clips, held to the safety standard.
  const clipRows = await pool(clipTexts, 6, async (c) => {
    let a = await attempt(c.text, "sarvam-translate:v1");
    if (!a) return null;
    if (!a.negationOk || a.score < SAFETY_MIN) {
      const b = await attempt(c.text, "mayura:v1").catch(() => null);
      if (b && b.negationOk && b.score >= a.score) a = b;
    }
    return { clip: c.clip, en: c.text, ...a, ok: a.negationOk && a.score >= SAFETY_MIN };
  });
  const clips = clipRows.filter((c): c is NonNullable<typeof c> => !!c);
  saveCache();

  const exact: Record<string, string> = {};
  const patterns: [string, string][] = [];
  for (const r of rows) {
    if (!good(r.status)) continue;
    if (/\{\d+\}/.test(r.en)) patterns.push([r.en, r.tr]);
    else exact[r.en] = r.tr;
  }
  const translated = rows.filter((r) => good(r.status)).length;
  const safetyRows = rows.filter((r) => r.safety);
  const safetyTranslated = safetyRows.filter((r) => good(r.status)).length;
  // Offered in the app only when nearly every string, and nearly every safety line, has a verified translation.
  const available = translated / rows.length >= 0.9 && safetyTranslated / Math.max(1, safetyRows.length) >= 0.9;
  mkdirSync("public/i18n", { recursive: true });
  writeFileSync(`public/i18n/${L.code}.json`, JSON.stringify({
    lang: L.code, generated: new Date().toISOString().slice(0, 10), exact, patterns,
    clips: Object.fromEntries(clips.filter((c) => c.ok).map((c) => [c.clip, c.tr])),
  }));
  const csv = [
    "english,translation,back_translation,meaning_score,negation_ok,safety,status,model",
    ...rows.map((r) => [r.en, r.status === "missing" ? "" : r.status === "FLAGGED" ? `(shown in English) ` : r.tr, r.back, r.score, r.negationOk, r.safety, r.status, r.model].map(csvCell).join(",")),
    ...clips.map((c) => [`[voice:${c.clip}] ${c.en}`, c.tr, c.back, Math.round(c.score * 100) / 100, c.negationOk, true, c.ok ? "ok" : "FLAGGED", `voice/${c.model}`].map(csvCell).join(",")),
  ].join("\n") + "\n";
  writeFileSync(`i18n/review/${L.code}.csv`, csv);

  // ---------- voice clips ----------
  let made = 0;
  mkdirSync(`public/audio/${L.code}`, { recursive: true });
  mkdirSync("i18n/.tts", { recursive: true });
  await pool(clips.filter((c) => c.ok), 3, async (c) => {
    const out = `public/audio/${L.code}/${c.clip}.mp3`;
    const stamp = `i18n/.tts/${L.code}-${c.clip}.txt`;
    if (existsSync(out) && existsSync(stamp) && readFileSync(stamp, "utf8") === c.tr) { made++; return; }
    if (SKIP_TTS || noCredits) return;
    for (let i = 0; i < 4; i++) {
      try {
        const res = await client.textToSpeech.convert({ text: c.tr, target_language_code: L.bcp, model: "bulbul:v4-flash", speaker: L.speaker, pace: 0.9, output_audio_codec: "mp3" } as never);
        const buf = Buffer.from((res as unknown as { audios: string[] }).audios.join(""), "base64");
        if (buf.length < 1000) throw new Error("audio too small");
        writeFileSync(out, buf);
        const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", out, "-ac", "1", "-ar", "22050", "-b:a", "24k", out + ".tmp.mp3"]);
        if (r.status === 0) renameSync(out + ".tmp.mp3", out);
        writeFileSync(stamp, c.tr);
        made++;
        return;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 401 || status === 402 || status === 403) { noCredits = true; creditNote ||= `Sarvam TTS ${status}`; return; }
        if (i === 3) { console.error(`${L.code}/${c.clip}: TTS failed (${status ?? (e as Error).message})`); return; }
        await sleep(2000 * (i + 1));
      }
    }
  });

  summary[L.code] = {
    strings: rows.length, translated, safety: safetyRows.length, safetyTranslated,
    flagged: [...rows.filter((r) => r.status === "FLAGGED").map((r) => r.en), ...clips.filter((c) => !c.ok).map((c) => `voice ${c.clip}`)],
    retranslated: rows.filter((r) => r.status === "retranslated").length,
    missing: rows.filter((r) => r.status === "missing").length,
    clips: made, available,
  };
  const S = summary[L.code];
  console.log(`${L.code}: ${translated}/${rows.length} translated (safety ${safetyTranslated}/${safetyRows.length}), ${S.retranslated} retranslated, ${S.flagged.length} flagged, ${S.missing} missing, ${made} clips, ${available ? "AVAILABLE" : "not offered yet"}`);
}

// Manifest the app reads to decide which regional languages to offer.
const manifest = existsSync("public/i18n/index.json") ? JSON.parse(readFileSync("public/i18n/index.json", "utf8")) : { langs: {} };
for (const [k, v] of Object.entries(summary)) manifest.langs[k] = { available: v.available, coverage: Math.round((v.translated / v.strings) * 1000) / 1000, clips: v.clips };
writeFileSync("public/i18n/index.json", JSON.stringify(manifest, null, 1) + "\n");
const prevSum = existsSync("i18n/review/SUMMARY.json") ? JSON.parse(readFileSync("i18n/review/SUMMARY.json", "utf8")) : {};
writeFileSync("i18n/review/SUMMARY.json", JSON.stringify({ ...prevSum, ...summary, note: creditNote || undefined }, null, 2) + "\n");
if (creditNote) console.log("NOTE: " + creditNote);
