// pages/place.js — точка входа place.html.

import { renderCredit } from '../core/credits.js';
import { goal } from '../core/analytics.js';
import { $, $$, on } from '../core/dom.js';
import {
  escapeHtml, safeUrl, cssUrl, getOpenStatus, describeStatusTimer, scheduleHtml, telHref, displayHost,
  openStatusLabel, isAlwaysOpen
} from '../core/format.js';
import {
  loadPlaces, bySlug, similar, nearby, placeIntent, walkMinutes, toggleFavoritePlace, markVisited, placeUrl, metroList, categoryLabel
} from '../core/places.js';
import * as Storage from '../core/storage.js';
import { similarCardHtml, bindImageFallback } from '../components/card.js';
import { createModal } from '../components/modal.js';
import { initPlaceMap, routeUrl } from '../components/map.js';
import { showToast } from '../components/toast.js';
import { icon } from '../core/icons.js';
import { loadCollections, collectionsWithPlace, collectionUrl, COLLECTION_TYPES } from '../core/collections.js';
import { initShare } from '../components/share.js';

let timerInterval = null;

function showNotFound(message) {
  const errorScreen = $('#place-error');
  const content = $('#place-content');
  if (content) content.hidden = true;
  // Без фото-hero прозрачная шапка с белым логотипом потерялась бы на светлом фоне
  $('.main-header')?.classList.remove('main-header--overlay');
  // Панель «Позвонить / Маршрут / Поделиться» без места бессмысленна
  const actionsBar = $('#mobile-actions-bar');
  if (actionsBar) actionsBar.hidden = true;
  if (errorScreen) {
    if (message) {
      const textEl = $('#place-error-text');
      if (textEl) textEl.textContent = message;
    }
    errorScreen.hidden = false;
  }
}

function setMetaTags(place) {
  document.title = `${place.name} — Локадо`;
  $('meta[property="og:title"]')?.setAttribute('content', place.name);
  if (place.photo) $('meta[property="og:image"]')?.setAttribute('content', new URL(place.photo, document.baseURI).href);
  $('meta[property="og:description"]')?.setAttribute('content', place.description || '');
}

function updateFavButtonUI(isFav) {
  [$('#fav-btn-hero'), $('#action-fav')].forEach((btn) => {
    if (!btn) return;
    btn.classList.toggle('active', isFav);
    btn.setAttribute('aria-pressed', String(isFav));
    const heart = btn.querySelector('.icon');
    const label = btn.querySelector('span');
    heart?.classList.toggle('icon--filled', isFav);
    if (label) label.textContent = isFav ? 'В избранном' : 'В избранное';
  });
}

function renderHero(place) {
  $('.place-hero')?.classList.remove('is-loading');
  setHeroPhoto(place);
  $('#place-category').textContent = place.type || categoryLabel(place.category);
  $('#place-name').textContent = place.name;
  // Краткое описание вместо шаблонного «… в центре Москвы» (не у всех мест правда)
  $('#place-subtitle').textContent = place.subtitle || place.description || '';
  renderFacts(place);

  updateFavButtonUI(Storage.isFavorite(place.slug));

  const visitedBtn = $('#visited-btn');
  if (visitedBtn) visitedBtn.classList.toggle('active', Storage.isVisited(place.slug));
}

/** Фото в hero — только если оно действительно загрузилось. Нет фото или
 *  файл битый — тёплая подложка по категории места (place.css,
 *  .place-hero--no-photo) и hero ниже: пустой тёмный экран ничего не говорит.
 *  Подпись к фото — тоже только у загрузившегося фото: подпись можно внести
 *  раньше, чем сам файл. photoFocus («50% 70%») — какую часть кадра
 *  оставить, когда широкий экран обрезает вертикальное фото. */
function setHeroPhoto(place) {
  const hero = $('.place-hero');
  const heroBg = $('#hero-bg');
  if (!hero || !heroBg) return;
  hero.dataset.category = place.category || '';
  const noPhoto = () => {
    hero.classList.add('place-hero--no-photo');
    renderCredit($('#photo-credit'), null);
  };
  if (!place.photo) { noPhoto(); return; }
  const img = new Image();
  img.onload = () => {
    heroBg.style.backgroundImage = cssUrl(place.photo);
    if (place.photoFocus) heroBg.style.backgroundPosition = place.photoFocus;
    renderCredit($('#photo-credit'), place.photoCredit);
  };
  img.onerror = noPhoto;
  img.src = place.photo;
}

/** Быстрые факты в hero: открыто ли сейчас и цена. Метро — в «Где и когда»,
 *  рядом с адресом. */
function renderFacts(place) {
  const list = $('#place-facts');
  if (!list) return;
  const facts = [];
  const status = openStatusLabel(place);
  if (status) facts.push({ icon: 'clock', text: status.text, mod: status.isOpen ? 'open' : 'closed' });
  if (place.price) {
    // «Билеты — на сайте музея» без ссылки заставляет искать сайт самому
    const website = safeUrl(place.website, '');
    const href = website && /на сайте/i.test(place.price) ? website : '';
    facts.push({ icon: 'ticket', text: place.price, href, external: true });
  }
  list.innerHTML = facts.map(heroFactHtml).join('');
}

function heroFactHtml(f) {
  const body = `${icon(f.icon)} ${escapeHtml(f.text)}`;
  const content = f.href
    ? `<a class="hero-fact__link" href="${escapeHtml(f.href)}"${f.external ? ' target="_blank" rel="noopener"' : ''}>${body}</a>`
    : body;
  return `
    <li class="hero-fact${f.mod ? ` hero-fact--${f.mod}` : ''}">${content}</li>`;
}

/** Показывает строку, только если есть что показать; прочерков не ставим. */
function setLine(el, html) {
  if (!el) return false;
  el.innerHTML = html || '';
  el.hidden = !html;
  return Boolean(html);
}

function renderInfo(place) {
  // Адрес, метро и подсказка «как дойти» — одной строкой с картой над ней
  const metro = metroList(place);
  const hasAddress = setLine($('#place-address'), place.address ? escapeHtml(place.address) : '');
  const hasMetro = setLine($('#place-metro'), metro.length ? escapeHtml(`м. ${metro.join(', м. ')}`) : '');
  const hasDirections = setLine($('#place-directions'), place.directions ? escapeHtml(place.directions) : '');
  $('#address-row').hidden = !hasAddress && !hasMetro && !hasDirections;

  // Часы: сверху «Открыто до 22:00» / «Откроется завтра в 10:00», под ними
  // часы на сегодня и «Все дни». Круглосуточно во все дни — хватает статуса
  $('#hours-row').hidden = !place.schedule;
  const scheduleContainer = $('#place-schedule');
  scheduleContainer.innerHTML = place.schedule && !isAlwaysOpen(place.schedule)
    ? scheduleHtml(place.schedule, new Date(), place.season) : '';
  // «Сегодня выходной, откроется завтра в 10:00» повторяло бы статус над ним
  const todayLine = $('.today-schedule > span', scheduleContainer);
  if (todayLine && /^Сегодня выходной/.test(todayLine.textContent)) todayLine.remove();
  const showBtn = $('.show-full-schedule-btn', scheduleContainer);
  const fullSchedule = $('.full-schedule-modal', scheduleContainer);
  if (showBtn && fullSchedule) {
    on(showBtn, 'click', (e) => {
      e.stopPropagation();
      const willShow = fullSchedule.hidden;
      fullSchedule.hidden = !willShow;
      showBtn.setAttribute('aria-expanded', String(willShow));
      showBtn.textContent = willShow ? 'Свернуть' : 'Все дни';
    });
  }

  refreshOpenStatus(place);

  // Телефон и сайт — двумя кнопками под часами
  const phoneBtn = $('#place-phone');
  const siteBtn = $('#place-website');
  const website = safeUrl(place.website, '');
  phoneBtn.hidden = !place.phone;
  if (place.phone) {
    phoneBtn.href = telHref(place.phone);
    phoneBtn.setAttribute('aria-label', `Позвонить: ${place.phone}`);
  }
  siteBtn.hidden = !website;
  if (website) siteBtn.href = website;
  $('#contact-btns').hidden = !place.phone && !website;

  if (!place.phone) {
    $('#call-btn')?.style.setProperty('display', 'none');
    $('#action-call')?.style.setProperty('display', 'none');
  }
}

// «Закроется через …» показываем, только когда до закрытия меньше часа:
// «Открыто до 22:00» уже есть в hero, а «через 7 часов 30 минут» его дублировало
const CLOSING_SOON_MS = 60 * 60000;

/** «Закроется через 40 минут» / «Откроется через …» под часами работы. */
function refreshOpenStatus(place) {
  const label = openStatusLabel(place);
  const statusEl = $('#open-status');
  if (statusEl) {
    statusEl.textContent = label?.text || '';
    statusEl.hidden = !label;
    statusEl.classList.toggle('where-row__status--closed', Boolean(label && !label.isOpen));
  }
  const status = getOpenStatus(place);
  const timerSpan = $('#closing-timer');
  if (!timerSpan) return;
  const soon = !status.isOpen || (status.nextChangeAt && status.nextChangeAt - new Date() <= CLOSING_SOON_MS);
  const text = soon ? describeStatusTimer(status) : '';
  timerSpan.textContent = text;
  timerSpan.hidden = !text;
  timerSpan.classList.toggle('closing-timer--open', status.isOpen);
}

// Ответы редакции «когда лучше» и «что заметить» — короткими акцентами под
// описанием; «почему стоит пойти» — крупным вступлением к нему
const STORY_TIPS = [
  { key: 'when', title: 'Когда лучше', icon: 'clock' },
  { key: 'notice', title: 'Не пропусти', icon: 'star' }
];

function renderStory(place) {
  const story = place.story || {};
  setLine($('#place-lead'), story.why ? escapeHtml(story.why) : '');
  const tips = STORY_TIPS.filter((t) => story[t.key]);
  setLine($('#place-tips'), tips.map((t) => `
      <div class="place-tip">
        <span class="place-tip__icon">${icon(t.icon)}</span>
        <p><b>${t.title}</b>${escapeHtml(story[t.key])}</p>
      </div>`).join(''));
}

/** «Позвать друга»: окно с выбором вместе (vmeste/ — это место уже в
 *  выборе) и обычной ссылкой. Открывают карточка «Идёшь не один?», кнопка в
 *  hero и кнопка в нижней панели. */
function initInvite(place) {
  const modal = createModal($('#invite-modal'), {
    onOpen: () => goal('invite_open', { place: place.slug })
  });
  if (!modal) return;
  const photo = $('#invite-photo');
  if (photo && place.photo) photo.style.backgroundImage = cssUrl(place.photoSm || place.photo);
  $('#invite-together').href = `vmeste/?with=${encodeURIComponent(place.id)}`;
  $('#invite-together-text').textContent = `${place.name} уже будет в выборе. Добавь ещё пару мест — друг отметит, куда ему хочется, и вы сразу увидите совпадение`;
  $$('[data-invite]').forEach((btn) => on(btn, 'click', () => modal.open()));
  // Сначала закрываем это окно, потом открывается «Поделиться» (initShare)
  on($('#invite-share'), 'click', () => modal.close());
}

function renderDescription(place) {
  const text = place.description_long || place.description || '';
  setLine($('#place-description'), text ? `<p>${escapeHtml(text)}</p>` : '');
  $('#place-readers').hidden = !place.fromReaders;
}

const AMENITY_ICONS = { wifi: 'wifi', parking: 'square-parking', card: 'credit-card', kids: 'baby', outdoor: 'trees', delivery: 'truck', takeaway: 'shopping-bag' };

function renderAmenities(place) {
  const container = $('#place-amenities');
  if (!place.amenities || !place.amenities.length) { container.style.display = 'none'; return; }
  container.style.display = 'block';
  container.innerHTML = `<div class="amenities-grid">${place.amenities.map((item) =>
    `<div class="amenity-item">${icon(AMENITY_ICONS[item.icon] || 'check')} ${escapeHtml(item.name)}</div>`
  ).join('')}</div>`;
}

function renderGallery(place) {
  const section = $('#gallery-section');
  const container = $('#place-gallery');
  if (!place.gallery || !place.gallery.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  container.innerHTML = place.gallery.map((url) => `
    <div class="gallery-item"><img src="${escapeHtml(safeUrl(url))}" alt="${escapeHtml(place.name)}" loading="lazy"></div>
  `).join('');
  bindImageFallback(container);
}

async function renderMap(place) {
  const container = $('#place-map-container');
  await initPlaceMap(container, place);
  // Не загрузилась карта — внутри надпись «Карта временно недоступна», а
  // ссылка «Как добраться» поверх неё всё равно ведёт в Яндекс.Карты
  const routeLink = $('#route-link');
  if (routeLink) routeLink.href = routeUrl(place);
  on(routeLink, 'click', () => goal('route_click', { place: place.slug }));
}

/* «Куда пойдём дальше?» — то, что просили в интервью: «сходил в одно место —
   хочется рядом поесть или догулять». Соседи до ~15 минут пешком разложены
   по тому, зачем туда идти; первая карточка ряда — готовый план из двух мест. */
const NEARBY_TAB = { eat: 'Поесть', walk: 'Погулять', see: 'Посмотреть' };
// После прогулки или музея первым делом хочется есть, после кафе — гулять
const NEARBY_ORDER = { eat: ['walk', 'see', 'eat'], walk: ['eat', 'see', 'walk'], see: ['eat', 'walk', 'see'] };

/** Готовые планы: шаг 1 — чего хочется после этого места, шаг 2 — ближайшее
 *  к шагу 1 место другого рода. План из одного места не нужен — это просто
 *  первая карточка ряда. */
function nearbyPlans(place, list) {
  const [first, second] = NEARBY_ORDER[placeIntent(place)];
  return list.filter((x) => x.intent === first).slice(0, 3).map((s1) => {
    let pool = list.filter((x) => x.intent === second);
    if (!pool.length) pool = list.filter((x) => x.intent !== first);
    const s2 = pool
      .map((x) => ({ ...x, minutes: walkMinutes(s1.place.coords, x.place.coords) }))
      .sort((a, b) => a.minutes - b.minutes)[0] || null;
    return { s1, s2 };
  }).filter((x) => x.s2);
}

/** Карточка плана в ряду: два фото встык и коротко — «Маршрут отсюда».
 *  Подробности (остановки, путь, другой вариант) — в окне по нажатию. */
function nearbyPlanCardHtml({ s1, s2 }) {
  const photo = (p) => `<img src="${escapeHtml(p.photoSm || p.photo || '')}" alt="" loading="lazy">`;
  return `
    <button type="button" class="similar-card plan-card" id="nearby-plan-open" aria-haspopup="dialog">
      <span class="plan-card__photos">${photo(s1.place)}${photo(s2.place)}
        <span class="plan-card__chip">Готовый план</span>
      </span>
      <span class="info">
        <span class="plan-card__title">Маршрут отсюда</span>
        <span class="plan-card__sub">Ещё 2 места рядом</span>
      </span>
    </button>`;
}

function planStopHtml(p, kicker) {
  const here = kicker === 'Ты здесь';
  const img = `<img class="plan-stop__img" src="${escapeHtml(p.photoSm || p.photo || '')}" alt="" loading="lazy">`;
  // Фото тоже ведёт на страницу места; из клавиатуры — одна ссылка, на названии
  return `
    <li class="plan-stop">
      ${here ? img : `<a class="plan-stop__photo" href="${placeUrl(p.slug)}" tabindex="-1" aria-hidden="true">${img}</a>`}
      <span class="plan-stop__text">
        <span class="plan-stop__kicker">${kicker}</span>
        ${here ? `<span class="plan-stop__name">${escapeHtml(p.name)}</span>` : `<a class="plan-stop__name" href="${placeUrl(p.slug)}">${escapeHtml(p.name)}</a>`}
        <span class="plan-stop__desc">${escapeHtml(p.description || p.type || '')}</span>
      </span>
    </li>`;
}

function renderNearby(place, allPlaces) {
  const section = $('#place-nearby');
  const container = $('#nearby-places-container');
  if (!section || !container) return;
  const list = nearby(allPlaces, place, { maxMinutes: 15, count: 40 })
    .map((x) => ({ ...x, intent: placeIntent(x.place) }));
  if (!list.length) return;
  const intents = NEARBY_ORDER[placeIntent(place)].filter((k) => list.some((x) => x.intent === k));
  const plans = nearbyPlans(place, list);
  let active = intents[0];
  let alt = 0;

  const tabs = $('#nearby-tabs');
  const NEXT_KICKER = { eat: 'Поесть', walk: 'Погулять', see: 'Посмотреть' };
  const planModal = plans.length ? createModal($('#plan-modal')) : null;
  const fillPlan = () => {
    const { s1, s2 } = plans[alt % plans.length];
    $('#plan-stops').innerHTML = planStopHtml(place, 'Ты здесь')
      + planStopHtml(s1.place, `Потом — ${NEXT_KICKER[s1.intent].toLowerCase()}`)
      + planStopHtml(s2.place, `И ещё — ${NEXT_KICKER[s2.intent].toLowerCase()}`);
    const points = [place, s1.place, s2.place].filter((p) => p.coords);
    $('#plan-route').href = `https://yandex.ru/maps/?rtext=${points.map((p) => p.coords.join(',')).join('~')}&rtt=pd`;
    $('#plan-other').hidden = plans.length < 2;
    bindImageFallback($('#plan-stops'));
  };
  const draw = () => {
    tabs.innerHTML = intents.map((k) => {
      const n = list.filter((x) => x.intent === k).length;
      return `<button type="button" class="category-btn${k === active ? ' active' : ''}" data-intent="${k}" aria-pressed="${k === active}">${NEARBY_TAB[k]} <span class="nearby-tabs__count">${n}</span></button>`;
    }).join('');
    const plan = plans.length ? nearbyPlanCardHtml(plans[alt % plans.length]) : '';
    container.innerHTML = plan + list.filter((x) => x.intent === active).slice(0, 8)
      .map(({ place: p }) => similarCardHtml(p)).join('');
    bindImageFallback(container);
  };
  draw();
  on(tabs, 'click', '.category-btn', (e, btn) => { active = btn.dataset.intent; draw(); container.scrollLeft = 0; });
  on(container, 'click', '#nearby-plan-open', () => {
    fillPlan();
    planModal?.open();
    goal('nearby_plan', { place: place.slug });
  });
  on($('#plan-other'), 'click', () => { alt += 1; fillPlan(); draw(); });
  section.hidden = false;
  initSimilarNav(container, $('#nearby-prev'), $('#nearby-next'));
}

function renderSimilar(place, allPlaces) {
  const container = $('#similar-places-container');
  const list = similar(allPlaces, place, 6);
  // В конце ряда — вся категория места
  const moreCard = `
    <a href="./?category=${encodeURIComponent(place.category)}" class="similar-card similar-card--more">
      <span class="similar-card__more-label">Все места</span>
      <span class="similar-card__more-title">${escapeHtml(categoryLabel(place.category))} →</span>
    </a>`;
  container.innerHTML = list.map(similarCardHtml).join('') + moreCard;
  bindImageFallback(container);
  initSimilarNav(container, $('#similar-prev'), $('#similar-next'));
}

/** Стрелки «назад / дальше» у ряда похожих мест: листают на ширину видимой
 *  части и гаснут на краях. */
function initSimilarNav(scroller, prev, next) {
  if (!prev || !next) return;
  const sync = () => {
    const max = scroller.scrollWidth - scroller.clientWidth - 2;
    prev.disabled = scroller.scrollLeft <= 2;
    next.disabled = scroller.scrollLeft >= max;
    prev.closest('.similar-nav').hidden = max <= 0;
  };
  const step = (dir) => scroller.scrollBy({ left: dir * scroller.clientWidth * 0.8, behavior: 'smooth' });
  on(prev, 'click', () => step(-1));
  on(next, 'click', () => step(1));
  on(scroller, 'scroll', sync, { passive: true });
  on(window, 'resize', sync);
  sync();
}

/** Подборка строкой: маленькое фото, тип и название. Полная карточка с
 *  описанием здесь лишняя — человек уже выбирает конкретное место. */
function collectionRowHtml(c) {
  return `
    <a class="collection-row" href="${collectionUrl(c.slug)}" data-title="${escapeHtml(c.title)}">
      <span class="collection-row__photo" style='background-image: ${cssUrl(c.coverSm || c.cover)}' aria-hidden="true"></span>
      <span class="collection-row__body">
        <span class="collection-row__type">${escapeHtml(COLLECTION_TYPES[c.type] || '')}</span>
        <span class="collection-row__title">${escapeHtml(c.title)}</span>
      </span>
    </a>`;
}

/** «Есть в подборках»: статьи, где упоминается место. Без подборок — секции нет. */
async function renderCollections(place) {
  const section = $('#place-collections');
  if (!section) return;
  try {
    const list = collectionsWithPlace(await loadCollections(), place.slug).slice(0, 3);
    if (!list.length) return;
    $('#place-collections-grid').innerHTML = list.map(collectionRowHtml).join('');
    section.hidden = false;
  } catch (err) {
    console.error('[place] подборки:', err);
  }
}

function renderReviews(slug) {
  const reviews = Storage.getReviews(slug);
  const container = $('#reviews-list');
  const avg = reviews.length ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) : 0;
  $('#average-rating').textContent = avg ? avg.toFixed(1) : '0';
  $('#reviews-count').textContent = `${reviews.length} отзывов`;

  const starsSpan = $('#average-stars');
  starsSpan.innerHTML = [1, 2, 3, 4, 5].map((i) => icon('star', i <= Math.round(avg) ? 'icon--filled' : '')).join('');

  if (!reviews.length) { container.innerHTML = '<p>Отзывов пока нет — стань первым!</p>'; return; }
  container.innerHTML = reviews.map((rev) => `
    <div class="review-card">
      <div class="review-header">
        <div class="review-author">${icon('circle-user')} ${escapeHtml(rev.name)}</div>
        <div class="review-rating">${'★'.repeat(rev.rating)}${'☆'.repeat(5 - rev.rating)}</div>
        <div class="review-date">${new Date(rev.date).toLocaleDateString('ru-RU')}</div>
      </div>
      <div class="review-text">${escapeHtml(rev.text)}</div>
    </div>`).join('');
}

function attachEventListeners(place, allPlaces) {
  // Избранное
  const favBtn = $('#fav-btn-hero');
  on(favBtn, 'click', () => {
    const isFav = toggleFavoritePlace(place);
    updateFavButtonUI(isFav);
    showToast(isFav ? 'Добавлено в избранное' : 'Удалено из избранного');
  });

  // Посещено
  const visitedBtn = $('#visited-btn');
  on(visitedBtn, 'click', () => {
    const isNew = markVisited(place);
    visitedBtn.classList.add('active');
    if (isNew) showToast('Спасибо! Место добавлено в твой список посещённых.');
  });

  // Позвонить
  const callBtn = $('#call-btn');
  const contactGoal = (how) => goal('contact_click', { 'Связаться': { [place.name]: how } });
  if (place.phone) on(callBtn, 'click', () => { contactGoal('Звонок'); window.location.href = telHref(place.phone); });
  on($('#place-phone'), 'click', (e) => { if (e.target.closest('a')) contactGoal('Звонок'); });
  on($('#place-website'), 'click', (e) => { if (e.target.closest('a')) contactGoal('Сайт'); });

  // «Позвать друга» → «Просто отправить ссылку»
  initInvite(place);
  initShare([$('#invite-share')], () => ({ title: place.name, text: place.description }), { what: `Место: ${place.name}` });

  // Мобильная панель быстрых действий
  on($('#action-fav'), 'click', () => favBtn.click());
  const actionCall = $('#action-call');
  if (actionCall) {
    if (place.phone) on(actionCall, 'click', () => callBtn.click());
    else actionCall.style.display = 'none';
  }
  on($('#action-route'), 'click', () => {
    if (!place.coords) return;
    goal('route_click', { place: place.slug });
    window.open(routeUrl(place), '_blank');
  });

  // Сообщить о неточности — Яндекс Форма в окне
  let reportTopic = '';
  const reportModal = createModal($('#report-modal'), {
    onOpen: () => { goal('report_open', { place: place.slug }); loadReportForm(place, reportTopic); }
  });
  // Две ссылки: под часами и адресом и в конце «О месте» (с темой «Ошибка
  // в описании» — уходит в форму параметром what)
  $$('[data-report]').forEach((btn) => on(btn, 'click', () => {
    reportTopic = btn.dataset.report;
    reportModal?.open();
  }));

  // Форма отзыва
  const form = $('#review-form');
  const starIcons = $$('#star-rating .icon');
  const ratingHidden = $('#review-rating');
  starIcons.forEach((star) => {
    on(star, 'click', () => {
      const val = parseInt(star.dataset.value, 10);
      ratingHidden.value = val;
      starIcons.forEach((s, idx) => { s.classList.toggle('icon--filled', idx < val); s.classList.toggle('active', idx < val); });
    });
  });
  on(form, 'submit', (e) => {
    e.preventDefault();
    const name = $('#review-name').value.trim();
    const rating = parseInt(ratingHidden.value, 10);
    const text = $('#review-text').value.trim();
    if (!name || !rating || !text) { showToast('Заполни все поля', true); return; }
    Storage.addReview(place.slug, { name, rating, text, date: new Date().toISOString() });
    renderReviews(place.slug);
    form.reset();
    ratingHidden.value = 0;
    starIcons.forEach((s) => s.classList.remove('icon--filled', 'active'));
    showToast('Отзыв добавлен!');
  });
}

// Яндекс Форма «Сообщить о неточности». Название и ссылка места уходят в
// форму параметрами URL: в настройках формы у скрытых вопросов должны быть
// идентификаторы place и page — тогда они заполнятся сами
const REPORT_FORM_ID = '6ab9085f49af475392c00f2e';
const REPORT_FORM_URL = `https://forms.yandex.ru/u/${REPORT_FORM_ID}/`;
const YA_FORMS_EMBED = 'https://forms.yandex.ru/_static/embed.js';

function reportFormUrl(place, embed, topic = '') {
  const params = new URLSearchParams({ place: place.name, page: window.location.href });
  if (topic) params.set('what', topic);
  if (embed) params.set('iframe', '1');
  return `${REPORT_FORM_URL}?${params}`;
}

/** Форма грузится при первом открытии окна; embed.js Яндекса подгоняет
 *  высоту iframe под форму (без него у окна остаётся своя прокрутка). */
function loadReportForm(place, topic) {
  const frame = $('#report-frame');
  const fallback = $('#report-fallback');
  if (fallback) fallback.href = reportFormUrl(place, false, topic);
  if (!frame) return;
  const src = reportFormUrl(place, true, topic);
  // Та же тема — форма уже загружена, не перезагружаем
  if (frame.dataset.topic === topic && frame.src) return;
  frame.dataset.topic = topic;
  frame.src = src;
  if (!document.querySelector(`script[src="${YA_FORMS_EMBED}"]`)) {
    const script = document.createElement('script');
    script.src = YA_FORMS_EMBED;
    script.async = true;
    document.head.append(script);
  }
}

async function main() {
  const slug = new URLSearchParams(window.location.search).get('slug');
  if (!slug) { showNotFound(); return; }

  let places;
  try {
    places = await loadPlaces();
  } catch (err) {
    console.error('[place] не удалось загрузить места:', err);
    showToast('Не получилось загрузить места. Обнови страницу — обычно помогает.', true);
    showNotFound('Не получилось загрузить данные. Обнови страницу — обычно помогает.');
    return;
  }

  const place = bySlug(places, slug);
  if (!place) { showNotFound(); return; }

  setMetaTags(place);

  renderHero(place);
  renderStory(place);
  renderInfo(place);
  renderDescription(place);
  renderAmenities(place);
  renderGallery(place);
  renderNearby(place, places);
  renderSimilar(place, places);
  renderCollections(place);
  renderReviews(place.slug);
  attachEventListeners(place, places);

  await renderMap(place);

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => refreshOpenStatus(place), 60000);
}

main();
