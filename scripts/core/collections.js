// core/collections.js — авторские подборки (data/collections.json): маршруты
// и подборки «под повод». Текст хранится блоками, практические данные мест
// (метро, часы, цены) берутся из places.json — в тексте они не устаревают.

import { smallPhoto } from './places.js';

const DATA_URL = 'data/collections.json';

export const COLLECTION_TYPES = {
  route: 'Маршрут',
  occasion: 'Под повод'
};

let cache = null;

export async function loadCollections() {
  if (cache) return cache;
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`Не удалось загрузить collections.json (${res.status})`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('collections.json: ожидался массив');
  cache = data.map((c) => ({ ...c, coverSm: smallPhoto(c.cover) }));
  return cache;
}

export const collectionUrl = (slug) => `collection.html?slug=${encodeURIComponent(slug)}`;

/** Слаги мест подборки по порядку появления в тексте. */
export const collectionPlaceSlugs = (collection) =>
  (collection.blocks || []).filter((b) => b.type === 'place').map((b) => b.slug);

/** Подборки, в которых упоминается место. */
export const collectionsWithPlace = (collections, slug) =>
  collections.filter((c) => collectionPlaceSlugs(c).includes(slug));
