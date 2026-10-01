// core/analytics.js — Яндекс Метрика. Загружается только после согласия
// на cookie («Хорошо» на плашке, components/consent.js); без согласия на
// сайт не попадает ни строчки кода Метрики.
//
// Цели: сайт отправляет событие (goal('route_click')), а в кабинете
// Метрики цель с таким идентификатором заводится вручную — «JavaScript-
// событие». Список — docs/analytics.md.

import { categoryLabel } from './places.js';
import { onAnalyticsConsent } from '../components/consent.js';

const COUNTER_ID = 113169704;
const TAG_URL = 'https://mc.yandex.ru/metrika/tag.js';

let started = false;

function start() {
  if (started) return;
  started = true;
  // Очередь вызовов, пока грузится tag.js: цели не теряются — Метрика
  // заберёт их, когда загрузится
  window.ym = window.ym || function ym(...args) { (window.ym.a = window.ym.a || []).push(args); };
  window.ym.l = Date.now();
  const script = document.createElement('script');
  script.src = TAG_URL;
  script.async = true;
  document.head.append(script);
  window.ym(COUNTER_ID, 'init', {
    clickmap: true, // карта кликов
    trackLinks: true, // переходы по внешним ссылкам и скачивания
    accurateTrackBounce: true, // отказ — меньше 15 секунд на странице
    webvisor: false // запись действий выключена: её пришлось бы отдельно описывать в политике
  });
}

export function initAnalytics() {
  onAnalyticsConsent(start);
}

/** Выбор раздела: в отчёте «Параметры визитов» — дерево
 *  «Раздел → Еда → Лента»: что выбирают и откуда. «Все» не считаем. */
export function categoryGoal(category, from) {
  if (!category || category === 'all') return;
  goal('category_select', { 'Раздел': { [categoryLabel(category)]: from } });
}

/** Достижение цели. params — подробности, видны в отчёте «Параметры
 *  визитов». Без согласия на cookie ничего не делает и ничего не копит. */
export function goal(name, params) {
  if (started) window.ym(COUNTER_ID, 'reachGoal', name, params);
}
