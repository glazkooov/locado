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
  $('meta[property="og:image"]')?.setAttribute('content', place.photo || '');
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
  const heroBg = $('#hero-bg');
  if (heroBg) heroBg.style.backgroundImage = cssUrl(place.photo);
  $('#place-category').innerHTML = `${icon('tag')} ${escapeHtml(place.type || place.category)}`;
  $('#place-name').textContent = place.name;
  // Краткое описание вместо шаблонного «… в центре Москвы» (не у всех мест правда)
  $('#place-subtitle').textContent = place.subtitle || place.description || '';
  renderFacts(place);

  updateFavButtonUI(Storage.isFavorite(place.slug));

  const visitedBtn = $('#visited-btn');
  if (visitedBtn) visitedBtn.classList.toggle('active', Storage.isVisited(place.slug));
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
    facts.push({ icon: 'tag', text: place.price, href, external: true });
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
  const addressCard = $('#address-card');
  if (addressCard) addressCard.hidden = !hasAddress && !hasMetro;

  // Часы работы: без расписания или круглосуточно во все дни карточка ничего
  // не сообщает — «Открыто круглосуточно» уже есть в hero
  const hoursCard = $('#hours-card');
  if (hoursCard) hoursCard.hidden = !place.schedule || isAlwaysOpen(place.schedule);

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

  // Контакты: показываем то, что есть; нет ни телефона, ни сайта — нет карточки
  const phone = place.phone || '';
  const website = safeUrl(place.website, '');
  const hasPhone = setLine($('#place-phone'), phone ? `<a href="${escapeHtml(telHref(phone))}">${escapeHtml(phone)}</a>` : '');
  const hasWebsite = setLine($('#place-website'), website
    ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener">${escapeHtml(displayHost(website))}</a>` : '');
  const contactsCard = $('#contacts-card');
  if (contactsCard) contactsCard.hidden = !hasPhone && !hasWebsite;

  if (!phone) {
    $('#call-btn')?.style.setProperty('display', 'none');
    $('#action-call')?.style.setProperty('display', 'none');
  }
}

/** «Закроется через …» / «Откроется через …» — статус «Открыто» уже есть в
 *  hero, отдельная плашка в карточке его только дублировала. */
function refreshOpenStatus(place) {
  const status = getOpenStatus(place);
  const timerSpan = $('#closing-timer');
  if (timerSpan) {
    timerSpan.textContent = describeStatusTimer(status);
    timerSpan.classList.toggle('closing-timer--open', status.isOpen);
  }
}

function renderDescription(place) {
  const text = place.description_long || place.description || '';
  const el = $('#place-description');
  el.innerHTML = text ? `<p>${escapeHtml(text)}</p>` : '';
  el.hidden = !text;
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
    `<a class="tag-chip" href="index.html?tag=${encodeURIComponent(t)}">#${escapeHtml(t)}</a>`).join('');
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
  const card = $('#directions-card');
  $('#place-directions').textContent = place.directions || '';
  card.hidden = !place.directions;

  const infoSection = $('.place-info');
  if (!infoSection) return;
  // Все карточки скрыты (нет ни адреса, ни часов, ни контактов, ни тегов) —
  // секция тоже. Одиночный адрес больше не уносим в hero: рядом с ним теперь
  // всегда стоит карточка «Настроение места».
  infoSection.hidden = !$$('.info-card', infoSection).some((c) => !c.hidden);
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
    <a href="index.html?category=${encodeURIComponent(place.category)}" class="similar-card similar-card--more">
      <span class="similar-card__more-label">Все места</span>
      <span class="similar-card__more-title">${escapeHtml(categoryLabel(place.category))} →</span>
    </a>`;
  container.innerHTML = list.map(similarCardHtml).join('') + moreCard;
  bindImageFallback(container);
}

function renderReviews(slug) {
  const reviews = Storage.getReviews(slug);
  const container = $('#reviews-list');
  const avg = reviews.length ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) : 0;
  $('#average-rating').textContent = avg ? avg.toFixed(1) : '0';
  $('#reviews-count').textContent = `${reviews.length} отзывов`;

  const starsSpan = $('#average-stars');
  starsSpan.innerHTML = [1, 2, 3, 4, 5].map((i) => icon('star', i <= Math.round(avg) ? 'icon--filled' : '')).join('');

  if (!reviews.length) { container.innerHTML = '<p>Пока нет отзывов. Будьте первым!</p>'; return; }
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
    if (isNew) showToast('Спасибо! Место добавлено в ваш список посещённых.');
  });

  // Позвонить
  const callBtn = $('#call-btn');
  if (place.phone) on(callBtn, 'click', () => { window.location.href = telHref(place.phone); });

  // Шеринг
  const shareModal = createModal($('#share-modal'));
  // На телефоне — системное меню «Поделиться» (сразу все мессенджеры
  // человека), на компьютере и без поддержки — наше окно
  const canShareNatively = 'share' in navigator && window.matchMedia('(pointer: coarse)').matches;
  const share = () => {
    if (!canShareNatively) { shareModal?.open(); return; }
    navigator.share({ title: place.name, text: place.description || '', url: window.location.href })
      .catch((err) => { if (err?.name !== 'AbortError') shareModal?.open(); });
  };
  on($('#share-btn'), 'click', share);
  on($('#share-close'), 'click', () => shareModal?.close());
  const shareUrl = () => window.location.href;
  on($('.share-vk'), 'click', () => window.open(`https://vk.com/share.php?url=${encodeURIComponent(shareUrl())}&title=${encodeURIComponent(place.name)}`, '_blank'));
  on($('.share-telegram'), 'click', () => window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl())}&text=${encodeURIComponent(place.name)}`, '_blank'));
  on($('.share-whatsapp'), 'click', () => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(place.name + ' ' + shareUrl())}`, '_blank'));
  on($('.share-copy'), 'click', () => {
    navigator.clipboard.writeText(shareUrl())
      .then(() => { showToast('Ссылка скопирована'); shareModal?.close(); })
      .catch(() => showToast('Не удалось скопировать ссылку', true));
  });

  // Мобильная панель быстрых действий
  on($('#action-fav'), 'click', () => favBtn.click());
  const actionCall = $('#action-call');
  if (actionCall) {
    if (place.phone) on(actionCall, 'click', () => callBtn.click());
    else actionCall.style.display = 'none';
  }
  on($('#action-route'), 'click', () => { if (place.coords) window.open(routeUrl(place), '_blank'); });
  on($('#action-share'), 'click', share);

  // Скролл к карте
  on($('#show-on-map'), 'click', () => $('.place-map')?.scrollIntoView({ behavior: 'smooth' }));

  // Предложить правку
  on($('#suggest-edit'), 'click', () => {
    window.location.href = `mailto:hello@locado.ru?subject=${encodeURIComponent('Правка для места ' + place.slug)}`;
  });

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
    if (!name || !rating || !text) { showToast('Заполните все поля', true); return; }
    Storage.addReview(place.slug, { name, rating, text, date: new Date().toISOString() });
    renderReviews(place.slug);
    form.reset();
    ratingHidden.value = 0;
    starIcons.forEach((s) => s.classList.remove('icon--filled', 'active'));
    showToast('Отзыв добавлен!');
  });
}

async function main() {
  const slug = new URLSearchParams(window.location.search).get('slug');
  if (!slug) { showNotFound(); return; }

  let places;
  try {
    places = await loadPlaces();
  } catch (err) {
    console.error('[place] не удалось загрузить места:', err);
    showToast('Не удалось загрузить данные. Попробуйте позже.', true);
    showNotFound('Не удалось загрузить данные. Попробуйте обновить страницу.');
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
  renderReviews(place.slug);
  attachEventListeners(place, places);

  await renderMap(place);

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => refreshOpenStatus(place), 60000);
}

main();
