/* FOREMAN smoke test: a headless iPhone plays every job with the real controls
 * (press the spot, pull back, let go). Checks the whole loop, the hidden balls, the
 * failing path, touch target sizes, that progress survives a reload, and that the classic
 * golf game still opens. Reports frame pacing during the collapses.
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
await page.evaluate(() => { localStorage.removeItem('foreman:v1'); });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__foreman);

const state = () => page.evaluate(() => window.__foreman.debug());
const settle = async () => {
  await page.waitForFunction(() => window.__foreman.debug().status !== 'aim', null, { timeout: 10_000 });
  await page.waitForFunction(() => { const s = window.__foreman.debug().status; return s !== 'busy' && s !== 'flight'; }, null, { timeout: 180_000 });
};
/** The real gesture: press the spot, pull straight back past full power, let go. */
const shoot = async (shot) => {
  const [which, fx = 0.5, fy = 0.5, ball = 'standard'] = shot;
  if (ball !== 'standard') await page.locator(`.fm-ball[aria-label^="${ball === 'blast' ? 'Charge' : ball[0].toUpperCase() + ball.slice(1)}"]`).tap();
  await page.waitForTimeout(900);
  const p = await page.evaluate(([which, fx, fy]) => {
    const g = window.__foreman;
    const ms = g.session.sim.members;
    const m = which === 'H' ? ms.find((q) => q.hidden && q.hidden !== 'gas' && q.state === 0) : ms[which];
    return g.screenOf(m.x - m.w / 2 + fx * m.w, m.y - m.h / 2 + fy * m.h);
  }, [which, fx, fy]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x, p.y + 120, { steps: 4 });
  await page.mouse.move(p.x, p.y + 330, { steps: 6 });
  await page.mouse.up();
};

await page.locator('.fm-title-actions .primary').tap();
if ((await state()).mode !== 'play') fail('Tee off did not open a job');

const ids = Object.keys(solutions);
const pacing = [];
for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  const lesson = page.locator('.fm-scrim .fm-card .fm-btn');
  if (await lesson.count()) await lesson.first().tap();
  const small = await page.evaluate(() => [...document.querySelectorAll('.fm-top button, .fm-bottom button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length);
  if (small) fail(`${id}: ${small} control(s) under 44 px`);
  for (const shot of solutions[id]) {
    const before = (await state()).used;
    await page.evaluate(() => { window.__frames = []; let last = performance.now(); const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__frames.length < 3000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    await shoot(shot);
    await settle();
    if ((await state()).used !== before + 1) fail(`${id}: the pull-back gesture did not take a shot`);
    const frames = await page.evaluate(() => window.__frames.slice(5));
    frames.sort((a, b) => a - b);
    pacing.push({ id, median: frames[Math.floor(frames.length / 2)], p95: frames[Math.floor(frames.length * 0.95)] });
  }
  await page.waitForSelector('.fm-verdict', { timeout: 15_000 }).catch(async () => fail(`${id}: no verdict ${JSON.stringify(await state())}`));
  const s = await state();
  if (s.status !== 'won' || s.stars !== 3) fail(`${id}: expected three stars, got ${s.status} with ${s.stars}`);
  else console.log(`  ${id}: down in ${s.used}, 3 stars`);
  if (i < ids.length - 1) await page.locator('.fm-card-actions .primary').tap();
}

// The failing path: every shot through a window, until the shots run out.
await page.evaluate(() => window.__foreman.startLevel(1));
for (let k = 0; k < 3; k++) {
  const pane = await page.evaluate(() => window.__foreman.session.sim.members.find((m) => m.mat === 'glass' && m.state === 0).id);
  await shoot([pane]);
  await settle();
}
await page.waitForSelector('.fm-verdict.lost', { timeout: 15_000 }).catch(() => fail('running out of shots should fail the job'));
if ((await state()).status === 'lost') console.log('  frame, three balls through windows: failed as it should');

await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__foreman);
const stars = await page.evaluate(() => window.__foreman.store.totalStars());
if (stars !== ids.length * 3) fail(`expected ${ids.length * 3} stars after reload, found ${stars}`);

// Classic golf is still there.
await page.locator('.fm-title-row .icon').tap();
await page.locator('.fm-link').first().tap();
await page.waitForSelector('.dd-play', { timeout: 10_000 }).catch(() => fail('classic golf title did not open from Settings'));

console.log('Frame pacing during shots (ms; this sandbox renders in software, so read it as relative):');
for (const p of pacing) console.log(`  ${p.id.padEnd(9)} median ${p.median.toFixed(1)}  p95 ${p.p95.toFixed(1)}`);
if (errors.length) fail(`console errors: ${errors.slice(0, 3).join(' | ')}`);
await browser.close();
console.log(process.exitCode ? 'FOREMAN smoke: FAILED' : 'FOREMAN smoke: ok');
