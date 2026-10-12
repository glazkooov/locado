// core/now.js — блок «Сейчас» на главной: что смотреть в это время года.
// Данные — data/now.json, по записи на сезон:
//   { "from": "09-15", "to": "10-31", "eyebrow": "Сейчас, осенью",
//     "title": "…", "lead": "…", "places": ["slug", …] }
// from/to — месяц-день, включительно; период может переходить через Новый
// год ("12-01" → "02-28"). Подходит первая запись, в которую попадает
// сегодняшний день; нет такой — блока на главной нет.
//
// «Живой» блок (pickNow): из places и запаса pool выбираются четыре места
// под погоду, время суток и часы работы, а заголовок — из variants
// ({ "rain": {title, lead}, "evening": …, "night": …, "hot": …, "snow": … }),
// если для текущих условий вариант написан.

import { getOpenStatus } from './format.js';
import { getDaypart } from './daypart.js';
import { sunTimes, moscowTime } from './sun.js';
import { weatherMode, tempLabel } from './weather.js';

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

const SHOW = 4;
const SOON_CLOSE = 60; // мин: закроется раньше — не зовём
const SUNSET_AHEAD = 150; // мин до заката: «успеешь к закату»
const VIEW_TAGS = ['панорама', 'высота', 'набережная'];

const minutesUntil = (from, to) => (to - from) / 6e4;
// Время закрытия — из расписания как есть («23:59» — это полночь)
const closeTime = (status) => (status.hoursToday?.[1] === '23:59' ? 'полуночи' : status.hoursToday?.[1]);

/** Сколько минут до закрытия сегодня (null — круглосуточно или неизвестно). */
function minutesToClose(status, now) {
  if (!status.isOpen || status.roundTheClock || !status.nextChangeAt) return null;
  return minutesUntil(now, status.nextChangeAt);
}

/** Какой вариант заголовка подходит сейчас: погода важнее времени суток. */
function variantKey(mode, weather, daypart) {
  if (mode === 'bad') return weather.kind === 'snow' ? 'snow' : 'rain';
  if (mode === 'hot') return 'hot';
  if (daypart === 'evening' || daypart === 'night' || daypart === 'morning') return daypart;
  return null;
}

/**
 * Что показать в «Сейчас» прямо сейчас.
 * ctx: { now, weather } — weather из core/weather.js или null.
 * Возвращает { title, lead, live, cards: [{ place, reason }] }.
 */
export function pickNow(entry, places, { now = new Date(), weather = null } = {}) {
  const bySlug = new Map(places.map((p) => [p.slug, p]));
  const slugs = [...new Set([...(entry.places || []), ...(entry.pool || [])])];
  const pool = slugs.map((s) => bySlug.get(s)).filter(Boolean);
  const daypart = getDaypart(now);
  const mode = weatherMode(weather);
  const { sunrise, sunset } = sunTimes(now);
  const toSunset = minutesUntil(now, sunset);
  const sunsetSoon = toSunset > 0 && toSunset <= SUNSET_AHEAD && mode !== 'bad';
  const tagged = (p, list) => (p.tags || []).some((t) => list.includes(t));

  // К закату зовём в одно место, лучшее для вида: панорама > высота > набережная
  const sunsetPlace = sunsetSoon && VIEW_TAGS.map((tag) => pool.find((p) => !p.indoor
    && (p.tags || []).includes(tag) && getOpenStatus(p, now).isOpen)).find(Boolean);
  const scored = pool.map((place, i) => {
    const status = getOpenStatus(place, now);
    const toClose = minutesToClose(status, now);
    if (!status.isOpen || (toClose !== null && toClose < SOON_CLOSE)) return null;
    // авторский порядок: основные места выше запаса
    let score = ((entry.places || []).includes(place.slug) ? 10 : 7) - i * 0.1;
    let reason = null;
    if (mode === 'bad') score += place.indoor ? 8 : -8;
    if (mode === 'good' && !place.indoor && (daypart === 'morning' || daypart === 'day')) score += 2;
    if (mode === 'hot') score += tagged(place, ['вода', 'купаться', 'лес']) ? 5 : place.indoor ? 2 : -2;
    if (daypart === 'evening' || daypart === 'night') score += tagged(place, ['вечер', 'ночь']) ? 4 : -4;
    if (daypart === 'morning' && tagged(place, ['утро'])) score += 2;
    if (place === sunsetPlace) {
      score += 6;
      reason = { icon: 'sunset', text: `Закат в ${moscowTime(sunset)} — успеешь` };
    }
    if (!reason && mode === 'bad' && place.indoor) {
      reason = { icon: 'umbrella', text: toClose !== null ? `Под крышей · до ${closeTime(status)}` : 'Под крышей' };
    }
    if (!reason && toClose !== null && toClose < 4 * 60) {
      reason = { icon: 'clock', text: `Открыто до ${closeTime(status)}` };
    }
    if (!reason && daypart === 'night' && status.roundTheClock) {
      reason = { icon: 'moon', text: 'Открыто всю ночь' };
    }
    return { place, reason, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score);

  // Если подходящих мало (ночь, всё закрыто) — авторская четвёрка как была
  const cards = scored.length >= 2
    ? scored.slice(0, SHOW).map(({ place, reason }) => ({ place, reason }))
    : (entry.places || []).map((s) => bySlug.get(s)).filter(Boolean).map((place) => ({ place, reason: null }));

  const variant = entry.variants?.[variantKey(mode, weather, daypart)];

  // Строка над заголовком: погода и солнце
  const live = [];
  if (weather) live.push({ icon: weather.icon, text: `${tempLabel(weather.temp)}, ${weather.label}` });
  if (toSunset > 0 && now > sunrise) live.push({ icon: 'sunset', text: `закат в ${moscowTime(sunset)}` });
  else if (now < sunrise) live.push({ icon: 'sun', text: `рассвет в ${moscowTime(sunrise)}` });

  return {
    eyebrow: entry.eyebrow || '',
    title: variant?.title || entry.title || '',
    lead: variant?.lead || entry.lead || '',
    live,
    cards
  };
}
