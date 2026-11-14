// node scripts/golf/look.mjs <houseId> "<x,y,z;...>" : phone screenshots of shots at a house.
import { chromium } from '@playwright/test';
const [, , id = 'h3', shots = '3.2,0.9,-0.8'] = process.argv;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto('http://localhost:5173/FOREMAN/');
await page.waitForFunction(() => window.__demoDay, null, { timeout: 60000 });
await page.evaluate(() => { const a = window.__demoDay; a.golf.data.campaign.reached = 9; a.golf.data.coached = true; });
await page.waitForTimeout(1200);
const names = [];
const snap = async (n) => { await page.screenshot({ path: `/tmp/shots/${n}.png` }); names.push(n); };
await snap('title');
await page.evaluate((id) => window.__demoDay.go('golf', { id }), id);
await page.waitForTimeout(2200);
await snap('aim');
let k = 0;
for (const s of shots.split(';')) {
  const [x, y, z] = s.split(',').map(Number);
  await page.evaluate(([x, y, z]) => { const g = window.__golf; g.aimAt(x, y, z, 1); g.fire(); }, [x, y, z]);
  await page.waitForTimeout(1300); await snap(`s${k}a`);
  await page.waitForTimeout(1500); await snap(`s${k}b`);
  await page.waitForFunction(() => window.__golf.session.phase === 'aim', null, { timeout: 60000 });
  await page.waitForTimeout(3200); await snap(`s${k}c`);
  k++;
}
console.log(await page.evaluate(() => { const s = window.__golf.session; return { used: s.shotsUsed, left: s.shotsLeft, pct: Math.round(s.world.destruction() * 100), done: s.completed, failed: s.failed }; }));
await browser.close();
const { execSync } = await import('node:child_process');
execSync(`python3 -c "
from PIL import Image
ns='${names.join(',')}'.split(',')
ims=[Image.open('/tmp/shots/'+n+'.png') for n in ns]
w,h=ims[0].size
o=Image.new('RGB',(w*len(ims),h))
for i,im in enumerate(ims): o.paste(im,(i*w,0))
o.save('/tmp/shots/golf.png')"`);
