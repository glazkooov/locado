// pages/home.js — точка входа index.html.

import { goal, categoryGoal } from '../core/analytics.js';
import { $, $$, on } from '../core/dom.js';
import { escapeHtml } from '../core/format.js';
import { loadPlaces, placeUrl, CATEGORIES } from '../core/places.js';
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
 *  Возвращает view из pickNow (или null): показанные места и запас (more). */
function renderNow(entry, places, weather) {
  const section = $('#now-section');
  if (!section || !entry) return null;
  const view = pickNow(entry, places, { weather });
  if (!view.cards.length) return null;
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
  return view;
}


/** Подборки — авторские статьи на отдельных страницах (collection.html). */
async function renderCollections() {
  const grid = $('#collections-grid');
  if (!grid) return [];
  try {
    const collections = await loadCollections();
    grid.innerHTML = collections.slice(0, 3).map(collectionCardHtml).join('');
    return collections;
  } catch (err) {
    console.error('[home] подборки:', err);
    return [];
  }
}

/** Карточки-напоминания в ленте — по кругу: подборка, «Сейчас», «Выбрать
 *  вместе», «Предложить место». Полосы наверху привлекли внимание, дальше
 *  лента напоминает о них — и каждый раз показывает другое: следующую
 *  подборку, следующее место «под момент». Сначала то, чего не было в
 *  полосах, потом — что было.
 *  В категории или настроении — только уместное: подборки, где есть места
 *  из этой ленты, и места «Сейчас» из неё же. */
function reminderCards({ view, collections }) {
  const photoCard = ({ href, photo, chip, title, link }) => `
    <a class="feed-promo" href="${href}">
      <img class="feed-promo__img" src="${escapeHtml(photo || '')}" alt="" loading="lazy">
      <span class="feed-promo__chip">${escapeHtml(chip)}</span>
      <span class="feed-promo__text"><b>${escapeHtml(title)}</b><small>${escapeHtml(link)}</small></span>
    </a>`;
  const shownPlans = 3; // столько подборок в полосе «Готовые планы»
  const plans = [...collections.slice(shownPlans), ...collections.slice(0, shownPlans)];
  const nowPicks = view ? [...view.more, ...view.cards] : [];
  const pick = (list, round) => (list.length ? list[round % list.length] : null);

  const kinds = [
    (round, { filtered, list }) => {
      const inList = new Set(list.map((p) => p.slug));
      const pool = filtered ? plans.filter((c) => collectionPlaceSlugs(c).some((s) => inList.has(s))) : plans;
      const c = pick(pool, round);
      return c && { ratio: 1.25, html: photoCard({ href: collectionUrl(c.slug), photo: c.coverSm || c.cover, chip: 'Готовый план', title: c.title, link: 'Открыть →' }) };
    },
    (round, { filtered, list }) => {
      const inList = new Set(list.map((p) => p.slug));
      const pool = filtered ? nowPicks.filter((c) => inList.has(c.place.slug)) : nowPicks;
      const c = pick(pool, round);
      return c && { ratio: 1.25, html: photoCard({
        href: placeUrl(c.place.slug),
        photo: c.place.photoSm || c.place.photo,
        chip: view.eyebrow || 'Сейчас',
        title: c.place.name,
        link: c.reason ? `${c.reason.text} →` : `${view.title} →`
      }) };
    },
    () => ({ ratio: SERVICE_RATIO, html: serviceCardHtml({ href: 'vmeste/?from=feed', iconName: 'users', title: 'Не можете решить вдвоём?', link: 'Выбрать вместе →' }) }),
    () => ({ ratio: SERVICE_RATIO, html: serviceCardHtml({ href: 'suggest/', iconName: 'heart', title: 'Знаешь место, которого здесь нет?', link: 'Расскажи о нём →' }) })
  ];
  return (k, ctx) => kinds[k % kinds.length](Math.floor(k / kinds.length), ctx) || null;
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

  // «Готовые планы» и «Сейчас» — полосы в ленте, после 3-го и 8-го ряда:
  // подборки приоритетнее, поэтому первыми, а «Сейчас» — подальше, чтобы
  // полосы не шли одна за другой
  const entry = await nowEntry;
  const view = renderNow(entry, places, await weather);
  const spotlight = view ? view.cards.map((c) => c.place) : [];
  const collections = await collectionsShown;
  const showcases = {};
  if (collections.length) showcases[3] = $('#collections');
  else $('#collections')?.remove();
  if (spotlight.length) showcases[8] = $('#now-section');

  // Места из «Сейчас» — в конец ленты: в полосе «Сейчас» они уже есть
  const inSpotlight = new Set(spotlight.map((p) => p.slug));
  const feed = initFeed(
    [...places.filter((p) => !inSpotlight.has(p.slug)), ...places.filter((p) => inSpotlight.has(p.slug))],
    { seasonal: inSpotlight, showcases, reminder: reminderCards({ view, collections }) }
  );
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
  // «Удиви меня» в конце ленты открывает тот же рандомайзер, что в hero
  $$('[data-random]').forEach((b) => on(b, 'click', () => $('#hero-random-icon')?.click()));
}

main();
