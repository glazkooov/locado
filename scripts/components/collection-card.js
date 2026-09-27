// components/collection-card.js — карточка подборки: главная, страница места
// («Есть в подборках») и конец страницы подборки («Ещё подборки»).

import { escapeHtml, cssUrl } from '../core/format.js';
import { collectionUrl, COLLECTION_TYPES } from '../core/collections.js';

export function collectionCardHtml(collection) {
  const type = COLLECTION_TYPES[collection.type] || '';
  return `
    <a class="collection-card" href="${collectionUrl(collection.slug)}" style='background-image: ${cssUrl(collection.coverSm || collection.cover)}'>
      <span class="collection-card__type">${escapeHtml(type)}</span>
      <h3 class="collection-title">${escapeHtml(collection.title)}</h3>
      <p class="collection-desc">${escapeHtml(collection.teaser || collection.lead || '')}</p>
      <span class="collection-btn">Читать</span>
    </a>`;
}
