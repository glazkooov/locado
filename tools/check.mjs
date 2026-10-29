// tools/check.mjs — проверка сайта перед коммитом:  npm run check
//
// 1. Данные: places.json и collections.json читаются, slug и id не
//    повторяются, места из подборок существуют.
// 2. Страницы: главная, подборки, все подборки и все места, служебные —
//    на телефоне (390px) и компьютере (1280px): ошибки скриптов,
//    горизонтальная прокрутка, «такого места нет» вместо места.
//    Списки модулей в <head> (tools/preload.mjs) совпадают с импортами.
// 3. Ссылки: все внутренние ссылки со страниц открываются и ведут на
//    существующие места и подборки.
//
// Печатает итог и только найденные проблемы; при проблемах — код выхода 1.
// Нужны PHP (сервер с правилами .htaccess — tools/dev-router.php) и
// Playwright: npm i -D playwright, или глобальный, как в облачной среде.
// Ключи: --quick — только телефон;  --port=8790 — другой порт.

import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stalePreloads } from './preload.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const port = Number((args.find((a) => a.startsWith('--port=')) || '--port=8790').split('=')[1]);
const BASE = `http://127.0.0.1:${port}`;
const problems = [];
const problem = (where, what) => problems.push(`${where}: ${what}`);

// ---------- 1. Данные ----------
const places = JSON.parse(readFileSync(`${root}data/places.json`, 'utf8'));
const collections = JSON.parse(readFileSync(`${root}data/collections.json`, 'utf8'));
const placeSlugs = new Set(places.map((p) => p.slug));
const collectionSlugs = new Set(collections.map((c) => c.slug));
const dupes = (list) => list.filter((x, i) => list.indexOf(x) !== i);
dupes(places.map((p) => p.slug)).forEach((s) => problem('places.json', `slug повторяется: ${s}`));
dupes(places.map((p) => p.id)).forEach((s) => problem('places.json', `id повторяется: ${s}`));
dupes(collections.map((c) => c.slug)).forEach((s) => problem('collections.json', `slug повторяется: ${s}`));
places.forEach((p) => {
  if (!/^[a-z0-9-]+$/.test(p.slug)) problem(`место ${p.slug}`, 'slug — только латиница, цифры и дефис');
  if (!p.name || !p.category || !p.coords) problem(`место ${p.slug}`, 'нет названия, категории или координат');
  // Подзаголовок на фото: длиннее — на телефоне четыре строки (задача 74)
  const subtitle = p.subtitle || p.description || '';
  if (subtitle.length > 110) problem(`место ${p.slug}`, `подзаголовок ${subtitle.length} знаков, нужно не больше 110`);
  const LINK_HOSTS = { telegram: 'https://t.me/', vk: 'https://vk.com/' };
  Object.entries(p.links || {}).forEach(([key, url]) => {
    if (!LINK_HOSTS[key]) problem(`место ${p.slug}`, `links.${key}: есть только telegram и vk`);
    else if (!String(url).startsWith(LINK_HOSTS[key])) problem(`место ${p.slug}`, `links.${key} должна начинаться с ${LINK_HOSTS[key]}`);
  });
});
collections.forEach((c) => (c.blocks || []).forEach((b) => {
  if (b.type === 'place' && !placeSlugs.has(b.slug)) problem(`подборка ${c.slug}`, `нет места ${b.slug}`);
}));

// Список модулей в <head> отстал от импортов в скриптах
stalePreloads().forEach((p) => problem(p, 'список модулей устарел — запусти node tools/preload.mjs'));

// ---------- Сервер ----------
const server = spawn('php', ['-S', `127.0.0.1:${port}`, 'tools/dev-router.php'], { cwd: root, stdio: 'ignore' });
server.on('error', () => { console.error('Не запустился PHP: нужен php в PATH'); process.exit(2); });
const stop = () => { try { server.kill(); } catch (e) { /* уже остановлен */ } };
process.on('exit', stop);
for (let i = 0; i < 50; i++) {
  try { await fetch(BASE + '/'); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
}

// ---------- Playwright: свой или глобальный ----------
let chromium;
for (const from of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
  try { ({ chromium } = await import(from)); break; } catch (e) { /* следующий */ }
}
if (!chromium) { console.error('Нет Playwright: npm i -D playwright'); process.exit(2); }

// ---------- 2. Страницы ----------
const pages = ['/', '/collections/', '/vmeste/', '/suggest/', '/privacy/', '/consent/', '/photos/',
  ...collections.map((c) => `/collection/${c.slug}`), ...places.map((p) => `/place/${p.slug}`)];
const sizes = quick ? [['телефон', 390, 844]] : [['телефон', 390, 844], ['компьютер', 1280, 900]];
const links = new Map();
const browser = await chromium.launch();
for (const [label, width, height] of sizes) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  // Внешние сервисы не нужны и в песочнице недоступны
  await ctx.route(/yandex|metrika|forms\./, (r) => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('locado:cookie-consent', 'accepted'); } catch (e) { /* без хранилища */ } });
  const queue = [...pages];
  await Promise.all(Array.from({ length: 6 }, async () => {
    const page = await ctx.newPage();
    for (let url; (url = queue.shift());) {
      const errs = [];
      const onErr = (e) => errs.push(e.message);
      page.on('pageerror', onErr);
      try {
        const res = await page.goto(BASE + url, { waitUntil: 'load' });
        if (!res || res.status() >= 400) problem(`${url} (${label})`, `ответ ${res && res.status()}`);
        await page.waitForTimeout(600);
        const r = await page.evaluate(() => ({
          w: document.documentElement.scrollWidth,
          missing: !!document.querySelector('#place-error:not([hidden]), #collection-error:not([hidden])'),
          hrefs: [...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => h.startsWith(location.origin))
        }));
        if (r.w > width) problem(`${url} (${label})`, `горизонтальная прокрутка: ширина ${r.w}px`);
        if (r.missing) problem(`${url} (${label})`, 'показан экран «не нашли»');
        r.hrefs.forEach((h) => { if (!links.has(h)) links.set(h, url); });
      } catch (e) {
        problem(`${url} (${label})`, `не открылась: ${e.message.split('\n')[0]}`);
      }
      errs.forEach((m) => problem(`${url} (${label})`, `ошибка скрипта: ${m}`));
      page.off('pageerror', onErr);
    }
    await page.close();
  }));
  await ctx.close();
}
await browser.close();

// ---------- 3. Ссылки ----------
for (const [href, from] of links) {
  const u = new URL(href);
  const res = await fetch(BASE + u.pathname + u.search, { redirect: 'manual' }).catch(() => null);
  const path = u.pathname + u.search;
  if (!res || res.status >= 400) { problem(`ссылка ${path} (со страницы ${from})`, `ответ ${res && res.status}`); continue; }
  const m = /^\/(place|collection)\/([^/]+)$/.exec(u.pathname);
  if (m && !(m[1] === 'place' ? placeSlugs : collectionSlugs).has(m[2])) problem(`ссылка ${path} (со страницы ${from})`, 'нет такого места или подборки');
}

// ---------- Итог ----------
stop();
const summary = `${places.length} мест, ${collections.length} подборок, ${pages.length} страниц × ${sizes.length}, ${links.size} ссылок`;
if (!problems.length) {
  console.log(`✓ Проблем нет — ${summary}`);
  process.exit(0);
}
console.log(`✗ Проблем: ${problems.length} — ${summary}`);
problems.slice(0, 50).forEach((p) => console.log(`  • ${p}`));
if (problems.length > 50) console.log(`  … и ещё ${problems.length - 50}`);
process.exit(1);
