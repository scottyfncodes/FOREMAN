/* FOREMAN smoke test: a headless iPhone plays every job with real taps.
 * Checks the whole loop (select, BLAST, collapse, verdict, next job), the losing path,
 * touch target sizes, and reports frame pacing during the collapses.
 * Requires a server: `pnpm preview` (default http://localhost:4173/FOREMAN/). */
import { readFileSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:4173/FOREMAN/';
const DEVICE = process.env.SMOKE_DEVICE ?? 'iPhone 13';
const solutions = JSON.parse(readFileSync(new URL('../../tests/foreman-solutions.json', import.meta.url), 'utf8'));
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ ...devices[DEVICE] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
console.log(`Opening ${BASE} as ${DEVICE}`);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__foreman);

const state = () => page.evaluate(() => window.__foreman.debug());
const tapPiece = async (id) => { const p = await page.evaluate((i) => window.__foreman.locate(i), id); await page.touchscreen.tap(p.x, p.y); };
const settle = async () => {
  // BLAST arms for a moment before the charge goes off.
  await page.waitForFunction(() => window.__foreman.debug().status !== 'aim', null, { timeout: 10_000 });
  await page.waitForFunction(() => window.__foreman.debug().status !== 'busy', null, { timeout: 120_000 });
};

// Title: start the first job.
await page.locator('.fm-title-actions .primary').tap();
if ((await state()).mode !== 'play') fail('Start did not open a job');

const ids = Object.keys(solutions);
const pacing = [];
for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  const lesson = page.locator('.fm-scrim .fm-card .fm-btn');
  if (await lesson.count()) await lesson.first().tap();
  // Touch targets.
  const small = await page.evaluate(() => [...document.querySelectorAll('.fm-top button, .fm-bottom button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length);
  if (small) fail(`${id}: ${small} control(s) under 44 px`);
  for (const piece of solutions[id]) {
    await tapPiece(piece);
    if ((await state()).selected !== piece) fail(`${id}: tapping piece ${piece} did not select it`);
    await page.evaluate(() => { window.__frames = []; let last = performance.now(); const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__frames.length < 2000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    await page.locator('.fm-blast').tap();
    await settle();
    const frames = await page.evaluate(() => window.__frames.slice(5));
    frames.sort((a, b) => a - b);
    pacing.push({ id, median: frames[Math.floor(frames.length / 2)], p95: frames[Math.floor(frames.length * 0.95)] });
  }
  await page.waitForSelector('.fm-verdict', { timeout: 10_000 }).catch(async () => { fail(id + ': no verdict ' + JSON.stringify(await state())); await page.screenshot({ path: 'scripts/foreman/shots/smoke-fail.png' }); });
  const s = await state();
  if (s.status !== 'won' || s.stars !== 3) fail(`${id}: expected a three-star clear, got ${s.status} with ${s.stars} stars`);
  else console.log(`  ${id}: cleared, 3 stars`);
  if (i < ids.length - 1) await page.locator('.fm-card-actions .primary').tap();
}

// The losing path: the tower dropped on the neighbour.
await page.evaluate(() => window.__foreman.startLevel(3));
await tapPiece(4);
await page.locator('.fm-blast').tap();
await settle();
await page.waitForSelector('.fm-verdict.lost', { timeout: 10_000 });
if ((await state()).status !== 'lost') fail('dropping the tower on the house should lose the job');
else console.log('  stack, wrong way: lost as it should');

// Progress survives a reload.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__foreman);
const stars = await page.evaluate(() => window.__foreman.store.totalStars());
if (stars !== ids.length * 3) fail(`expected ${ids.length * 3} stars after reload, found ${stars}`);

console.log('Frame pacing during collapses (ms, software rendering in this sandbox):');
for (const p of pacing) console.log(`  ${p.id.padEnd(8)} median ${p.median.toFixed(1)}  p95 ${p.p95.toFixed(1)}`);
if (errors.length) fail(`console errors: ${errors.slice(0, 3).join(' | ')}`);
await browser.close();
console.log(process.exitCode ? 'FOREMAN smoke: FAILED' : 'FOREMAN smoke: ok');
