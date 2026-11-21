// Voice loop test on the LIVE site with generated speech (not real speakers).
//   Chromium: one browser per speech file, fake microphone fed from eval/voice/wav/*.wav
//     (--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture).
//     Per language: welcome clip after the tap, speech transcribed, expected medicine in
//     the top 3 options, demo RED batch plays the RED clip.
//   WebKit (iPhone 13 emulation): the recording path is chosen (no Web Speech) and
//     MediaRecorder picks an iOS-compatible format.
// Writes eval/voice/results.json. Run: node scripts/voice-loop.mjs [baseUrl]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, webkit, devices } from "playwright";

const BASE = process.argv[2] || "https://dawashield-hybrid-3023.web.app";
const P = JSON.parse(readFileSync("eval/voice/phrases.json", "utf8"));
const ONLY = process.env.LANGS ? process.env.LANGS.split(",") : Object.keys(P.cases);
const index = await fetch(`${BASE}/i18n/index.json`).then((r) => r.json()).catch(() => ({ langs: {} }));

// Logs every clip the page tries to play (mp3 or device voice) and whether it actually played.
const PROBE = () => {
  window.__clips = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const e = { kind: "mp3", src: this.src, ok: null };
    window.__clips.push(e);
    const p = play.call(this);
    p.then(() => { e.ok = true; }, (err) => { e.ok = false; e.err = String(err?.name || err); });
    return p;
  };
  if (window.speechSynthesis) {
    const speak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = (u) => { window.__clips.push({ kind: "browser-voice", text: u.text, lang: u.lang, ok: true }); speak(u); };
  }
};

// App Check (reCAPTCHA Enterprise) correctly rejects headless browsers ("App attestation
// failed"). So the test forwards the page's own Firebase AI Logic request body, unchanged,
// to the same Gemini model with the developer key. The key stays in this Node process and
// never reaches the page. Everything except the App Check token itself is exercised.
const KEY = process.env.GEMINI_API_KEY;
const aiCalls = [];
async function proxyAi(ctx) {
  if (!KEY) return;
  // Stand-in App Check exchange so the SDK sends its request (the stand-in token is never accepted by Google; the proxy below replaces auth).
  await ctx.route(/content-firebaseappcheck\.googleapis\.com\/.*:exchange/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "test-only", ttl: "3600s" }) }));
  await ctx.route(/firebasevertexai\.googleapis\.com\/.*:generateContent/, async (route) => {
    const model = /models\/([^:]+):/.exec(route.request().url())?.[1] || "gemini-3.5-flash";
    const body = route.request().postData();
    for (let i = 0; i < 3; i++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": KEY }, body });
      const text = await r.text();
      aiCalls.push({ model, status: r.status, audio: /audio\//.test(body || "") });
      if (r.status === 503 && i < 2) { await new Promise((s) => setTimeout(s, 3000)); continue; }
      return route.fulfill({ status: r.status, contentType: "application/json", body: text });
    }
  });
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const clips = (page) => page.evaluate(() => window.__clips.slice());

async function runCase(lang, [id, expected, text], withDemo) {
  const wav = resolve(`eval/voice/wav/${lang}-${id}.wav`);
  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`, "--autoplay-policy=user-gesture-required"],
  });
  const ctx = await browser.newContext({ permissions: ["microphone"], viewport: { width: 400, height: 860 } });
  await ctx.addInitScript((l) => {
    localStorage.setItem("ds-ui-lang", l);
    if (l === "hi" || l === "en") localStorage.setItem("ds-lang", l);
    localStorage.setItem("ds-first-run-v2", "1");
    localStorage.setItem("ds-muted", "0");
  }, lang);
  await ctx.addInitScript(PROBE);
  // Headless Chromium's own Web Speech crashes the renderer, so Hindi/English use a stand-in
  // recogniser that fails like iPhone Safari with dictation off ("service-not-allowed").
  // This exercises the app's fallback from browser recognition to recording.
  await ctx.addInitScript(() => {
    class FailingRecognition { start() { setTimeout(() => { this.onerror?.({ error: "service-not-allowed" }); this.onend?.(); }, 200); } stop() {} abort() {} }
    Object.defineProperty(window, "SpeechRecognition", { value: FailingRecognition });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: FailingRecognition });
  });
  await proxyAi(ctx);
  const page = await ctx.newPage();
  const out = { lang, id, expected, spoken: text };
  try {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.getByTestId("hero").waitFor();
    if (!["hi", "en"].includes(lang)) await page.waitForFunction((l) => document.documentElement.lang === l, lang, { timeout: 15000 });
    await page.getByTestId("speak-btn").click();
    await page.waitForTimeout(1500);
    const c = await clips(page);
    const w = c.find((x) => (x.src || "").includes("/welcome.mp3") || x.kind === "browser-voice");
    out.welcome = w ? (w.kind === "mp3" ? (w.ok ? `played ${new URL(w.src).pathname}` : `blocked ${w.err}`) : "browser voice") : "none";
    // Recording path: waits 2.5 s, records up to 8 s, then Gemini transcribes.
    const t0 = Date.now();
    const done = await Promise.race([
      page.getByTestId("option").first().waitFor({ timeout: 45000 }).then(() => "options"),
      page.locator("[role=alert], [data-testid=voice-offline]").first().waitFor({ timeout: 45000 }).then(() => "error"),
    ]).catch(() => "timeout");
    out.ms = Date.now() - t0;
    out.sawProcessing = await page.evaluate(() => !!document.body.innerText).catch(() => false);
    const said = await page.locator("text=/“.*”/").first().innerText().catch(() => "");
    out.transcript = said.replace(/^.*?“|”.*$/gs, "");
    out.options = done === "options" ? (await page.getByTestId("option").allInnerTexts()).map((s) => s.split("\n")[0]) : [];
    out.outcome = done;
    if (done !== "options") out.errorText = (await page.locator("main").innerText().catch(() => "")).slice(0, 200);
    out.top1 = out.options.length > 0 && norm(out.options[0]).includes(norm(expected).slice(0, 6));
    out.top3 = out.options.slice(0, 3).some((o) => norm(o).includes(norm(expected).slice(0, 6)));
    out.transcribed = !!out.transcript;
    if (withDemo) {
      await page.goto(BASE);
      await page.getByTestId("hero").waitFor();
      if (!["hi", "en"].includes(lang)) await page.waitForFunction((l) => document.documentElement.lang === l, lang, { timeout: 15000 });
      await page.evaluate(() => { window.__clips = []; });
      await page.getByTestId("demo-btn").first().click();
      await page.waitForTimeout(2500);
      const d = (await clips(page)).find((x) => /\/red[^/]*\.mp3$/.test(x.src || "") || x.kind === "browser-voice");
      out.redClip = d ? (d.kind === "mp3" ? (d.ok ? `played ${new URL(d.src).pathname}` : `failed ${d.err}`) : `browser voice (${d.lang})`) : "none";

    }
  } catch (e) {
    out.outcome = "crash";
    out.error = String(e.message).slice(0, 200);
  }
  await browser.close();
  console.log(JSON.stringify(out));
  return out;
}

const results = [];
for (const lang of ONLY) {
  const cases = P.cases[lang].slice(0, Number(process.env.CASES) || 99);
  for (let i = 0; i < cases.length; i++) results.push(await runCase(lang, cases[i], i === 0));
}

// WebKit, iPhone 13 emulation: which hearing path and recording format is chosen.
let webkitResult = null;
try {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  await ctx.addInitScript(() => { localStorage.setItem("ds-ui-lang", "kn"); localStorage.setItem("ds-first-run-v2", "1"); });
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByTestId("hero").waitFor();
  const caps = await page.evaluate(() => {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/aac", "audio/ogg;codecs=opus", "audio/ogg"];
    return {
      userAgent: navigator.userAgent,
      webSpeech: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
      mediaRecorder: typeof MediaRecorder !== "undefined",
      getUserMedia: !!navigator.mediaDevices?.getUserMedia,
      supported: typeof MediaRecorder !== "undefined" ? types.filter((t) => MediaRecorder.isTypeSupported(t)) : [],
    };
  });
  await page.waitForFunction(() => document.documentElement.lang === "kn", null, { timeout: 15000 }).catch(() => {});
  await page.getByTestId("speak-btn").click();
  await page.waitForTimeout(4000);
  const c = await clips(page);
  webkitResult = {
    ...caps,
    welcome: c.find((x) => (x.src || "").includes("welcome")) ?? null,
    micShown: await page.getByTestId("mic").isVisible().catch(() => false),
    screen: (await page.locator("main").innerText().catch(() => "")).slice(0, 240),
  };
  await browser.close();
} catch (e) {
  webkitResult = { error: String(e.message).slice(0, 200) };
}
console.log("webkit", JSON.stringify(webkitResult));

writeFileSync("eval/voice/results.json", JSON.stringify({ when: new Date().toISOString(), base: BASE, voices: P.voices, clipModes: Object.fromEntries(Object.entries(index.langs || {}).map(([k, v]) => [k, { voice: v.voice, clips: v.clips }])), results, webkit: webkitResult, aiCalls, appCheck: KEY ? "bypassed in test (proxied to same model)" : "live" }, null, 1) + "\n");
