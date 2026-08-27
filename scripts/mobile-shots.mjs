import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

/* Mobil görsel kontrol: iPhone boyutunda sayfalar + açık mobil menü. */
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const out = process.env.OUT_DIR ?? '.';
const base = process.env.BASE ?? 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
page.on('pageerror', (e) => console.log('PAGE ERROR:', String(e).slice(0, 300)));

const shots = [
  ['/', 'mob-home', 4000],
  ['/earthquakes', 'mob-earthquakes', 3500],
  ['/map', 'mob-map', 4000],
  ['/analytics', 'mob-analytics', 4000],
];

for (const [path, name, wait] of shots) {
  await page
    .goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 45000 })
    .catch((e) => console.log('NAV WARN', path, String(e).slice(0, 120)));
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('SHOT', name);
  // yatay taşma kontrolü: sayfa gövdesi görünür alandan genişse raporla
  const overflow = await page.evaluate(() => {
    const w = document.documentElement.scrollWidth;
    return w > window.innerWidth + 1 ? w : 0;
  });
  if (overflow) console.log('YATAY TASMA', name, overflow, 'px (viewport 390)');
}

// mobil menüyü aç
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.getByLabel('Menüyü aç/kapat').tap().catch(async () => {
  await page.getByLabel('Menüyü aç/kapat').click();
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/mob-menu.png` });
console.log('SHOT mob-menu');

await browser.close();
