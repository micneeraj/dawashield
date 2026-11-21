// Writes the "voice loop test" block of docs/EVAL.md from eval/voice/results.json
// (scripts/voice-loop.mjs) and public/i18n/index.json. Run: node scripts/voice-report.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const R = JSON.parse(readFileSync("eval/voice/results.json", "utf8"));
const idx = JSON.parse(readFileSync("public/i18n/index.json", "utf8")).langs;
const NAMES = { hi: "Hindi", en: "English", pa: "Punjabi", gu: "Gujarati", mr: "Marathi", kn: "Kannada", ta: "Tamil" };
const by = {};
for (const r of R.results) (by[r.lang] ??= []).push(r);

const clipSource = (l) => {
  if (l === "hi" || l === "en") return "Sarvam clips (unchanged)";
  const v = idx[l];
  if (v?.voice === "gemini") return v.clips >= 26 ? `Gemini TTS (${v.clips}/26)` : `Gemini TTS (${v.clips}/26), rest browser voice → text`;
  return "browser voice → text only (Gemini clips not generated yet: daily TTS quota)";
};

const rows = Object.entries(by).map(([l, rs]) => {
  const n = rs.length;
  const tr = rs.filter((r) => r.transcribed).length;
  const t1 = rs.filter((r) => r.top1).length;
  const t3 = rs.filter((r) => r.top3).length;
  const w = (rs[0]?.welcome ?? "none") === "none" ? "text only (no device voice for this language in test Chromium)" : rs[0].welcome;
  const redRaw = rs.find((r) => r.redClip)?.redClip ?? "not run";
  const red = redRaw === "none" ? "text only (RED result shown)" : redRaw;
  const misses = rs.filter((r) => !r.top3).map((r) => `${r.expected}: heard “${r.transcript || "—"}”${r.options.length ? ` → ${r.options.slice(0, 3).join(", ")}` : ` (${r.outcome})`}`);
  return { l, n, tr, t1, t3, w, red, misses };
});

const tot = rows.reduce((a, r) => ({ n: a.n + r.n, t3: a.t3 + r.t3, t1: a.t1 + r.t1, tr: a.tr + r.tr }), { n: 0, t3: 0, t1: 0, tr: 0 });
const wk = R.webkit || {};
const md = `<!-- voice-loop -->
## d) Voice loop test (generated speech, not real speakers)

Run ${R.when.slice(0, 16).replace("T", " ")} UTC on the live site (${R.base}) with \`node --env-file=.env scripts/voice-loop.mjs\`, then \`node scripts/voice-report.mjs\`.
Chromium with a fake microphone (\`--use-fake-ui-for-media-stream --use-file-for-fake-audio-capture\`) fed one generated sentence per case, “I want to check <medicine>” in the language (\`eval/voice/phrases.json\`; voices: edge-tts neural voices, gTTS for Punjabi).
Flow per case: tap Speak → welcome clip → app records (MediaRecorder, max 8 s) → Gemini Flash-Lite transcript → deterministic matcher → option buttons. First case per language also taps the demo RED batch.

**App Check note:** reCAPTCHA Enterprise correctly rejects headless browsers, so in this test the page's own Firebase AI Logic request is forwarded unchanged to the same model with the developer key held by the Node test process (never by the page). Everything except the App Check token itself is exercised. Hindi/English: headless Chromium has no working Web Speech service, so these runs also cover the fallback from browser recognition to recording.

| Language | Transcribed | Top-1 | Top-3 | Welcome clip | Demo RED clip | Clip source |
|---|---|---|---|---|---|---|
${rows.map((r) => `| ${NAMES[r.l]} | ${r.tr}/${r.n} | ${r.t1}/${r.n} | **${r.t3}/${r.n}** | ${r.w} | ${r.red} | ${clipSource(r.l)} |`).join("\n")}
| **All** | ${tot.tr}/${tot.n} | ${tot.t1}/${tot.n} | **${tot.t3}/${tot.n}** | | | |

${rows.some((r) => r.misses.length) ? `Misses:\n${rows.filter((r) => r.misses.length).map((r) => `- ${NAMES[r.l]}: ${r.misses.join("; ")}`).join("\n")}\n` : "No top-3 misses.\n"}
**iPhone Safari emulation (Playwright WebKit, iPhone 13 profile, Windows):** Web Speech ${wk.webSpeech ? "present" : "absent"}, MediaRecorder ${wk.mediaRecorder ? `present (${(wk.supported || []).join(", ")})` : "absent"}, getUserMedia ${wk.getUserMedia ? "present" : "absent"}; welcome clip ${wk.welcome?.ok ? "played" : "did not play"}. ${wk.mediaRecorder ? "" : "Playwright's Windows WebKit build has no media-capture APIs, so it can only confirm the app picks the recording path and shows the polite \"type instead\" card when no microphone API exists. The iOS format choice (audio/mp4 when webm is unsupported) is covered by unit tests (\`tests/voice-record.test.ts\`); a real iPhone test is still needed."}

What this does not prove: accuracy with real speakers, accents, background noise or real phone microphones; App Check acceptance of the new transcription call on a real phone.
<!-- /voice-loop -->`;

const prev = existsSync("docs/EVAL.md") ? readFileSync("docs/EVAL.md", "utf8") : "# DawaShield evaluation\n";
const next = /<!-- voice-loop -->[\s\S]*<!-- \/voice-loop -->/.test(prev)
  ? prev.replace(/<!-- voice-loop -->[\s\S]*<!-- \/voice-loop -->/, md)
  : `${prev.trimEnd()}\n\n${md}\n`;
writeFileSync("docs/EVAL.md", next);
console.log(JSON.stringify(rows.map(({ l, n, tr, t1, t3, w, red }) => ({ l, n, tr, t1, t3, w, red, clips: clipSource(l) }))));
