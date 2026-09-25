// components/feed.js — лента мест на главной: категории, поиск, пагинация
// (кнопка "Показать ещё N").

import { $, $$, on, toggleClear } from '../core/dom.js';
import { filterPlaces } from '../core/places.js';
import { pluralize } from '../core/format.js';
import { renderCards } from './card.js';
import { setPressed } from './category-buttons.js';

const PAGE_SIZE = 9;

export function initFeed(allPlaces, { pageSize = PAGE_SIZE } = {}) {
  const container = $('#places-container');
  if (!container) return null; // не на этой странице

  const showMoreBtn = $('#show-more-btn');
  const emptyBlock = $('#feed-empty');
  const endBlock = $('.feed-end');
  const activeBar = $('#feed-active');
  const activeLabel = $('#feed-active-label');
  const tabs = $$('.scroll__category-btn');

  // label — что выбрал пользователь вне ленты (настроение из hero, подборка):
  // { kind: 'Настроение', text: 'Тихая прогулка на природе' } или null.
  let state = { category: 'all', query: '', tags: null, label: null };
  let shown = 0;

  const filtered = () => filterPlaces(allPlaces, state);

  const syncTabs = () => {
    // Пока действует настроение из hero-pill (tags или список категорий),
    // ни одна вкладка не подсвечивается — иначе «Все» выглядела бы активной
    // при уже отфильтрованной ленте.
    const moodActive = Boolean(state.tags) || Array.isArray(state.category);
    setPressed(tabs, (btn) => !moodActive && btn.dataset.category === state.category);
  };

  // Плашка над лентой: после клика по настроению/подборке страница уезжает
  // далеко вниз, и без неё непонятно, почему лента отфильтрована.
  const syncActiveBar = (count) => {
    if (!activeBar) return;
    activeBar.hidden = !state.label;
    if (!state.label || !activeLabel) return;
    activeLabel.textContent = `${state.label.kind}: ${state.label.text} · ${count} ${pluralize(count, ['место', 'места', 'мест'])}`;
  };

  const renderPage = (reset) => {
    const list = filtered();
    syncActiveBar(list.length);
    if (emptyBlock) emptyBlock.hidden = list.length > 0;
    // «Это все места» уместно только после непустой ленты — иначе рядом
    // с «Пока ничего не нашли» получалось два противоречащих сообщения.
    if (endBlock) endBlock.hidden = list.length === 0;

    if (reset) {
      shown = Math.min(pageSize, list.length);
      renderCards(container, list.slice(0, shown));
    } else {
      const next = list.slice(shown, shown + pageSize);
      if (next.length) {
        renderCards(container, next, { append: true });
        shown += next.length;
      }
    }
    if (showMoreBtn) {
      const rest = list.length - shown;
      showMoreBtn.classList.toggle('invisible', rest <= 0);
      showMoreBtn.textContent = `Показать ещё ${Math.min(rest, pageSize)}`;
    }
  };

  const loadMore = () => renderPage(false);

  const setFilters = (next, { syncInput = false, label = null } = {}) => {
    state = { ...state, ...next, label };
    syncTabs();
    if (syncInput) {
      const input = $('#categories-search-input');
      const clearBtn = $('#categories-clear-btn');
      if (input && typeof next.query === 'string') {
        input.value = next.query;
        toggleClear(input, clearBtn);
      }
    }
    renderPage(true);
  };

  // Явный клик по категории/ручной ввод в поиске отменяет ранее выбранное
  // настроение (tags), иначе старый фильтр pill'а продолжал бы действовать
  // «невидимо» поверх нового выбора.
  const setCategory = (category) => setFilters({ category, tags: null });
  // Если настроение сработало через запасной план (список категорий), ручной
  // поиск тоже его сбрасывает — иначе текст искался бы только внутри
  // невидимого набора категорий этого настроения.
  const setQuery = (query) => setFilters({
    query,
    tags: null,
    ...(Array.isArray(state.category) ? { category: 'all' } : {})
  });
  const reset = () => setFilters({ category: 'all', query: '', tags: null }, { syncInput: true });

  // --- UI: вкладки категорий ---
  on($('#categories-scroll'), 'click', '.scroll__category-btn', (e, btn) => {
    e.preventDefault();
    setCategory(btn.dataset.category);
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  });

  // --- UI: поиск в ленте (debounce) ---
  const searchInput = $('#categories-search-input');
  const searchClear = $('#categories-clear-btn');
  if (searchInput) {
    let timer;
    on(searchInput, 'input', (e) => {
      toggleClear(searchInput, searchClear);
      clearTimeout(timer);
      timer = setTimeout(() => setQuery(e.target.value), 250);
    });
  }
  if (searchClear) {
    on(searchClear, 'click', () => {
      searchInput.value = '';
      toggleClear(searchInput, searchClear);
      setQuery('');
      searchInput.focus();
    });
  }

  // --- UI: пустое состояние ---
  on($('#feed-reset-btn'), 'click', reset);
  on($('#feed-active-reset'), 'click', reset);

  // --- UI: "Показать ещё" ---
  // Без автоподгрузки: пользователь сам решает, листать ли дальше, и
  // может спокойно долистать до футера.
  on(showMoreBtn, 'click', loadMore);

  renderPage(true);

  return { setFilters, setCategory, setQuery, reset };
}
