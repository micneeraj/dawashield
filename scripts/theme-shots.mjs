// Theme screenshots + UI checks for the main screens, Hindi and English, 360 / 390 / desktop.
// Needs `npm run build && npm run preview` on http://localhost:4173.
// Usage: node scripts/theme-shots.mjs <before|after> [--check]
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:4173";
const tag = process.argv[2] || "after";
const CHECK = process.argv.includes("--check");
const OUT = `docs/theme/${tag}`;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
let failures = 0;
const expect = (ok, msg) => { console.log(ok ? "PASS" : "FAIL", msg); if (!ok) failures++; };

async function shot(page, name) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
const noHScroll = async (page, label) => {
  if (!CHECK) return;
  const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(w <= 1, `${label}: no horizontal scroll (${w}px)`);
};

async function ctxFor(lang, width, { fresh = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 800 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(([l, f]) => {
    localStorage.setItem("ds-muted", "1");
    if (!f) {
      localStorage.setItem("ds-lang", l); localStorage.setItem("ds-ui-lang", l);
      localStorage.setItem("ds-first-run-v2", "1"); localStorage.setItem("ds-welcome-v1", "1");
    }
  }, [lang, fresh]);
  return ctx;
}

async function home(page) {
  await page.goto(BASE);
  await page.waitForSelector('[data-testid="hero"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="demo-btn"]', { timeout: 60000 });
}

// Welcome / language screen (new install).
{
  const ctx = await ctxFor("hi", 390, { fresh: true });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  await shot(page, "00-welcome");
  if (CHECK) {
    expect(await page.getByTestId("welcome").isVisible(), "welcome screen shows on first start");
    expect((await page.getByTestId("lang-hi").getAttribute("data-ready")) === "1", "Hindi tile active");
    expect((await page.getByTestId("lang-en").getAttribute("data-ready")) === "1", "English tile active");
    for (const l of ["pa", "gu", "mr", "kn", "ta"]) expect(await page.getByTestId(`lang-${l}`).isVisible(), `${l} tile shown`);
    await page.getByTestId("lang-en").click();
    await page.getByTestId("nickname-input").fill("Maa");
    await page.getByTestId("welcome-next").click();
    await page.waitForTimeout(400);
    if (await page.getByTestId("first-run-ok").isVisible().catch(() => false)) await page.getByTestId("first-run-ok").click();
    await page.waitForSelector('[data-testid="hero"]');
    const g = await page.getByTestId("greeting").textContent();
    expect(/^Good (morning|afternoon|evening), Maa/.test(g ?? ""), `greeting shows name: "${g}"`);
  }
  await ctx.close();
}

for (const lang of ["hi", "en"]) {
  for (const width of [360, 390]) {
    const full = width === 390;
    const ctx = await ctxFor(lang, width);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("pageerror", e.message));
    await home(page);
    const p = `${lang}-${width}`;
    await shot(page, `${p}-01-home`);
    await noHScroll(page, `${p} home`);

    // RED demo
    await page.locator('[data-testid="demo-btn"][data-batch="251TTF014"]').click();
    await page.waitForSelector('[data-testid="result"]');
    await shot(page, `${p}-02-result-red`);
    await noHScroll(page, `${p} red`);
    if (CHECK) {
      expect((await page.getByTestId("result").getAttribute("data-level")) === "RED", `${p}: 251TTF014 is RED`);
      expect(await page.getByTestId("call-buttons").isVisible(), `${p}: Call buttons on RED`);
      expect(await page.getByTestId("call-family").count() === 1 && await page.getByTestId("call-doctor").count() === 1 && await page.getByTestId("call-chemist").count() === 1, `${p}: three call buttons`);
      const h = await page.getByTestId("call-doctor").evaluate((e) => e.getBoundingClientRect().height);
      expect(h >= 56, `${p}: call button >= 56px (${h})`);
      await page.getByTestId("call-doctor").click();
      expect(await page.getByTestId("add-number-sheet").isVisible(), `${p}: unsaved number opens Add number sheet`);
      await page.getByTestId("contact-number").fill("9876543210");
      await page.getByTestId("contact-save").click();
      await page.waitForTimeout(300);
      expect((await page.getByTestId("call-doctor").getAttribute("href")) === "tel:9876543210", `${p}: saved number becomes tel: link`);
    }
    if (full && await page.getByTestId("call-buttons").count()) {
      await page.getByTestId("call-buttons").scrollIntoViewIfNeeded();
      await shot(page, `${p}-03-result-red-calls`);
    }

    // GREY: a batch not on any list
    await page.goto(BASE);
    await page.waitForSelector('[data-testid="type-btn"]');
    await page.getByTestId("type-btn").click();
    await page.getByTestId("name-input").fill("Dolo 650");
    await page.getByTestId("type-batch").fill("ZZQ98765");
    await page.getByTestId("check-btn").click();
    await page.waitForSelector('[data-testid="result"]');
    await shot(page, `${p}-04-result-grey`);
    if (CHECK) {
      expect((await page.getByTestId("result").getAttribute("data-level")) === "GREY", `${p}: unlisted batch is GREY`);
      expect(await page.getByTestId("call-buttons").count() === 0, `${p}: no Call buttons on GREY`);
    }

    if (full) {
      for (const [btn, name] of [["speak-btn", "05-voice"], ["photo-btn", "06-photo"]]) {
        await page.goto(BASE); await page.waitForSelector(`[data-testid="${btn}"]`);
        await page.getByTestId(btn).click(); await shot(page, `${p}-${name}`);
      }
      for (const [nav, name] of [["cabinet", "07-cabinet"], ["family", "08-family"], ["settings", "09-settings"]]) {
        await page.goto(BASE); await page.waitForSelector('[data-testid="hero"]');
        await page.locator("nav button").nth(["home", "cabinet", "family", "settings"].indexOf(nav)).click();
        await shot(page, `${p}-${name}`);
        await noHScroll(page, `${p} ${nav}`);
      }
      if (CHECK) {
        expect(await page.getByTestId("contacts-card").isVisible(), `${p}: My contacts in Settings`);
        await page.getByTestId("contacts-card").scrollIntoViewIfNeeded();
        await shot(page, `${p}-10-contacts`);
      }
      await page.goto(BASE); await page.waitForSelector('[data-testid="why-link"]');
      await page.getByTestId("why-link").click(); await shot(page, `${p}-11-why`);
    }
    await ctx.close();
  }
}

// Desktop
{
  const ctx = await ctxFor("en", 1366);
  const page = await ctx.newPage();
  await home(page);
  await shot(page, "desktop-01-home");
  await noHScroll(page, "desktop home");
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
