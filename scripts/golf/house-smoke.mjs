/* House puzzle smoke test: a headless iPhone plays the first house at its recorded par line,
 * checks the stars sheet and that the next house opens, then burns every shot into the lawn
 * and checks the fail sheet and the retry. Requires `pnpm preview`. */
import { readFileSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:4173/FOREMAN/';
const par = JSON.parse(readFileSync(new URL('../../tests/golf-par.json', import.meta.url), 'utf8'));
const fail = (m) => { console.error(`FAIL: ${m}`); process.exitCode = 1; };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('demo-day:golf')).forEach((k) => localStorage.removeItem(k)));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.dd-play');
const sub = await page.locator('.dd-play-sub').textContent();
if (!/shots · par/.test(sub ?? '')) fail(`title does not show the budget: ${sub}`);
await page.locator('.dd-play').click();
await page.waitForFunction(() => window.__golf);
await page.waitForTimeout(1500);
const settle = () => page.waitForFunction(() => window.__golf.session.phase === 'aim', null, { timeout: 120_000 });
for (const [x, y, z] of par.h1) {
  if (await page.evaluate(() => window.__golf.session.completed)) break;
  await page.evaluate(([x, y, z]) => { const g = window.__golf; g.aimAt(x, y, z, 1); g.fire(); }, [x, y, z]);
  await page.waitForTimeout(400);
  await settle();
}
const s1 = await page.evaluate(() => { const s = window.__golf.session; return { used: s.shotsUsed, done: s.completed, pct: s.world.destruction() }; });
if (!s1.done) fail(`h1 par line did not finish the house: ${JSON.stringify(s1)}`);
await page.waitForSelector('.dd-stars', { timeout: 15_000 }).catch(() => fail('no stars sheet after the goal'));
const stars = await page.locator('.dd-stars .on').count();
if (stars !== 2) fail(`expected 2 stars at par, saw ${stars}`);
await page.screenshot({ path: '/tmp/shots/house-done.png' });
console.log(`  h1: down in ${s1.used} (${(s1.pct * 100).toFixed(1)}%), ${stars} stars`);
const saved = await page.evaluate(() => window.__golf.store.data.campaign);
if (saved.houses.h1?.stars !== 2 || saved.reached < 1) fail(`save did not record the clear: ${JSON.stringify(saved.houses.h1)} reached ${saved.reached}`);

// Fail path: every shot into the grass.
await page.getByRole('button', { name: /Go again|Play it again/ }).click();
await page.waitForTimeout(1500);
const budget = await page.evaluate(() => window.__golf.session.shotsLeft);
for (let k = 0; k < budget; k++) {
  await page.evaluate(() => { const g = window.__golf; g.aimAt(0, 0.05, 9, 0.2); g.fire(); });
  await page.waitForTimeout(400);
  await settle();
}
await page.getByRole('heading', { name: 'Still standing' }).waitFor({ timeout: 15_000 }).catch(() => fail('no fail sheet when the shots ran out'));
await page.screenshot({ path: '/tmp/shots/house-fail.png' });
await page.getByRole('button', { name: 'Try again' }).click();
await page.waitForTimeout(1500);
const fresh = await page.evaluate(() => { const s = window.__golf.session; return { left: s.shotsLeft, pct: s.world.destruction(), failed: s.failed }; });
if (fresh.failed || fresh.pct > 0.001 || fresh.left !== budget) fail(`retry did not start a fresh house: ${JSON.stringify(fresh)}`);
else console.log('  out of shots: fail sheet, then a fresh house on retry');
if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
await browser.close();
console.log(process.exitCode ? 'House smoke: FAILED' : 'House smoke: ok');
