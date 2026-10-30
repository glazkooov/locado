// tools/preload.mjs — вписывает в <head> страниц список всех JS-модулей,
// которые страница подключает (<link rel="modulepreload">). Без него
// браузер узнаёт о модуле, только скачав тот, что его импортирует, —
// на мобильном интернете цепочка из шести уровней стоит секунды. Со
// списком все модули качаются сразу и параллельно.
//
// У каждого модуля в адресе версия — ?v= от содержимого. nginx Бегета
// отдаёт .js с кэшем на неделю, мимо .htaccess (задача 109): без версии
// вернувшийся посетитель получил бы новую страницу со старыми скриптами.
// Модули импортируют друг друга без версий ('./core/dom.js'), поэтому
// версии им подставляет карта импортов (<script type="importmap">):
// браузер сам меняет ./scripts/core/dom.js на ./scripts/core/dom.js?v=….
// Браузеры без карт импортов (Safari до 16.4) грузят модули как раньше.
//
// Запускать из корня проекта после любой правки скриптов:
//   node tools/preload.mjs
// npm run check напомнит, если забыли. Без запуска браузер может взять
// из кэша старую версию изменённого модуля.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

const STATIC_IMPORT = /^\s*(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm;
const DYNAMIC_IMPORT = /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
const ENTRY = /<script type="module" src="([^"?]+)(?:\?v=[0-9a-f]+)?"><\/script>/g;

/** Импорты модуля — пути от корня сайта. */
function imports(code, fromDir, re = STATIC_IMPORT) {
  return [...code.matchAll(re)].map((m) => posix.normalize(posix.join(fromDir, m[1])));
}

/** Модули страницы в порядке обхода: сначала её скрипты, затем их импорты.
 *  preload — то, что нужно при открытии (статические импорты); versioned —
 *  ещё и import(): модули по требованию тоже должны прийти свежими.
 *  Пути в скриптах страниц — от корня сайта: у всех страниц <base> на корень. */
function modulesOf(html) {
  const walk = (withDynamic) => {
    const queue = [];
    for (const m of html.matchAll(ENTRY)) queue.push(posix.normalize(m[1]));
    for (const m of html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)) {
      queue.push(...imports(m[1], '.'), ...(withDynamic ? imports(m[1], '.', DYNAMIC_IMPORT) : []));
    }
    const seen = new Set();
    while (queue.length) {
      const file = queue.shift();
      if (seen.has(file) || !existsSync(root + file)) continue;
      seen.add(file);
      const code = readFileSync(root + file, 'utf8');
      const dir = posix.dirname(file);
      queue.push(...imports(code, dir), ...(withDynamic ? imports(code, dir, DYNAMIC_IMPORT) : []));
    }
    return [...seen];
  };
  return { preload: walk(false), versioned: walk(true) };
}

const version = (file) => createHash('sha1').update(readFileSync(root + file)).digest('hex').slice(0, 8);

function withBlock(html) {
  const { preload, versioned } = modulesOf(html);
  const v = new Map(versioned.map((m) => [m, `${m}?v=${version(m)}`]));
  // Скрипты страницы браузер берёт по src, мимо карты: версия прямо в адресе
  const out = html.replace(ENTRY, (tag, src) => {
    const file = posix.normalize(src);
    return v.has(file) ? `<script type="module" src="${v.get(file)}"></script>` : tag;
  });
  if (!preload.length) return out.replace(BLOCK, '');
  // Карта — раньше любого модуля и modulepreload, иначе браузер её не применит.
  // Адреса с ./ — от <base>, как и остальные пути на странице
  const map = versioned.map((m) => `      "./${m}": "./${v.get(m)}"`).join(',\n');
  const block = START
    + `  <script type="importmap">\n  {\n    "imports": {\n${map}\n    }\n  }\n  </script>\n`
    + preload.map((m) => `  <link rel="modulepreload" href="${v.get(m)}">\n`).join('') + END;
  return BLOCK.test(out) ? out.replace(BLOCK, block) : out.replace('</head>', `${block}</head>`);
}

/** Страницы, где список модулей или их версии не совпадают со скриптами. */
export function stalePreloads() {
  return pages().filter((p) => {
    const html = readFileSync(root + p, 'utf8');
    return withBlock(html) !== html;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const changed = stalePreloads();
  for (const p of changed) writeFileSync(root + p, withBlock(readFileSync(root + p, 'utf8')));
  console.log(changed.length ? `Обновлено: ${changed.join(', ')}` : 'Списки и версии модулей уже актуальны.');
}
