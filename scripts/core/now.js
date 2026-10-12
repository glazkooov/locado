// core/now.js — блок «Сейчас» на главной: что смотреть в это время года.
// Данные — data/now.json, по записи на сезон:
//   { "from": "09-15", "to": "10-31",
//     "title": "…", "lead": "…", "places": ["slug", …] }
// from/to — месяц-день, включительно; период может переходить через Новый
// год ("12-01" → "02-28"). Подходит первая запись, в которую попадает
// сегодняшний день; нет такой — блока на главной нет. Подпись над
// заголовком («Пока идёт дождь», «Этой осенью») — из кода, по моменту.
//
// «Живой» блок (pickNow): из places и запаса pool выбираются четыре места
// под погоду, время суток и часы работы, а заголовок — из variants
// ({ "rain": {title, lead}, "golden": …, "evening": …, "night": …,
//    "morning": …, "hot": …, "snow": … }),
// если для текущих условий вариант написан.
//
// Под фото — фраза места под этот момент: поле moments в places.json
// ({ "rain": "…", "sunset": "…", "evening": "…", "night": "…" }), а если
// для момента фразы нет — «Когда лучше» из story или описание.

import { getOpenStatus } from './format.js';
import { getDaypart } from './daypart.js';
import { sunTimes, moscowTime } from './sun.js';
import { weatherMode, tempLabel, forecastPhrase } from './weather.js';

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
const GOLDEN = 120; // мин до заката: «золотой час», зовём на виды
const VIEW_TAGS = ['панорама', 'высота', 'набережная'];
// Подпись над заголовком — по моменту: объясняет, почему здесь эти места
const MOMENT_EYEBROWS = {
  rain: 'Пока идёт дождь',
  snow: 'Пока идёт снег',
  golden: 'Пока не стемнело',
  evening: 'Сегодня вечером',
  night: 'Этой ночью',
  morning: 'Сегодня утром'
};
const SEASON_EYEBROWS = { зима: 'Этой зимой', весна: 'Этой весной', лето: 'Этим летом', осень: 'Этой осенью' };
const SEASON_TAGS = ['зима', 'зима', 'весна', 'весна', 'весна', 'лето', 'лето', 'лето', 'осень', 'осень', 'осень', 'зима'];

const minutesUntil = (from, to) => (to - from) / 6e4;
// Время закрытия — из расписания как есть («23:59» — это полночь)
const closeTime = (status) => (status.hoursToday?.[1] === '23:59' ? 'полуночи' : status.hoursToday?.[1]);
const tagged = (p, list) => (p.tags || []).some((t) => list.includes(t));
// Где переждать непогоду: залы, кафе и рынки (indoor в places.json)
const sheltered = (p) => Boolean(p.indoor) || p.category === 'food';

/** «1 ч 29 мин», «40 мин». */
export function durationLabel(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h ? `${h} ч${m % 60 ? ` ${m % 60} мин` : ''}` : `${m} мин`;
}

/** Сцена — настроение блока: от неё цвет, анимация и какие места звать.
 *  rain | snow | golden | evening | night | morning | day */
export function sceneOf(now, weather) {
  const mode = weatherMode(weather);
  if (mode === 'bad') return weather.kind === 'snow' ? 'snow' : 'rain';
  const { sunrise, sunset } = sunTimes(now);
  const toSunset = minutesUntil(now, sunset);
  if (toSunset > 0 && toSunset <= GOLDEN) return 'golden';
  const daypart = getDaypart(now);
  if (daypart === 'night' || now < sunrise) return 'night';
  if (toSunset <= 0) return 'evening';
  return daypart === 'morning' ? 'morning' : 'day';
}

/**
 * Что показать в «Сейчас» прямо сейчас.
 * ctx: { now, weather } — weather из core/weather.js или null.
 */
export function pickNow(entry, places, { now = new Date(), weather = null } = {}) {
  const bySlug = new Map(places.map((p) => [p.slug, p]));
  const main = entry.places || [];
  const editorial = [...new Set([...main, ...(entry.pool || [])])];
  // Остальной каталог тоже участвует, но ниже авторских: места с тегом
  // сезона или «круглый год» — так подборка растёт вместе с каталогом
  const seasonTag = SEASON_TAGS[now.getMonth()];
  const catalog = places.filter((p) => !editorial.includes(p.slug)
    && tagged(p, [seasonTag, 'круглый год']));
  const pool = [...editorial.map((s) => bySlug.get(s)).filter(Boolean), ...catalog];
  const mode = weatherMode(weather);
  const scene = sceneOf(now, weather);
  const { sunrise, sunset } = sunTimes(now);
  const toSunset = minutesUntil(now, sunset);
  const late = scene === 'evening' || scene === 'night';

  // К закату зовём в одно место, лучшее для вида: панорама > высота > набережная
  const sunsetPlace = scene === 'golden' && VIEW_TAGS.map((tag) => pool.find((p) => !p.indoor
    && (p.tags || []).includes(tag) && getOpenStatus(p, now).isOpen)).find(Boolean);

  const scored = pool.map((place, i) => {
    const status = getOpenStatus(place, now);
    const toClose = minutesToClose(status, now);
    if (!status.isOpen || (toClose !== null && toClose < SOON_CLOSE)) return null;
    // авторские места выше каталога, основные выше запаса
    let score = main.includes(place.slug) ? 10 - i * 0.1
      : editorial.includes(place.slug) ? 7 - i * 0.1 : 4;
    if (mode === 'bad') score += sheltered(place) ? 8 : -8;
    if (mode === 'good' && !place.indoor && (scene === 'morning' || scene === 'day')) score += 2;
    if (mode === 'hot') score += tagged(place, ['вода', 'купаться', 'лес']) ? 5 : place.indoor ? 2 : -2;
    if (late) score += tagged(place, ['вечер', 'ночь']) ? 4 : -4;
    if (scene === 'morning' && tagged(place, ['утро'])) score += 2;
    if (place === sunsetPlace) score += 6;
    if (place.moments?.[scene]) score += 1.5; // про этот момент у места есть что сказать
    return { place, status, toClose, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score);

  // Разнообразие: в дождь и вечером не четыре музея подряд, а музей, кафе,
  // кино… Сначала по одному месту каждого типа из подходящих моменту, потом
  // добираем подходящими, и только потом — любыми открытыми. Днём авторская
  // подборка одного типа («время усадеб») остаётся как есть
  const fits = mode === 'bad' ? sheltered : late ? (p) => tagged(p, ['вечер', 'ночь']) : null;
  const picked = [];
  const take = (item) => { if (picked.length < SHOW && !picked.includes(item)) picked.push(item); };
  if (fits) {
    const seen = new Set();
    scored.filter((x) => fits(x.place)).forEach((x) => {
      if (!seen.has(x.place.category)) { seen.add(x.place.category); take(x); }
    });
    scored.filter((x) => fits(x.place)).forEach(take);
  }
  scored.forEach(take);

  const momentKey = (place) => (place === sunsetPlace ? 'sunset' : scene);
  const cards = picked.length >= 2
    ? picked.map(({ place, status, toClose }) => {
      let reason = null;
      if (place === sunsetPlace) reason = { icon: 'sunset', text: `Закат в ${moscowTime(sunset)}` };
      else if (mode === 'bad' && sheltered(place)) reason = { icon: 'umbrella', text: toClose !== null ? `Под крышей · до ${closeTime(status)}` : 'Под крышей' };
      else if (toClose !== null && toClose < 3 * 60) reason = { icon: 'clock', text: `Открыто до ${closeTime(status)}` };
      else if (scene === 'night' && status.roundTheClock) reason = { icon: 'moon', text: 'Открыто всю ночь' };
      const note = place.moments?.[momentKey(place)] || place.moments?.[scene];
      return { place, reason, note: note || null };
    })
    : main.map((s) => bySlug.get(s)).filter(Boolean).map((place) => ({ place, reason: null, note: null }));

  const variant = entry.variants?.[scene] || (mode === 'hot' ? entry.variants?.hot : null);

  // Живые факты для панели: закат или рассвет
  const facts = [];
  if (toSunset > 0 && now > sunrise) {
    facts.push({ icon: 'sunset', text: toSunset <= 3 * 60 ? `до заката ${durationLabel(toSunset)}` : `закат в ${moscowTime(sunset)}` });
  } else if (now < sunrise) {
    facts.push({ icon: 'sun', text: `рассвет в ${moscowTime(sunrise)}` });
  } else facts.push({ icon: 'moon', text: `стемнело в ${moscowTime(sunset)}` });

  return {
    scene,
    eyebrow: MOMENT_EYEBROWS[scene] || (mode === 'hot' ? 'Пока жарко' : SEASON_EYEBROWS[seasonTag]),
    title: variant?.title || entry.title || '',
    lead: variant?.lead || entry.lead || '',
    weather: weather ? { icon: weather.icon, temp: tempLabel(weather.temp), label: weather.label } : null,
    forecast: forecastPhrase(weather),
    facts,
    cards
  };
}

/** Сколько минут до закрытия сегодня (null — круглосуточно или неизвестно). */
function minutesToClose(status, now) {
  if (!status.isOpen || status.roundTheClock || !status.nextChangeAt) return null;
  return minutesUntil(now, status.nextChangeAt);
}
