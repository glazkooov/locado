// tools/check-photos.mjs — проверка фото перед публикацией:
// у каждого места и подборки с фото есть файл и подпись автора.
// Запуск из корня проекта:  node tools/check-photos.mjs

import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Пути — от корня проекта, откуда бы ни запустили
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const LICENSES = ['CC BY 4.0', 'CC BY-SA 4.0', 'CC BY 3.0', 'CC BY-SA 3.0', 'CC0'];
const places = JSON.parse(readFileSync('data/places.json', 'utf8'));
const collections = JSON.parse(readFileSync('data/collections.json', 'utf8'));

const problems = { noFile: [], noSmall: [], tooBig: [], noCredit: [], noSource: [], badLicense: [] };
const check = (label, photo, credit) => {
  if (!photo) return;
  const local = !/^https?:/.test(photo);
  // Фото ещё нет — подпись проверим, когда оно появится
  if (local && !existsSync(photo)) { problems.noFile.push(`${label} — ${photo}`); return; }
  if (local) {
    const small = photo.replace(/^(assets\/images\/places\/)/, '$1sm/');
    if (small !== photo && !existsSync(small)) problems.noSmall.push(label);
    if (statSync(photo).size > 600_000) problems.tooBig.push(`${label} — ${Math.round(statSync(photo).size / 1024)} КБ`);
  }
  if (!credit?.author) { problems.noCredit.push(label); return; }
  if (credit.license && !credit.source) problems.noSource.push(label);
  if (credit.license && !LICENSES.includes(credit.license)) problems.badLicense.push(`${label} — «${credit.license}»`);
};
places.forEach((p) => check(`место ${p.slug}`, p.photo, p.photoCredit));
collections.forEach((c) => check(`подборка ${c.slug}`, c.cover, c.photoCredit));

const titles = {
  noFile: 'Нет файла фото',
  noSmall: 'Нет копии для карточек (sm/) — запусти python3 tools/photos.py',
  tooBig: 'Фото тяжелее 600 КБ — запусти python3 tools/photos.py',
  noCredit: 'Нет подписи (photoCredit.author) — для своих фото: { "author": "Локадо" }',
  noSource: 'Фото есть, но нет ссылки на источник (photoCredit.source) — без неё подпись не показывается',
  badLicense: `Неизвестная лицензия — допустимые: ${LICENSES.join(', ')}`
};
let total = 0;
for (const [key, list] of Object.entries(problems)) {
  if (!list.length) continue;
  total += list.length;
  console.log(`\n${titles[key]} (${list.length}):`);
  list.forEach((x) => console.log(`  ${x}`));
}
console.log(total ? `\nВсего замечаний: ${total}` : 'Все фото на месте и подписаны.');
