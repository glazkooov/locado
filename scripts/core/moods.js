// core/moods.js — словарь настроений для карточек в hero на главной.
//
// Настроение — это заранее описанный набор тегов из data/places.json:
//   any — у места есть хотя бы один из тегов (природа, парк, сад…);
//   all — у места есть все эти теги («тихо», «свидание»…).
// Если по тегам нашлось меньше MIN_RESULTS мест, выборка расширяется до
// categories настроения — так карточка не показывает пустую ленту.
//
// photo — фото одного из наших мест (assets/images/places/sm/): у них
// есть лицензия и подпись автора; сторонние картинки сюда не ставить.
//
// При изменении базы проверьте, что у каждого настроения остаётся хотя бы
// MIN_RESULTS мест.

import { getOpenStatus } from './format.js';

export const MIN_RESULTS = 4;

// Название — состояние, а не рубрика: «что хочется», глагол и то, что даёт
// город.
export const MOODS = [
  {
    id: 'quiet',
    label: 'Выдохнуть в тишине',
    color: '#2F6B57', // цвет дуотона карточки
    icon: 'leaf',
    photo: 'assets/images/places/sm/vorontsovsky-park.jpg', // фото места — подпись на странице «Фото на сайте»
    bestAt: ['morning', 'day'],
    any: ['природа', 'парк', 'лес', 'сад', 'скрыто'],
    all: ['тихо'],
    categories: ['nature']
  },
  {
    id: 'new',
    label: 'Открыть новое',
    color: '#5A3DB0', // цвет дуотона карточки
    icon: 'wand-sparkles',
    photo: 'assets/images/places/sm/park-huamin.jpg', // фото места — подпись на странице «Фото на сайте»
    bestAt: ['day'],
    any: ['необычно', 'скрыто'],
    categories: ['art', 'entertainment']
  },
  {
    id: 'love',
    label: 'Влюбиться в вечер',
    color: '#A8304F', // цвет дуотона карточки
    icon: 'heart',
    photo: 'assets/images/places/sm/krymskaya-naberezhnaya.jpg', // фото места — подпись на странице «Фото на сайте»
    bestAt: ['evening', 'night'],
    any: ['вечер', 'ночь'],
    all: ['свидание'],
    categories: ['photo']
  },
  {
    id: 'photo',
    label: 'Поймать кадр',
    color: '#C9741C', // цвет дуотона карточки
    icon: 'camera',
    photo: 'assets/images/places/sm/vorobyovy-gory.jpg', // фото места — подпись на странице «Фото на сайте»
    bestAt: ['day', 'evening'],
    any: ['красиво', 'эстетично', 'панорама', 'высота'],
    all: ['фотографировать'],
    categories: ['photo']
  },
  {
    id: 'city',
    label: 'Зарядиться городом',
    color: '#D9480F', // цвет дуотона карточки
    icon: 'users',
    photo: 'assets/images/places/sm/park-gorkogo.jpg', // фото места — подпись на странице «Фото на сайте»
    bestAt: ['evening', 'night'],
    any: ['оживлённо'],
    categories: ['entertainment', 'food']
  }
];

export const matchesMood = (place, mood) => {
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

// --- живые карточки: сколько мест, что открыто, с чего начать ---

const SOON_CLOSE = 60; // мин: закроется раньше — в «с чего начать» не зовём
// Где переждать непогоду — как в блоке «Сейчас» (core/now.js)
const sheltered = (p) => Boolean(p.indoor) || p.category === 'food';

/** Места настроения (по тегам, а если мало — по категориям). */
export function moodPlaces(places, mood) {
  const byTags = places.filter((p) => matchesMood(p, mood));
  return byTags.length >= MIN_RESULTS ? byTags : places.filter((p) => mood.categories.includes(p.category));
}

/** Открыто и не закрывается в ближайший час. */
function openForAWhile(place, now) {
  const s = getOpenStatus(place, now);
  if (!s.isOpen) return false;
  if (s.roundTheClock || !s.nextChangeAt) return true;
  return (s.nextChangeAt - now) / 6e4 >= SOON_CLOSE;
}

/**
 * Живые данные карточек: { [moodId]: { total, open, picks } } и порядок
 * настроений. В непогоду «подходит сейчас» — то, что под крышей.
 * daypart — 'morning' | 'day' | 'evening' | 'night', bad — непогода.
 */
export function moodsNow(places, { now = new Date(), daypart, bad = false } = {}) {
  const info = {};
  MOODS.forEach((mood) => {
    const list = moodPlaces(places, mood);
    const open = list.filter((p) => openForAWhile(p, now));
    const fit = bad ? open.filter(sheltered) : open;
    // С чего начать: подходящие сейчас, потом с тегом времени суток
    const dayTag = { morning: 'утро', day: 'день', evening: 'вечер', night: 'ночь' }[daypart];
    const ranked = [...fit].sort((a, b) => Number((b.tags || []).includes(dayTag)) - Number((a.tags || []).includes(dayTag)));
    info[mood.id] = { total: list.length, open: open.length, fit: fit.length, picks: ranked.slice(0, 3) };
  });
  // Порядок: сначала то, что подходит времени суток и где сейчас больше
  // подходящих мест; в дождь вперёд выходят настроения «под крышей»
  const score = (m) => (m.bestAt.includes(daypart) ? 100 : 0) * (bad ? 0.2 : 1) + info[m.id].fit * (bad ? 10 : 1);
  const order = [...MOODS].sort((a, b) => score(b) - score(a));
  return { info, order };
}
