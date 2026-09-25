// components/hero-moods.js — фотокарточки настроений в hero. Клик применяет
// настроение к ленте мест (через feed.setFilters) и подсвечивает карточку.
// Тот же паттерн клик → фильтр → скролл, что уже используют плитки
// категорий и карточки подборок (см. initCategoryTiles/initCollections в
// scripts/pages/home.js) — просто третий источник того же действия.

import { $, $$, on } from '../core/dom.js';
import { escapeHtml } from '../core/format.js';
import { MOODS, moodsFor, resolveMoodFilters } from '../core/moods.js';

/** Рисует карточки сразу, до загрузки places.json: первый экран не ждёт данных. */
export function renderHeroMoods(daypart) {
  const container = $('#hero-moods');
  if (!container) return;
  container.innerHTML = moodsFor(daypart).map((mood, i) => {
    const fitsNow = i === 0 && mood.bestAt.includes(daypart);
    return `
      <button type="button" class="mood-card" data-mood="${mood.id}" aria-pressed="false">
        <img src="${escapeHtml(mood.photo)}" alt="" class="mood-card__img" width="360" height="480" decoding="async">
        ${fitsNow ? '<span class="mood-card__badge">Сейчас в тему</span>' : ''}
        <span class="mood-card__label">${escapeHtml(mood.label)}</span>
      </button>`;
  }).join('');
}

export function initHeroMoods(feed, places, { onSelect } = {}) {
  const container = $('#hero-moods');
  if (!feed || !container) return;
  const cards = () => $$('.mood-card', container);
  const setActive = (active) => cards().forEach((c) => {
    c.classList.toggle('active', c === active);
    c.setAttribute('aria-pressed', String(c === active));
  });

  on(container, 'click', '.mood-card', (e, card) => {
    const mood = MOODS.find((m) => m.id === card.dataset.mood);
    if (!mood) return;
    feed.setFilters(resolveMoodFilters(places, mood.id), { syncInput: true, label: { kind: 'Настроение', text: mood.label } });
    setActive(card);
    onSelect?.();
  });

  // Любой другой способ отфильтровать ленту отменяет настроение — снимаем
  // подсветку с карточки, чтобы она не «врала» о текущем фильтре.
  const clearActive = () => setActive(null);
  on(document, 'click', '.scroll__category-btn, .category-masonry, .collection-card, #feed-reset-btn, #feed-active-reset', clearActive);
  on(document, 'input', '#categories-search-input', clearActive);
}
