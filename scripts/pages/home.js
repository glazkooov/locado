// pages/home.js — точка входа index.html.

import { $, $$, on } from '../core/dom.js';
import { escapeHtml, cssUrl } from '../core/format.js';
import { loadPlaces, popular, sample, categoryLabel, CATEGORIES } from '../core/places.js';
import { bindCards, renderCards } from '../components/card.js';
import { initFeed } from '../components/feed.js';
import { initRandomizer } from '../components/randomizer.js';
import { initHeroMoods, renderHeroMoods } from '../components/hero-moods.js';
import { heroGreeting } from '../core/daypart.js';
import { renderCategoryButtons, renderCategoryCounts } from '../components/category-buttons.js';
import { initPlacesMap } from '../components/map.js';
import { showToast } from '../components/toast.js';
import { loadCollections } from '../core/collections.js';
import { collectionCardHtml } from '../components/collection-card.js';

// Скроллим к заголовку ленты, а не к карточкам: так видны вкладки и
// плашка выбранного настроения/подборки над ними.
function scrollToFeed({ instant = false } = {}) {
  const target = $('#all-places');
  if (!target) return;
  const header = $('.main-header');
  const offset = header ? header.offsetHeight : 0;
  window.scrollTo({
    top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset),
    behavior: instant ? 'instant' : 'smooth'
  });
}

/** Ссылки со страницы места: index.html?tag=спорт или ?category=nature —
 *  сразу открывают ленту с этим фильтром. */
function applyUrlFilter(feed) {
  if (!feed || feed.restored) return; // «Назад» важнее параметров в адресе
  const params = new URLSearchParams(window.location.search);
  const tag = params.get('tag');
  const category = params.get('category');
  if (tag) {
    feed.setFilters({ category: 'all', query: '', tags: [tag], tagsAll: null }, { syncInput: true, label: { kind: 'Тег', text: `#${tag}` } });
  } else if (category && CATEGORIES[category]) {
    feed.setFilters({ category, query: '', tags: null, tagsAll: null }, { syncInput: true });
  } else {
    return;
  }
  requestAnimationFrame(() => scrollToFeed({ instant: true }));
}

function renderSuggested(places) {
  const container = $('#suggested-grid');
  if (!container) return;
  const picks = sample(places.filter((p) => p.description), 2);
  if (!picks.length) { container.closest('.suggested-places')?.remove(); return; }
  container.innerHTML = picks.map((p) => `
    <a href="place/?slug=${encodeURIComponent(p.slug)}" class="suggested-card">
      <div class="suggested-img" style='background-image: ${cssUrl(p.photo)}'></div>
      <div class="suggested-content">
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.description)}</p>
      </div>
    </a>`).join('');
}

/** «Пятница, вечер» + вопрос под время суток; возвращает daypart для порядка настроений. */
function renderHeroGreeting() {
  const greeting = heroGreeting();
  const when = $('#hero-when');
  const question = $('#hero-question');
  if (when) { when.textContent = greeting.when; when.hidden = false; }
  if (question) question.textContent = greeting.question;
  return greeting.daypart;
}

function skeletonCards(n, cardClass) {
  return Array.from({ length: n }, () => `<div class="${cardClass} skeleton"></div>`).join('');
}

function showLoadError() {
  const message = '<p class="feed-load-error">Не получилось загрузить места. Обнови страницу — обычно помогает.</p>';
  const popularContainer = $('#popular-places-container');
  const suggestedContainer = $('#suggested-grid');
  const feedContainer = $('#places-container');
  if (popularContainer) popularContainer.innerHTML = message;
  if (suggestedContainer) suggestedContainer.closest('.suggested-places')?.remove();
  if (feedContainer) feedContainer.innerHTML = message;
}

function initCategoryTiles(feed) {
  $$('.category-masonry').forEach((tile) => {
    on(tile, 'click', () => {
      feed?.setFilters({ category: tile.dataset.category, query: '', tags: null, tagsAll: null }, { syncInput: true });
      scrollToFeed();
    });
  });
}


/** Подборки — авторские статьи на отдельных страницах (collection.html). */
async function renderCollections() {
  const grid = $('#collections-grid');
  if (!grid) return;
  try {
    const collections = await loadCollections();
    grid.innerHTML = collections.slice(0, 3).map(collectionCardHtml).join('');
  } catch (err) {
    console.error('[home] подборки:', err);
    grid.closest('.cat-col-right')?.remove();
  }
}

async function main() {
  renderCollections();
  renderHeroMoods(renderHeroGreeting());
  renderCategoryButtons();
  bindCards(document.body);

  const popularContainer = $('#popular-places-container');
  const suggestedContainer = $('#suggested-grid');
  const feedContainer = $('#places-container');
  if (popularContainer) popularContainer.innerHTML = skeletonCards(4, 'place-card');
  if (suggestedContainer) suggestedContainer.innerHTML = skeletonCards(2, 'suggested-card');
  if (feedContainer) feedContainer.innerHTML = skeletonCards(8, 'place-card');

  let places;
  try {
    places = await loadPlaces();
  } catch (err) {
    console.error('[home] не удалось загрузить места:', err);
    showToast('Не получилось загрузить места. Обнови страницу — обычно помогает.', true);
    showLoadError();
    return;
  }

  const spotlight = popular(places, 4);
  if (popularContainer) renderCards(popularContainer, spotlight);

  renderSuggested(places);

  renderCategoryCounts(places);
  // Места из «Сейчас в центре внимания» — в конец ленты: иначе первый ряд
  // ленты повторял блок, который человек только что пролистал
  const inSpotlight = new Set(spotlight.map((p) => p.slug));
  const feed = initFeed([...places.filter((p) => !inSpotlight.has(p.slug)), ...places.filter((p) => inSpotlight.has(p.slug))]);
  applyUrlFilter(feed);
  initHeroMoods(feed, places, { onSelect: () => scrollToFeed() });
  initCategoryTiles(feed);
  initRandomizer(places);
  initPlacesMap(places);
}

main();
