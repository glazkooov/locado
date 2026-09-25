// core/storage.js — единственный модуль, который трогает localStorage.
// Раньше main.js и place.js держали свои копии избранного/счётчиков и
// ключ locado_places_data хранил ПОЛНУЮ копию всех мест (включая старые
// пути к фото) — она незаметно "затеняла" свежие данные из places.json
// при каждой перезагрузке. Здесь вместо копии всех мест хранятся только
// локальные дельты счётчиков (locado_counters), поверх статических чисел
// из places.json.

const KEYS = {
  LEGACY_PLACES: 'locado_places_data', // старый ключ — только чтобы его удалить
  FAVORITES: 'locado_favorites',
  VISITED: 'locado_visited',
  REVIEWS: 'locado_reviews',
  COUNTERS: 'locado_counters'
};

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn('[storage] не удалось прочитать', key, e);
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[storage] не удалось записать', key, e);
  }
};

// Удаляем устаревший полный снимок мест, чтобы он не перекрывал свежие
// данные из places.json при следующей загрузке.
try { localStorage.removeItem(KEYS.LEGACY_PLACES); } catch (e) { /* no-op */ }

// ---------- Избранное ----------
export const getFavorites = () => read(KEYS.FAVORITES, []);
export const isFavorite = (slug) => getFavorites().includes(slug);
export const toggleFavorite = (slug) => {
  const favorites = getFavorites();
  const idx = favorites.indexOf(slug);
  if (idx === -1) favorites.push(slug);
  else favorites.splice(idx, 1);
  write(KEYS.FAVORITES, favorites);
  return favorites.includes(slug);
};

// ---------- Посещённые ----------
export const getVisited = () => read(KEYS.VISITED, []);
export const isVisited = (slug) => getVisited().includes(slug);
export const addVisited = (slug) => {
  const visited = getVisited();
  if (!visited.includes(slug)) {
    visited.push(slug);
    write(KEYS.VISITED, visited);
    return true; // это было первое посещение
  }
  return false;
};

// ---------- Отзывы ----------
export const getReviews = (slug) => {
  const all = read(KEYS.REVIEWS, {});
  return all[slug] || [];
};
export const addReview = (slug, review) => {
  const all = read(KEYS.REVIEWS, {});
  if (!all[slug]) all[slug] = [];
  all[slug].unshift(review);
  write(KEYS.REVIEWS, all);
  return all[slug];
};

// ---------- Счётчики (views/favorites/visits) — локальные дельты поверх places.json ----------
export const getCounters = () => read(KEYS.COUNTERS, {});
export const incrementCounter = (slug, field, delta = 1) => {
  const counters = getCounters();
  const entry = counters[slug] || {};
  entry[field] = Math.max(0, (entry[field] || 0) + delta);
  counters[slug] = entry;
  write(KEYS.COUNTERS, counters);
  return entry[field];
};
