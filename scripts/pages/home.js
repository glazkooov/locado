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
    <a href="place.html?slug=${encodeURIComponent(p.slug)}" class="suggested-card">
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
  const message = '<p class="feed-load-error">Не удалось загрузить места. Обновите страницу.</p>';
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

/** Подборки описаны тегами прямо в разметке: data-tags-any — любой из
 *  тегов, data-tags-all — все сразу (как настроения в hero). Раньше подборка
 *  искала слово по тексту и с новой базой находила 0–1 место. */
const tagList = (value) => (value ? value.split(',').map((t) => t.trim()).filter(Boolean) : null);

function initCollections(feed) {
  $$('.collection-card').forEach((card) => {
    const open = () => {
      const tags = tagList(card.dataset.tagsAny);
      const tagsAll = tagList(card.dataset.tagsAll);
      if (!tags && !tagsAll) return;
      const title = card.querySelector('.collection-title')?.textContent.trim();
      feed?.setFilters({ category: 'all', query: '', tags, tagsAll }, { syncInput: true, label: title && { kind: 'Подборка', text: title } });
      scrollToFeed();
    };
    on(card, 'click', open);
    on(card, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

async function main() {
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
    showToast('Не удалось загрузить данные. Попробуйте позже.', true);
    showLoadError();
    return;
  }

  if (popularContainer) renderCards(popularContainer, popular(places, 4));

  renderSuggested(places);

  renderCategoryCounts(places);
  const feed = initFeed(places);
  applyUrlFilter(feed);
  initHeroMoods(feed, places, { onSelect: () => scrollToFeed() });
  initCategoryTiles(feed);
  initCollections(feed);
  initRandomizer(places);
  initPlacesMap(places);
}

main();
