// tools/telegram-cards.mjs — фирменные картинки для Telegram: альбом
// карточек «Журнал» для постов-подборок (рубрика «Под повод») и схема
// маршрута, как линия метро (рубрика «Маршрут»). Рисует обложку и карточку на каждое
// место, 1080×1350, шрифтами и цветами сайта. Нужен Playwright (в облачной
// среде есть, как и для tools/check.mjs).
//
// Карточки собирает tools/telegram.mjs, когда в post.json есть "cards":
//   "cards": {
//     "cover": "мест, где дождь не помеха",     — строка под большой цифрой
//     "items": [{ "place": "moskvarium", "text": "Акулы, скаты…" }, …]
//   }
// Фото — только места с файлом и photoCredit (docs/photos.md).
//
// Схема маршрута — когда в post.json есть "scheme":
//   "scheme": { "title": "Тихие Хамовники",            — если название длинное
//               "stops": [{ "place": "usadba-tolstogo", "name": "Дом Толстого",
//                           "note": "дом, где всё как при семье" }, …] }
// Время пешком, бюджет и старт — из данных маршрута на сайте.

import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = pathToFileURL(`${process.cwd()}/`).href;

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pad = (n) => String(n).padStart(2, '0');
const credit = (c) => `Фото: ${escapeHtml(c.author + (c.license ? `, ${c.license}` : ''))}`;

// Логотип в два цвета сайта: оранжевая волна и тёмные буквы
const logo = `data:image/svg+xml;base64,${Buffer.from(
  readFileSync('assets/logo.svg', 'utf8').replaceAll('#2E2E2E', '#1F1B18')
).toString('base64')}`;

const font = (family, file, weight, range) =>
  `@font-face{font-family:${family};src:url(${root}assets/fonts/${file});font-weight:${weight};unicode-range:${range}}`;
const CYR = 'U+0400-04FF';
const LAT = 'U+0000-00FF,U+2000-206F';

const css = `
${font('U', 'unbounded-cyrillic-700-normal.woff2', 700, CYR)}
${font('U', 'unbounded-latin-700-normal.woff2', 700, LAT)}
${font('Ra', 'raleway-cyrillic-500-normal.woff2', 500, CYR)}
${font('Ra', 'raleway-latin-500-normal.woff2', 500, LAT)}
${font('Ra', 'raleway-cyrillic-700-normal.woff2', 700, CYR)}
${font('Ra', 'raleway-latin-700-normal.woff2', 700, LAT)}
html,body{margin:0}
.card{position:relative;width:1080px;height:1350px;overflow:hidden;background:#FBF7F2;color:#1F1B18;font-family:Ra,sans-serif}
.run{position:absolute;left:64px;right:64px;top:52px;display:flex;justify-content:space-between;font:700 20px/1 Ra;letter-spacing:.22em;text-transform:uppercase}
.photo{position:absolute;overflow:hidden}
.photo img{width:100%;height:100%;object-fit:cover;display:block}
.num{position:absolute;font:700 230px/1 U;color:#FF570A;letter-spacing:-.06em}
.col{position:absolute;left:470px;right:64px;top:910px}
.name{font:700 46px/1.1 U;letter-spacing:-.035em}
.text{font-size:29px;line-height:1.42;margin-top:22px;color:#3B342E}
.meta{margin-top:26px;padding-top:18px;border-top:2px solid #1F1B18;font:700 20px Ra;letter-spacing:.2em;text-transform:uppercase}
.logo{position:absolute;left:64px;bottom:48px;height:34px}
.credit{position:absolute;right:64px;bottom:56px;font:500 18px Ra;letter-spacing:.06em;opacity:.7}
`;

function coverHtml(title, line, items) {
  const [first] = items;
  return `<div class="card">
    <div class="run"><span>Локадо</span><span>Подборка</span></div>
    <div class="num" style="left:30px;top:70px;font-size:760px;letter-spacing:-.08em">${items.length}</div>
    <div class="photo" style="left:520px;right:64px;top:250px;height:560px"><img src="${first.photo}"></div>
    <div style="position:absolute;left:64px;right:64px;top:900px;font:700 92px/1 U;letter-spacing:-.05em">${escapeHtml(line)}</div>
    <img class="logo" src="${logo}"><div class="credit">${credit(first.credit)}</div>
  </div>`;
}

function itemHtml(title, item, i, total) {
  return `<div class="card">
    <div class="run"><span>${escapeHtml(title)}</span><span>${pad(i + 1)} / ${pad(total)}</span></div>
    <div class="photo" style="left:0;right:0;top:110px;height:760px"><img src="${item.photo}"></div>
    <div class="num" style="left:40px;top:745px">${pad(i + 1)}</div>
    <div class="col">
      <div class="name">${escapeHtml(item.name)}</div>
      <div class="text">${escapeHtml(item.text)}</div>
      <div class="meta">м. ${escapeHtml(item.metro)}</div>
    </div>
    <img class="logo" src="${logo}"><div class="credit">${credit(item.credit)}</div>
  </div>`;
}

/** Рисует альбом и возвращает пути к картинкам: обложка и карточки мест.
 *  items: [{ name, text, metro, photo (путь от корня), credit }]. */
export async function renderCards({ title, cover, items }) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const dir = mkdtempSync(join(tmpdir(), 'locado-cards-'));
  const withUrls = items.map((item) => ({ ...item, photo: root + item.photo }));
  const slides = [coverHtml(title, cover, withUrls), ...withUrls.map((item, i) => itemHtml(title, item, i, items.length))];

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  const files = [];
  for (const [i, html] of slides.entries()) {
    const htmlFile = join(dir, 'card.html');
    writeFileSync(htmlFile, `<!doctype html><meta charset="utf-8"><style>${css}</style>${html}`);
    await page.goto(pathToFileURL(htmlFile).href);
    await page.evaluate(() => document.fonts.ready);
    const file = join(dir, `card-${i}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
    files.push(file);
  }
  await browser.close();
  return files;
}

const schemeCss = `
.scheme h1{position:absolute;left:64px;right:64px;top:120px;margin:0;font:700 96px/1 U;letter-spacing:-.05em}
.facts{position:absolute;left:64px;right:64px;top:345px;display:flex;border-top:2px solid #1F1B18;border-bottom:2px solid #1F1B18}
.facts div{flex:1;padding:18px 16px 18px 0;font:700 19px Ra;letter-spacing:.16em;text-transform:uppercase}
.facts b{display:block;font:700 30px/1.15 U;letter-spacing:-.03em;text-transform:none;margin-top:8px}
.track{position:absolute;left:112px;width:14px;background:#FF570A}
.stop{position:absolute;left:84px;right:64px;display:flex;align-items:center}
.dot{flex:none;border-radius:50%;background:#FBF7F2;border:12px solid #FF570A;box-sizing:border-box}
.stop.last .dot{background:#FF570A}
.stop-name{font:700 40px/1.05 U;letter-spacing:-.035em}
.stop-note{font-size:26px;color:#5A5048;margin-top:8px}
.walk{position:absolute;right:64px;font:700 20px Ra;letter-spacing:.14em;text-transform:uppercase;color:#B93C05}
`;

/** «15 минут пешком через …» → «15 мин пешком»; без минут — без подписи. */
function walkLabel(text) {
  const match = /(\d+)\s*мин\S*\s*(пешком)?/.exec(text || '');
  return match ? `↓ ${match[1]} мин${match[2] ? ' пешком' : ''}` : '';
}

/** Рисует схему маршрута и возвращает путь к картинке.
 *  { title, facts: [[подпись, значение]], stops: [{ name, note, walk }] } —
 *  walk — дорога до следующей остановки. */
export async function renderScheme({ title, facts, stops }) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const dir = mkdtempSync(join(tmpdir(), 'locado-scheme-'));
  // Остановки делят место между шапкой и логотипом; чем их больше, тем мельче
  const top = 560, bottom = 1150;
  const step = Math.min(140, (bottom - top) / (stops.length - 1));
  const scale = Math.min(1, step / 140);
  const dot = Math.round(70 * scale);
  const titleSize = title.length > 18 ? 72 : 96;

  const html = `<div class="card scheme">
    <div class="run"><span>Маршрут</span><span>Локадо</span></div>
    <h1 style="font-size:${titleSize}px">${escapeHtml(title)}</h1>
    <div class="facts">${facts.map(([label, value]) => `<div>${escapeHtml(label)}<b>${escapeHtml(value)}</b></div>`).join('')}</div>
    <div class="track" style="top:${top + dot / 2}px;height:${step * (stops.length - 1)}px;left:${84 + dot / 2 - 7}px"></div>
    ${stops.map((stop, i) => `<div class="stop${i === stops.length - 1 ? ' last' : ''}" style="top:${top + i * step}px;gap:${40 * scale}px">
      <div class="dot" style="width:${dot}px;height:${dot}px;border-width:${Math.round(12 * scale)}px"></div>
      <div><div class="stop-name" style="font-size:${Math.round(40 * Math.max(scale, .8))}px">${escapeHtml(stop.name)}</div>
      <div class="stop-note" style="font-size:${Math.round(26 * Math.max(scale, .85))}px">${escapeHtml(stop.note)}</div></div>
    </div>`).join('')}
    ${stops.slice(0, -1).map((stop, i) => walkLabel(stop.walk)
      ? `<div class="walk" style="top:${top + i * step + step * .66}px">${escapeHtml(walkLabel(stop.walk))}</div>` : '').join('')}
    <img class="logo" src="${logo}">
  </div>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  const htmlFile = join(dir, 'scheme.html');
  writeFileSync(htmlFile, `<!doctype html><meta charset="utf-8"><style>${css}${schemeCss}</style>${html}`);
  await page.goto(pathToFileURL(htmlFile).href);
  await page.evaluate(() => document.fonts.ready);
  const file = join(dir, 'scheme.jpg');
  await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
  await browser.close();
  return file;
}
