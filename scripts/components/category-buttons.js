// components/category-buttons.js — рендер всех наборов кнопок категорий
// на главной из одного словаря CATEGORIES (core/places.js). Раньше каждый
// набор был написан в index.html вручную, и названия/порядок/иконки
// расходились («Музеи» / «Искусство», «Театр» / «Театры»).

import { $ } from '../core/dom.js';
import { CATEGORIES } from '../core/places.js';
import { pluralize } from '../core/format.js';

const ALL_ICON = 'fa-map-marker-alt';

function iconHtml(icon, extraClass = '') {
  return `<i class="fas ${icon}${extraClass ? ` ${extraClass}` : ''}" aria-hidden="true"></i>`;
}

/** Кнопки-фильтры: «Все» + категории. Выбранная помечается .active и aria-pressed. */
function chipsHtml({ className, allLabel }) {
  const items = [['all', { label: allLabel, icon: ALL_ICON }], ...Object.entries(CATEGORIES)];
  return items.map(([key, meta]) => {
    const active = key === 'all';
    return `<button type="button" data-category="${key}" class="${className}${active ? ' active' : ''}" aria-pressed="${active}">`
      + `${iconHtml(meta.icon)} ${meta.label}</button>`;
  }).join('');
}

/** Плитки раздела «Категории и подборки». */
function tilesHtml() {
  return Object.entries(CATEGORIES).map(([key, meta]) => `
    <button type="button" class="category-masonry ${key}" data-category="${key}">
      <span class="masonry-bg-shape" aria-hidden="true"></span>
      ${iconHtml(meta.icon, 'masonry-icon')}
      <span class="masonry-label">${meta.label}</span>
    </button>`).join('');
}

export function renderCategoryButtons() {
  const fill = (selector, html) => { const el = $(selector); if (el) el.innerHTML = html; };
  fill('#categoryGrid', tilesHtml());
  fill('#map-categories', chipsHtml({ className: 'category-btn map__categories-button', allLabel: 'Все места' }));
  fill('#categories-scroll', chipsHtml({ className: 'category-btn scroll__category-btn', allLabel: 'Все' }));
  fill('#randomizer-categories', chipsHtml({ className: 'chip', allLabel: 'Любая' }));
}

/** «13 мест» на плитках категорий — после загрузки базы. */
export function renderCategoryCounts(places) {
  document.querySelectorAll('.category-masonry[data-category]').forEach((tile) => {
    const n = places.filter((p) => p.category === tile.dataset.category).length;
    tile.querySelector('.masonry-count')?.remove();
    if (!n) return;
    tile.insertAdjacentHTML('beforeend', `<span class="masonry-count">${n} ${pluralize(n, ['место', 'места', 'мест'])}</span>`);
  });
}

/** Переключает .active / aria-pressed в наборе кнопок. */
export function setPressed(buttons, isActive) {
  buttons.forEach((btn) => {
    const active = isActive(btn);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}
