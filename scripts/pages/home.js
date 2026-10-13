// pages/home.js — точка входа index.html.

import { goal, categoryGoal } from '../core/analytics.js';
import { $, $$, on } from '../core/dom.js';
import { escapeHtml, cssUrl } from '../core/format.js';
import { loadPlaces, sample, bySlug, placeUrl, CATEGORIES } from '../core/places.js';
import { bindCards } from '../components/card.js';
import { initFeed } from '../components/feed.js';
import { initRandomizer } from '../components/randomizer.js';
import { initHeroMoods, renderHeroMoods, liveHeroMoods } from '../components/hero-moods.js';
import { heroGreeting, getDaypart } from '../core/daypart.js';
import { renderCategoryButtons } from '../components/category-buttons.js';
import { initPlacesMap } from '../components/map.js';
import { showToast } from '../components/toast.js';
import { loadCollections } from '../core/collections.js';
import { collectionCardHtml } from '../components/collection-card.js';
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

/** Строка над заголовком: погода, прогноз, закат. Обновляется раз в минуту. */
function renderNowLive(view) {
  const items = [];
  // «+7°, дождь, стихнет к 21:00» — прогноз в одной фразе с погодой
  if (view.weather) {
    items.push({ icon: view.weather.icon, text: [`${view.weather.temp}`, view.weather.label, view.forecast].filter(Boolean).join(', ') });
  }
  items.push(...view.facts);
  $('#now-live').innerHTML = items.map((x) => `<span>${x.icon ? icon(x.icon) : ''}${escapeHtml(x.text)}</span>`).join('');
  $('#now-live').hidden = !items.length;
}

/** «Сейчас»: сезонная подборка из data/now.json, подобранная под погоду,
 *  время суток и часы работы (core/now.js → pickNow). Под фото — причина
 *  («Под крышей», «Закат в 17:34»), под названием — фраза места под этот
 *  момент (moments) или «Когда лучше».
 *  Возвращает показанные места (их не повторяем в начале ленты). */
function renderNow(entry, places, weather) {
  const section = $('#now-section');
  if (!section || !entry) return [];
  const view = pickNow(entry, places, { weather });
  if (!view.cards.length) return [];
  $('#now-eyebrow').textContent = view.eyebrow;
  $('#now-eyebrow').hidden = !view.eyebrow;
  $('#now-title').textContent = view.title;
  $('#now-lead').textContent = view.lead;
  $('#now-lead').hidden = !view.lead;
  renderNowLive(view);
  // «до заката 1 ч 30 мин» — живое, раз в минуту
  setInterval(() => renderNowLive(pickNow(entry, places, { weather })), 60 * 1000);
  $('#now-cards').innerHTML = view.cards.map(({ place: p, reason, note }) => {
    const when = p.story?.when;
    const text = note ? escapeHtml(note) : when ? `<b>Когда:</b> ${escapeHtml(when)}` : escapeHtml(p.description || '');
    return `
      <a class="now-card" href="${placeUrl(p.slug)}">
        <span class="now-card__media">
          <img class="now-card__photo" src="${escapeHtml(p.photoSm || p.photo || '')}" alt="${escapeHtml(p.name)}" loading="lazy">
          ${reason ? `<span class="now-card__reason">${icon(reason.icon)}${escapeHtml(reason.text)}</span>` : ''}
        </span>
        <span class="now-card__name">${escapeHtml(p.name)}</span>
        <p class="now-card__text">${text}</p>
      </a>`;
  }).join('');
  section.hidden = false;
  // Цель: что из «Сейчас» открывают — работает ли сезонный блок
  const picks = view.cards.map((c) => c.place);
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
  const weather = loadWeather();
  const suggestedContainer = $('#suggested-grid');
  const feedContainer = $('#places-container');
  if (suggestedContainer) suggestedContainer.innerHTML = skeletonCards(2, 'suggested-card');
  if (feedContainer) feedContainer.innerHTML = `<div class="places-grid">${skeletonCards(8, 'place-card')}</div>`;

  let places;
  try {
    places = await loadPlaces();
  } catch (err) {
    console.error('[home] не удалось загрузить места:', err);
    showToast('Не получилось загрузить места. Обнови страницу — обычно помогает.', true);
    showLoadError();
    return;
  }

  const spotlight = renderNow(await nowEntry, places, await weather);

  renderSuggested(places);

  // Места из «Сейчас» — в конец ленты: иначе первый ряд ленты повторял
  // блок, который человек только что пролистал
  const inSpotlight = new Set(spotlight.map((p) => p.slug));
  const feed = initFeed(
    [...places.filter((p) => !inSpotlight.has(p.slug)), ...places.filter((p) => inSpotlight.has(p.slug))],
    // «Сейчас» и «Готовые планы» — полосы внутри ленты
    { seasonal: inSpotlight, bands: { 3: $('#now-section'), 6: $('#collections') } }
  );
  applyUrlFilter(feed);
  const live = liveHeroMoods(places, { daypart: getDaypart(), bad: weatherMode(await weather) === 'bad' });
  // Лента сразу под героем: настроение фильтрует её на месте, а подборка
  // «с чего начать» под карточками не нужна — её роль играет сама лента
  void live;
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
