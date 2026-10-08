// tools/og-image.mjs — пересобирает assets/og-image.jpg (1200×630, превью
// ссылок в мессенджерах) из шаблона tools/og-image.html.
// Нужен Playwright:  npm i -D playwright && npx playwright install chromium
// Запуск (из любой папки проекта):  node tools/og-image.mjs

import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(new URL('og-image.html', import.meta.url).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.locator('.og').screenshot({ path: `${root}assets/og-image.jpg`, type: 'jpeg', quality: 86 });
await browser.close();
console.log('assets/og-image.jpg готова');
