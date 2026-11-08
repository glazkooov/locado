// tools/instagram-cards.mjs — карусели для Instagram Локадо (docs/instagram.md).
// Два стиля: «Цифра» для подборок и «Линия» для маршрутов. Слайды 1080×1350,
// фото на весь кадр. Только свои фото (photoCredit.author — «Локадо»): чужие
// в Instagram не берём. Нужен Playwright (в облачной среде есть).
//
//   node tools/instagram-cards.mjs <post.json> [папка]   нарисовать слайды
//   node tools/instagram-cards.mjs <post.json> --send    и прислать владельцу
//                                     в личку через Telegram-бота: альбом и
//                                     подпись отдельным сообщением
//
// post.json:
//   {
//     "type": "collection",                    — или "route"
//     "title": "парка, чтобы\nсбежать\nот города", — у подборки после большой цифры; \n — перенос
//     "sub": "не уезжая из Москвы",            — строка курсивом под заголовком
//     "cover": "glavny-botanichesky-sad",      — фото обложки (slug места)
//     "items": [{ "place": "soldatenkovsky-park",
//                 "line": "где деревья похожи на брокколи",
//                 "meta": "м. Пионерская · вход свободный",   — по умолчанию: метро
//                 "name": "Ботанический сад" }, …],         — короче, чем на сайте (необязательно)
//     "close": "meshchersky-park",             — фото последнего слайда (по умолчанию — последнее место)
//     "caption": "Подпись к посту…"
//   }

import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const startDir = process.cwd();
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const root = pathToFileURL(`${process.cwd()}/`).href;

const places = JSON.parse(readFileSync('data/places.json', 'utf8'));
const OWN_PHOTO = 'Локадо';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Неразрывный пробел после коротких слов, чтобы предлоги не висели в конце строки
const tidy = (s) => escapeHtml(s).replace(/(^|\s)([а-яё]{1,2}) /gi, '$1$2&nbsp;').replace(/\n/g, '<br>');
const pad = (n) => String(n).padStart(2, '0');

function place(slug) {
  const found = places.find((p) => p.slug === slug);
  if (!found) fail(`Нет места ${slug} в data/places.json.`);
  if (found.photoCredit?.author !== OWN_PHOTO) fail(`У места ${slug} нет своего фото: в Instagram только фото Локадо.`);
  return { ...found, src: root + found.photo };
}

const font = (family, file, weight, style = 'normal') =>
  `@font-face{font-family:${family};src:url(${root}assets/fonts/${file});font-weight:${weight};font-style:${style}}`;
const logo = `data:image/svg+xml;base64,${Buffer.from(
  readFileSync('assets/logo.svg', 'utf8').replaceAll('#2E2E2E', '#FFFFFF').replaceAll('#FF570A', '#FFFFFF')
).toString('base64')}`;
const logoColor = `data:image/svg+xml;base64,${Buffer.from(readFileSync('assets/logo.svg', 'utf8')).toString('base64')}`;
const grain = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

// N — большая цифра обложки: в файле с кириллицей она того начертания, что на одобренном макете
const css = `
${font('U', 'unbounded-cyrillic-700-normal.woff2', 700)}${font('U', 'unbounded-latin-700-normal.woff2', 700)}
${font('Ra', 'raleway-cyrillic-500-normal.woff2', 500)}${font('Ra', 'raleway-latin-500-normal.woff2', 500)}
${font('Ra', 'raleway-cyrillic-600-normal.woff2', 600)}${font('Ra', 'raleway-latin-600-normal.woff2', 600)}
${font('N', 'cormorant-garamond-cyrillic-400-italic.woff2', 400, 'italic')}${font('S', 'cormorant-garamond-cyrillic-500-italic.woff2', 500, 'italic')}${font('S', 'cormorant-garamond-latin-500-italic.woff2', 500, 'italic')}
html,body{margin:0}*{box-sizing:border-box}
.c{position:relative;width:1080px;height:1350px;overflow:hidden;color:#fff;font-family:Ra,sans-serif;background:#111}
.abs{position:absolute}
.ph{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.8) contrast(1.05) brightness(.95)}
.warm{position:absolute;inset:0;background:rgba(60,35,10,.10);mix-blend-mode:multiply}
.grain{position:absolute;inset:0;background-image:${grain};opacity:.2;mix-blend-mode:overlay}
.s{font-family:S;font-style:italic;font-weight:500}
.u{font-family:U;font-weight:700;letter-spacing:-.03em}
.sh{text-shadow:0 2px 30px rgba(0,0,0,.35)}
.cap{font:600 24px Ra;letter-spacing:.16em;text-transform:uppercase}
.logo{position:absolute;height:30px;opacity:.9}`;

const photo = (src, shade) =>
  `<img class="ph" src="${src}"><div class="warm"></div><div class="abs" style="inset:0;background:${shade}"></div><div class="grain"></div>`;
const TOP = 'linear-gradient(180deg,rgba(0,0,0,.62),rgba(0,0,0,.2) 32%,rgba(0,0,0,0) 50%)';
const BOTTOM = 'linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(0,0,0,.55))';
const metaOf = (item, p) => item.meta || (p.metro ? `м. ${p.metro}` : '');

// ——— «Цифра»: подборки ———

function collectionSlides(post) {
  const items = post.items.map((item) => ({ ...item, p: place(item.place), name: item.name || place(item.place).name }));
  const total = items.length;
  const cover = `<div class="c">${photo(place(post.cover).src, TOP)}
    <div class="abs sh" style="left:60px;top:70px;display:flex;align-items:flex-start;gap:18px">
      <div style="flex:none;font:italic 400 430px/.78 N">${total}</div>
      <div style="padding-top:28px"><div class="u" style="font-size:62px;line-height:1;text-transform:uppercase;">${tidy(post.title)}</div>
      ${post.sub ? `<div class="s" style="font-size:58px;margin-top:14px">${tidy(post.sub)}</div>` : ''}</div></div>
    <img class="logo" src="${logo}" style="left:60px;bottom:56px"></div>`;
  const slides = items.map((item, i) => `<div class="c">${photo(item.p.src, BOTTOM)}
    <div class="cap" style="position:absolute;left:60px;top:60px;opacity:.85">${pad(i + 1)} / ${pad(total)}</div>
    <div class="abs sh" style="left:60px;right:60px;bottom:120px;text-align:center">
      <div class="u" style="font-size:${item.name.length > 22 ? 42 : 50}px;text-transform:uppercase">${tidy(item.name)}</div>
      ${item.line ? `<div class="s" style="font-size:52px;margin-top:10px">${tidy(item.line)}</div>` : ''}
      <div class="cap" style="margin-top:26px;opacity:.85">${escapeHtml(metaOf(item, item.p))}</div></div></div>`);
  return [cover, ...slides, closing(post, items)];
}

function closing(post, items) {
  const src = place(post.close || items.at(-1).place).src;
  return `<div class="c">${photo(src, 'rgba(0,0,0,.42)')}
    <div class="abs sh" style="left:60px;right:60px;top:470px;text-align:center">
      <div class="s" style="font-size:150px;line-height:.9">Сохрани</div>
      <div class="u" style="font-size:64px;text-transform:uppercase;margin-top:6px">на выходные</div>
      <div style="font:500 32px/1.45 Ra;margin-top:44px;opacity:.9">Адреса и часы на locado.ru<br>ссылка в шапке профиля</div></div>
    <img class="logo" src="${logo}" style="left:50%;margin-left:-70px;bottom:56px"></div>`;
}

// ——— «Линия»: маршруты. Оранжевая волна из логотипа идёт через всю
// карусель: на каждом слайде входит и выходит на одной высоте, точка — остановка

const LINE_Y = 1000;
const wave = (from, to) => {
  const span = to - from, q = span / 4;
  return `M ${from} ${LINE_Y} C ${from + q} ${LINE_Y - 60} ${from + 2 * q - q / 2} ${LINE_Y + 60} ${from + 2 * q} ${LINE_Y} C ${from + 3 * q - q / 2} ${LINE_Y - 60} ${to - q / 2} ${LINE_Y + 60} ${to} ${LINE_Y}`;
};
const lineSvg = (d, dotX, dotY = LINE_Y) => `<svg class="abs" style="inset:0" width="1080" height="1350">
  <path d="${d}" fill="none" stroke="#FF570A" stroke-width="16" stroke-linecap="round"/>
  ${dotX != null ? `<circle cx="${dotX}" cy="${dotY}" r="26" fill="#FBF7F2" stroke="#FF570A" stroke-width="14"/>` : ''}</svg>`;
const ROUTE_SHADE = 'linear-gradient(180deg,rgba(0,0,0,.62),rgba(0,0,0,.25) 30%,rgba(0,0,0,0) 45%,rgba(0,0,0,0) 62%,rgba(0,0,0,.45))';

function routeSlides(post) {
  const items = post.items.map((item) => ({ ...item, p: place(item.place), name: item.name || place(item.place).name }));
  const cover = `<div class="c">${photo(place(post.cover).src, ROUTE_SHADE)}
    ${lineSvg(wave(120, 1080), 120)}
    <div class="abs sh" style="left:64px;right:64px;top:80px"><div class="cap" style="opacity:.85">Маршрут · ${items.length} ${items.length < 5 ? 'остановки' : 'остановок'}</div>
      <div class="u" style="font-size:80px;line-height:1.04;margin-top:22px">${tidy(post.title)}</div>
      ${post.sub ? `<div style="font:500 34px Ra;margin-top:18px;opacity:.92">${tidy(post.sub)}</div>` : ''}</div>
    <img class="logo" src="${logo}" style="left:64px;bottom:64px;height:32px"></div>`;
  const slides = items.map((item, i) => `<div class="c">${photo(item.p.src, ROUTE_SHADE)}
    ${lineSvg(wave(0, 1080), i % 2 ? 660 : 420)}
    <div class="abs sh" style="left:64px;right:64px;top:80px"><div class="cap" style="opacity:.85">${pad(i + 1)} · ${escapeHtml(metaOf(item, item.p))}</div>
      <div class="u" style="font-size:64px;line-height:1.05;margin-top:16px">${tidy(item.name)}</div>
      ${item.line ? `<div style="font:500 32px/1.4 Ra;margin-top:14px;opacity:.92;max-width:820px">${tidy(item.line)}</div>` : ''}</div></div>`);
  const finish = `<div class="c" style="background:#FBF7F2;color:#2A2521">
    ${lineSvg(`M 0 ${LINE_Y} C 160 ${LINE_Y - 60} 300 ${LINE_Y + 60} 460 ${LINE_Y} C 620 ${LINE_Y - 60} 700 860 760 760`, 760, 760)}
    <div class="abs" style="left:64px;right:64px;top:150px"><div class="cap" style="color:#B93C05">Весь маршрут</div>
      <div class="u" style="font-size:88px;line-height:1.02;margin-top:20px">Сохрани на&nbsp;выходные</div>
      <div style="font:500 34px/1.4 Ra;color:#6B6259;margin-top:24px">Время, бюджет и как идти на locado.ru,<br>ссылка в шапке профиля</div></div>
    <img class="abs" src="${logoColor}" style="left:64px;bottom:64px;height:40px"></div>`;
  return [cover, ...slides, finish];
}

// ——— Рисование и отправка ———

async function render(slides, dir) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  const files = [];
  for (const [i, html] of slides.entries()) {
    const htmlFile = join(dir, 'slide.html');
    writeFileSync(htmlFile, `<!doctype html><meta charset="utf-8"><style>${css}</style>${html}`);
    await page.goto(pathToFileURL(htmlFile).href);
    await page.evaluate(() => document.fonts.ready);
    const file = join(dir, `slide-${pad(i + 1)}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
    files.push(file);
  }
  await browser.close();
  return files;
}

async function telegram(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) fail('Нет TELEGRAM_BOT_TOKEN в окружении.');
  const isForm = body instanceof FormData;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: isForm ? undefined : { 'Content-Type': 'application/json' }, body: isForm ? body : JSON.stringify(body)
  });
  const data = await response.json();
  if (!data.ok) fail(`Telegram (${method}): ${data.description}`);
  return data.result;
}

/** Черновик владельцу: альбом (Telegram пускает до 10 картинок) и подпись
 *  отдельным сообщением, чтобы её было удобно скопировать в Instagram. */
async function sendDraft(files, caption) {
  const { ownerChatId } = JSON.parse(readFileSync('tools/telegram.json', 'utf8'));
  if (files.length > 10) fail('В альбоме Telegram не больше 10 картинок.');
  const form = new FormData();
  form.append('chat_id', String(ownerChatId));
  files.forEach((file, i) => form.append(`p${i}`, new Blob([readFileSync(file)]), file.split('/').pop()));
  form.append('media', JSON.stringify(files.map((_, i) => ({ type: 'photo', media: `attach://p${i}` }))));
  await telegram('sendMediaGroup', form);
  await telegram('sendMessage', { chat_id: ownerChatId, text: `Instagram, черновик подписи:\n\n${caption}` });
  console.log('Черновик отправлен владельцу.');
}

const [file, ...args] = process.argv.slice(2);
if (!file) fail('Нужен post.json — см. начало tools/instagram-cards.mjs.');
const post = JSON.parse(readFileSync(resolve(startDir, file), 'utf8'));
const build = { collection: collectionSlides, route: routeSlides }[post.type];
if (!build) fail('type: collection или route.');
if (!post.items?.length) fail('Нет items.');
const outArg = args.find((a) => !a.startsWith('--'));
const dir = outArg ? resolve(startDir, outArg) : mkdtempSync(join(tmpdir(), 'locado-ig-'));
mkdirSync(dir, { recursive: true });
const files = await render(build(post), dir);
console.log(files.join('\n'));
if (args.includes('--send')) {
  if (!post.caption) fail('Для отправки нужна caption.');
  await sendDraft(files, post.caption);
}
