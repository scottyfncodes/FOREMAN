// node scripts/foreman/svg2png.mjs : rasterises every film strip in scripts/foreman/out.
import { readdirSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const dir = 'scripts/foreman/out';
const browser = await chromium.launch();
for (const f of readdirSync(dir).filter((n) => n.endsWith('.svg'))) {
  const svg = readFileSync(`${dir}/${f}`, 'utf8');
  const w = Number(/width="([\d.]+)"/.exec(svg)[1]);
  const h = Number(/height="([\d.]+)"/.exec(svg)[1]);
  const page = await browser.newPage({ viewport: { width: Math.ceil(w), height: Math.ceil(h) } });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  await page.screenshot({ path: `${dir}/${f.replace('.svg', '.png')}` });
  await page.close();
}
await browser.close();
