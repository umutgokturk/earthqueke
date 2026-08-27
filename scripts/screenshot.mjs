import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const out = process.env.OUT_DIR;
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('PAGE ERROR:', String(e).slice(0, 300)));

const targets = JSON.parse(process.env.TARGETS ?? '[]');
for (const [path, name, wait] of targets) {
  await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => console.log('NAV WARN', path, String(e).slice(0, 120)));
  await page.waitForTimeout(wait ?? 2500);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  console.log('SHOT', name);
}
await browser.close();
