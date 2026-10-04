// core/credits.js — подписи к фото: автор, источник, лицензия. Данные —
// поле photoCredit у места (places.json) и у подборки (collections.json):
//   "photoCredit": { "author": "Денис Гришкин, mos.ru",
//                    "source": "https://foto.mos.ru/…",
//                    "license": "CC BY 4.0", "modified": true }
// author — как подписан снимок у источника; source — страница, откуда фото
// взято; license — из списка ниже (или без неё — для своих фото);
// modified — если фото кадрировали или меняли цвет (просто уменьшение
// размера изменением не считается).
//
// У всех мест уже стоит заготовка «редакция «Мосфото»» с пустым source:
// подпись с лицензией появляется на сайте, только когда вписана ссылка —
// без неё лицензию CC BY не соблюсти, а фото, может, ещё и нет.

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
