// pages/place.js — точка входа place.html.

import { $, $$, on } from '../core/dom.js';
import {
  escapeHtml, safeUrl, cssUrl, getOpenStatus, describeStatusTimer, scheduleHtml, telHref, displayHost
} from '../core/format.js';
import {
  loadPlaces, bySlug, similar, toggleFavoritePlace, markVisited, placeUrl, metroList
} from '../core/places.js';
import * as Storage from '../core/storage.js';
import { similarCardHtml, bindImageFallback } from '../components/card.js';
import { createModal } from '../components/modal.js';
import { initPlaceMap, routeUrl } from '../components/map.js';
import { showToast } from '../components/toast.js';

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
    const icon = btn.querySelector('i');
    const label = btn.querySelector('span');
    if (icon) icon.className = isFav ? 'fas fa-heart' : 'far fa-heart';
    if (label) label.textContent = isFav ? 'В избранном' : 'В избранное';
  });
}

function renderHero(place) {
  const heroBg = $('#hero-bg');
  if (heroBg) heroBg.style.backgroundImage = cssUrl(place.photo);
  $('#place-category').innerHTML = `<i class="fas fa-tag" aria-hidden="true"></i> ${escapeHtml(place.type || place.category)}`;
  $('#place-name').textContent = place.name;
  // Краткое описание вместо шаблонного «… в центре Москвы» (не у всех мест правда)
  $('#place-subtitle').textContent = place.subtitle || place.description || '';
  renderFacts(place);

  updateFavButtonUI(Storage.isFavorite(place.slug));

  const visitedBtn = $('#visited-btn');
  if (visitedBtn) visitedBtn.classList.toggle('active', Storage.isVisited(place.slug));
}

const hhmm = (date) => `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

/** Быстрые факты в hero вместо счётчиков просмотров/избранного. */
function renderFacts(place) {
  const list = $('#place-facts');
  if (!list) return;
  const facts = [];
  const [metro] = metroList(place);
  if (metro) facts.push({ icon: 'fa-subway', text: `м. ${metro}` });
  if (place.schedule) {
    const now = new Date();
    const status = getOpenStatus(place, now);
    const opensToday = status.nextChangeAt && status.nextChangeAt.toDateString() === now.toDateString();
    if (status.isOpen && status.hoursToday) facts.push({ icon: 'fa-clock', text: `Открыто до ${status.hoursToday[1]}`, mod: 'open' });
    else facts.push({ icon: 'fa-clock', text: opensToday ? `Откроется в ${hhmm(status.nextChangeAt)}` : 'Сейчас закрыто', mod: 'closed' });
  }
  if (place.price) facts.push({ icon: 'fa-tag', text: place.price });
  list.innerHTML = facts.map((f) => `
    <li class="hero-fact${f.mod ? ` hero-fact--${f.mod}` : ''}"><i class="fas ${f.icon}" aria-hidden="true"></i> ${escapeHtml(f.text)}</li>`).join('');
}

function renderInfo(place) {
  $('#place-address').textContent = place.address || 'Не указан';
  const metro = Array.isArray(place.metro) ? place.metro.join(', ') : (place.metro || 'Не указано');
  $('#place-metro').textContent = metro;

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

  const phone = place.phone || '';
  $('#place-phone').innerHTML = phone ? `<a href="${escapeHtml(telHref(phone))}">${escapeHtml(phone)}</a>` : '—';
  const website = safeUrl(place.website, '');
  $('#place-website').innerHTML = website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener">${escapeHtml(displayHost(website))}</a>` : '—';

  if (!phone) {
    $('#call-btn')?.style.setProperty('display', 'none');
    $('#action-call')?.style.setProperty('display', 'none');
  }
}

function refreshOpenStatus(place) {
  const status = getOpenStatus(place);
  const statusSpan = $('#open-status');
  if (statusSpan) {
    statusSpan.textContent = status.isOpen ? 'Открыто' : 'Закрыто';
    statusSpan.className = `open-status ${status.isOpen ? 'open' : 'closed'}`;
  }
  const timerSpan = $('#closing-timer');
  if (timerSpan) timerSpan.textContent = describeStatusTimer(status);
}

function renderDescription(place) {
  const text = place.description_long || place.description || 'Описание отсутствует.';
  $('#place-description').innerHTML = `<p>${escapeHtml(text)}</p>`;
}

function renderTags(place) {
  const container = $('#place-tags');
  if (!place.tags || !place.tags.length) { container.style.display = 'none'; return; }
  container.style.display = '';
  container.innerHTML = place.tags.map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('');
}

const AMENITY_ICONS = { wifi: 'fa-wifi', parking: 'fa-parking', card: 'fa-credit-card', kids: 'fa-child', outdoor: 'fa-tree', delivery: 'fa-truck', takeaway: 'fa-shopping-bag' };

function renderAmenities(place) {
  const container = $('#place-amenities');
  if (!place.amenities || !place.amenities.length) { container.style.display = 'none'; return; }
  container.style.display = 'block';
  container.innerHTML = `<div class="amenities-grid">${place.amenities.map((item) =>
    `<div class="amenity-item"><i class="fas ${AMENITY_ICONS[item.icon] || 'fa-check'}" aria-hidden="true"></i> ${escapeHtml(item.name)}</div>`
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
  if (place.directions) {
    $('#place-directions').textContent = place.directions;
    card.style.display = 'flex';
  } else {
    card.style.display = 'none';
  }
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
  if (!list.length) { container.innerHTML = '<p>Нет похожих мест</p>'; return; }
  container.innerHTML = list.map(similarCardHtml).join('');
  bindImageFallback(container);
}

function renderReviews(slug) {
  const reviews = Storage.getReviews(slug);
  const container = $('#reviews-list');
  const avg = reviews.length ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) : 0;
  $('#average-rating').textContent = avg ? avg.toFixed(1) : '0';
  $('#reviews-count').textContent = `${reviews.length} отзывов`;

  const starsSpan = $('#average-stars');
  starsSpan.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('i');
    star.className = i <= Math.round(avg) ? 'fas fa-star' : 'far fa-star';
    starsSpan.appendChild(star);
  }

  if (!reviews.length) { container.innerHTML = '<p>Пока нет отзывов. Будьте первым!</p>'; return; }
  container.innerHTML = reviews.map((rev) => `
    <div class="review-card">
      <div class="review-header">
        <div class="review-author"><i class="fas fa-user-circle" aria-hidden="true"></i> ${escapeHtml(rev.name)}</div>
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
  on($('#share-btn'), 'click', () => shareModal?.open());
  on($('#share-close'), 'click', () => shareModal?.close());
  const shareUrl = () => window.location.href;
  on($('.share-vk'), 'click', () => window.open(`https://vk.com/share.php?url=${encodeURIComponent(shareUrl())}&title=${encodeURIComponent(place.name)}`, '_blank'));
  on($('.share-telegram'), 'click', () => window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl())}&text=${encodeURIComponent(place.name)}`, '_blank'));
  on($('.share-whatsapp'), 'click', () => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(place.name + ' ' + shareUrl())}`, '_blank'));
  on($('.share-copy'), 'click', () => {
    navigator.clipboard.writeText(shareUrl()).then(() => { showToast('Ссылка скопирована'); shareModal?.close(); });
  });

  // Мобильная панель быстрых действий
  on($('#action-fav'), 'click', () => favBtn.click());
  const actionCall = $('#action-call');
  if (actionCall) {
    if (place.phone) on(actionCall, 'click', () => callBtn.click());
    else actionCall.style.display = 'none';
  }
  on($('#action-route'), 'click', () => { if (place.coords) window.open(routeUrl(place), '_blank'); });
  on($('#action-share'), 'click', () => shareModal?.open());

  // Скролл к карте
  on($('#show-on-map'), 'click', () => $('.place-map')?.scrollIntoView({ behavior: 'smooth' }));

  // Предложить правку
  on($('#suggest-edit'), 'click', () => {
    window.location.href = `mailto:hello@locado.ru?subject=${encodeURIComponent('Правка для места ' + place.slug)}`;
  });

  // Форма отзыва
  const form = $('#review-form');
  const starIcons = $$('#star-rating i');
  const ratingHidden = $('#review-rating');
  starIcons.forEach((star) => {
    on(star, 'click', () => {
      const val = parseInt(star.dataset.value, 10);
      ratingHidden.value = val;
      starIcons.forEach((s, idx) => { s.className = idx < val ? 'fas fa-star active' : 'far fa-star'; });
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
    starIcons.forEach((s) => { s.className = 'far fa-star'; });
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
