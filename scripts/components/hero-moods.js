// components/hero-moods.js — фотокарточки настроений в hero. Клик применяет
// настроение к ленте мест (через feed.setFilters) прямо под героем и
// подсвечивает карточку. Когда места загружены, порядок карточек учитывает
// время суток и погоду (на первой — «Сейчас в тему» или «В непогоду»).
// Тот же паттерн клик → фильтр → скролл, что уже используют плитки
// категорий и карточки подборок (см. initCategoryTiles/initCollections в
// scripts/pages/home.js) — просто третий источник того же действия.

import { goal } from '../core/analytics.js';
import { $, $$, on } from '../core/dom.js';
import { escapeHtml } from '../core/format.js';
import { MOODS, moodsFor, moodsNow, resolveMoodFilters } from '../core/moods.js';

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
        <span class="mood-card__text">
          <span class="mood-card__label">${escapeHtml(mood.label)}</span>
        </span>
      </button>`;
  }).join('');
}

/** Порядок карточек с учётом времени суток и погоды и «Сейчас в тему»
 *  (в непогоду — «В непогоду») на первой. */
export function liveHeroMoods(places, { daypart, bad = false } = {}) {
  const container = $('#hero-moods');
  if (!container) return null;
  const live = moodsNow(places, { daypart, bad });
  live.order.forEach((mood, i) => {
    const card = $(`.mood-card[data-mood="${mood.id}"]`, container);
    if (!card) return;
    $('.mood-card__badge', card)?.remove();
    if (i === 0) card.insertAdjacentHTML('afterbegin', `<span class="mood-card__badge">${bad ? 'В непогоду' : 'Сейчас в тему'}</span>`);
    container.append(card); // в порядке live.order
  });
  container.scrollLeft = 0;
  return live;
}

export function initHeroMoods(feed, places, { onSelect } = {}) {
  const container = $('#hero-moods');
  if (!feed || !container) return;
  const cards = () => $$('.mood-card[data-mood]', container);
  const setActive = (active) => cards().forEach((c) => {
    c.classList.toggle('active', c === active);
    c.setAttribute('aria-pressed', String(c === active));
  });

  on(container, 'click', '.mood-card[data-mood]', (e, card) => {
    const mood = MOODS.find((m) => m.id === card.dataset.mood);
    if (!mood) return;
    goal('mood_select', { 'Настроение': mood.label });
    feed.setFilters(resolveMoodFilters(places, mood.id), { syncInput: true, label: { kind: 'Настроение', text: mood.label, moodId: mood.id } });
    setActive(card);
    onSelect?.();
  });

  // Любой другой способ отфильтровать ленту отменяет настроение — снимаем
  // подсветку с карточки, чтобы она не «врала» о текущем фильтре.
  const clearActive = () => setActive(null);
  on(document, 'click', '.scroll__category-btn, .category-masonry, #feed-reset-btn, #feed-active-reset', clearActive);
  on(document, 'input', '#categories-search-input', clearActive);
}
