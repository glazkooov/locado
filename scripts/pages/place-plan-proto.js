// pages/place-plan-proto.js — прототип вида «Маршрут отсюда» (задача 71).
// Вариант — параметром ?plan=a|b|v|g|d|e|zh; без параметра — как на сайте.
// После выбора оставить один вариант, файл убрать.

import { escapeHtml } from '../core/format.js';

const VARIANTS = ['a', 'b', 'v', 'g', 'd', 'e', 'zh'];
const param = new URLSearchParams(window.location.search).get('plan');
export const planVariant = VARIANTS.includes(param) ? param : null;

const photoUrl = (p) => escapeHtml(p.photoSm || p.photo || '');
const name = (p) => escapeHtml(p.name);
const img = (p, cls = '') => `<img class="${cls}" src="${photoUrl(p)}" alt="" loading="lazy">`;

function open(cls, inner) {
  return `<button type="button" class="similar-card plan-card plan-x plan-x--${cls}" id="nearby-plan-open" aria-haspopup="dialog">${inner}</button>`;
}

/** Карточка плана в ряду для вариантов А, Б, В, Д, Е. Г и Ж — не карточка. */
export function planCardProtoHtml(variant, here, { s1, s2 }) {
  const chip = '<span class="plan-x__chip">Готовый план</span>';
  if (variant === 'a') {
    return open('a', `
      <span class="plan-x__cover">${img(s1.place)}</span>
      <span class="plan-x__shade"></span>
      ${chip}
      <span class="plan-x__over">
        <span class="plan-x__title">Маршрут отсюда</span>
        <span class="plan-x__sub">${name(s1.place)} → ${name(s2.place)}</span>
      </span>`);
  }
  if (variant === 'b') {
    const dot = (p, label) => `<li><span class="plan-x__dot"></span><span><small>${label}</small>${name(p)}</span></li>`;
    return open('b', `
      ${chip}
      <span class="plan-x__title">Маршрут отсюда</span>
      <ol class="plan-x__path">${dot(here, 'Ты здесь')}${dot(s1.place, 'Потом')}${dot(s2.place, 'И ещё')}</ol>`);
  }
  if (variant === 'v') {
    return open('v', `
      <span class="plan-x__circles">${[here, s1.place, s2.place].map((p) => `<span class="plan-x__circle">${img(p)}</span>`).join('')}</span>
      <span class="info">
        <span class="plan-x__title">Маршрут отсюда</span>
        <span class="plan-x__sub">${name(s1.place)} → ${name(s2.place)}</span>
      </span>`);
  }
  if (variant === 'd') {
    return open('d', `
      <span class="plan-x__map">
        <svg viewBox="0 0 240 160" aria-hidden="true" focusable="false">
          <path d="M34 122 C 70 40, 120 150, 150 82 S 200 30, 212 44" />
          <circle cx="34" cy="122" r="9" /><circle cx="150" cy="82" r="9" /><circle cx="212" cy="44" r="9" />
          <text x="34" y="126">1</text><text x="150" y="86">2</text><text x="212" y="48">3</text>
        </svg>
        ${chip}
      </span>
      <span class="info">
        <span class="plan-x__title">Маршрут отсюда</span>
        <span class="plan-x__sub">${name(s1.place)} → ${name(s2.place)}</span>
      </span>`);
  }
  // e — «билет»
  const stop = (p, n) => `<li><span class="plan-x__num">${n}</span><span>${name(p)}</span></li>`;
  return open('e', `
    <span class="plan-x__head"><small>Готовый план</small>Маршрут отсюда</span>
    <ol class="plan-x__stops">${stop(here, 1)}${stop(s1.place, 2)}${stop(s2.place, 3)}</ol>`);
}

/** Г: тёмная полоса над рядом. */
export function planStripHtml({ s1, s2 }) {
  return `
    <button type="button" class="plan-strip" id="nearby-plan-open" aria-haspopup="dialog">
      <span class="plan-strip__label">Готовый план отсюда:</span>
      <span class="plan-strip__route">${name(s1.place)} → ${name(s2.place)}</span>
      <span class="plan-strip__arrow" aria-hidden="true">→</span>
    </button>`;
}

/** Ж: номер остановки поверх обычной карточки места. */
export function numberCard(html, n) {
  return html.replace('class="similar-card"', `class="similar-card plan-num" data-num="${n}"`);
}

/** Ж: последняя карточка вкладки — открыть весь план. */
export const planTabEndHtml = `
  <button type="button" class="similar-card similar-card--more plan-x--end" id="nearby-plan-open" aria-haspopup="dialog">
    <span class="similar-card__more-label">Весь план</span>
    <span class="similar-card__more-title">Проложить путь →</span>
  </button>`;
