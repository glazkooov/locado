// components/hero-moods.js — клик по hero-pill применяет выбранное
// настроение к ленте мест (через feed.setFilters) и подсвечивает активный
// pill. Тот же паттерн клик → фильтр → скролл, что уже используют плитки
// категорий и карточки подборок (см. initCategoryTiles/initCollections в
// scripts/pages/home.js) — просто третий источник того же действия.

import { $$, on } from '../core/dom.js';
import { resolveMoodFilters } from '../core/moods.js';

export function initHeroMoods(feed, places, { onSelect } = {}) {
  if (!feed) return;
  const pills = $$('.hero__pill[data-mood]');
  if (!pills.length) return;

  pills.forEach((pill) => {
    on(pill, 'click', () => {
      const moodId = pill.dataset.mood;
      const patch = resolveMoodFilters(places, moodId);
      feed.setFilters(patch, { syncInput: true });
      pills.forEach((p) => p.classList.toggle('active', p === pill));
      onSelect?.();
    });
  });

  // Любой другой способ отфильтровать ленту отменяет настроение — снимаем
  // подсветку с pill, чтобы она не «врала» о текущем фильтре.
  const clearActive = () => pills.forEach((p) => p.classList.remove('active'));
  on(document, 'click', '.scroll__category-btn, .category-masonry, .collection-card, #feed-reset-btn', clearActive);
  on(document, 'input', '#categories-search-input', clearActive);
}
