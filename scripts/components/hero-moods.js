// components/hero-moods.js — фотокарточки настроений в hero. Клик применяет
// настроение к ленте мест (через feed.setFilters) прямо под героем и
// подсвечивает карточку. Когда места загружены, порядок карточек учитывает
// время суток и погоду. Плашек «сейчас в тему» нет: что в тему — человек
// решит сам.
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
  container.innerHTML = moodsFor(daypart).map((mood) => {
    // Глагол — вертикально во всю высоту карточки, остальное — внизу
    const [verb, ...tail] = mood.label.split(' ');
    return `
      <button type="button" class="mood-card" data-mood="${mood.id}" aria-pressed="false" aria-label="${escapeHtml(mood.label)}" style="--mood: ${mood.color}">
        <img src="${escapeHtml(mood.photo)}" alt="" class="mood-card__img" width="360" height="480" decoding="async">
        <span class="mood-card__verb" aria-hidden="true">${escapeHtml(verb)}</span>
        <span class="mood-card__tail" aria-hidden="true">${tail.map((w) => `<span>${escapeHtml(w)}</span>`).join(' ')}</span>
      </button>`;
  }).join('');
  fitMoodText(container);
}

/** Подгоняет кегль. Глагол стоит вертикально по левому краю, и у всех
 *  карточек он одного размера — по самому длинному глаголу, во всю высоту
 *  карточки. Остальное — вплотную справа от глагола, внизу, того же
 *  размера; если не влезает по ширине — мельче (и переносится по словам).
 *  Ширина карточек зависит от экрана, поэтому пересчёт — после загрузки
 *  шрифта и при каждом ресайзе. */
const PAD = 10;
const GAP = 0.18; // зазор между глаголом и остальным — в долях кегля
function fitMoodText(container) {
  const fit = () => {
    const cards = $$('.mood-card[data-mood]', container).filter((c) => c.clientWidth);
    if (!cards.length) return;
    const parts = cards.map((card) => ({ card, verb: $('.mood-card__verb', card), tail: $('.mood-card__tail', card) }));
    parts.forEach(({ verb, tail }) => { verb.style.fontSize = tail.style.fontSize = '100px'; });
    const verbSize = Math.min(...parts.map(({ card, verb }) => (100 * (card.clientHeight - 2 * PAD)) / verb.scrollHeight));
    parts.forEach(({ card, verb, tail }) => {
      const widest = Math.max(...$$('span', tail).map((w) => w.offsetWidth)) / 100;
      verb.style.fontSize = `${verbSize}px`;
      const left = PAD + verb.offsetWidth + GAP * verbSize;
      const room = card.clientWidth - left - PAD;
      tail.style.fontSize = `${Math.min(verbSize, room / widest)}px`;
      tail.style.left = `${left}px`;
      tail.style.maxWidth = `${room + 2}px`;
    });
  };
  document.fonts?.ready.then(fit);
  fit();
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(container);
}

/** Порядок карточек с учётом времени суток и погоды. */
export function liveHeroMoods(places, { daypart, bad = false } = {}) {
  const container = $('#hero-moods');
  if (!container) return null;
  const live = moodsNow(places, { daypart, bad });
  live.order.forEach((mood) => {
    const card = $(`.mood-card[data-mood="${mood.id}"]`, container);
    if (!card) return;
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
