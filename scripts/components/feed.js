// components/feed.js — лента мест на главной: категории, поиск, бесконечная
// подгрузка и раскладка «как в Pinterest» (колонки разной высоты).

import { $, $$, on, toggleClear } from '../core/dom.js';
import { filterPlaces } from '../core/places.js';
import { pluralize } from '../core/format.js';
import * as Storage from '../core/storage.js';
import { cardHtml } from './card.js';
import { setPressed } from './category-buttons.js';

// 12 делится на 2, 3 и 4 колонки — страница заполняет ряды ровно
const PAGE_SIZE = 12;

// Пропорции карточек (высота / ширина) — классы .place-card--r0…r4 в
// card.css. По ним без замеров DOM знаем высоту каждой колонки.
const CARD_RATIOS = [5 / 4, 4 / 3, 1, 1.4, 4 / 5];

/** Пропорция карточки зависит от самого места (простой хеш slug): у места
 *  одна и та же форма при любом фильтре, а соседние карточки различаются. */
function ratioIndex(slug = '') {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  return hash % CARD_RATIOS.length;
}

// Состояние ленты на время ухода со страницы — чтобы «Назад» из места
// вернул ту же ленту и ту же позицию, а не собрал её заново с начала
const SNAPSHOT_KEY = 'locado:feed';

const readSnapshot = () => {
  try { return JSON.parse(sessionStorage.getItem(SNAPSHOT_KEY)); } catch (e) { return null; }
};
const writeSnapshot = (snapshot) => {
  try { sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot)); } catch (e) { /* приватный режим */ }
};
const isBackForward = () => performance.getEntriesByType?.('navigation')[0]?.type === 'back_forward';

// Подгружаем следующую страницу заранее, пока до конца ленты ещё ~2 экрана
const PRELOAD_MARGIN = 800;

// Сама лента подгружает первые 36 карточек (3 страницы: ~5–6 экранов на
// телефоне, ~4–5 на компьютере; делится на 2, 3 и 4 колонки). Дальше —
// кнопка «Показать ещё» и под ней подвал. Кто нажал кнопку, тот хочет
// листать: после этого лента подгружается сама до конца, без новых пауз.
// При смене фильтра счётчик начинается заново. Порог не зависит от размера
// базы — при 100 и при 500 местах он тот же.
const AUTO_LOAD_LIMIT = 36;

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
  let state = { category: 'all', query: '', tags: null, tagsAll: null, label: null };
  let shown = 0;
  let list = [];
  let autoUnlocked = false; // пользователь нажал «Показать ещё» — дальше без пауз

  // --- Раскладка по колонкам ---
  // Не CSS column-count: при подгрузке он перераскладывает всё заново, и уже
  // показанные карточки прыгают между колонками. Здесь каждая новая карточка
  // встаёт в самую короткую колонку, а старые остаются на месте. Число
  // колонок задаёт CSS (grid-template-columns у .places-grid).
  let columns = [];
  let heights = [];
  const columnCount = () => getComputedStyle(container).gridTemplateColumns.split(' ').length || 1;

  const resetColumns = () => {
    container.innerHTML = Array.from({ length: columnCount() }, () => '<div class="places-grid__col"></div>').join('');
    columns = [...container.children];
    heights = columns.map(() => 0);
  };

  const appendCards = (places) => {
    const favorites = Storage.getFavorites();
    places.forEach((place) => {
      const ratio = ratioIndex(place.slug);
      const col = heights.indexOf(Math.min(...heights));
      columns[col].insertAdjacentHTML('beforeend', cardHtml(place, favorites.includes(place.slug), `place-card--r${ratio}`));
      heights[col] += CARD_RATIOS[ratio];
    });
  };

  const filtered = () => filterPlaces(allPlaces, state);

  const syncTabs = () => {
    // Пока действует настроение из hero-pill (tags или список категорий),
    // ни одна вкладка не подсвечивается — иначе «Все» выглядела бы активной
    // при уже отфильтрованной ленте.
    const moodActive = Boolean(state.tags || state.tagsAll) || Array.isArray(state.category);
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
    if (reset) list = filtered();
    syncActiveBar(list.length);
    if (emptyBlock) emptyBlock.hidden = list.length > 0;
    // «Это все места» уместно только после непустой ленты — иначе рядом
    // с «Пока ничего не нашли» получалось два противоречащих сообщения.
    if (endBlock) endBlock.hidden = list.length === 0;

    if (reset) {
      resetColumns();
      shown = 0;
      autoUnlocked = false;
    }
    const next = list.slice(shown, shown + pageSize);
    appendCards(next);
    shown += next.length;

    if (showMoreBtn) {
      const rest = list.length - shown;
      showMoreBtn.classList.toggle('invisible', rest <= 0);
      showMoreBtn.textContent = `Показать ещё ${Math.min(rest, pageSize)}`;
    }
    requestAnimationFrame(maybeLoadMore);
  };

  const loadMore = () => { if (shown < list.length) renderPage(false); };

  const canAutoLoad = () => autoUnlocked || shown < AUTO_LOAD_LIMIT;
  const autoLoadMore = () => { if (canAutoLoad()) loadMore(); };

  // Бесконечная лента: когда конец ленты близко, подгружаем следующую
  // страницу. Проверяем и после каждой подгрузки — если карточки короткие и
  // конец всё ещё на экране, IntersectionObserver второй раз не сработает.
  function maybeLoadMore() {
    if (!showMoreBtn || shown >= list.length || !canAutoLoad()) return;
    if (showMoreBtn.getBoundingClientRect().top < window.innerHeight + PRELOAD_MARGIN) loadMore();
  }

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
  const setCategory = (category) => setFilters({ category, tags: null, tagsAll: null });
  // Если настроение сработало через запасной план (список категорий), ручной
  // поиск тоже его сбрасывает — иначе текст искался бы только внутри
  // невидимого набора категорий этого настроения.
  const setQuery = (query) => setFilters({
    query,
    tags: null,
    tagsAll: null,
    ...(Array.isArray(state.category) ? { category: 'all' } : {})
  });
  const reset = () => setFilters({ category: 'all', query: '', tags: null, tagsAll: null }, { syncInput: true });

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

  // --- UI: бесконечная подгрузка ---
  // Кнопка «Показать ещё» — пауза после AUTO_LOAD_LIMIT карточек, а также
  // запасной вариант для клавиатуры и браузеров без IntersectionObserver.
  on(showMoreBtn, 'click', () => { autoUnlocked = true; loadMore(); });
  if (showMoreBtn && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) autoLoadMore();
    }, { rootMargin: `0px 0px ${PRELOAD_MARGIN}px 0px` }).observe(showMoreBtn);
  }

  // --- UI: смена числа колонок (поворот телефона, ресайз окна) ---
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (columnCount() === columns.length) return;
      const count = shown;
      resetColumns();
      appendCards(list.slice(0, count));
    }, 150);
  }, { passive: true });

  // --- Возврат «Назад» из места ---
  // Снимок пишем при уходе со страницы. Если браузер вернул страницу из
  // bfcache, код не перезапускается и всё и так на месте; иначе (страница
  // собирается заново) восстанавливаем фильтр, число карточек и прокрутку.
  window.addEventListener('pagehide', () => {
    writeSnapshot({ state, shown, autoUnlocked, scrollY: window.scrollY });
  });

  const restore = (snapshot) => {
    state = { category: 'all', query: '', tags: null, tagsAll: null, label: null, ...snapshot.state };
    syncTabs();
    const input = $('#categories-search-input');
    if (input) { input.value = state.query || ''; toggleClear(input, $('#categories-clear-btn')); }
    renderPage(true);
    while (shown < snapshot.shown && shown < list.length) renderPage(false);
    autoUnlocked = Boolean(snapshot.autoUnlocked);
    // Пропорции карточек заданы в CSS, поэтому высота ленты известна сразу,
    // без ожидания фото — прокрутка попадает точно.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    // behavior: 'instant' — у html стоит плавная прокрутка, а здесь нужен прыжок
    requestAnimationFrame(() => window.scrollTo({ top: snapshot.scrollY || 0, behavior: 'instant' }));
  };

  const snapshot = isBackForward() ? readSnapshot() : null;
  const restored = Boolean(snapshot?.state);
  if (restored) restore(snapshot);
  else renderPage(true);

  return { setFilters, setCategory, setQuery, reset, restored };
}
