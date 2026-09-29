// pages/suggest.js — suggest.html: «Предложить место». Яндекс Форма
// открывается в окне по кнопке и грузится только при первом открытии
// (как собрать форму — docs/suggest-form.md).

import { createModal } from '../components/modal.js';

const SUGGEST_FORM_ID = '6ab90833e010db752e550dfc';
const FORM_URL = `https://forms.yandex.ru/u/${SUGGEST_FORM_ID}/`;
const YA_FORMS_EMBED = 'https://forms.yandex.ru/_static/embed.js';

function loadForm() {
  const frame = document.getElementById('suggest-frame');
  if (frame.src) return;
  frame.src = `${FORM_URL}?iframe=1`;
  // embed.js подгоняет высоту iframe под форму — без внутренней прокрутки
  const script = document.createElement('script');
  script.src = YA_FORMS_EMBED;
  script.async = true;
  document.head.append(script);
}

document.getElementById('suggest-fallback').href = FORM_URL;
const modal = createModal(document.getElementById('suggest-modal'), { onOpen: loadForm });
document.querySelectorAll('[data-suggest-open]').forEach((btn) => btn.addEventListener('click', () => modal.open()));
