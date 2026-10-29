// tools/build-css.mjs — собирает стили в один файл styles/site.css.
//
// Править по-прежнему нужно отдельные файлы в styles/ — их список и
// порядок задаёт styles/main.css. Страницы подключают не его, а собранный
// site.css: один запрос вместо двадцати пяти, первый экран на мобильном
// интернете появляется раньше. В адресе — ?v= от содержимого: после
// правки стилей адрес меняется, и браузер не возьмёт старый файл из кэша
// (nginx Бегета отдаёт стили с кэшем на неделю).
//
// Запускать из корня проекта после любой правки стилей:
//   node tools/build-css.mjs
// npm run check напомнит, если забыли.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pages } from './preload.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = 'styles/main.css';
const OUT = 'styles/site.css';
const LINK = /<link rel="stylesheet" href="styles\/(?:main|site)\.css(?:\?v=[0-9a-f]+)?">/;

/** Относительные url() файла styles/<dir>/x.css — относительно styles/. */
function rebase(css, dir) {
  return css.replace(/url\((['"]?)([^'")]+)\1\)/g, (all, quote, url) => {
    if (/^(data:|https?:|\/|#)/.test(url)) return all;
    return `url(${quote}${posix.relative('styles', posix.join('styles', dir, url))}${quote})`;
  });
}

function build() {
  const main = readFileSync(root + SOURCE, 'utf8');
  const body = main.replace(/^@import url\(['"]([^'"]+)['"]\);$/gm, (line, file) => {
    const css = readFileSync(`${root}styles/${file}`, 'utf8');
    return `/* ===== ${file} ===== */\n${rebase(css, posix.dirname(file)).trim()}\n`;
  });
  return `/* Собрано из ${SOURCE} командой node tools/build-css.mjs — не править:\n   изменения пропадут при следующей сборке. */\n\n${body}`;
}

const version = (css) => createHash('sha1').update(css).digest('hex').slice(0, 8);

/** Что устарело: site.css не совпадает со сборкой или страницы ссылаются
 *  на другую версию. Пустой список — всё актуально. */
export function staleCss() {
  const css = build();
  const link = `<link rel="stylesheet" href="${OUT}?v=${version(css)}">`;
  const stale = [];
  if (!existsSync(root + OUT) || readFileSync(root + OUT, 'utf8') !== css) stale.push(OUT);
  for (const p of pages()) {
    const m = readFileSync(root + p, 'utf8').match(LINK);
    if (m && m[0] !== link) stale.push(p);
  }
  return stale;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const css = build();
  const link = `<link rel="stylesheet" href="${OUT}?v=${version(css)}">`;
  writeFileSync(root + OUT, css);
  const changed = pages().filter((p) => {
    const html = readFileSync(root + p, 'utf8');
    if (!LINK.test(html) || html.match(LINK)[0] === link) return false;
    writeFileSync(root + p, html.replace(LINK, link));
    return true;
  });
  console.log(`${OUT} собран (${Math.round(css.length / 1024)} КБ, версия ${version(css)})`
    + (changed.length ? `; ссылка обновлена: ${changed.join(', ')}` : ''));
}
