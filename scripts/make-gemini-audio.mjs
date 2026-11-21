// Build-time voice clips for the 5 regional languages with Gemini text-to-speech.
// The key is read from .env (GEMINI_API_KEY), used only on this machine, never
// printed, never bundled. Hindi / English Sarvam clips are not touched.
//
//   1. Quality check per language: synthesise 3 sample clips, transcribe them back
//      with Gemini Flash and compare with the reviewed text (character similarity).
//      Pass -> "gemini" clips. Fail -> "browser" voice (then text only on devices
//      without one). The decision is written to public/i18n/index.json.
//   2. For passing languages: every fixed clip (welcome, prompts, every result
//      template, What-should-I-do card) -> public/audio/<lang>/<clip>.mp3,
//      mono 32 kbps. These folders are excluded from the offline precache
//      (vite.config.ts globIgnores) and fetched only when played.
//
// Run: npm run audio:gemini           (LANGS=kn,ta to limit; FORCE=1 to redo existing clips)
import { mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("Set GEMINI_API_KEY in .env"); process.exit(1); }

const TTS_MODELS = (process.env.TTS_MODEL || "gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts,gemini-2.5-pro-preview-tts").split(",");
// One clip per request (batched reads could not be split reliably: the model ignores
// pause instructions). Free tier is 10 requests per model per day, so clips are made
// most-important first and the run resumes where it stopped; the app falls back to
// the browser voice for any clip not made yet.
const PRIORITY = ["welcome", "ask_name", "pick_option", "red_nsq", "red_spurious", "amber", "grey", "ask_batch", "fallback", "error", "offline"];
const STT_MODEL = "gemini-3.5-flash";
const VOICE = process.env.TTS_VOICE || "Kore";
const LANGS = (process.env.LANGS || "pa,gu,mr,kn,ta").split(",");
const NAMES = { pa: "Punjabi", gu: "Gujarati", mr: "Marathi", kn: "Kannada", ta: "Tamil" };
const PASS = 0.8; // mean similarity needed on the round-trip check
const API = "https://generativelanguage.googleapis.com/v1beta/models";

async function call(model, body, tries = 4) {
  for (let i = 0; ; i++) {
    const r = await fetch(`${API}/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify(body),
    });
    if (r.ok) return r.json();
    const msg = (await r.text()).slice(0, 200);
    if (i + 1 >= tries || ![500, 503].includes(r.status)) throw new Error(`${model} ${r.status} ${msg}`);
    await new Promise((s) => setTimeout(s, 4000 * (i + 1)));
  }
}

let ttsModel = null;
const spent = new Set();
async function tts(text, lang, prompt) {
  const body = {
    contents: [{ parts: [{ text: prompt ?? `Read this aloud in ${NAMES[lang]}, slowly, warmly and clearly, for an elderly listener:\n${text}` }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
  };
  let last;
  for (const m of TTS_MODELS) {
    if (spent.has(m)) continue;
    try {
      const j = await call(m, body);
      const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      if (!part) throw new Error(`${m}: no audio`);
      ttsModel = m;
      return { pcm: Buffer.from(part.inlineData.data, "base64"), mime: part.inlineData.mimeType };
    } catch (e) { last = e; if (/ 429 /.test(e.message) || / 404 /.test(e.message)) spent.add(m); }
  }
  throw last;
}

function toMp3(pcm, mime, out) {
  const rate = /rate=(\d+)/.exec(mime || "")?.[1] || "24000";
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "s16le", "-ar", rate, "-ac", "1", "-i", "pipe:0",
    "-af", "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse",
    "-ac", "1", "-ar", "22050", "-b:a", "32k", out], { input: pcm });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
}

async function transcribe(mp3, lang) {
  const j = await call(STT_MODEL, {
    contents: [{ parts: [
      { text: `Transcribe this ${NAMES[lang]} audio exactly in ${NAMES[lang]} script. Reply with only the transcript.` },
      { inlineData: { mimeType: "audio/mp3", data: mp3.toString("base64") } },
    ] }],
    generationConfig: { temperature: 0 },
  });
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() ?? "";
}

/** Synthesise several clips in one request and cut at the N-1 longest silences. */
async function ttsGroup(items, lang, dir) {
  const prompt = `Read each numbered ${NAMES[lang]} message aloud slowly, warmly and clearly for an elderly listener. ` +
    `Do NOT read the numbers. After each message stay completely silent for 4 seconds before the next.\n\n` +
    items.map(([, t], i) => `${i + 1}. ${t}`).join("\n\n");
  // Raw audio is cached (gitignored) so a bad split never costs another request.
  const { createHash } = await import("node:crypto");
  const cache = `i18n/.tts/${lang}-${createHash("sha1").update(prompt).digest("hex").slice(0, 12)}`;
  await mkdir("i18n/.tts", { recursive: true });
  let pcm, mime;
  try { pcm = await readFile(cache + ".raw"); mime = await readFile(cache + ".mime", "utf8"); }
  catch { ({ pcm, mime } = await tts("", lang, prompt)); await writeFile(cache + ".raw", pcm); await writeFile(cache + ".mime", mime || ""); }
  const rate = Number(/rate=(\d+)/.exec(mime || "")?.[1] || 24000);
  const wav = cache + ".raw";
  let sil = [];
  for (const [noise, d] of [[-42, 0.7], [-38, 0.5], [-35, 0.35], [-32, 0.25]]) {
    const det = spawnSync("ffmpeg", ["-hide_banner", "-f", "s16le", "-ar", String(rate), "-ac", "1", "-i", wav, "-af", `silencedetect=noise=${noise}dB:d=${d}`, "-f", "null", "-"], { encoding: "utf8" });
    sil = [...det.stderr.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)].map((m) => ({ a: +m[1], b: +m[2] }));
    if (sil.length >= items.length + 1) break;
  }
  const total = pcm.length / 2 / rate;
  const inner = sil.filter((s) => s.a > 0.3 && s.b < total - 0.3);
  if (inner.length < items.length - 1) throw new Error(`split: ${inner.length + 1} parts for ${items.length} clips`);
  // Choose N-1 cut silences (in order) so each part's length best fits its text
  // length, preferring longer silences. Dynamic programming over candidates.
  const lens = items.map(([, t]) => [...t].length);
  const N = items.length, M = inner.length;
  const perChar = (total - inner.reduce((n, x) => n + 0, 0)) / lens.reduce((x, y) => x + y, 0);
  const segCost = (from, to, k) => { const d = Math.max(0.05, to - from); return Math.log(d / (perChar * lens[k])) ** 2; };
  // best[k][j]: cost with cut k (0-based) at silence j
  const INF = 1e9;
  const best = Array.from({ length: N - 1 }, () => new Array(M).fill(INF));
  const prev = Array.from({ length: N - 1 }, () => new Array(M).fill(-1));
  for (let j = 0; j < M; j++) best[0][j] = segCost(0, inner[j].a, 0) - 0.5 * (inner[j].b - inner[j].a);
  for (let k = 1; k < N - 1; k++)
    for (let j = k; j < M; j++)
      for (let i = k - 1; i < j; i++) {
        if (best[k - 1][i] >= INF) continue;
        const c = best[k - 1][i] + segCost(inner[i].b, inner[j].a, k) - 0.5 * (inner[j].b - inner[j].a);
        if (c < best[k][j]) { best[k][j] = c; prev[k][j] = i; }
      }
  let end = -1, endCost = INF;
  for (let j = N - 2; j < M; j++) { const c = best[N - 2][j] + segCost(inner[j].b, total, N - 1); if (c < endCost) { endCost = c; end = j; } }
  const pick = [];
  for (let k = N - 2, j = end; k >= 0; j = prev[k][j], k--) pick.unshift(inner[j]);
  let start = 0;
  const bounds = pick.map((c) => { const r = [start, c.a + 0.15]; start = c.b - 0.15; return r; });
  bounds.push([start, total]);
  bounds.forEach(([x, y], i) => {
    const ratio = (y - x) / (perChar * lens[i]);
    if (ratio < 0.4 || ratio > 2.5) throw new Error(`split: part ${i + 1} (${items[i][0]}) length off x${ratio.toFixed(2)}`);
  });
  for (let i = 0; i < items.length; i++) {
    const [a, b] = bounds[i];
    toMp3(pcm.subarray(Math.floor(a * rate) * 2, Math.floor(b * rate) * 2), mime, `${dir}/${items[i][0]}.mp3`);
  }
}

const norm = (s) => s.normalize("NFC").replace(/[\s\p{P}\p{S}]/gu, "");
function similarity(a, b) {
  a = [...norm(a)]; b = [...norm(b)];
  if (!a.length || !b.length) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

const indexPath = "public/i18n/index.json";
const index = JSON.parse(await readFile(indexPath, "utf8"));
const report = {};

for (const lang of LANGS) {
  const dict = JSON.parse(await readFile(`public/i18n/${lang}.json`, "utf8"));
  const clips = Object.entries(dict.clips);
  const dir = `public/audio/${lang}`;
  await mkdir(dir, { recursive: true });

  // 1. Make every missing clip, GROUP clips per request.
  const has = async (k) => stat(`${dir}/${k}.mp3`).then((s) => s.size > 1000).catch(() => false);
  const todo = [];
  for (const c of clips) if (process.env.FORCE || !(await has(c[0]))) todo.push(c);
  todo.sort((x, y) => (PRIORITY.indexOf(x[0]) + 1 || 99) - (PRIORITY.indexOf(y[0]) + 1 || 99));
  for (const [k, text] of todo) {
    if (spent.size >= TTS_MODELS.length) break;
    try { const { pcm, mime } = await tts(text, lang); toMp3(pcm, mime, `${dir}/${k}.mp3`); }
    catch (e) { console.error(`${lang}/${k}: ${String(e.message).slice(0, 100)}`); }
  }
  // 2. Round-trip quality check: transcribe two clips back and compare with the reviewed text.
  const sample = ["welcome", "red_nsq"].map((k) => [k, dict.clips[k]]).filter(([, t]) => t);
  const scores = [];
  for (const [k, text] of sample) {
    if (!(await has(k))) continue;
    try { scores.push(similarity(text, await transcribe(await readFile(`${dir}/${k}.mp3`), lang))); } catch (e) { console.error(`${lang}: check ${String(e.message).slice(0, 120)}`); }
  }
  const mean = scores.length === sample.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const ok = mean >= PASS;
  console.log(`${lang}: round-trip similarity ${scores.map((s) => s.toFixed(2)).join(", ")} -> mean ${mean.toFixed(2)} ${ok ? "PASS (gemini)" : "FAIL (browser voice / text)"}`);

  if (!ok) {
    // Only delete clips that were checked and sound wrong; keep clips when we merely ran out of quota.
    if (scores.length) { await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true }); }
    index.langs[lang] = { ...index.langs[lang], clips: 0, voice: "browser", ttsCheck: scores.length ? Number(mean.toFixed(2)) : null, ttsNote: scores.length ? "failed round-trip check" : "no clips made (quota or API error)" };
    report[lang] = { voice: "browser", mean };
    continue;
  }

  let n = 0, bytes = 0;
  for (const [k] of clips) if (await has(k)) { bytes += (await stat(`${dir}/${k}.mp3`)).size; n++; }
  console.log(`${lang}: ${n}/${clips.length} clips, ${(bytes / 1024).toFixed(0)} KB, model ${ttsModel}`);
  index.langs[lang] = { ...index.langs[lang], clips: n, voice: n ? "gemini" : "browser", ttsCheck: Number(mean.toFixed(2)), ttsModel };
  report[lang] = { voice: index.langs[lang].voice, mean, n, kb: Math.round(bytes / 1024) };
}

await writeFile(indexPath, JSON.stringify(index, null, 1) + "\n");
await writeFile("i18n/review/tts-check.json", JSON.stringify({ when: new Date().toISOString(), model: ttsModel, voice: VOICE, pass: PASS, report }, null, 1) + "\n");
console.log(JSON.stringify(report));
