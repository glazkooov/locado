// pages/collections.js — collections.html: все подборки с фильтром по формату.

import { $, on } from '../core/dom.js';
import { escapeHtml } from '../core/format.js';
import { loadCollections, COLLECTION_TYPES } from '../core/collections.js';
import { collectionCardHtml } from '../components/collection-card.js';

async function main() {
  const list = $('#collections-list');
  const filters = $('#collections-filters');
  let collections;
  try {
    collections = await loadCollections();
  } catch (err) {
    console.error('[collections] не удалось загрузить подборки:', err);
    list.innerHTML = '<p class="collections-index__empty">Не получилось загрузить подборки. Обнови страницу — обычно помогает.</p>';
    return;
  }

  const render = (type) => {
    const shown = type === 'all' ? collections : collections.filter((c) => c.type === type);
    list.innerHTML = shown.map(collectionCardHtml).join('');
    filters.querySelectorAll('.category-btn').forEach((b) => {
      const active = b.dataset.type === type;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  };

  // Фильтр нужен, только если форматов больше одного
  const types = [...new Set(collections.map((c) => c.type))].filter((t) => COLLECTION_TYPES[t]);
  if (types.length > 1) {
    filters.innerHTML = [['all', 'Все'], ...types.map((t) => [t, COLLECTION_TYPES[t]])]
      .map(([t, label]) => `<button type="button" class="category-btn" data-type="${t}" aria-pressed="false">${escapeHtml(label)}</button>`).join('');
    on(filters, 'click', '.category-btn', (e, btn) => render(btn.dataset.type));
  }
  render('all');
}

main();
