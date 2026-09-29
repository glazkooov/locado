// tools/sitemap.mjs — собирает sitemap.xml из data/places.json и
// data/collections.json. Запускать из корня проекта после изменения
// списка мест или подборок:  node tools/sitemap.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const SITE = 'https://locado.ru/';

const places = JSON.parse(readFileSync('data/places.json', 'utf8'));
const collections = JSON.parse(readFileSync('data/collections.json', 'utf8'));

const urls = [
  '',
  'collections.html',
  'suggest.html',
  ...collections.map((c) => `collection.html?slug=${encodeURIComponent(c.slug)}`),
  ...places.map((p) => `place.html?slug=${encodeURIComponent(p.slug)}`)
];

// & в адресе в XML нужно экранировать
const xmlEscape = (s) => s.replace(/&/g, '&amp;');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${xmlEscape(SITE + u)}</loc></url>`).join('\n')}
</urlset>
`;

writeFileSync('sitemap.xml', xml);
console.log(`sitemap.xml: ${urls.length} адресов`);
