// tools/check-photos.mjs — проверка фото перед публикацией:
// у каждого места и подборки с фото есть файл и подпись автора.
// Запуск из корня проекта:  node tools/check-photos.mjs

import { readFileSync, existsSync } from 'node:fs';

const LICENSES = ['CC BY 4.0', 'CC BY-SA 4.0', 'CC BY 3.0', 'CC BY-SA 3.0', 'CC0'];
const places = JSON.parse(readFileSync('data/places.json', 'utf8'));
const collections = JSON.parse(readFileSync('data/collections.json', 'utf8'));

const problems = { noFile: [], noCredit: [], noSource: [], badLicense: [] };
const check = (label, photo, credit) => {
  if (!photo) return;
  if (!/^https?:/.test(photo) && !existsSync(photo)) problems.noFile.push(`${label} — ${photo}`);
  if (!credit?.author) { problems.noCredit.push(label); return; }
  if (credit.license && !credit.source) problems.noSource.push(label);
  if (credit.license && !LICENSES.includes(credit.license)) problems.badLicense.push(`${label} — «${credit.license}»`);
};
places.forEach((p) => check(`место ${p.slug}`, p.photo, p.photoCredit));
collections.forEach((c) => check(`подборка ${c.slug}`, c.cover, c.photoCredit));

const titles = {
  noFile: 'Нет файла фото',
  noCredit: 'Нет подписи (photoCredit.author) — для своих фото: { "author": "Локадо" }',
  noSource: 'Есть лицензия, но нет ссылки на источник (photoCredit.source)',
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
