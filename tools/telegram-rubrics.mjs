// tools/telegram-rubrics.mjs — рубрики и хэштеги Telegram-канала: общие для
// отправки постов (tools/telegram.mjs) и недельного разбора (tools/telegram-stats.mjs).

/** Рубрики: метка utm_campaign → название, хэштег и что в ней бывает.
 *  Хэштеги — те же, что в навигационном посте (docs/telegram/nav.html). */
export const RUBRICS = {
  place: { label: 'Место недели', tag: '#место_недели', kind: 'place' },
  weekend: { label: 'Куда в выходные', tag: '#на_выходные', kind: 'place' },
  route: { label: 'Маршрут', tag: '#маршруты', kind: 'collection' },
  now: { label: 'Сейчас', tag: '#сезон', kind: 'place' },
  occasion: { label: 'Под повод', tag: '#под_повод', kind: 'collection' },
  fact: { label: 'Интересное', tag: '#интересное', kind: 'place' }
};

/** Хэштег категории места — по CATEGORIES из scripts/core/places.js. */
export const CATEGORY_TAGS = {
  food: '#еда', nature: '#природа', art: '#искусство',
  photo: '#фотолокации', entertainment: '#развлечения', shops: '#магазины'
};
