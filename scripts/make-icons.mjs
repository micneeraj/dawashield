import { chromium } from "playwright"; import { readFileSync } from "node:fs";
const svg = readFileSync("public/icon.svg", "utf8"); const b = await chromium.launch();
for (const s of [192, 512]) { const p = await b.newPage({ viewport: { width: s, height: s } });
  await p.setContent(`<style>body{margin:0}</style>${svg.replace("<svg ", `<svg width="${s}" height="${s}" `)}`);
  await p.screenshot({ path: `public/icon-${s}.png` }); }
await b.close();
