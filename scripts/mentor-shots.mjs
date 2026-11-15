// Mentor screenshots: every key screen on a phone and a desktop viewport.
// Needs `npm run build && npx vite preview --port 4173` running.
// AI calls and speech recognition are faked in the browser so the flows render
// deterministically (no network, no microphone). Matching is the real code + data.
// Usage: node scripts/mentor-shots.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:4173";
const OUT = "screenshots";
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
let fails = 0;
const ok = (c, m) => { console.log(c ? "PASS" : "FAIL", m); if (!c) fails++; };

const STRIP_REPLY = JSON.stringify({
  name: { value: "Orofer XT", source: "Orofer XT", confidence: 0.95 },
  manufacturer: { value: "Emcure Pharmaceuticals Ltd.", source: "Mfd. by: Emcure Pharmaceuticals Ltd.", confidence: 0.9 },
  batch: { value: "E166L26", source: "B.No. E166L26", confidence: 0.93 },
  expiry: { value: "JUN 2028", source: "EXP. JUN 2028", confidence: 0.92 },
  mfd: { value: "JUL 2026", source: "MFD. JUL 2026", confidence: 0.9 },
  image_quality: "ok",
  batch_expiry_box: null,
});

async function fakeAi(ctx) {
  await ctx.route(/exchangeDebugToken|exchangeRecaptcha/, (r) => r.fulfill({ json: { token: "fake", ttl: "3600s" } }));
  await ctx.route(/generateContent/, async (r) => {
    const body = r.request().postData() || "";
    const text = body.includes("candidate") ? '{"candidates":["Zinc Sulphate Dispersible Tablets IP"]}' : body.includes("B.No") ? STRIP_REPLY : "This alert means the sample failed a lab test.";
    await r.fulfill({ json: { candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }] } });
  });
  await ctx.addInitScript(() => {
    // Fake Web Speech: hears "Dolo 650 hai" once.
    class FakeRec {
      start() { setTimeout(() => { this.onresult?.({ results: [Object.assign([{ transcript: "zinc sulphate wali goli hai" }], { isFinal: true })] }); this.onend?.(); }, 500); }
      stop() { this.onend?.(); }
    }
    window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec;
  });
}

async function stripPng() {
  const p = await browser.newPage({ viewport: { width: 900, height: 520 } });
  await p.setContent(`<body style="margin:0;background:#c9ccd1;display:grid;place-items:center;height:100vh;font-family:Arial">
    <div style="background:linear-gradient(#eef0f3,#d9dde3);width:760px;height:360px;border-radius:18px;padding:30px;box-sizing:border-box;box-shadow:0 10px 30px #0004">
    <div style="font-size:54px;font-weight:800;color:#b3122b">Orofer XT</div><div style="font-size:20px;color:#333">Ferrous Ascorbate &amp; Folic Acid Tablets</div>
    <div style="margin-top:60px;font:600 24px monospace;color:#222">B.No. E166L26<br>MFD. JUL 2026<br>EXP. JUN 2028</div>
    <div style="font-size:16px;color:#444;margin-top:14px">Mfd. by: Emcure Pharmaceuticals Ltd.</div></div></body>`);
  const buf = await p.screenshot(); await p.close(); return buf;
}
const STRIP = await stripPng();

const VIEWS = [
  { tag: "phone", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { tag: "desktop", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
];

for (const v of VIEWS) {
  for (const lang of v.tag === "phone" ? ["en", "hi"] : ["en"]) {
    const ctx = await browser.newContext({ ...v, locale: lang === "hi" ? "hi-IN" : "en-IN" });
    await ctx.addInitScript((l) => { localStorage.setItem("ds-lang", l); localStorage.setItem("ds-muted", "1"); }, lang);
    await fakeAi(ctx);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("pageerror", e.message));
    const n = { i: 0 };
    const shot = async (name, full = false) => {
      await page.waitForTimeout(500);
      const f = `${OUT}/${v.tag}-${lang}-${String(++n.i).padStart(2, "0")}-${name}.png`;
      await page.screenshot({ path: f, fullPage: full });
    };
    const home = async () => { await page.goto(BASE); await page.getByTestId("hero").waitFor(); };

    // Home (first paint timing)
    const t0 = Date.now();
    await home();
    await page.getByTestId("trust-strip").getByText(/records|रिकॉर्ड/).waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-testid="trust-strip"]')?.textContent?.includes("…"));
    ok(Date.now() - t0 < 3000, `${v.tag}/${lang}: home usable in ${Date.now() - t0} ms (< 3000)`);
    await shot("home");

    // Cabinet + family empty
    await page.goto(BASE); await page.getByTestId("hero").waitFor();
    await page.getByRole("button", { name: lang === "hi" ? /पेटी/ : /cabinet/i }).first().click();
    await page.getByTestId("cabinet-empty").waitFor(); await shot("cabinet-empty");
    await home();
    await page.locator("nav").getByRole("button").nth(2).click();
    await page.getByTestId("family-empty").waitFor(); await shot("family-empty");

    // Type flow
    await home();
    await page.getByTestId("type-btn").click();
    await page.getByTestId("name-input").fill("Dolo");
    await shot("type-flow");

    // RED via demo chip
    await page.getByTestId("demo-chip").click();
    await page.getByTestId("result").waitFor();
    ok((await page.getByTestId("result").getAttribute("data-level")) === "RED", `${v.tag}/${lang}: demo chip gives RED`);
    await shot("red");
    ok((await page.getByTestId("pipeline").getAttribute("data-source")) === "typed", `${v.tag}/${lang}: typed demo shows "Typed by you"`);
    ok((await page.getByTestId("result").textContent()).includes(lang === "hi" ? "गुणवत्ता चेतावनी" : "This batch appears in an official CDSCO quality alert"), `${v.tag}/${lang}: safer RED wording`);
    ok(await page.getByTestId("listed-note").first().isVisible(), `${v.tag}/${lang}: listed 2 times note`);
    await page.getByTestId("why-panel").scrollIntoViewIfNeeded();
    await shot("red-why");
    await shot("red-full", true);

    // Save to cabinet, then family alert preview
    await page.getByRole("button", { name: lang === "hi" ? "दवा पेटी में रखें" : "Save to cabinet" }).click();
    await page.getByRole("button", { name: lang === "hi" ? "माँ" : "Maa" }).click();
    await page.getByRole("textbox", { name: lang === "hi" ? "समाप्ति तिथि" : "Expiry" }).fill("12/2026");
    await page.getByRole("button", { name: lang === "hi" ? "सहेजें" : "Save", exact: true }).click();
    await page.getByTestId("family-alert").click();
    await page.getByTestId("family-msg").waitFor();
    ok((await page.getByTestId("family-alert").textContent())?.includes(lang === "hi" ? "परिवार को चेतावनी भेजें" : "Send alert to family"), `${v.tag}/${lang}: family button text`);
    await shot("family-alert-preview");
    await page.keyboard.press("Escape");

    // AMBER (one character off) and GREY
    const red = await page.getByTestId("checked-batch").textContent();
    const near = red.slice(0, -1) + (red.endsWith("9") ? "8" : "9");
    const name = (await page.locator('[data-testid="why-name"] td').nth(1).textContent()) || "";
    await home(); await page.getByTestId("type-btn").click();
    await page.getByTestId("name-input").fill(name); await page.getByTestId("type-batch").fill(near);
    await page.getByTestId("type-batch").press("Enter");
    await page.getByTestId("result").waitFor();
    ok((await page.getByTestId("result").getAttribute("data-level")) === "AMBER", `${v.tag}/${lang}: near batch gives AMBER`);
    await shot("amber");
    await page.getByTestId("why-panel").scrollIntoViewIfNeeded(); await shot("amber-why");

    await home(); await page.getByTestId("type-btn").click();
    await page.getByTestId("name-input").fill("Telmisartan"); await page.getByTestId("type-batch").fill("ZZQ0001");
    await page.getByTestId("check-btn").click();
    await page.getByTestId("result").waitFor();
    ok((await page.getByTestId("result").getAttribute("data-level")) === "GREY", `${v.tag}/${lang}: unknown batch gives GREY`);
    await page.getByTestId("why-toggle").click();
    await shot("grey");
    await page.getByTestId("no-guarantee").scrollIntoViewIfNeeded(); await shot("grey-why");

    // Cabinet filled
    await home();
    await page.locator("nav").getByRole("button").nth(1).click();
    await page.getByTestId("cabinet-banner").waitFor();
    await shot("cabinet"); await shot("cabinet-full", true);

    // Voice flow (fake speech + faked AI reply)
    await home();
    await page.getByTestId("speak-btn").click();
    await page.getByTestId("option").first().waitFor({ timeout: 15000 });
    await shot("voice-pick");
    await page.getByTestId("option").first().click();
    await page.getByTestId("batch-input").waitFor(); await shot("voice-batch");
    await page.getByTestId("batch-input").fill("MT14501"); await page.getByTestId("batch-input").press("Enter");
    await page.getByTestId("result").waitFor();
    ok((await page.getByTestId("pipeline").getAttribute("data-source")) === "cloud", `${v.tag}/${lang}: voice result pipeline from SDK source`);
    await page.getByTestId("pipeline").scrollIntoViewIfNeeded(); await shot("voice-result-pipeline");
    await page.getByTestId("how-toggle").click();
    ok((await page.getByTestId("how-step").count()) >= 2, `${v.tag}/${lang}: how-made lists AI call + plain code`);
    await page.getByTestId("how-list").scrollIntoViewIfNeeded(); await shot("how-made");

    // Photo confirm (faked cloud read)
    await home();
    await page.getByTestId("photo-btn").click();
    await shot("photo-tip");
    await page.getByTestId("photo-input").setInputFiles({ name: "strip.png", mimeType: "image/png", buffer: STRIP });
    await page.getByTestId("confirm-screen").waitFor({ timeout: 30000 });
    await shot("photo-confirm");
    ok((await page.getByTestId("status-pill").getAttribute("data-kind")) === "cloud", `${v.tag}/${lang}: status pill shows Cloud AI after a cloud answer`);
    await page.getByTestId("confirm-btn").scrollIntoViewIfNeeded(); await shot("photo-confirm-fields");
    await page.getByTestId("confirm-btn").click(); await page.getByTestId("result").waitFor();
    await page.getByTestId("pipeline").scrollIntoViewIfNeeded(); await shot("photo-result-pipeline");
    await page.getByTestId("status-pill").click(); await page.getByTestId("status-popover").waitFor(); await shot("status-popover");
    await page.getByTestId("status-pill").click();

    // Settings (Nano status)
    await home();
    await page.locator("nav").getByRole("button").nth(3).click();
    await page.getByTestId("offline-facts").last().scrollIntoViewIfNeeded();
    ok((await page.getByTestId("offline-facts").last().textContent()).includes(lang === "hi" ? "स्पीच पैक" : "Hindi speech pack"), `${v.tag}/${lang}: precise offline list`);
    ok(!/^unavailable/i.test((await page.getByTestId("nano-status").textContent()) || ""), `${v.tag}/${lang}: no bare 'unavailable'`);
    await shot("settings");

    // Offline: pill + check still works
    await home(); await ctx.setOffline(true); await page.waitForTimeout(400);
    ok((await page.getByTestId("status-pill").getAttribute("data-kind")) === "device", `${v.tag}/${lang}: offline pill`);
    await page.getByTestId("type-btn").click(); await page.getByTestId("demo-chip").click();
    await page.getByTestId("result").waitFor();
    ok((await page.getByTestId("result").getAttribute("data-level")) === "RED", `${v.tag}/${lang}: offline RED still works`);
    await shot("offline-red");
    await ctx.setOffline(false);
    await ctx.close();
  }
}
await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
