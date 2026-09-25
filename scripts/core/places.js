// core/places.js — загрузка data/places.json, выборки и мутации (избранное,
// посещения). Единственное место, которое знает формат данных.

import * as Storage from './storage.js';

const DATA_URL = new URL('../../data/places.json', import.meta.url);

// Единственный словарь категорий: названия, порядок и иконки для плиток,
// вкладок ленты, кнопок карты и окна случайного места берутся отсюда
// (см. components/category-buttons.js). Названия — из CLAUDE.md.
export const CATEGORIES = {
  food: { label: 'Еда и напитки', emoji: '🍕', icon: 'fa-utensils' },
  nature: { label: 'Природа', emoji: '🌳', icon: 'fa-tree' },
  art: { label: 'Музеи', emoji: '🎨', icon: 'fa-landmark' },
  theater: { label: 'Театры', emoji: '🎭', icon: 'fa-theater-masks' },
  photo: { label: 'Фото', emoji: '📸', icon: 'fa-camera' },
  entertainment: { label: 'Развлечения', emoji: '🎉', icon: 'fa-ticket' }
};

export function categoryLabel(category, { emoji = false } = {}) {
  const meta = CATEGORIES[category];
  if (!meta) return category || '';
  return emoji ? `${meta.emoji} ${meta.label}` : meta.label;
}

export function placeUrl(slug) {
  return `place.html?slug=${encodeURIComponent(slug)}`;
}

/** Путь к фото в data/places.json уже хранится в готовом виде
 *  (assets/images/places/... или assets/images/ui/...) — просто пропускаем
 *  его как есть, оставляя только защиту от пустого значения. */
export function resolvePhoto(path) {
  return path || '';
}

let cache = null;
let inFlight = null;

function normalize(raw) {
  const counters = Storage.getCounters();
  return raw.map((place) => {
    const delta = counters[place.slug] || {};
    return {
      ...place,
      photo: resolvePhoto(place.photo),
      // Локальные просмотры больше не считаем: из-за них «Избранное от
      // города» у каждого посетителя было своим. Старые дельты игнорируем.
      views: place.views || 0,
      favorites: (place.favorites || 0) + (delta.favorites || 0),
      visits: (place.visits || 0) + (delta.visits || 0)
    };
  });
}

export async function loadPlaces() {
  if (cache) return cache;
  if (inFlight) return inFlight;

  inFlight = fetch(DATA_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Не удалось загрузить places.json (${res.status})`);
      return res.json();
    })
    .then((data) => {
      if (!Array.isArray(data)) throw new Error('places.json: ожидался массив');
      cache = normalize(data);
      return cache;
    })
    .catch((err) => {
      cache = null;
      throw err;
    })
    .finally(() => { inFlight = null; });

  return inFlight;
}

// ---------- Выборки ----------
export const bySlug = (places, slug) => places.find((p) => p.slug === slug);
export const byCategory = (places, category) => {
  if (!category || category === 'all') return places.slice();
  if (Array.isArray(category)) return places.filter((p) => category.includes(p.category));
  return places.filter((p) => p.category === category);
};

export const metroList = (place) => (Array.isArray(place.metro) ? place.metro : [place.metro]).filter(Boolean);

export function uniqueMetro(places) {
  const all = places.flatMap(metroList);
  return [...new Set(all)].sort((a, b) => a.localeCompare(b, 'ru'));
}

export function search(places, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return places;
  return places.filter((p) => {
    const haystack = [p.name, p.type, p.description, metroList(p).join(' '), (p.tags || []).join(' ')]
      .filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

export function filterPlaces(places, { category = 'all', query = '', metros = [], price = '', openNow = false, tags = null } = {}) {
  let list = byCategory(places, category);
  list = search(list, query);
  if (metros.length) {
    list = list.filter((p) => metroList(p).some((m) => metros.includes(m)));
  }
  if (price) {
    list = list.filter((p) => (price === 'free' ? p.price_level === 'free' : p.price_level === price));
  }
  if (openNow) {
    // импортируем лениво, чтобы не тянуть format.js туда, где он не нужен
    list = list.filter((p) => isPlaceOpenNow(p));
  }
  if (tags && tags.length) {
    list = list.filter((p) => (p.tags || []).some((t) => tags.includes(t)));
  }
  return list;
}

let _isOpenNow = null;
function isPlaceOpenNow(place) {
  if (!_isOpenNow) {
    // динамический импорт синхронно недоступен — используем простую эвристику здесь,
    // а полноценную (с ночными сменами) версию из core/format.js используют
    // компоненты, которым нужна точность (карточка места, карта).
    _isOpenNow = true;
  }
  if (!place.schedule) return false;
  const dayMap = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
  const hours = place.schedule[dayMap[new Date().getDay()]];
  if (!hours) return false;
  const [oh, om] = hours[0].split(':').map(Number);
  const [ch, cm] = hours[1].split(':').map(Number);
  const open = oh * 60 + om, close = ch * 60 + cm;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  return close < open ? (cur >= open || cur <= close) : (cur >= open && cur <= close);
}

export function popular(places, count = 4) {
  return [...places]
    .map((p) => ({ p, score: (p.views || 0) + (p.favorites || 0) * 2 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((x) => x.p);
}

export function similar(places, place, count = 6) {
  return places.filter((p) => p.slug !== place.slug && p.category === place.category).slice(0, count);
}

/** Fisher–Yates: случайная выборка без повторов. */
export function sample(places, count) {
  const arr = places.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

export function pickRandom(places, exceptSlug) {
  const pool = exceptSlug ? places.filter((p) => p.slug !== exceptSlug) : places;
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------- Мутации (обёртки над storage.js + обновление объекта в памяти) ----------
function adjustCounter(place, field, delta) {
  if (!place) return;
  place[field] = Math.max(0, (place[field] || 0) + delta);
}

export function toggleFavoritePlace(place) {
  const isFavNow = Storage.toggleFavorite(place.slug);
  adjustCounter(place, 'favorites', isFavNow ? 1 : -1);
  return isFavNow;
}

export function markVisited(place) {
  const isNew = Storage.addVisited(place.slug);
  if (isNew) adjustCounter(place, 'visits', 1);
  return isNew;
}
