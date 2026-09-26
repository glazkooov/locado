// core/moods.js — словарь настроений для карточек в hero на главной.
//
// Настроение — это заранее описанный набор тегов из data/places.json:
//   any — у места есть хотя бы один из тегов (природа, парк, сад…);
//   all — у места есть все эти теги («тихо», «свидание»…).
// Если по тегам нашлось меньше MIN_RESULTS мест, выборка расширяется до
// categories настроения — так карточка не показывает пустую ленту.
//
// Теги сверены с базой из 61 места (сентябрь 2026). При изменении базы
// проверьте, что у каждого настроения остаётся хотя бы MIN_RESULTS мест.

export const MIN_RESULTS = 4;

export const MOODS = [
  {
    id: 'quiet-nature',
    label: 'Тихая прогулка на природе',
    icon: 'leaf',
    photo: 'assets/images/moods/quiet-nature.jpg',
    bestAt: ['morning', 'day'],
    any: ['природа', 'парк', 'лес', 'сад'],
    all: ['тихо'],
    categories: ['nature']
  },
  {
    id: 'romantic-evening',
    label: 'Романтично вечером',
    icon: 'building-2',
    photo: 'assets/images/moods/romantic-evening.jpg',
    bestAt: ['evening'],
    any: ['вечер', 'ночь'],
    all: ['свидание'],
    categories: ['photo']
  },
  {
    id: 'culture-art',
    label: 'Культура и искусство',
    icon: 'palette',
    photo: 'assets/images/moods/culture-art.jpg',
    bestAt: ['day'],
    any: ['смотреть искусство', 'смотреть спектакль'],
    categories: ['art', 'theater']
  },
  {
    id: 'food',
    label: 'Вкусно поесть',
    icon: 'utensils',
    photo: 'assets/images/moods/food.jpg',
    bestAt: ['morning', 'evening'],
    any: ['есть', 'еда'],
    categories: ['food']
  },
  {
    id: 'friends',
    label: 'С друзьями',
    icon: 'users',
    photo: 'assets/images/moods/friends.jpg',
    bestAt: ['evening', 'night'],
    all: ['с друзьями'],
    categories: ['entertainment']
  }
];

const matchesMood = (place, mood) => {
  const tags = place.tags || [];
  return (!mood.any || mood.any.some((t) => tags.includes(t)))
    && (!mood.all || mood.all.every((t) => tags.includes(t)));
};

/**
 * Патч фильтров для feed.setFilters() под выбранное настроение: теги
 * настроения (tags — любой из any, tagsAll — все из all), а если мест
 * меньше MIN_RESULTS — категории настроения (запасной план).
 */
export function resolveMoodFilters(places, moodId) {
  const mood = MOODS.find((m) => m.id === moodId);
  const none = { category: 'all', query: '', tags: null, tagsAll: null };
  if (!mood) return none;
  if (places.filter((p) => matchesMood(p, mood)).length >= MIN_RESULTS) {
    return { ...none, tags: mood.any || null, tagsAll: mood.all || null };
  }
  return { ...none, category: mood.categories };
}

/** Настроения в порядке показа: подходящие текущему времени суток — первыми. */
export function moodsFor(daypart) {
  const fits = (m) => m.bestAt.includes(daypart);
  return [...MOODS.filter(fits), ...MOODS.filter((m) => !fits(m))];
}
