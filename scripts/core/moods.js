// core/moods.js — словарь настроений для hero-pills на главной странице.
//
// Каждый pill — это не поиск по слову, а заранее описанное настроение:
// { id, label, icon, photo, bestAt, tags, categories }. photo — превью
// карточки в hero (assets/images/moods/, 360×480), bestAt — время суток
// (core/daypart.js), когда настроение показывается первым. По клику сначала ищем места по
// tags (places.tags из data/places.json) — точное совпадение хотя бы
// одного тега. Если найдено меньше MIN_RESULTS мест, расширяем выборку до
// categories этого же настроения (places.category). Так pill никогда не
// показывает пустую ленту, даже если у части мест ещё нет нужных тегов.
//
// Список tags подобран по смыслу настроения и проверен на реальном наборе
// data/places.json (26 мест, сентябрь 2026) — этот файл, по вашим словам,
// лишь черновой набор и будет дополняться, так что при расширении данных
// стоит время от времени сверять tags здесь с тем, что реально используется
// в местах, и добавлять сюда новые синонимы по мере необходимости.

export const MIN_RESULTS = 4;

export const MOODS = [
  {
    id: 'quiet-nature',
    label: 'Тихая прогулка на природе',
    icon: 'fa-leaf',
    photo: 'assets/images/moods/quiet-nature.jpg',
    bestAt: ['morning', 'day'],
    tags: ['тишина', 'природа', 'прогулки', 'ландшафты', 'пруды', 'пикник', 'велопрогулки'],
    categories: ['nature']
  },
  {
    id: 'romantic-evening',
    label: 'Романтично вечером',
    icon: 'fa-city',
    photo: 'assets/images/moods/romantic-evening.jpg',
    bestAt: ['evening'],
    tags: ['закат', 'панорама', 'панорамный вид', 'винная карта', 'коктейли', 'неон'],
    categories: ['food', 'photo']
  },
  {
    id: 'culture-art',
    label: 'Культура и искусство',
    icon: 'fa-palette',
    photo: 'assets/images/moods/culture-art.jpg',
    bestAt: ['day'],
    tags: ['искусство', 'живопись', 'выставки', 'современное искусство', 'галереи', 'дизайн', 'архитектура', 'театр', 'драма', 'постановки', 'экскурсии'],
    categories: ['art', 'theater']
  },
  {
    id: 'food',
    label: 'Вкусно поесть',
    icon: 'fa-utensils',
    photo: 'assets/images/moods/food.jpg',
    bestAt: ['morning', 'evening'],
    tags: ['завтраки', 'кофе', 'выпечка', 'фудкорт', 'детская комната'],
    categories: ['food']
  },
  {
    id: 'active-fun',
    label: 'Активности и развлечения',
    icon: 'fa-ticket',
    photo: 'assets/images/moods/active-fun.jpg',
    bestAt: ['night'],
    tags: ['квест', 'стендап', 'юмор', 'VR', 'игры', 'активный отдых', 'спорт', 'команда'],
    categories: ['entertainment']
  }
];

/**
 * Возвращает патч фильтров для feed.setFilters() под выбранное настроение:
 * либо { tags } (точное совпадение по тегам, если мест достаточно), либо
 * { category } со списком категорий настроения (запасной план).
 */
export function resolveMoodFilters(places, moodId) {
  const mood = MOODS.find((m) => m.id === moodId);
  if (!mood) return { category: 'all', query: '', tags: null };

  const byTags = places.filter((p) => (p.tags || []).some((t) => mood.tags.includes(t)));
  if (byTags.length >= MIN_RESULTS) {
    return { category: 'all', query: '', tags: mood.tags };
  }
  return { category: mood.categories, query: '', tags: null };
}

/** Настроения в порядке показа: подходящие текущему времени суток — первыми. */
export function moodsFor(daypart) {
  const fits = (m) => m.bestAt.includes(daypart);
  return [...MOODS.filter(fits), ...MOODS.filter((m) => !fits(m))];
}
