// components/hero-moods.js — фотокарточки настроений в hero. Клик применяет
// настроение к ленте мест (через feed.setFilters), подсвечивает карточку и
// прямо под карточками раскрывает три места «с чего начать»; кнопка «Все N
// мест» уводит к ленте. Когда места загружены, на карточках появляется
// живая строка «17 мест · 12 открыто», а порядок учитывает погоду.
// Тот же паттерн клик → фильтр → скролл, что уже используют плитки
// категорий и карточки подборок (см. initCategoryTiles/initCollections в
// scripts/pages/home.js) — просто третий источник того же действия.

import { goal } from '../core/analytics.js';
import { $, $$, on } from '../core/dom.js';
import { escapeHtml, pluralize, openStatusLabel } from '../core/format.js';
import { MOODS, moodsFor, moodsNow, resolveMoodFilters } from '../core/moods.js';
import { placeUrl, metroList } from '../core/places.js';
import { icon } from '../core/icons.js';

const placesWord = (n) => pluralize(n, ['место', 'места', 'мест']);

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
          <span class="mood-card__meta" hidden></span>
          <span class="mood-card__label">${escapeHtml(mood.label)}</span>
        </span>
      </button>`;
  }).join('');
}

/** «С чего начать»: три места настроения под карточками. */
function picksHtml(mood, data) {
  const items = data.picks.map((p) => {
    // «Открыто круглосуточно» у всех парков подряд только шумит — вместо
    // него тип места; часы — когда они важны
    const status = openStatusLabel(p);
    const metro = metroList(p)[0];
    const when = status?.text === 'Открыто круглосуточно' ? p.type : status?.text;
    const meta = [when, metro && `м. ${metro}`].filter(Boolean).join(' · ');
    return `
      <a class="mood-pick" href="${placeUrl(p.slug)}">
        <img class="mood-pick__img" src="${escapeHtml(p.photoSm || p.photo || '')}" alt="" loading="lazy">
        <span class="mood-pick__text">
          <b>${escapeHtml(p.name)}</b>
          <small>${escapeHtml(meta)}</small>
        </span>
      </a>`;
  }).join('');
  return `
    <div class="mood-picks__head">
      <p class="mood-picks__title">${escapeHtml(mood.label)} — с чего начать</p>
      <button type="button" class="mood-picks__close" aria-label="Свернуть">${icon('x')}</button>
    </div>
    <div class="mood-picks__list">${items || '<p class="mood-picks__empty">Сейчас всё закрыто — загляни в ленту, там часы работы.</p>'}</div>
    <button type="button" class="mood-picks__all">Все ${data.total} ${placesWord(data.total)} ${icon('chevron-right')}</button>`;
}

/**
 * Живые карточки: строка «17 мест · 12 открыто», порядок с учётом погоды
 * и «Сейчас в тему» на первой. weather — из core/weather.js или null.
 */
export function liveHeroMoods(places, { daypart, bad = false } = {}) {
  const container = $('#hero-moods');
  if (!container) return null;
  const live = moodsNow(places, { daypart, bad });
  live.order.forEach((mood, i) => {
    const card = $(`.mood-card[data-mood="${mood.id}"]`, container);
    if (!card) return;
    const data = live.info[mood.id];
    const meta = $('.mood-card__meta', card);
    const now = bad ? (data.fit ? `${data.fit} под крышей` : 'все под открытым небом') : `${data.open} открыто`;
    // на телефоне карточки узкие — там только вторая часть
    meta.innerHTML = `<span class="mood-card__total">${data.total} ${placesWord(data.total)} · </span>${escapeHtml(now)}`;
    meta.hidden = false;
    $('.mood-card__badge', card)?.remove();
    if (i === 0) card.insertAdjacentHTML('afterbegin', `<span class="mood-card__badge">${bad ? 'В непогоду' : 'Сейчас в тему'}</span>`);
    container.append(card); // в порядке live.order
  });
  container.scrollLeft = 0;
  return live;
}

export function initHeroMoods(feed, places, { onSelect, live } = {}) {
  const container = $('#hero-moods');
  const panel = $('#mood-picks');
  if (!feed || !container) return;
  const cards = () => $$('.mood-card[data-mood]', container);
  const setActive = (active) => cards().forEach((c) => {
    c.classList.toggle('active', c === active);
    c.setAttribute('aria-pressed', String(c === active));
  });
  const closePanel = () => { if (panel) panel.hidden = true; };

  on(container, 'click', '.mood-card[data-mood]', (e, card) => {
    const mood = MOODS.find((m) => m.id === card.dataset.mood);
    if (!mood) return;
    goal('mood_select', { 'Настроение': mood.label });
    feed.setFilters(resolveMoodFilters(places, mood.id), { syncInput: true, label: { kind: 'Настроение', text: mood.label, moodId: mood.id } });
    setActive(card);
    // Без живых данных (или без панели) — как раньше, сразу к ленте
    if (!panel || !live?.info[mood.id]) { onSelect?.(); return; }
    panel.innerHTML = picksHtml(mood, live.info[mood.id]);
    panel.hidden = false;
    // на телефоне подборка ниже первого экрана — показываем её
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    on($('.mood-picks__all', panel), 'click', () => onSelect?.());
    on($('.mood-picks__close', panel), 'click', () => { closePanel(); setActive(null); });
  });

  // Любой другой способ отфильтровать ленту отменяет настроение — снимаем
  // подсветку с карточки, чтобы она не «врала» о текущем фильтре.
  const clearActive = () => { setActive(null); closePanel(); };
  on(document, 'click', '.scroll__category-btn, .category-masonry, #feed-reset-btn, #feed-active-reset', clearActive);
  on(document, 'input', '#categories-search-input', clearActive);
}
