// pages/place.js — точка входа place.html.

import { renderCredit } from '../core/credits.js';
import { goal } from '../core/analytics.js';
import { $, $$, on, slugFromUrl } from '../core/dom.js';
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
  if (place.description) $('meta[name="description"]')?.setAttribute('content', place.description);
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
    heroBg.style.backgroundImage = '';
    hero.classList.add('place-hero--no-photo');
    renderCredit($('#photo-credit'), null);
  };
  if (!place.photo) { noPhoto(); return; }
  if (place.photoFocus) heroBg.style.backgroundPosition = place.photoFocus;
  // Сначала уменьшенная копия: она лёгкая и уже грузится с самого начала
  // страницы (place/index.php). Большое фото подменяет её, когда загрузится;
  // успело раньше — копию не показываем
  let fullShown = false;
  const show = (url) => {
    heroBg.style.backgroundImage = cssUrl(url);
    renderCredit($('#photo-credit'), place.photoCredit);
  };
  if (place.photoSm && place.photoSm !== place.photo) {
    const small = new Image();
    small.onload = () => { if (!fullShown) show(place.photoSm); };
    small.src = place.photoSm;
  }
  const img = new Image();
  img.onload = () => { fullShown = true; show(place.photo); };
  img.onerror = noPhoto;
  img.src = place.photo;
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
  $('#place-facts').classList.toggle('place-facts--no-hours', !place.schedule);
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

  // Цена. «Билеты — на сайте музея» без ссылки заставляет искать сайт самому
  const website = safeUrl(place.website, '');
  const priceLink = website && /на сайте/i.test(place.price || '');
  $('#price-row').hidden = !setLine($('#place-price'), place.price
    ? (priceLink ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener">${escapeHtml(place.price)}</a>` : escapeHtml(place.price))
    : '');

  // «Позвонить», третья плитка, «Маршрут» — под справкой; чего нет — нет.
  // Плиток не больше трёх: одна ссылка — плитка с её названием, несколько —
  // «Соцсети» со списком снизу
  const phoneBtn = $('#place-phone');
  phoneBtn.hidden = !place.phone;
  if (place.phone) {
    phoneBtn.href = telHref(place.phone);
    phoneBtn.setAttribute('aria-label', `Позвонить: ${place.phone}`);
  }
  const links = placeLinks(place);
  const siteBtn = $('#place-website');
  siteBtn.hidden = links.length !== 1;
  if (links.length === 1) {
    const [link] = links;
    siteBtn.href = link.href;
    siteBtn.innerHTML = `${icon(link.icon)}<span>${escapeHtml(link.label)}</span>`;
  }
  $('#place-links').hidden = links.length < 2;
  // Только маршрут — одна плитка на всю ширину выглядела пустой кнопкой:
  // вместо плиток «Маршрут» встаёт в строку «Показать на карте»
  const routeOnly = !place.phone && !links.length;
  $('#route-link').hidden = !place.coords;
  $('#route-inline').hidden = !place.coords || !routeOnly;
  $('#place-acts').hidden = routeOnly;

  if (!place.phone) $('#action-call')?.style.setProperty('display', 'none');
}

/** Сайт и соцсети места: поле website и links: { telegram, vk } */
function placeLinks(place) {
  const path = (url) => { try { return new URL(url).pathname.replace(/^\/|\/$/g, ''); } catch (e) { return ''; } };
  const website = safeUrl(place.website, '');
  const telegram = safeUrl(place.links?.telegram, '');
  const vk = safeUrl(place.links?.vk, '');
  return [
    website && { label: 'Сайт', sub: displayHost(website), href: website, icon: 'globe' },
    telegram && { label: 'Telegram', sub: path(telegram) && `@${path(telegram)}`, href: telegram, icon: 'send' },
    vk && { label: 'ВКонтакте', sub: '', href: vk, icon: 'message-circle' }
  ].filter(Boolean);
}

/** «Соцсети»: список ссылок выезжает снизу */
function initLinks(place, contactGoal) {
  const links = placeLinks(place);
  const siteBtn = $('#place-website');
  on(siteBtn, 'click', () => contactGoal(links[0]?.label || 'Сайт'));
  if (links.length < 2) return;
  const list = $('#links-list');
  list.innerHTML = links.map((link) => `
    <a class="invite-option" href="${escapeHtml(link.href)}" target="_blank" rel="noopener" data-label="${escapeHtml(link.label)}">
      <span class="invite-option__icon">${icon(link.icon)}</span>
      <span><b>${escapeHtml(link.label)}</b>${link.sub ? `<small>${escapeHtml(link.sub)}</small>` : ''}</span>
    </a>`).join('');
  const modal = createModal($('#links-modal'));
  on($('#place-links'), 'click', () => modal?.open());
  on(list, 'click', (e) => {
    const link = e.target.closest('a[data-label]');
    if (link) contactGoal(link.dataset.label);
  });
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
    statusEl.classList.toggle('fact-row__status--closed', Boolean(label && !label.isOpen));
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
  // Пустая строка в тексте (\n\n) — новый абзац
  const text = place.description_long || place.description || '';
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  setLine($('#place-description'), paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join(''));
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

/** Карта — по кнопке «Показать на карте»: открывают её редко, а
 *  «Как добраться» и так ведёт в Яндекс.Карты. Скрипт Яндекса грузится
 *  только при первом открытии. Без координат — ни карты, ни маршрута. */
function initMap(place) {
  const routeLinks = [$('#route-link'), $('#route-inline')];
  const toggle = $('#map-toggle');
  const box = $('#place-map');
  if (!place.coords) {
    $('#map-row').hidden = true;
    return;
  }
  routeLinks.forEach((link) => {
    link.href = routeUrl(place);
    on(link, 'click', () => goal('route_click', { place: place.slug }));
  });
  let created = false;
  on(toggle, 'click', () => {
    const show = box.hidden;
    box.hidden = !show;
    toggle.setAttribute('aria-expanded', String(show));
    $('#map-toggle-label').textContent = show ? 'Скрыть карту' : 'Показать на карте';
    if (show && !created) {
      created = true;
      goal('map_open', { place: place.slug });
      // Не загрузилась — внутри надпись «Карта временно недоступна»
      initPlaceMap($('#place-map-container'), place);
    }
  });
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

/** Карточка плана в ряду: одно фото на всю карточку — второй остановки,
 *  первая и так стоит в ряду следом. Поверх — «Маршрут отсюда» и куда
 *  идти. Подробности — в окне по нажатию. */
function nearbyPlanCardHtml({ s1, s2 }) {
  const cover = [s2.place, s1.place].find((p) => p.photoSm || p.photo);
  return `
    <button type="button" class="similar-card plan-card" id="nearby-plan-open" aria-haspopup="dialog">
      ${cover ? `<img class="plan-card__cover" src="${escapeHtml(cover.photoSm || cover.photo)}" alt="" loading="lazy">` : ''}
      <span class="plan-card__chip">Готовый план</span>
      <span class="plan-card__text">
        <span class="plan-card__title">Маршрут отсюда</span>
        <span class="plan-card__sub">${escapeHtml(s1.place.name)} → ${escapeHtml(s2.place.name)}</span>
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

/** На компьютере «Есть в подборках» — справа от «Где и когда», под
 *  «Идёшь не один?»: там иначе пусто. На телефоне — внизу страницы. */
function placeCollectionsSection() {
  const section = $('#place-collections');
  const aside = $('#place-aside');
  const bottom = $('.place-more');
  if (!section || !aside || !bottom) return;
  const wide = window.matchMedia('(min-width: 900px)');
  const place = () => {
    if (wide.matches) aside.append(section);
    else bottom.before(section);
  };
  place();
  on(wide, 'change', place);
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

  if (!reviews.length) { container.innerHTML = '<p>Отзывов пока нет.</p>'; return; }
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

  // Позвонить, сайт и соцсети
  const contactGoal = (how) => goal('contact_click', { 'Связаться': { [place.name]: how } });
  on($('#place-phone'), 'click', () => contactGoal('Звонок'));
  initLinks(place, contactGoal);

  // «Позвать друга» → «Просто отправить ссылку»
  initInvite(place);
  initShare([$('#invite-share')], () => ({ title: place.name, text: place.description }), { what: `Место: ${place.name}` });

  // Мобильная панель быстрых действий
  on($('#action-fav'), 'click', () => favBtn.click());
  const actionCall = $('#action-call');
  if (actionCall) {
    if (place.phone) on(actionCall, 'click', () => { contactGoal('Звонок'); window.location.href = telHref(place.phone); });
    else actionCall.style.display = 'none';
  }
  on($('#action-route'), 'click', () => {
    if (!place.coords) return;
    goal('route_click', { place: place.slug });
    window.open(routeUrl(place), '_blank');
  });

  // Сообщить о неточности — Яндекс Форма в окне
  const reportModal = createModal($('#report-modal'), {
    onOpen: () => { goal('report_open', { place: place.slug }); loadReportForm(place); }
  });
  on($('[data-report]'), 'click', () => reportModal?.open());

  initActionsBar();

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

/** Нижняя панель на телефоне появляется, когда справка ушла с экрана: пока
 *  она видна, «Позвонить» и «Маршрут» уже под рукой. */
function initActionsBar() {
  const bar = $('#mobile-actions-bar');
  const facts = $('#place-facts');
  if (!bar || !facts || !('IntersectionObserver' in window)) {
    bar?.classList.add('is-shown');
    return;
  }
  new IntersectionObserver(([entry]) => {
    // Справка ниже экрана (страницу ещё не долистали) — панель не нужна
    const passed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    bar.classList.toggle('is-shown', passed);
  }).observe(facts);
}

// Яндекс Форма «Сообщить о неточности». Название и ссылка места уходят в
// форму параметрами URL: в настройках формы у скрытых вопросов должны быть
// идентификаторы place и page — тогда они заполнятся сами
const REPORT_FORM_ID = '6ab9085f49af475392c00f2e';
const REPORT_FORM_URL = `https://forms.yandex.ru/u/${REPORT_FORM_ID}/`;
const YA_FORMS_EMBED = 'https://forms.yandex.ru/_static/embed.js';

function reportFormUrl(place, embed) {
  const params = new URLSearchParams({ place: place.name, page: window.location.href });
  if (embed) params.set('iframe', '1');
  return `${REPORT_FORM_URL}?${params}`;
}

/** Форма грузится при первом открытии окна; embed.js Яндекса подгоняет
 *  высоту iframe под форму (без него у окна остаётся своя прокрутка). */
function loadReportForm(place) {
  const frame = $('#report-frame');
  const fallback = $('#report-fallback');
  if (fallback) fallback.href = reportFormUrl(place, false);
  if (!frame || frame.src) return;
  frame.src = reportFormUrl(place, true);
  if (!document.querySelector(`script[src="${YA_FORMS_EMBED}"]`)) {
    const script = document.createElement('script');
    script.src = YA_FORMS_EMBED;
    script.async = true;
    document.head.append(script);
  }
}

async function main() {
  const slug = slugFromUrl('place');
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
  renderInfo(place);
  renderDescription(place);
  renderAmenities(place);
  renderGallery(place);
  renderNearby(place, places);
  renderSimilar(place, places);
  renderCollections(place);
  renderReviews(place.slug);
  attachEventListeners(place, places);

  initMap(place);
  placeCollectionsSection();

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => refreshOpenStatus(place), 60000);
}

main();
