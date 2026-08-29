import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const out = process.env.OUT_DIR ?? '.';
const base = process.env.BASE ?? 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

// 1) Açık tema — masaüstü + satır tıklama etkileşimi + tema düğmesi
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${out}/t-light-home.png` });
  console.log('SHOT t-light-home');

  // tabloda ilk satıra tıkla → harita odaklanmalı (panel açılır)
  const row = page.locator('tbody tr').first();
  await row.click({ position: { x: 260, y: 10 } }).catch((e) => console.log('ROW CLICK WARN', String(e).slice(0, 90)));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/t-light-focus.png` });
  console.log('SHOT t-light-focus');

  // tema düğmesi → koyu
  await page.getByLabel('Koyu temaya geç').click().catch((e) => console.log('TOGGLE WARN', String(e).slice(0, 90)));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/t-dark-home.png` });
  console.log('SHOT t-dark-home');
  await page.close();
}

// 2) Açık tema — mobil
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/t-light-mobil.png` });
  console.log('SHOT t-light-mobil');
  await page.close();
}

// 3) Açık tema — harita sayfası (Konumum düğmesi + açık altlık)
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/map`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/t-light-map.png` });
  console.log('SHOT t-light-map');
  await page.close();
}

await browser.close();
