// node scripts/foreman/shoot.mjs <levelIndex> "<x,y[,power[,ball]];...>" [times ms] : phone screenshots of shots.
import { chromium } from '@playwright/test';
const [, , idx = '0', shots = '', times = '250,700,1300,2400'] = process.argv;
const url = process.env.URL ?? 'http://localhost:5173/FOREMAN/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const vp = process.env.WIDE ? { width: 1280, height: 720 } : { width: 393, height: 852 };
const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: Number(process.env.DSF ?? 1), hasTouch: !process.env.WIDE, isMobile: !process.env.WIDE });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__foreman, null, { timeout: 60000 });
await page.waitForTimeout(900);
const out = 'scripts/foreman/shots';
const names = [];
const snap = async (n) => { await page.screenshot({ path: `${out}/${n}.png` }); names.push(n); };
if (idx === 'title') await snap('title');
else {
  await page.evaluate((i) => { const g = window.__foreman; g.store.data.seen = ['coach', ...['hut','frame','terrace','stack','shed','shop','flats','exchange']]; g.startLevel(i); }, Number(idx));
  await page.waitForTimeout(700);
  await snap(`l${idx}-rest`);
  let n = 0;
  for (const s of shots.split(';').filter(Boolean)) {
    const [x, y, power = '1', ball = 'standard'] = s.split(',');
    await page.evaluate(([x, y, p, b]) => window.__foreman.aimAt(x, y, p, b), [Number(x), Number(y), Number(power), ball]);
    await page.waitForTimeout(250);
    await snap(`l${idx}-${n}-aim`);
    await page.evaluate(() => window.__foreman.fire());
    let t0 = 0;
    for (const t of times.split(',').map(Number)) { await page.waitForTimeout(t - t0); t0 = t; await snap(`l${idx}-${n}-${t}`); }
    await page.waitForFunction(() => { const s = window.__foreman.debug().status; return s !== 'busy' && s !== 'flight'; }, null, { timeout: 120000 });
    await page.waitForTimeout(1600);
    await snap(`l${idx}-${n}-end`);
    console.log(JSON.stringify(await page.evaluate(() => window.__foreman.debug())));
    n++;
  }
}
if (errors.length) console.log('ERRORS', errors.slice(0, 5));
await browser.close();
// One strip of everything taken.
const { execSync } = await import('node:child_process');
execSync(`python3 -c "
from PIL import Image
ns='${names.join(',')}'.split(',')
ims=[Image.open('${out}/'+n+'.png') for n in ns]
w,h=ims[0].size
o=Image.new('RGB',(w*len(ims),h))
for i,im in enumerate(ims): o.paste(im,(i*w,0))
o.save('${out}/strip.png')"`);
