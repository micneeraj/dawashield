// Screenshots of every screen + an offline end-to-end check, with Playwright.
// Needs `npm run build && npm run preview` running on http://localhost:4173.
// Usage: node scripts/shots.mjs "<medicine>" "<RED batch>"
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:4173";
const [NAME = "", BATCH = ""] = process.argv.slice(2);
await mkdir("shots", { recursive: true });
const browser = await chromium.launch();
const log = (...a) => console.log(...a);
let failures = 0;
const expect = (ok, msg) => { log(ok ? "PASS" : "FAIL", msg); if (!ok) failures++; };

async function shoot(page, name) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `shots/${name}.png`, fullPage: false });
}

// ---------- Mobile screens ----------
for (const lang of ["hi", "en"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: lang === "hi" ? "hi-IN" : "en-IN" });
  await ctx.addInitScript((l) => localStorage.setItem("ds-lang", l), lang);
  await ctx.addInitScript(() => localStorage.setItem("ds-muted", "1"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log("pageerror", e.message));
  await page.goto(BASE);
  await page.waitForSelector("text=CDSCO", { timeout: 20000 });
  await shoot(page, `${lang}-01-home`);

  await page.getByTestId("type-btn").click();
  await page.getByTestId("name-input").fill(NAME.slice(0, 5));
  await shoot(page, `${lang}-02-type-suggest`);
  await page.getByTestId("name-input").fill(NAME);
  await page.getByTestId("type-batch").fill(BATCH);
  await page.getByTestId("check-btn").click();
  await page.waitForSelector('[data-testid="result"]');
  expect((await page.getByTestId("result").getAttribute("data-level")) === "RED", `${lang}: verified batch ${BATCH} gives RED`);
  await shoot(page, `${lang}-03-result-red`);
  await page.getByTestId("record").first().scrollIntoViewIfNeeded();
  await shoot(page, `${lang}-04-result-record`);

  // Save to cabinet
  await page.getByRole("button", { name: lang === "hi" ? "दवा पेटी में रखें" : "Save to cabinet" }).click();
  await page.getByRole("button", { name: lang === "hi" ? "माँ" : "Maa" }).click();
  await page.getByRole("textbox", { name: lang === "hi" ? "समाप्ति तिथि" : "Expiry" }).fill("11/2026");
  await shoot(page, `${lang}-05-save-sheet`);
  await page.getByRole("button", { name: lang === "hi" ? "सहेजें" : "Save", exact: true }).click();

  // Family alert sheet
  await page.getByTestId("family-alert").click();
  await shoot(page, `${lang}-06-family-sheet`);
  await page.keyboard.press("Escape");

  // Grey and amber
  await page.goto(BASE);
  await page.getByTestId("type-btn").click();
  await page.getByTestId("name-input").fill("Telmisartan");
  await page.getByTestId("type-batch").fill("ZZQ0001");
  await page.getByTestId("check-btn").click();
  await page.waitForSelector('[data-testid="result"]');
  expect((await page.getByTestId("result").getAttribute("data-level")) === "GREY", `${lang}: unknown batch gives GREY`);
  await shoot(page, `${lang}-07-result-grey`);

  await page.goto(BASE);
  await page.getByTestId("type-btn").click();
  await page.getByTestId("name-input").fill(NAME);
  const near = BATCH.slice(0, -1) + (BATCH.endsWith("9") ? "8" : "9");
  await page.getByTestId("type-batch").fill(near);
  await page.getByTestId("check-btn").click();
  await page.waitForSelector('[data-testid="result"]');
  expect((await page.getByTestId("result").getAttribute("data-level")) === "AMBER", `${lang}: near batch ${near} gives AMBER`);
  await shoot(page, `${lang}-08-result-amber`);
  await page.getByRole("button", { name: lang === "hi" ? "शिकायत करें" : "Report it" }).click();
  await shoot(page, `${lang}-09-report`);

  for (const [i, [nav, name]] of [
    [lang === "hi" ? "पेटी" : "Cabinet", "cabinet"],
    [lang === "hi" ? "परिवार" : "Family", "family"],
    [lang === "hi" ? "सेटिंग" : "Settings", "settings"],
  ].entries()) {
    await page.getByRole("navigation").getByRole("button", { name: nav }).click();
    await shoot(page, `${lang}-1${i}-${name}`);
  }
  await page.getByRole("button", { name: lang === "hi" ? "परिवार का सदस्य जोड़ें" : "Add family member" }).count();
  await page.getByRole("navigation").getByRole("button", { name: lang === "hi" ? "परिवार" : "Family" }).click();
  await page.getByRole("button", { name: lang === "hi" ? "परिवार का सदस्य जोड़ें" : "Add family member" }).click();
  await shoot(page, `${lang}-13-family-add`);
  await page.keyboard.press("Escape");
  await page.getByRole("navigation").getByRole("button", { name: lang === "hi" ? "सेटिंग" : "Settings" }).click();
  await page.getByRole("button", { name: lang === "hi" ? "निजता" : "Privacy" }).click();
  await shoot(page, `${lang}-14-privacy`);
  await page.goto(BASE);
  await page.getByRole("navigation").getByRole("button", { name: lang === "hi" ? "सेटिंग" : "Settings" }).click();
  await page.getByRole("button", { name: lang === "hi" ? "दवा कवच के बारे में" : "About DawaShield" }).click();
  await shoot(page, `${lang}-15-about`);
  await page.goto(BASE);
  await page.getByRole("button", { name: lang === "hi" ? "पत्ते की फ़ोटो" : "Strip photo" }).click();
  await shoot(page, `${lang}-16-photo`);
  // Headless Chromium has no working speech engine: stub it with a fixed transcript.
  await page.addInitScript((said) => {
    class FakeSR {
      start() {
        setTimeout(() => this.onresult?.({ results: [Object.assign([{ transcript: said }], { isFinal: true })] }), 400);
        setTimeout(() => this.onend?.(), 700);
      }
      stop() {} abort() {}
    }
    window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  }, lang === "hi" ? "सर दर्द की दवा है डोलो" : "headache medicine Dolo");
  await page.goto(BASE);
  await page.getByTestId("mic").click();
  await page.waitForSelector('[data-testid="option"]', { timeout: 20000 });
  await shoot(page, `${lang}-17-voice-options`);
  await page.getByTestId("option").first().click();
  await shoot(page, `${lang}-18-voice-batch`);
  await ctx.close();
}

// ---------- Desktop frame ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem("ds-muted", "1"));
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForSelector("text=CDSCO");
  await shoot(page, "desktop-home");
  await ctx.close();
}

// ---------- Offline end-to-end ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { localStorage.setItem("ds-muted", "1"); localStorage.setItem("ds-lang", "en"); });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  // Wait until workbox has precached everything.
  await page.waitForFunction(async () => (await caches.keys()).some((k) => k.includes("precache")), null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('[data-testid="offline-badge"]', { timeout: 15000 });
  expect(true, "offline: app shell loads from cache with offline badge");
  expect(await page.locator("text=CDSCO alerts on this phone").count() > 0, "offline: dataset loaded");
  // Clear IndexedDB copy to prove the dataset itself comes from the SW cache.
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase("dawashield"); q.onsuccess = q.onerror = q.onblocked = () => r(null); }));
  await page.reload();
  await page.waitForSelector("text=CDSCO alerts on this phone", { timeout: 15000 });
  expect(true, "offline: dataset reloads from service-worker cache after IndexedDB wipe");
  await page.getByTestId("type-btn").click();
  await page.getByTestId("name-input").fill(NAME);
  await page.getByTestId("type-batch").fill(BATCH);
  await page.getByTestId("check-btn").click();
  await page.waitForSelector('[data-testid="result"]');
  expect((await page.getByTestId("result").getAttribute("data-level")) === "RED", "offline: verified batch gives RED");
  expect((await page.getByTestId("record").count()) > 0, "offline: source record shown");
  expect((await page.getByTestId("data-upto").innerText()).includes("Data available up to"), "offline: data-up-to line shown");
  await shoot(page, "offline-result-red");
  const clip = await page.evaluate(async () => (await fetch("/audio/hi/red.mp3")).status).catch(() => 0);
  log("offline: /audio/hi/red.mp3 status", clip);
  await ctx.close();
}

await browser.close();
log(failures ? `${failures} FAILURE(S)` : "ALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
