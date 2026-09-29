// pages/suggest.js — suggest.html: «Предложить место» через Яндекс Форму.
// Форму создают в forms.yandex.ru и вписывают её id сюда. Пока id пустой,
// на странице — кнопка письма на почту: предложение всё равно дойдёт.

const SUGGEST_FORM_ID = '';
const YA_FORMS_EMBED = 'https://forms.yandex.ru/_static/embed.js';

const $ = (id) => document.getElementById(id);

function init() {
  if (!SUGGEST_FORM_ID) {
    $('suggest-mail').hidden = false;
    return;
  }
  const url = `https://forms.yandex.ru/u/${SUGGEST_FORM_ID}/`;
  $('suggest-frame').src = `${url}?iframe=1`;
  $('suggest-frame-wrap').hidden = false;
  $('suggest-fallback').href = url;
  $('suggest-fallback').hidden = false;
  // embed.js подгоняет высоту iframe под форму — без внутренней прокрутки
  const script = document.createElement('script');
  script.src = YA_FORMS_EMBED;
  script.async = true;
  document.head.append(script);
}

init();
