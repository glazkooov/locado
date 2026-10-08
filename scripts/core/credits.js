// core/credits.js — подписи к фото: автор, источник, лицензия. Данные —
// поле photoCredit у места (places.json) и у подборки (collections.json).
//
// Фото с foto.mos.ru (соглашение фотобанка, п. 4.5.2 — «mos.ru» с активной
// ссылкой на mos.ru; Creative Commons тут ни при чём, лицензию не пишем):
//   "photoCredit": { "author": "mos.ru", "source": "https://www.mos.ru/" }
// Когда есть ссылка на страницу самого снимка — source меняем на неё.
//
// Другие источники, например Wikimedia Commons:
//   "photoCredit": { "author": "Имя Фамилия", "source": "https://…",
//                    "license": "CC BY-SA 4.0", "modified": true }
// license — из списка ниже, ссылку на текст подставит сайт; modified — если
// фото кадрировали или меняли цвет (уменьшение размера не считается).
// Свои фото: { "author": "Локадо" }.

import { escapeHtml } from './format.js';

// Ссылки на тексты лицензий — вписывать в данные не нужно
export const LICENSES = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/deed.ru',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/deed.ru',
  'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/deed.ru',
  'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/deed.ru',
  'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/deed.ru'
};

const link = (text, href) => (href
  ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`
  : escapeHtml(text));

/** Подпись готова к показу: есть автор, а у фото по лицензии — и ссылка. */
export const hasCredit = (credit) => Boolean(credit?.author && (credit.source || !credit.license));

/** «Фото: автор · CC BY 4.0 · изменено» со ссылками; '' — если подписи нет. */
export function creditHtml(credit) {
  if (!hasCredit(credit)) return '';
  const parts = [`Фото: ${link(credit.author, credit.source)}`];
  if (credit.license) parts.push(link(credit.license, LICENSES[credit.license]));
  if (credit.modified) parts.push('изменено');
  return parts.join(' · ');
}

/** Подпись под первым экраном страницы (place, collection). */
export function renderCredit(el, credit) {
  if (!el) return;
  const html = creditHtml(credit);
  el.innerHTML = html;
  el.hidden = !html;
}
