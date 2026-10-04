// core/now.js — блок «Сейчас» на главной: что смотреть в это время года.
// Данные — data/now.json, по записи на сезон:
//   { "from": "09-15", "to": "10-31", "eyebrow": "Сейчас, осенью",
//     "title": "…", "lead": "…", "places": ["slug", …] }
// from/to — месяц-день, включительно; период может переходить через Новый
// год ("12-01" → "02-28"). Подходит первая запись, в которую попадает
// сегодняшний день; нет такой — блока на главной нет.

const DATA_URL = 'data/now.json';

const monthDay = (date) =>
  `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const inPeriod = (day, from, to) => (from <= to ? day >= from && day <= to : day >= from || day <= to);

/** Запись на сегодня или null (в том числе если файла нет или он битый). */
export async function loadNow(date = new Date()) {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) return null;
    const list = await res.json();
    const day = monthDay(date);
    return (Array.isArray(list) ? list : []).find((e) => e.from && e.to && inPeriod(day, e.from, e.to)) || null;
  } catch (err) {
    console.error('[now] не удалось загрузить now.json:', err);
    return null;
  }
}
