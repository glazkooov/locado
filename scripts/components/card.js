// components/card.js — рендер карточек мест (лента, популярное, похожие) +
// делегированные обработчики (избранное, клик по карточке, fallback на битые фото).

import { $, $$, on } from '../core/dom.js';
import { escapeHtml, cssUrl } from '../core/format.js';
import { placeUrl, categoryLabel } from '../core/places.js';
import * as Storage from '../core/storage.js';
import { icon } from '../core/icons.js';

// Избранное не входит в MVP (см. CLAUDE.md) и страницы favorites.html пока
// нет — сердечко на карточках скрыто. Вернуть: SHOW_FAVORITES = true.
const SHOW_FAVORITES = false;

// Прототип (задача 97, пункт 2): ?card=v2 — под названием строка «зачем»
// (короткое описание), метро и цена. Без параметра карточка прежняя.
const CARD_V2 = new URLSearchParams(window.location.search).get('card') === 'v2';

const priceLabel = (level) => (level === 'free' ? 'Бесплатно' : level || '');

function cardDetailsHtml(place) {
  if (!CARD_V2) return '';
  // части метаданных не рвутся посередине: «м. Библиотека им. Ленина» целиком
  const meta = [place.metro ? `м. ${place.metro}` : '', priceLabel(place.price_level)]
    .filter(Boolean).map((part) => `<span>${escapeHtml(part)}</span>`).join(' · ');
  return (place.description ? `<p class="place-card__why">${escapeHtml(place.description)}</p>` : '')
    + (meta ? `<p class="place-card__meta">${meta}</p>` : '');
}

function favButtonHtml(place, isFavorite) {
  if (!SHOW_FAVORITES) return '';
  return `
        <button type="button" class="fav-btn${isFavorite ? ' active' : ''}" data-slug="${escapeHtml(place.slug)}"
                aria-pressed="${isFavorite}" aria-label="${isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}">
          ${icon('heart', 'icon--filled')}
        </button>`;
}

/** now — место подходит моменту (core/now.js): короткая плашка «почему
 *  сейчас» — { icon, text }: «Под крышей», «Закат в 17:34». */
export function cardHtml(place, isFavorite, extraClass = '', { now = null } = {}) {
  const badge = (place.temporary ? '<div class="badge-temporary">Успей посетить</div>' : '')
    + (now ? `<div class="badge-now">${now.icon ? icon(now.icon) : ''}${escapeHtml(now.text)}</div>` : '');
  return `
    <div class="place-card${CARD_V2 ? ' place-card--v2' : ''}${extraClass ? ` ${extraClass}` : ''}" data-category="${escapeHtml(place.category)}" data-slug="${escapeHtml(place.slug)}">
      <div class="place-card__top">
        <div class="place-card__category">${escapeHtml(place.type || categoryLabel(place.category))}</div>${favButtonHtml(place, isFavorite)}
        ${badge}
      </div>
      <img src="${escapeHtml(place.photoSm || place.photo || '')}" alt="${escapeHtml(place.name)}" class="place-card__img" loading="lazy">
      <div class="place-card__info"><h3>${escapeHtml(place.name)}</h3>${cardDetailsHtml(place)}</div>
    </div>`;
}

export function similarCardHtml(place) {
  return `
    <a href="${placeUrl(place.slug)}" class="similar-card">
      <img src="${escapeHtml(place.photoSm || place.photo || '')}" alt="${escapeHtml(place.name)}" loading="lazy">
      <div class="info">
        <h4>${escapeHtml(place.name)}</h4>
        <p>${escapeHtml(place.type || categoryLabel(place.category))}</p>
      </div>
    </a>`;
}

export function renderCards(container, places, { append = false } = {}) {
  if (!container) return;
  const favorites = Storage.getFavorites();
  const html = places.map((p) => cardHtml(p, favorites.includes(p.slug))).join('');
  if (append) container.insertAdjacentHTML('beforeend', html);
  else container.innerHTML = html;
  bindImageFallback(container);
}

export function syncFavoriteButtons(slug, isActive) {
  $$(`.fav-btn[data-slug="${CSS.escape(slug)}"]`).forEach((btn) => {
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
    btn.setAttribute('aria-label', isActive ? 'Удалить из избранного' : 'Добавить в избранное');
  });
}

/** 'error' на <img> не всплывает, поэтому слушаем на capture-фазе. */
export function bindImageFallback(root = document) {
  root.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName === 'IMG' && img.matches('.place-card__img, .similar-card img, .plan-stop__img, .randomizer-preview img, .state-card img, .c-place__photo img, .now-card__photo')) {
      img.classList.add('is-broken');
    }
  }, true);
}

/** Делегирование клика по карточкам (переход на страницу места) и по
 *  сердечку (переключение избранного) для контейнера root. */
export function bindCards(root = document) {
  on(root, 'click', '.fav-btn', (e, btn) => {
    e.preventDefault();
    e.stopPropagation();
    const slug = btn.dataset.slug;
    if (!slug) return;
    btn.classList.add('animate');
    setTimeout(() => btn.classList.remove('animate'), 300);

    const isFavNow = Storage.toggleFavorite(slug);
    syncFavoriteButtons(slug, isFavNow);
    import('./toast.js').then(({ showToast }) => {
      showToast(isFavNow ? 'Добавлено в избранное' : 'Удалено из избранного');
    });
  });

  on(root, 'click', '.place-card', (e, card) => {
    if (e.target.closest('.fav-btn')) return;
    const slug = card.dataset.slug;
    if (slug) window.location.href = placeUrl(slug);
  });

  bindImageFallback(root);
}
