// pages/home.js — точка входа index.html.

import { goal, categoryGoal } from '../core/analytics.js';
import { $, $$, on } from '../core/dom.js';
import { escapeHtml } from '../core/format.js';
import { loadPlaces, CATEGORIES } from '../core/places.js';
import { bindCards } from '../components/card.js';
import { initFeed, serviceCardHtml, SERVICE_RATIO } from '../components/feed.js';
import { initRandomizer } from '../components/randomizer.js';
import { initHeroMoods, renderHeroMoods, liveHeroMoods } from '../components/hero-moods.js';
import { heroGreeting, getDaypart } from '../core/daypart.js';
import { renderCategoryButtons } from '../components/category-buttons.js';
import { initPlacesMap } from '../components/map.js';
import { showToast } from '../components/toast.js';
import { loadCollections, collectionUrl, collectionPlaceSlugs } from '../core/collections.js';
import { collectionCardHtml } from '../components/collection-card.js';
import { loadNow, pickNow } from '../core/now.js';
import { loadWeather, weatherMode } from '../core/weather.js';

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

/** Места «под момент» (core/now.js) встают в первые ряды ленты — через
 *  несколько карточек, а не стеной: 2-я, 5-я, 9-я, 14-я позиция. */
const NOW_SLOTS = [1, 4, 8, 13];
function withNowPlaces(places, picks) {
  const slugs = new Set(picks.map((p) => p.slug));
  const rest = places.filter((p) => !slugs.has(p.slug));
  picks.forEach((p, i) => rest.splice(Math.min(NOW_SLOTS[i] ?? rest.length, rest.length), 0, p));
  return rest;
}

/** Подборки — авторские статьи на отдельных страницах (collection.html). */
// Столько подборок в полосе «Готовые планы»; остальные — в напоминаниях
const PLANS_IN_BAND = 3;

async function renderCollections() {
  const grid = $('#collections-grid');
  if (!grid) return [];
  try {
    const collections = await loadCollections();
    grid.innerHTML = collections.slice(0, PLANS_IN_BAND).map(collectionCardHtml).join('');
    return collections;
  } catch (err) {
    console.error('[home] подборки:', err);
    return [];
  }
}

/** Карточки-напоминания в ленте — по кругу: подборка, «Выбрать вместе»,
 *  подборка, «Предложить место». Подборок будет много, поэтому они — через
 *  раз. В полной ленте — только те, которых не было в полосе «Готовые планы»
 *  (пока других нет, их место пропускается). В категории или настроении
 *  полосы нет — там любые подборки, где есть места из этой ленты. */
function reminderCards({ collections }) {
  const photoCard = ({ href, photo, chip, title, link }) => `
    <a class="feed-promo" href="${href}">
      <img class="feed-promo__img" src="${escapeHtml(photo || '')}" alt="" loading="lazy">
      <span class="feed-promo__chip">${escapeHtml(chip)}</span>
      <span class="feed-promo__text"><b>${escapeHtml(title)}</b><small>${escapeHtml(link)}</small></span>
    </a>`;
  const notInBand = collections.slice(PLANS_IN_BAND);
  const plans = [...notInBand, ...collections.slice(0, PLANS_IN_BAND)];

  const plan = (round, { filtered, list }) => {
    let pool = notInBand;
    if (filtered) {
      const inList = new Set(list.map((p) => p.slug));
      pool = plans.filter((c) => collectionPlaceSlugs(c).some((s) => inList.has(s)));
    }
    if (!pool.length) return null;
    const c = pool[round % pool.length];
    return { ratio: SERVICE_RATIO, html: photoCard({ href: collectionUrl(c.slug), photo: c.coverSm || c.cover, chip: 'Готовый план', title: c.title, link: 'Открыть →' }) };
  };
  const together = () => ({ ratio: SERVICE_RATIO, html: serviceCardHtml({ href: 'vmeste/?from=feed', iconName: 'users', title: 'Не можете решить вдвоём?', link: 'Выбрать вместе →' }) });
  const suggest = () => ({ ratio: SERVICE_RATIO, html: serviceCardHtml({ href: 'suggest/', iconName: 'heart', title: 'Знаешь место, которого здесь нет?', link: 'Расскажи о нём →' }) });

  // k-е напоминание: чётные — подборки (k / 2 — какая по счёту), нечётные —
  // по очереди «Выбрать вместе» и «Предложить место»
  return (k, ctx) => (k % 2 === 0 ? plan(k / 2, ctx) : (k % 4 === 1 ? together() : suggest()));
}

async function main() {
  const collectionsShown = renderCollections();
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

  // «Готовые планы» — полоса в ленте после 3-го ряда
  const collections = await collectionsShown;
  const showcases = {};
  if (collections.length) showcases[3] = $('#collections');
  else $('#collections')?.remove();

  // «Сейчас» — не отдельный блок: места под погоду, время и сезон встают в
  // первые ряды ленты с короткой плашкой «почему сейчас»
  const entry = await nowEntry;
  const w = await weather;
  const view = entry ? pickNow(entry, places, { weather: w }) : null;
  const picks = view ? view.cards : [];
  // Плашка — только когда причина особенная: закат или «всю ночь». «Под
  // крышей» и часы работы — не повод выделять место, таких много
  const SPECIAL = ['sunset', 'moon'];
  const badge = (c) => (SPECIAL.includes(c.reason?.icon) ? { icon: c.reason.icon, text: c.reason.text } : { text: 'Сейчас в тему' });
  const nowBadges = new Map(picks.map((c) => [c.place.slug, badge(c)]));
  const feed = initFeed(withNowPlaces(places, picks.map((c) => c.place)), {
    nowBadges, showcases, reminder: reminderCards({ collections }),
    // «Выбрать вместе» — самой первой карточкой ленты
    lead: { ratio: SERVICE_RATIO, html: serviceCardHtml({ href: 'vmeste/?from=feed-top', iconName: 'users', title: 'Идёшь не один?', link: 'Выбрать вместе →' }) }
  });
  applyUrlFilter(feed);
  liveHeroMoods(places, { daypart: getDaypart(), bad: weatherMode(w) === 'bad' });
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
  // После переключения — к переключателю: карта сразу во весь экран под ним,
  // а лента — с начала
  const toToolbar = (instant) => {
    const bar = $('.feed-toolbar');
    const header = $('.main-header');
    if (!bar) return;
    window.scrollTo({
      top: bar.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight : 0) - 8,
      behavior: instant ? 'instant' : 'smooth'
    });
  };
  btns.forEach((b) => on(b, 'click', () => { setView(b.dataset.view); toToolbar(); }));
  // Ссылки «Карта» из меню и подвала ведут на ./#map-section
  const fromHash = () => { if (window.location.hash === '#map-section') { setView('map'); toToolbar(true); } };
  window.addEventListener('hashchange', fromHash);
  fromHash();
  // Строка над лентой прилипла к шапке — подложка во всю ширину и без шва
  const toolbar = $('.feed-toolbar');
  if (toolbar) {
    const syncStuck = () => {
      const header = $('.main-header');
      const stuck = toolbar.getBoundingClientRect().top <= (header ? header.offsetHeight : 0) + 1
        && !toolbar.classList.contains('feed-toolbar--map');
      toolbar.classList.toggle('is-stuck', stuck);
      document.body.classList.toggle('feed-toolbar-stuck', stuck);
    };
    window.addEventListener('scroll', syncStuck, { passive: true });
    syncStuck();
  }
  // «Удиви меня» в конце ленты открывает тот же рандомайзер, что в hero
  $$('[data-random]').forEach((b) => on(b, 'click', () => $('#hero-random-icon')?.click()));
}

main();
