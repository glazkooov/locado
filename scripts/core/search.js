// core/search.js — поиск мест для ленты и карты. Без библиотек:
// - каждое слово запроса ищется отдельно, место должно подойти по всем;
// - окончания отсекаются: «парки», «музеи», «свидания» находят «парк»…;
// - совпадение считается только с начала слова: «бар» не находит «барокко»;
// - ё = е, регистр не важен;
// - бытовые слова переводятся словарём (search-words.js): «кафе» → еда;
// - набранное в английской раскладке («gfhr») пробуем как русское;
// - порядок: совпадение в названии выше, чем в описании.

import { SYNONYMS, STOP_WORDS, NOTES } from './search-words.js';
import { inCategory } from './places.js';

/** Нижний регистр, ё → е, всё кроме букв и цифр — пробел. */
export const normalizeText = (s = '') =>
  String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^0-9a-zа-я]+/g, ' ').trim();

// Окончания — от длинных к коротким; основа не короче трёх букв
const ENDINGS = [
  'иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'иях',
  'ах', 'ях', 'ов', 'ев', 'ей', 'ий', 'ый', 'ой', 'ая', 'яя', 'ое', 'ее',
  'ие', 'ые', 'ую', 'юю', 'ом', 'ем', 'ам', 'ям', 'ых', 'их', 'ию', 'ия',
  'ье', 'ья', 'ми', 'ы', 'и', 'а', 'я', 'о', 'е', 'у', 'ю', 'ь', 'й'
];

export function stem(word) {
  if (word.length < 4) return word;
  for (const end of ENDINGS) {
    if (word.endsWith(end) && word.length - end.length >= 3) return word.slice(0, -end.length);
  }
  return word;
}

// Словарь — по основам, чтобы ключ находился в любой форме
const normSynonyms = new Map();
Object.entries(SYNONYMS).forEach(([key, targets]) => {
  normSynonyms.set(normalizeText(key).split(' ').map(stem).join(' '), targets);
});
const stopWords = new Set(STOP_WORDS.map((w) => stem(normalizeText(w))));
const phraseKeys = [...normSynonyms.keys()].filter((k) => k.includes(' ')).sort((a, b) => b.length - a.length);

// Английская раскладка → русская
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
const fromLatin = (s) => s.toLowerCase().split('').map((c) => {
  const i = EN.indexOf(c);
  return i === -1 ? c : RU[i];
}).join('');

// Поля места с весом: чем важнее поле, тем выше место в выдаче
// Метро не ищем: для него на карте свой фильтр, а в поиске оно смешивало
// «где» и «что» («Таганская» находила всё вокруг станции)
const FIELD_WEIGHTS = { name: 6, type: 5, category: 4, tags: 3, price: 2, description: 1.5, address: 1, more: 0.5 };

const index = new WeakMap();
function fieldsOf(place, categoryLabel) {
  let f = index.get(place);
  if (f) return f;
  const raw = {
    name: place.name,
    type: place.type,
    category: categoryLabel(place.category),
    tags: (place.tags || []).join(' | '),
    // «бесплатно» — и по price_level, не только по тексту цены
    price: `${place.price || ''} ${place.price_level === 'free' ? 'бесплатно' : ''}`,
    description: place.description,
    address: place.address,
    more: place.description_long
  };
  f = {};
  Object.entries(raw).forEach(([k, v]) => {
    const text = normalizeText(v || '');
    const words = text.split(' ').filter(Boolean);
    f[k] = { text: ` ${text} `, words, stems: words.map(stem) };
  });
  index.set(place, f);
  return f;
}

/** Вес лучшего совпадения варианта (основы или слова из словаря) в полях. */
function matchScore(place, fields, alt) {
  if (alt.startsWith('cat:')) return inCategory(place, alt.slice(4)) ? FIELD_WEIGHTS.category : 0;
  let best = 0;
  const multi = alt.includes(' ');
  for (const [key, { text, words }] of Object.entries(fields)) {
    const w = FIELD_WEIGHTS[key];
    if (w <= best) continue;
    const hit = multi ? text.includes(` ${alt}`) : words.some((word) => word.startsWith(alt));
    if (hit) best = w;
  }
  return best;
}

/** Запрос → группы вариантов: место должно подойти хотя бы по одному
 *  варианту из каждой группы. */
function parseQuery(query) {
  let q = ` ${normalizeText(query).split(' ').map(stem).join(' ')} `;
  const groups = [];
  const noteKeys = new Set();
  // Сначала ключи-фразы («вид на город»)
  phraseKeys.forEach((key) => {
    if (q.includes(` ${key} `)) {
      groups.push(normSynonyms.get(key).map((t) => (t.startsWith('cat:') ? t : normalizeText(t))));
      noteKeys.add(key);
      q = q.replace(` ${key} `, ' ');
    }
  });
  q.trim().split(' ').filter(Boolean).forEach((token) => {
    if (stopWords.has(token)) return;
    const syn = normSynonyms.get(token);
    if (syn) {
      noteKeys.add(token);
      // Слово из словаря ищется по словарю. Само слово — только целиком
      // («бар» не находит «барокко») и только если словарь не ограничивает
      // поиск разделом: «кафе» — строго «Еда», а не театр со словом «кафе»
      // в описании
      const onlyCategory = syn.length > 0 && syn.every((t) => t.startsWith('cat:'));
      // '=бар' в словаре — только целое слово, как и само слово запроса
      const alts = syn.map((t) => {
        if (t.startsWith('cat:')) return t;
        if (t.startsWith('=')) return `=${stem(normalizeText(t.slice(1)))}`;
        return stem(normalizeText(t));
      });
      groups.push(onlyCategory ? alts : [`=${token}`, ...alts]);
    } else {
      groups.push([token]);
    }
  });
  return { groups, noteKeys };
}

function rank(places, groups, categoryLabel) {
  const scored = [];
  places.forEach((place, order) => {
    const fields = fieldsOf(place, categoryLabel);
    let total = 0;
    for (const alts of groups) {
      let best = 0;
      for (const alt of alts) {
        const s = alt.startsWith('=')
          ? Math.max(...Object.entries(fields).map(([k, { stems }]) => (stems.includes(alt.slice(1)) ? FIELD_WEIGHTS[k] : 0)))
          : matchScore(place, fields, alt);
        if (s > best) best = s;
      }
      if (!best) return; // не подошло по одному из слов — место не показываем
      total += best;
    }
    scored.push({ place, total, order });
  });
  scored.sort((a, b) => b.total - a.total || a.order - b.order);
  return scored.map((x) => x.place);
}

/** Поиск с порядком по важности совпадения. Возвращает { list, note,
 *  suggest, corrected } — note: честная подсказка («кафе у нас пока нет…»),
 *  suggest: текст ссылки на «Предложить место» для пустого результата,
 *  corrected: запрос, переведённый из английской раскладки. */
export function searchPlaces(places, query, { categoryLabel = (c) => c } = {}) {
  if (!normalizeText(query)) return { list: places, note: '', suggest: '', corrected: '' };
  let { groups, noteKeys } = parseQuery(query);
  if (!groups.length) return { list: places, note: '', suggest: '', corrected: '' };
  let list = rank(places, groups, categoryLabel);
  let corrected = '';
  if (!list.length && /[a-z]/i.test(query) && !/[а-яё]/i.test(query)) {
    corrected = fromLatin(query);
    ({ groups, noteKeys } = parseQuery(corrected));
    list = groups.length ? rank(places, groups, categoryLabel) : [];
    if (!list.length) corrected = '';
  }
  const stems = (words) => words.map((w) => stem(normalizeText(w)));
  const found = NOTES.find((n) => stems(n.words).some((w) => noteKeys.has(w)));
  return { list, note: found?.text || '', suggest: found?.suggest || '', corrected };
}
