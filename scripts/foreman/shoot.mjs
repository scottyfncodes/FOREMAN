// node scripts/foreman/shoot.mjs <levelIndex> <strikeIds comma> [times ms comma] : phone screenshots of a strike.
import { chromium } from '@playwright/test';
const [, , idx = '0', strikes = '', times = '300,900,1800,5000', mode = 'play'] = process.argv;
const url = process.env.URL ?? 'http://localhost:5173/FOREMAN/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: Number(process.env.DSF ?? 2), hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__foreman);
await page.waitForTimeout(700);
const out = 'scripts/foreman/shots';
if (mode === 'title') { await page.screenshot({ path: `${out}/title.png` }); }
else {
  await page.evaluate((i) => { const g = window.__foreman; g.store.data.seen = ['hut','frame','terrace','stack','shop','flats','shed','tower']; g.startLevel(i); }, Number(idx));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/l${idx}-rest.png` });
  for (const s of strikes.split(',').filter(Boolean)) {
    const p = await page.evaluate((id) => window.__foreman.locate(id), Number(s));
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/l${idx}-sel${s}.png` });
    await page.click('.fm-blast');
    let t0 = 0;
    for (const t of times.split(',').map(Number)) {
      await page.waitForTimeout(t - t0); t0 = t;
      await page.screenshot({ path: `${out}/l${idx}-s${s}-${t}.png` });
    }
    await page.waitForFunction(() => window.__foreman.debug().status !== 'busy', null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/l${idx}-s${s}-end.png` });
    console.log(JSON.stringify(await page.evaluate(() => window.__foreman.debug())));
  }
}
if (errors.length) console.log('ERRORS', errors.slice(0, 5));
await browser.close();
