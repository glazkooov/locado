// pages/home.js — точка входа index.html.

import { goal, categoryGoal } from '../core/analytics.js';
import { $, $$, on } from '../core/dom.js';
import { escapeHtml, cssUrl } from '../core/format.js';
import { loadPlaces, sample, bySlug, placeUrl, CATEGORIES } from '../core/places.js';
import { bindCards } from '../components/card.js';
import { initFeed } from '../components/feed.js';
import { initRandomizer } from '../components/randomizer.js';
import { initHeroMoods, renderHeroMoods } from '../components/hero-moods.js';
import { heroGreeting } from '../core/daypart.js';
import { renderCategoryButtons } from '../components/category-buttons.js';
import { initPlacesMap } from '../components/map.js';
import { showToast } from '../components/toast.js';
import { loadCollections } from '../core/collections.js';
import { collectionCardHtml } from '../components/collection-card.js';
import { loadNow } from '../core/now.js';

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
    goal('tag_select', { 'Тег': tag });
    feed.setFilters({ category: 'all', query: '', tags: [tag], tagsAll: null }, { syncInput: true, label: { kind: 'Тег', text: `#${tag}` } });
  } else if (category && CATEGORIES[category]) {
    // Ссылка ?category= — из меню или «Ещё места» на странице места
    categoryGoal(category, 'Ссылка (меню, страница места)');
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
  const suggestedContainer = $('#suggested-grid');
  const feedContainer = $('#places-container');
  if (suggestedContainer) suggestedContainer.closest('.suggested-places')?.remove();
  if (feedContainer) feedContainer.innerHTML = message;
}

/** «Сейчас»: сезонная подборка из data/now.json. Под фото — «когда лучше»
 *  из story места, а если его ещё нет — короткое описание.
 *  Возвращает показанные места (их не повторяем в начале ленты). */
function renderNow(entry, places) {
  const section = $('#now-section');
  if (!section || !entry) return [];
  const picks = (entry.places || []).map((slug) => bySlug(places, slug)).filter(Boolean);
  if (!picks.length) return [];
  $('#now-eyebrow').textContent = entry.eyebrow || '';
  $('#now-eyebrow').hidden = !entry.eyebrow;
  $('#now-title').textContent = entry.title || '';
  $('#now-lead').textContent = entry.lead || '';
  $('#now-lead').hidden = !entry.lead;
  $('#now-cards').innerHTML = picks.map((p) => {
    const when = p.story?.when;
    const text = when ? `<b>Когда:</b> ${escapeHtml(when)}` : escapeHtml(p.description || '');
    return `
      <a class="now-card" href="${placeUrl(p.slug)}">
        <img class="now-card__photo" src="${escapeHtml(p.photoSm || p.photo || '')}" alt="${escapeHtml(p.name)}" loading="lazy">
        <span class="now-card__name">${escapeHtml(p.name)}</span>
        <p class="now-card__text">${text}</p>
      </a>`;
  }).join('');
  section.hidden = false;
  // Цель: что из «Сейчас» открывают — работает ли сезонный блок
  $$('.now-card', section).forEach((card, i) => on(card, 'click', () => {
    goal('now_open', { 'Сейчас': { [entry.title || '']: picks[i].name } });
  }));
  return picks;
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

  const nowEntry = loadNow(); // параллельно с местами
  const suggestedContainer = $('#suggested-grid');
  const feedContainer = $('#places-container');
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

  const spotlight = renderNow(await nowEntry, places);

  renderSuggested(places);

  // Места из «Сейчас» — в конец ленты: иначе первый ряд ленты повторял
  // блок, который человек только что пролистал
  const inSpotlight = new Set(spotlight.map((p) => p.slug));
  const feed = initFeed(
    [...places.filter((p) => !inSpotlight.has(p.slug)), ...places.filter((p) => inSpotlight.has(p.slug))],
    { seasonal: inSpotlight }
  );
  applyUrlFilter(feed);
  initHeroMoods(feed, places, { onSelect: () => scrollToFeed() });
  initRandomizer(places);
  initPlacesMap(places);
}

main();
