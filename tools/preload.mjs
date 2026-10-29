// tools/preload.mjs — вписывает в <head> страниц список всех JS-модулей,
// которые страница подключает (<link rel="modulepreload">). Без него
// браузер узнаёт о модуле, только скачав тот, что его импортирует, —
// на мобильном интернете цепочка из шести уровней стоит секунды. Со
// списком все модули качаются сразу и параллельно.
//
// Запускать из корня проекта после того, как в скриптах появился,
// пропал или переехал import:  node tools/preload.mjs
// npm run check напомнит, если список устарел. Устаревший список ничего
// не ломает — страница просто грузится медленнее.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const START = '  <!-- Модули страницы: браузер качает их сразу, а не по цепочке импортов. Список — node tools/preload.mjs -->\n';
const END = '  <!-- /модули страницы -->\n';
const BLOCK = new RegExp(`${escapeRe(START)}[\\s\\S]*?${escapeRe(END)}`);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Страницы сайта: index.html в корне и в папках первого уровня, 404.html. */
export function pages() {
  const list = ['index.html', '404.html'];
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (dir.isDirectory() && existsSync(`${root}${dir.name}/index.html`)) list.push(`${dir.name}/index.html`);
  }
  return list.filter((p) => existsSync(root + p));
}

/** Статические импорты модуля — пути от корня сайта. import() не берём:
 *  такие модули грузятся по требованию, а не при открытии страницы. */
function imports(code, fromDir) {
  const found = [];
  const re = /^\s*(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm;
  for (const m of code.matchAll(re)) found.push(posix.normalize(posix.join(fromDir, m[1])));
  return found;
}

/** Все модули страницы в порядке обхода: сначала её скрипты, затем их импорты.
 *  Пути в скриптах страниц — от корня сайта: у всех страниц <base> на корень. */
function modulesOf(html) {
  const queue = [];
  for (const m of html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)) queue.push(posix.normalize(m[1]));
  for (const m of html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)) queue.push(...imports(m[1], '.'));
  const seen = new Set();
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file) || !existsSync(root + file)) continue;
    seen.add(file);
    queue.push(...imports(readFileSync(root + file, 'utf8'), posix.dirname(file)));
  }
  return [...seen];
}

function withBlock(html) {
  const modules = modulesOf(html);
  if (!modules.length) return html.replace(BLOCK, '');
  const block = START + modules.map((m) => `  <link rel="modulepreload" href="${m}">\n`).join('') + END;
  return BLOCK.test(html) ? html.replace(BLOCK, block) : html.replace('</head>', `${block}</head>`);
}

/** Страницы, где список модулей не совпадает с тем, что подключают скрипты. */
export function stalePreloads() {
  return pages().filter((p) => {
    const html = readFileSync(root + p, 'utf8');
    return withBlock(html) !== html;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const changed = stalePreloads();
  for (const p of changed) writeFileSync(root + p, withBlock(readFileSync(root + p, 'utf8')));
  console.log(changed.length ? `Обновлено: ${changed.join(', ')}` : 'Списки модулей уже актуальны.');
}
