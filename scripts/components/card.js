// components/card.js — рендер карточек мест (лента, популярное, похожие) +
// делегированные обработчики (избранное, клик по карточке, fallback на битые фото).

import { $, $$, on } from '../core/dom.js';
import { escapeHtml, cssUrl } from '../core/format.js';
import { placeUrl, categoryLabel } from '../core/places.js';
import * as Storage from '../core/storage.js';

// Избранное не входит в MVP (см. CLAUDE.md) и страницы favorites.html пока
// нет — сердечко на карточках скрыто. Вернуть: SHOW_FAVORITES = true.
const SHOW_FAVORITES = false;

function favButtonHtml(place, isFavorite) {
  if (!SHOW_FAVORITES) return '';
  return `
        <button type="button" class="fav-btn${isFavorite ? ' active' : ''}" data-slug="${escapeHtml(place.slug)}"
                aria-pressed="${isFavorite}" aria-label="${isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}">
          <i class="fas fa-heart" aria-hidden="true"></i>
        </button>`;
}

export function cardHtml(place, isFavorite, extraClass = '') {
  const badge = place.temporary ? '<div class="badge-temporary">Успей посетить</div>' : '';
  return `
    <div class="place-card${extraClass ? ` ${extraClass}` : ''}" data-category="${escapeHtml(place.category)}" data-slug="${escapeHtml(place.slug)}">
      <div class="place-card__top">
        <div class="place-card__category">${escapeHtml(place.type || categoryLabel(place.category))}</div>${favButtonHtml(place, isFavorite)}
        ${badge}
      </div>
      <img src="${escapeHtml(place.photo || '')}" alt="${escapeHtml(place.name)}" class="place-card__img" loading="lazy">
      <div class="place-card__info"><h3>${escapeHtml(place.name)}</h3></div>
    </div>`;
}

export function similarCardHtml(place) {
  return `
    <a href="${placeUrl(place.slug)}" class="similar-card">
      <img src="${escapeHtml(place.photo || '')}" alt="${escapeHtml(place.name)}" loading="lazy">
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
    if (img.tagName === 'IMG' && (img.matches('.place-card__img') || img.closest('.similar-card'))) {
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
      showToast(isFavNow ? 'Добавлено в избранное ❤️' : 'Удалено из избранного 💔');
    });
  });

  on(root, 'click', '.place-card', (e, card) => {
    if (e.target.closest('.fav-btn')) return;
    const slug = card.dataset.slug;
    if (slug) window.location.href = placeUrl(slug);
  });

  bindImageFallback(root);
}
