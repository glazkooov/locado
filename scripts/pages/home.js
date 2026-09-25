// pages/home.js — точка входа index.html.

import { $, $$, on, toggleClear } from '../core/dom.js';
import { escapeHtml, cssUrl } from '../core/format.js';
import { loadPlaces, popular, sample, categoryLabel } from '../core/places.js';
import { bindCards, renderCards } from '../components/card.js';
import { initFeed } from '../components/feed.js';
import { initRandomizer } from '../components/randomizer.js';
import { initPlacesMap } from '../components/map.js';
import { showToast } from '../components/toast.js';

function scrollToFeed() {
  const target = $('#places-container');
  if (!target) return;
  const header = $('.main-header');
  const offset = (header ? header.offsetHeight : 0) + 110;
  window.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset), behavior: 'smooth' });
}

function renderSuggested(places) {
  const container = $('#suggested-grid');
  if (!container) return;
  const picks = sample(places.filter((p) => p.description), 2);
  if (!picks.length) { container.closest('.suggested-places')?.remove(); return; }
  container.innerHTML = picks.map((p) => `
    <a href="place.html?slug=${encodeURIComponent(p.slug)}" class="suggested-card">
      <div class="suggested-img" style="background-image: ${cssUrl(p.photo)}"></div>
      <div class="suggested-content">
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.description)}</p>
      </div>
    </a>`).join('');
}

function initPlaceholderTyping() {
  const input = $('#main-search-input');
  if (!input || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const phrases = ['Погулять по парку', 'Вкусно поесть', 'Сходить на выставку', 'Активный отдых', 'Романтический вечер', 'Бесплатные музеи'];
  let phraseIndex = 0, charIndex = 0, isDeleting = false;

  const tick = () => {
    if (document.activeElement === input || input.value) { setTimeout(tick, 1000); return; }
    const fullText = phrases[phraseIndex];
    charIndex += isDeleting ? -1 : 1;
    input.placeholder = fullText.substring(0, charIndex);

    if (!isDeleting && charIndex === fullText.length) { isDeleting = true; setTimeout(tick, 1500); }
    else if (isDeleting && charIndex === 0) { isDeleting = false; phraseIndex = (phraseIndex + 1) % phrases.length; setTimeout(tick, 300); }
    else setTimeout(tick, isDeleting ? 50 : 100);
  };
  tick();
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

function initRandomTooltip() {
  const icon = $('#hero-random-icon');
  const tooltip = $('#random-tooltip');
  if (!icon || !tooltip) return;
  setTimeout(() => {
    tooltip.classList.add('show');
    setTimeout(() => tooltip.classList.remove('show'), 3000);
  }, 2000);
}

function initHeroSearch(feed) {
  const input = $('#main-search-input');
  const btn = $('#main-search-btn');
  const clearBtn = $('#hero-clear-btn');
  if (!input) return;

  const performSearch = () => {
    const query = input.value.trim();
    feed?.setFilters({ category: 'all', query }, { syncInput: true });
    scrollToFeed();
  };

  on(btn, 'click', performSearch);
  on(input, 'keydown', (e) => { if (e.key === 'Enter') performSearch(); });
  on(input, 'input', () => toggleClear(input, clearBtn));
  on(clearBtn, 'click', () => { input.value = ''; toggleClear(input, clearBtn); input.focus(); });
}

function initCategoryTiles(feed) {
  $$('.category-masonry').forEach((tile) => {
    on(tile, 'click', () => {
      feed?.setFilters({ category: tile.dataset.category, query: '' }, { syncInput: true });
      scrollToFeed();
    });
  });
}

function initCollections(feed) {
  $$('.collection-card').forEach((card) => {
    const open = () => {
      const tag = card.dataset.tag;
      if (!tag) return;
      feed?.setFilters({ category: 'all', query: tag }, { syncInput: true });
      scrollToFeed();
    };
    on(card, 'click', open);
    on(card, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

async function main() {
  bindCards(document.body);
  initPlaceholderTyping();
  initRandomTooltip();

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

  const feed = initFeed(places);
  initHeroSearch(feed);
  initCategoryTiles(feed);
  initCollections(feed);
  initRandomizer(places);
  initPlacesMap(places);
}

main();
