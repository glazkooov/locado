// pages/suggest.js — suggest.html: «Предложить место» через Яндекс Форму
// (как собрать форму — docs/suggest-form.md).

const SUGGEST_FORM_ID = '6ab90833e010db752e550dfc';
const FORM_URL = `https://forms.yandex.ru/u/${SUGGEST_FORM_ID}/`;
const YA_FORMS_EMBED = 'https://forms.yandex.ru/_static/embed.js';

document.getElementById('suggest-frame').src = `${FORM_URL}?iframe=1`;
document.getElementById('suggest-fallback').href = FORM_URL;

// embed.js подгоняет высоту iframe под форму — без внутренней прокрутки
const script = document.createElement('script');
script.src = YA_FORMS_EMBED;
script.async = true;
document.head.append(script);
