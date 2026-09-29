// pages/place.js — точка входа place.html.

import { $, $$, on } from '../core/dom.js';
import {
  escapeHtml, safeUrl, cssUrl, getOpenStatus, describeStatusTimer, scheduleHtml, telHref, displayHost,
  openStatusLabel, isAlwaysOpen
} from '../core/format.js';
import {
  loadPlaces, bySlug, similar, toggleFavoritePlace, markVisited, placeUrl, metroList, categoryLabel
} from '../core/places.js';
import * as Storage from '../core/storage.js';
import { similarCardHtml, bindImageFallback } from '../components/card.js';
import { createModal } from '../components/modal.js';
import { initPlaceMap, routeUrl } from '../components/map.js';
import { showToast } from '../components/toast.js';
import { icon } from '../core/icons.js';
import { loadCollections, collectionsWithPlace } from '../core/collections.js';
import { collectionCardHtml } from '../components/collection-card.js';
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
  if (place.photo) $('meta[property="og:image"]')?.setAttribute('content', new URL(place.photo, location.href).href);
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
 *  .place-hero--no-photo) и hero ниже: пустой тёмный экран ничего не говорит. */
function setHeroPhoto(place) {
  const hero = $('.place-hero');
  const heroBg = $('#hero-bg');
  if (!hero || !heroBg) return;
  hero.dataset.category = place.category || '';
  const noPhoto = () => hero.classList.add('place-hero--no-photo');
  if (!place.photo) { noPhoto(); return; }
  const img = new Image();
  img.onload = () => { heroBg.style.backgroundImage = cssUrl(place.photo); };
  img.onerror = noPhoto;
  img.src = place.photo;
}

/** Быстрые факты в hero вместо счётчиков просмотров/избранного. */
function renderFacts(place) {
  const list = $('#place-facts');
  if (!list) return;
  const facts = [];
  const [metro] = metroList(place);
  if (metro) facts.push({ icon: 'train-front', text: `м. ${metro}` });
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
  // Адрес и метро (метро — строкой в карточке адреса, а не отдельной карточкой)
  const metro = metroList(place);
  const hasAddress = setLine($('#place-address'), place.address ? escapeHtml(place.address) : '');
  const hasMetro = setLine($('#place-metro'), metro.length ? escapeHtml(`м. ${metro.join(', м. ')}`) : '');
  const addressRow = $('#address-row');
  if (addressRow) addressRow.hidden = !hasAddress && !hasMetro;

  // Часы работы: без расписания или круглосуточно во все дни строка ничего
  // не сообщает — «Открыто круглосуточно» уже есть в hero
  const hoursRow = $('#hours-row');
  if (hoursRow) hoursRow.hidden = !place.schedule || isAlwaysOpen(place.schedule);

  const scheduleContainer = $('#place-schedule');
  scheduleContainer.innerHTML = scheduleHtml(place.schedule);
  const showBtn = $('.show-full-schedule-btn', scheduleContainer);
  const fullSchedule = $('.full-schedule-modal', scheduleContainer);
  if (showBtn && fullSchedule) {
    on(showBtn, 'click', (e) => {
      e.stopPropagation();
      const willShow = fullSchedule.hidden;
      fullSchedule.hidden = !willShow;
      showBtn.setAttribute('aria-expanded', String(willShow));
    });
  }

  refreshOpenStatus(place);

  // Телефон и сайт — отдельными строками со своими значками
  const phone = place.phone || '';
  const website = safeUrl(place.website, '');
  $('#phone-row').hidden = !setLine($('#place-phone'), phone ? `<a href="${escapeHtml(telHref(phone))}">${escapeHtml(phone)}</a>` : '');
  const host = website ? displayHost(website) : '';
  $('#website-row').hidden = !setLine($('#place-website'), website
    ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener" title="${escapeHtml(host)}">${escapeHtml(host)}</a>` : '');

  if (!phone) {
    $('#call-btn')?.style.setProperty('display', 'none');
    $('#action-call')?.style.setProperty('display', 'none');
  }
}

// «Закроется через …» показываем, только когда до закрытия меньше часа:
// «Открыто до 22:00» уже есть в hero, а «через 7 часов 30 минут» его дублировало
const CLOSING_SOON_MS = 60 * 60000;

/** «Закроется через 40 минут» / «Откроется через …» под часами работы. */
function refreshOpenStatus(place) {
  const status = getOpenStatus(place);
  const timerSpan = $('#closing-timer');
  if (!timerSpan) return;
  const soon = !status.isOpen || (status.nextChangeAt && status.nextChangeAt - new Date() <= CLOSING_SOON_MS);
  const text = soon ? describeStatusTimer(status) : '';
  timerSpan.textContent = text;
  timerSpan.hidden = !text;
  timerSpan.classList.toggle('closing-timer--open', status.isOpen);
}

function renderDescription(place) {
  const text = place.description_long || place.description || '';
  const el = $('#place-description');
  el.innerHTML = text ? `<p>${escapeHtml(text)}</p>` : '';
  el.hidden = !text;
  $('#place-readers').hidden = !place.fromReaders;
}

// Пользователю — только первые теги места (в данных они самые характерные:
// атмосфера, сценарий, впечатление). Остальные теги работают на поиск,
// настроения, подборки и «похожие места», но на странице не показываются.
const VISIBLE_TAGS = 5;

// Теги, которые дословно повторяют категорию места, — это уже написано на
// плашке в hero; вместо них в пятёрку попадают теги настроения
const CATEGORY_TAGS = { nature: 'природа', art: 'искусство', food: 'еда', theater: 'театр', entertainment: 'развлечения' };

/** Теги для показа: без повторов категории и типа места — и целиком, и по
 *  словам («музей» у «Дом-музея», «парк» у «Парка скульптур»). */
function visibleTags(place) {
  const type = (place.type || '').toLowerCase();
  const repeats = new Set([CATEGORY_TAGS[place.category], type, ...type.split(/[\s-]+/)]);
  return (place.tags || []).filter((t) => !repeats.has(t.toLowerCase())).slice(0, VISIBLE_TAGS);
}

function renderTags(place) {
  const container = $('#place-tags');
  const card = $('#place-tags-card');
  const tags = visibleTags(place);
  if (card) card.hidden = !tags.length;
  if (!tags.length) return;
  // Тег ведёт в ленту на главной с этим тегом — повод пойти дальше
  container.innerHTML = tags.map((t) =>
    `<a class="tag-chip" href="./?tag=${encodeURIComponent(t)}">#${escapeHtml(t)}</a>`).join('');
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

function renderDirections(place) {
  $('#place-directions').textContent = place.directions || '';
  $('#directions-row').hidden = !place.directions;

  // Строк нет — нет и карточки; нет ни её, ни тегов — нет секции
  const list = $('#info-list');
  const rows = list ? $$('.info-row', list).filter((r) => !r.hidden).length : 0;
  if (list) list.hidden = !rows;
  $('.info-grid')?.setAttribute('data-rows', String(rows));
  const infoSection = $('.place-info');
  if (infoSection) infoSection.hidden = !$$('.info-card', infoSection).some((c) => !c.hidden);
}

async function renderMap(place) {
  const container = $('#place-map-container');
  const map = await initPlaceMap(container, place);
  // Карта не загрузилась — «Показать на карте» вела бы к надписи
  // «Карта временно недоступна». Маршрут в Яндекс.Картах работает и так.
  if (!map) $('#show-on-map')?.setAttribute('hidden', '');
  const routeLink = $('#route-link');
  if (routeLink) routeLink.href = routeUrl(place);
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
  initSimilarNav(container);
}

/** Стрелки «назад / дальше» у ряда похожих мест: листают на ширину видимой
 *  части и гаснут на краях. */
function initSimilarNav(scroller) {
  const prev = $('#similar-prev');
  const next = $('#similar-next');
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

/** «Есть в подборках»: статьи, где упоминается место. Без подборок — секции нет. */
async function renderCollections(place) {
  const section = $('#place-collections');
  if (!section) return;
  try {
    const list = collectionsWithPlace(await loadCollections(), place.slug).slice(0, 3);
    if (!list.length) return;
    $('#place-collections-grid').innerHTML = list.map(collectionCardHtml).join('');
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
  if (place.phone) on(callBtn, 'click', () => { window.location.href = telHref(place.phone); });

  // Шеринг
  initShare([$('#share-btn'), $('#action-share')], () => ({ title: place.name, text: place.description }));

  // Мобильная панель быстрых действий
  on($('#action-fav'), 'click', () => favBtn.click());
  const actionCall = $('#action-call');
  if (actionCall) {
    if (place.phone) on(actionCall, 'click', () => callBtn.click());
    else actionCall.style.display = 'none';
  }
  on($('#action-route'), 'click', () => { if (place.coords) window.open(routeUrl(place), '_blank'); });

  // Скролл к карте
  on($('#show-on-map'), 'click', () => $('#on-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));

  // Сообщить о неточности — Яндекс Форма в окне
  const reportModal = createModal($('#report-modal'), { onOpen: () => loadReportForm(place) });
  on($('#suggest-edit'), 'click', () => reportModal?.open());

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
  renderInfo(place);
  renderDescription(place);
  renderTags(place);
  renderAmenities(place);
  renderGallery(place);
  renderDirections(place);
  renderSimilar(place, places);
  renderCollections(place);
  renderReviews(place.slug);
  attachEventListeners(place, places);

  await renderMap(place);

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => refreshOpenStatus(place), 60000);
}

main();
