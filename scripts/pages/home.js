// pages/home.js — точка входа index.html.

import { goal, categoryGoal } from '../core/analytics.js';
import { $, $$, on } from '../core/dom.js';
import { escapeHtml } from '../core/format.js';
import { loadPlaces, placeUrl, CATEGORIES } from '../core/places.js';
import { bindCards } from '../components/card.js';
import { initFeed } from '../components/feed.js';
import { initRandomizer } from '../components/randomizer.js';
import { initHeroMoods, renderHeroMoods, liveHeroMoods } from '../components/hero-moods.js';
import { heroGreeting, getDaypart } from '../core/daypart.js';
import { renderCategoryButtons } from '../components/category-buttons.js';
import { initPlacesMap } from '../components/map.js';
import { showToast } from '../components/toast.js';
import { loadCollections, collectionUrl, COLLECTION_TYPES } from '../core/collections.js';
import { loadNow, pickNow } from '../core/now.js';
import { loadWeather, weatherMode } from '../core/weather.js';
import { icon } from '../core/icons.js';

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
  const feedContainer = $('#places-container');
  if (feedContainer) feedContainer.innerHTML = message;
}

/** «Сейчас» — карточка в ленте: момент, погода, заголовок и три места с
 *  причиной («Под крышей», «Закат в 17:34»). Подбор — core/now.js (pickNow). */
function nowCardHtml(view) {
  const live = [
    view.weather && `${icon(view.weather.icon)}${escapeHtml([view.weather.temp, view.weather.label, view.forecast].filter(Boolean).join(', '))}`,
    ...view.facts.map((f) => `${icon(f.icon)}${escapeHtml(f.text)}`)
  ].filter(Boolean);
  const rows = view.cards.slice(0, 3).map(({ place: p, reason }) => `
    <a class="feed-panel__row" href="${placeUrl(p.slug)}" data-now="${escapeHtml(p.name)}">
      <img class="feed-panel__thumb" src="${escapeHtml(p.photoSm || p.photo || '')}" alt="" loading="lazy">
      <span class="feed-panel__text">
        <b>${escapeHtml(p.name)}</b>
        <small>${reason ? `${icon(reason.icon)}${escapeHtml(reason.text)}` : escapeHtml(p.type || '')}</small>
      </span>
    </a>`).join('');
  return `
    <section class="feed-panel feed-panel--now" aria-label="Сейчас">
      <p class="feed-panel__eyebrow">${escapeHtml(view.eyebrow)}</p>
      ${live.length ? `<p class="feed-panel__live">${live.map((x) => `<span>${x}</span>`).join('')}</p>` : ''}
      <h3 class="feed-panel__title">${escapeHtml(view.title)}</h3>
      <div class="feed-panel__rows">${rows}</div>
    </section>`;
}

/** «Готовые планы» — карточка в ленте: три подборки строками. */
function plansCardHtml(collections) {
  const rows = collections.slice(0, 3).map((c) => `
    <a class="feed-panel__row" href="${collectionUrl(c.slug)}">
      <img class="feed-panel__thumb" src="${escapeHtml(c.coverSm || c.cover || '')}" alt="" loading="lazy">
      <span class="feed-panel__text">
        <b>${escapeHtml(c.title)}</b>
        <small>${escapeHtml([COLLECTION_TYPES[c.type], c.meta?.duration].filter(Boolean).join(' · '))}</small>
      </span>
    </a>`).join('');
  return `
    <section class="feed-panel feed-panel--plans" aria-label="Готовые планы">
      <p class="feed-panel__eyebrow">Не хочешь думать</p>
      <h3 class="feed-panel__title">Готовые планы на день</h3>
      <div class="feed-panel__rows">${rows}</div>
      <a class="feed-panel__more" href="collections/">Все подборки →</a>
    </section>`;
}

async function main() {
  const collectionsReady = loadCollections().catch((err) => { console.error('[home] подборки:', err); return []; });
  renderHeroMoods(renderHeroGreeting());
  renderCategoryButtons();
  bindCards(document.body);

  const nowEntry = loadNow(); // параллельно с местами
  const weather = loadWeather();
  const feedContainer = $('#places-container');
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

  // «Сейчас» и «Готовые планы» — карточки внутри ленты, после 4-го и 13-го
  // места. Высота (ratio) — для раскладки по колонкам, примерно по содержимому
  const entry = await nowEntry;
  const view = entry ? pickNow(entry, places, { weather: await weather }) : null;
  const collections = await collectionsReady;
  const inserts = {};
  if (view?.cards.length) inserts[4] = { html: nowCardHtml(view), ratio: 1.55 };
  if (collections.length) inserts[13] = { html: plansCardHtml(collections), ratio: 1.3 };
  const spotlight = view ? view.cards.slice(0, 3).map((c) => c.place) : [];

  // Места из «Сейчас» — в конец ленты: в карточке «Сейчас» они уже есть
  const inSpotlight = new Set(spotlight.map((p) => p.slug));
  const feed = initFeed(
    [...places.filter((p) => !inSpotlight.has(p.slug)), ...places.filter((p) => inSpotlight.has(p.slug))],
    { seasonal: inSpotlight, inserts }
  );
  // Цель: что из «Сейчас» открывают — работает ли блок
  on(document, 'click', '.feed-panel--now [data-now]', (e, row) => {
    goal('now_open', { 'Сейчас': { [entry?.title || '']: row.dataset.now } });
  });
  applyUrlFilter(feed);
  liveHeroMoods(places, { daypart: getDaypart(), bad: weatherMode(await weather) === 'bad' });
  // Лента сразу под героем: настроение фильтрует её на месте
  initHeroMoods(feed, places, { onSelect: () => scrollToFeed() });
  initRandomizer(places);
  initFeedView(places);
}

/** «Список / Карта» над лентой. Карта создаётся при первом показе: пока её
 *  не открыли, Яндекс Карты не грузятся вовсе. */
function initFeedView(places) {
  const mapBox = $('#map-section');
  const stream = $('#places-container');
  const listOnly = ['#places-container', '#show-more-btn', '.feed-end', '#feed-active', '#feed-note'].map((s) => $(s)).filter(Boolean);
  const btns = $$('.feed-view__btn');
  if (!mapBox || !stream || !btns.length) return;
  let mapStarted = false;
  const setView = (view) => {
    const isMap = view === 'map';
    btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    mapBox.hidden = !isMap;
    listOnly.forEach((el) => el.classList.toggle('is-off', isMap));
    // строка поиска и категорий ленты к карте не относится — у карты свои фильтры
    $('.feed-toolbar')?.classList.toggle('feed-toolbar--map', isMap);
    if (isMap && !mapStarted) { mapStarted = true; initPlacesMap(places); }
  };
  btns.forEach((b) => on(b, 'click', () => { setView(b.dataset.view); scrollToFeed(); }));
  // Ссылки «Карта» из меню и подвала ведут на ./#map-section
  const fromHash = () => { if (window.location.hash === '#map-section') { setView('map'); scrollToFeed({ instant: true }); } };
  window.addEventListener('hashchange', fromHash);
  fromHash();
  // «Удиви меня» в конце ленты открывает тот же рандомайзер, что в hero
  $$('[data-random]').forEach((b) => on(b, 'click', () => $('#hero-random-icon')?.click()));
}

main();
