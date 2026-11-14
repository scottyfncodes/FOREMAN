/* Renders the Foreman icon SVG to the PNG sizes the PWA manifest and iOS need.
 * Uses the Chromium that Playwright ships with. Run: pnpm icons */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public', 'favicon.svg'), 'utf8');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// Maskable icons must survive a circular crop: no rounded corners, artwork
// scaled into the central 80% safe zone.
const maskable = svg
  .replace('<rect id="tile" width="512" height="512" rx="112" fill="#131416"/>', '<rect width="512" height="512" fill="#131416"/>')
  .replace('<g id="art">', '<g transform="translate(256 256) scale(0.82) translate(-256 -256)"><g id="art">')
  .replace('</svg>', '</g></svg>');

// iOS squares the corners itself and shows black behind transparency, so the
// touch icon is full-bleed with the artwork slightly inset.
const apple = svg
  .replace('<rect id="tile" width="512" height="512" rx="112" fill="#131416"/>', '<rect width="512" height="512" fill="#131416"/>')
  .replace('<g id="art">', '<g transform="translate(256 256) scale(0.92) translate(-256 -256)"><g id="art">')
  .replace('</svg>', '</g></svg>');

// Social share card: the mark, the name and one line, on the app's graphite.
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#131416"/>
  <rect x="0" y="618" width="1200" height="12" fill="#f2b705"/>
  <g transform="translate(96 190) scale(0.86) translate(-142 -112)">
    <path d="M142 112H378V184H214V224H318V292H214V400H142Z" fill="#efe8da"/>
    <rect x="214" y="224" width="104" height="68" fill="#f2b705"/>
  </g>
  <text x="400" y="318" font-family="'Liberation Sans', Arial, sans-serif" font-weight="700" font-size="112" letter-spacing="8" fill="#efe8da">FOREMAN</text>
  <text x="404" y="380" font-family="'Liberation Sans', Arial, sans-serif" font-size="38" fill="#a39d92">A demolition puzzle for your phone.</text>
</svg>`;

const targets = [
  { file: 'icon-512.png', size: 512, source: svg },
  { file: 'icon-192.png', size: 192, source: svg },
  { file: 'icon-maskable-512.png', size: 512, source: maskable },
  { file: 'apple-touch-icon.png', size: 180, source: apple },
  { file: 'favicon-32.png', size: 32, source: svg },
  { file: 'og-image.png', size: 1200, height: 630, source: og },
];

function pageHtml(source, size, height = size) {
  return `<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${size}px;height:${height}px">${source.replace('<svg ', `<svg width="${size}" height="${height}" `)}</div>
  </body></html>`;
}

async function main() {
  const candidates = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH].filter(Boolean);
  let launchOptions = {};
  for (const c of candidates) {
    if (existsSync(c)) {
      launchOptions = { executablePath: c };
      break;
    }
  }
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  for (const t of targets) {
    const h = t.height ?? t.size;
    await page.setViewportSize({ width: t.size, height: h });
    await page.setContent(pageHtml(t.source, t.size, h));
    const buffer = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: h } });
    writeFileSync(join(outDir, t.file), buffer);
    console.log(`wrote icons/${t.file} (${t.size}px)`);
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
