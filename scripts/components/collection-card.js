// components/collection-card.js — карточка подборки: главная, список
// подборок, страница места («Есть в подборках») и «Ещё подборки».
// Фото + тип, название, описание и плашки для выбора: сколько времени,
// сколько мест, бюджет. В широкой колонке (главная) — фото слева, в узкой
// (телефон, сетка из трёх) — сверху; решает container query в home.css.

import { escapeHtml, cssUrl, pluralize } from '../core/format.js';
import { collectionUrl, collectionPlaceSlugs, COLLECTION_TYPES } from '../core/collections.js';
import { icon } from '../core/icons.js';

function metaChips(collection) {
  const count = collectionPlaceSlugs(collection).length;
  const places = count && (collection.type === 'route'
    ? `${count} ${pluralize(count, ['остановка', 'остановки', 'остановок'])}`
    : `${count} ${pluralize(count, ['место', 'места', 'мест'])}`);
  const { duration, budget } = collection.meta || {};
  return [
    duration && `<span>${icon('clock')} ${escapeHtml(duration)}</span>`,
    places && `<span>${icon('map-pin')} ${escapeHtml(places)}</span>`,
    budget && `<span>${icon('ticket')} ${escapeHtml(budget)}</span>`
  ].filter(Boolean).join('');
}

/** Последнее слово названия — вместе со стрелкой, чтобы «→» не уезжала
 *  на отдельную строку (inline-block неразрывный пробел не держит). */
function titleHtml(title = '') {
  const i = title.lastIndexOf(' ');
  const arrow = '<span class="collection-title__arrow" aria-hidden="true">→</span>';
  return `${escapeHtml(title.slice(0, i + 1))}<span class="collection-title__end">${escapeHtml(title.slice(i + 1))}&nbsp;${arrow}</span>`;
}

export function collectionCardHtml(collection) {
  const type = COLLECTION_TYPES[collection.type] || '';
  return `
    <a class="collection-card" href="${collectionUrl(collection.slug)}">
      <span class="collection-card__inner">
        <span class="collection-card__photo" style='background-image: ${cssUrl(collection.coverSm || collection.cover)}' aria-hidden="true"></span>
        <span class="collection-card__body">
          <span class="collection-card__type">${escapeHtml(type)}</span>
          <span class="collection-title">${titleHtml(collection.title)}</span>
          <span class="collection-desc">${escapeHtml(collection.teaser || collection.lead || '')}</span>
          <span class="collection-card__meta">${metaChips(collection)}</span>
        </span>
      </span>
    </a>`;
}
