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
  'CC BY 2.0': 'https://creativecommons.org/licenses/by/2.0/deed.ru',
  'CC BY-SA 2.0': 'https://creativecommons.org/licenses/by-sa/2.0/deed.ru',
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

/** Подпись, свёрнутая в значок «i»: по нажатию раскрывается «Фото: …».
 *  Так подпись не спорит с фото, но всегда в одном нажатии — этого хватает
 *  и Creative Commons («любым разумным способом»), и foto.mos.ru (источник
 *  со ссылкой на странице). Открыто видны все подписи на странице «Фото на сайте». */
export function creditToggleHtml(credit) {
  const html = creditHtml(credit);
  if (!html) return '';
  initCreditToggles();
  return `<span class="credit-text" hidden>${html}</span>`
    + '<button type="button" class="credit-toggle" aria-expanded="false" aria-label="Автор фото">'
    + '<span aria-hidden="true">i</span></button>';
}

/** Подпись под первым экраном страницы (place, collection). */
export function renderCredit(el, credit) {
  if (!el) return;
  const html = creditToggleHtml(credit);
  el.innerHTML = html;
  el.hidden = !html;
}

function setOpen(btn, open) {
  btn.setAttribute('aria-expanded', String(open));
  btn.previousElementSibling.hidden = !open;
  btn.closest('.photo-credit')?.classList.toggle('is-open', open);
}

const openToggles = () => document.querySelectorAll('.credit-toggle[aria-expanded="true"]');

// Один обработчик на страницу: «i» открывает подпись, нажатие мимо или Esc — закрывает
let ready = false;
function initCreditToggles() {
  if (ready) return;
  ready = true;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.credit-toggle');
    if (e.target.closest('.credit-text')) return; // клик по ссылке в подписи
    openToggles().forEach((b) => { if (b !== btn) setOpen(b, false); });
    if (btn) setOpen(btn, btn.getAttribute('aria-expanded') !== 'true');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    openToggles().forEach((b) => { setOpen(b, false); b.focus(); });
  });
}
