// tools/check-now.mjs — проверка блока «Сейчас» (data/now.json):
// какие дни года без блока, что сейчас на главной и когда менять,
// у каких мест нет фото или «Когда лучше» (story.when).
// Запуск (из любой папки проекта):  node tools/check-now.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const now = JSON.parse(readFileSync('data/now.json', 'utf8'));
const places = JSON.parse(readFileSync('data/places.json', 'utf8'));
const bySlug = Object.fromEntries(places.map((p) => [p.slug, p]));

const md = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inPeriod = (day, from, to) => (from <= to ? day >= from && day <= to : day >= from || day <= to);
const human = (day) => {
  const [m, d] = day.split('-').map(Number);
  return new Date(2026, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};
const entryFor = (day) => now.find((e) => e.from && e.to && inPeriod(day, e.from, e.to));

// Сегодня и когда сменится
const today = new Date();
const current = entryFor(md(today));
console.log(current
  ? `Сейчас на главной: «${current.title}» — до ${human(current.to)}`
  : 'Сейчас на главной блока «Сейчас» нет');
for (let i = 1; i <= 21; i++) {
  const d = new Date(today); d.setDate(d.getDate() + i);
  if (entryFor(md(d)) !== current) {
    const next = entryFor(md(d));
    console.log(`Через ${i} дн. (${human(md(d))}) ${next ? `сменится на «${next.title}»` : 'блок пропадёт — пора добавить следующий сезон'}`);
    break;
  }
}

// Дни года без блока — одним списком периодов
const gaps = [];
let start = null;
for (let i = 0; i <= 366; i++) {
  const d = new Date(2024, 0, 1 + i); // високосный год — с 29 февраля
  const day = md(d);
  const empty = i < 366 && !entryFor(day);
  if (empty && !start) start = day;
  if (!empty && start) { gaps.push([start, md(new Date(2024, 0, i))]); start = null; }
}
console.log(gaps.length
  ? `\nБез блока: ${gaps.map(([a, b]) => (a === b ? human(a) : `${human(a)} — ${human(b)}`)).join('; ')}`
  : '\nБлок есть на каждый день года');

// Места
const problems = [];
now.forEach((e) => {
  (e.places || []).forEach((slug) => {
    const p = bySlug[slug];
    if (!p) { problems.push(`«${e.title}»: нет места ${slug}`); return; }
    if (!existsSync(p.photo)) problems.push(`«${e.title}»: у ${slug} нет фото`);
    if (!p.story?.when) problems.push(`«${e.title}»: у ${slug} нет «Когда лучше» (story.when) — покажется описание`);
  });
  if ((e.places || []).length !== 4) problems.push(`«${e.title}»: мест ${(e.places || []).length}, лучше 4 — один ряд на компьютере`);
});
console.log(problems.length ? `\nЗамечания:\n  ${problems.join('\n  ')}` : '\nУ всех мест есть фото и «Когда лучше»');
