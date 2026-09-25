// components/feed.js — лента мест на главной: категории, поиск, пагинация
// (кнопка "Показать ещё" + автоподгрузка через IntersectionObserver).

import { $, $$, on, toggleClear } from '../core/dom.js';
import { filterPlaces } from '../core/places.js';
import { renderCards } from './card.js';

const PAGE_SIZE = 9;

export function initFeed(allPlaces, { pageSize = PAGE_SIZE } = {}) {
  const container = $('#places-container');
  if (!container) return null; // не на этой странице

  const showMoreBtn = $('#show-more-btn');
  const emptyBlock = $('#feed-empty');
  const tabs = $$('.scroll__category-btn');

  let state = { category: 'all', query: '', tags: null };
  let shown = 0;
  let isLoading = false;

  const filtered = () => filterPlaces(allPlaces, state);

  const syncTabs = () => {
    // Пока действует настроение из hero-pill (tags или список категорий),
    // ни одна вкладка не подсвечивается — иначе «Все» выглядела бы активной
    // при уже отфильтрованной ленте.
    const moodActive = Boolean(state.tags) || Array.isArray(state.category);
    tabs.forEach((btn) => {
      const active = !moodActive && btn.dataset.category === state.category;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
  };

  const renderPage = (reset) => {
    const list = filtered();
    if (emptyBlock) emptyBlock.hidden = list.length > 0;

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
    if (showMoreBtn) showMoreBtn.classList.toggle('invisible', shown >= list.length);
  };

  const loadMore = () => {
    if (isLoading) return;
    isLoading = true;
    renderPage(false);
    isLoading = false;
  };

  const setFilters = (next, { syncInput = false } = {}) => {
    state = { ...state, ...next };
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

  // --- UI: "Показать ещё" + автоподгрузка ---
  if (showMoreBtn) {
    on(showMoreBtn, 'click', loadMore);
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !showMoreBtn.classList.contains('invisible')) loadMore();
    }, { rootMargin: '200px', threshold: 0.1 });
    observer.observe(showMoreBtn);
  }

  renderPage(true);

  return { setFilters, setCategory, setQuery, reset };
}
