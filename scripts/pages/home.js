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

// Витрины в ленте — «Сейчас» и «Готовые планы»: слева обложка (что это и
// почему сейчас), справа три крупные карточки. Место для платной подборки:
// туда же встанет подпись партнёра и пометка «Реклама» (38-ФЗ, erid).

function showcaseItemHtml({ href, photo, name, note, chip, data = '' }) {
  return `
    <a class="showcase-item" href="${href}"${data}>
      <img class="showcase-item__img" src="${escapeHtml(photo || '')}" alt="" loading="lazy">
      ${chip ? `<span class="showcase-item__chip">${chip}</span>` : ''}
      <span class="showcase-item__text">
        <b>${escapeHtml(name)}</b>
        ${note ? `<small>${escapeHtml(note)}</small>` : ''}
      </span>
    </a>`;
}

/** «Сейчас»: момент, погода, заголовок сезона и три места с причиной. */
function nowShowcaseHtml(view) {
  const live = [
    view.weather && `${icon(view.weather.icon)}${escapeHtml([view.weather.temp, view.weather.label, view.forecast].filter(Boolean).join(', '))}`,
    ...view.facts.map((f) => `${icon(f.icon)}${escapeHtml(f.text)}`)
  ].filter(Boolean);
  const items = view.cards.slice(0, 3).map(({ place: p, reason }) => showcaseItemHtml({
    href: placeUrl(p.slug),
    photo: p.photoSm || p.photo,
    name: p.name,
    note: p.type,
    chip: reason ? `${icon(reason.icon)}${escapeHtml(reason.text)}` : '',
    data: ` data-now="${escapeHtml(p.name)}"`
  })).join('');
  return `
    <section class="showcase showcase--now" aria-label="Сейчас">
      <div class="showcase__cover">
        <p class="showcase__eyebrow">${escapeHtml(view.eyebrow)}</p>
        ${live.length ? `<p class="showcase__live">${live.map((x) => `<span>${x}</span>`).join('')}</p>` : ''}
        <h3 class="showcase__title">${escapeHtml(view.title)}</h3>
        ${view.lead ? `<p class="showcase__lead">${escapeHtml(view.lead)}</p>` : ''}
      </div>
      <div class="showcase__items">${items}</div>
    </section>`;
}

/** «Готовые планы»: подборки крупными карточками. */
function plansShowcaseHtml(collections) {
  const items = collections.slice(0, 3).map((c) => showcaseItemHtml({
    href: collectionUrl(c.slug),
    photo: c.coverSm || c.cover,
    name: c.title,
    note: c.meta?.duration,
    chip: escapeHtml(COLLECTION_TYPES[c.type] || '')
  })).join('');
  return `
    <section class="showcase showcase--plans" aria-label="Готовые планы">
      <div class="showcase__cover">
        <p class="showcase__eyebrow">Не хочешь думать</p>
        <h3 class="showcase__title">Готовые планы на день</h3>
        <p class="showcase__lead">Маршрут целиком: где начать, где поесть, сколько времени и денег.</p>
        <a class="showcase__more" href="collections/">Все подборки →</a>
      </div>
      <div class="showcase__items">${items}</div>
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

  // «Сейчас» и «Готовые планы» — витрины в ленте, после 3-го и 6-го ряда
  const entry = await nowEntry;
  const view = entry ? pickNow(entry, places, { weather: await weather }) : null;
  const collections = await collectionsReady;
  const showcases = {};
  if (view?.cards.length) showcases[3] = nowShowcaseHtml(view);
  if (collections.length) showcases[6] = plansShowcaseHtml(collections);
  const spotlight = view ? view.cards.slice(0, 3).map((c) => c.place) : [];

  // Места из «Сейчас» — в конец ленты: в витрине «Сейчас» они уже есть
  const inSpotlight = new Set(spotlight.map((p) => p.slug));
  const feed = initFeed(
    [...places.filter((p) => !inSpotlight.has(p.slug)), ...places.filter((p) => inSpotlight.has(p.slug))],
    { seasonal: inSpotlight, showcases }
  );
  // Цель: что из «Сейчас» открывают — работает ли блок
  on(document, 'click', '.showcase--now [data-now]', (e, row) => {
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
