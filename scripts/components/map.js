// components/map.js — обёртка над Яндекс.Картами: карта мест на главной
// (кластеризация, фильтры) и одиночная карта места.

import { $, $$, on, toggleClear } from '../core/dom.js';
import { setPressed } from './category-buttons.js';
import { escapeHtml } from '../core/format.js';
import { categoryLabel, filterPlaces, metroList, placeUrl, recordView, uniqueMetro } from '../core/places.js';

export function whenYmapsReady() {
  return new Promise((resolve, reject) => {
    if (typeof window.ymaps === 'undefined') {
      reject(new Error('ymaps недоступен'));
      return;
    }
    window.ymaps.ready(resolve);
  });
}

export function showMapError(container, message = 'Карта временно недоступна') {
  if (container) container.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

export function routeUrl(place) {
  if (!place?.coords) return 'https://yandex.ru/maps/';
  return `https://yandex.ru/maps/?rtext=~${place.coords[0]},${place.coords[1]}&rtt=auto`;
}

// ---------- Карта одного места (place.html) ----------
export async function initPlaceMap(container, place) {
  if (!container || !place?.coords) return null;
  try {
    await whenYmapsReady();
    const map = new ymaps.Map(container, {
      center: place.coords,
      zoom: 16,
      controls: ['zoomControl', 'fullscreenControl']
    });
    const placemark = new ymaps.Placemark(place.coords, {
      balloonContent: `<strong>${escapeHtml(place.name)}</strong><br/>${escapeHtml(place.address || '')}`
    }, { preset: 'islands#redDotIcon' });
    map.geoObjects.add(placemark);
    return map;
  } catch (err) {
    console.error('[map] место:', err);
    showMapError(container);
    return null;
  }
}

// ---------- Карта всех мест (index.html) ----------
const PIN_STYLES = {
  nature: { preset: 'islands#greenDotIcon', color: '#34A853' },
  food: { preset: 'islands#pinkDotIcon', color: '#fc3adb' },
  art: { preset: 'islands#blueDotIcon', color: '#3F51B5' },
  theater: { preset: 'islands#orangeDotIcon', color: '#FF7043' },
  photo: { preset: 'islands#redDotIcon', color: '#f50e0e' },
  entertainment: { preset: 'islands#orangeDotIcon', color: '#FF6B6B' }
};
const DEFAULT_PIN = { preset: 'islands#violetDotIcon', color: '#8312da' };

function balloonHtml(place) {
  const metro = metroList(place);
  return `
    <div class="custom-balloon" data-slug="${escapeHtml(place.slug)}">
      <div class="balloon-inner">
        <img src="${escapeHtml(place.photo)}" alt="${escapeHtml(place.name)}" class="balloon-img">
        <div class="balloon-content">
          <div class="balloon-category">${categoryLabel(place.category, { emoji: true })}</div>
          <h3 class="balloon-title">${escapeHtml(place.name)}</h3>
          <p class="balloon-desc">${escapeHtml((place.description || '').slice(0, 80))}${(place.description || '').length > 80 ? '…' : ''}</p>
          ${metro.length ? `<div class="balloon-metro"><i class="fas fa-subway"></i> ${escapeHtml(metro.join(', '))}</div>` : ''}
          ${place.price ? `<div class="balloon-price"><i class="fas fa-tag"></i> ${escapeHtml(place.price)}</div>` : ''}
          <button type="button" class="balloon-details-btn" data-slug="${escapeHtml(place.slug)}">Подробнее →</button>
        </div>
      </div>
    </div>`;
}

function createPlacemark(place) {
  const style = PIN_STYLES[place.category] || DEFAULT_PIN;
  return new ymaps.Placemark(
    place.coords,
    { balloonContent: balloonHtml(place), hintContent: place.name },
    { preset: style.preset, iconColor: style.color }
  );
}

function initMetroFilter(container, stations, { onChange }) {
  if (!container) return { clear: () => {} };

  const popular = ['Пушкинская', 'Курская', 'Китай-город', 'Парк культуры', 'ВДНХ', 'Новокузнецкая']
    .filter((s) => stations.includes(s));

  container.innerHTML = `
    <div class="metro-filter-input-wrapper">
      <input type="text" id="metro-autocomplete" placeholder="Введите станцию метро..." autocomplete="off">
      <div id="metro-suggestions" class="metro-suggestions" style="display:none"></div>
    </div>
    ${popular.length ? `
      <div class="popular-metros">
        <div class="popular-metros-label">Ищут чаще всего:</div>
        <div class="popular-metros-buttons">
          ${popular.map((s) => `<button type="button" class="popular-metro-btn" data-station="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}
        </div>
      </div>` : ''}
    <div id="metro-chips" class="metro-chips"></div>
  `;

  const input = $('#metro-autocomplete', container);
  const suggestionsBox = $('#metro-suggestions', container);
  const chipsBox = $('#metro-chips', container);
  let selected = [];

  const renderChips = () => {
    chipsBox.innerHTML = selected.map((s) => `
      <div class="metro-chip">
        <span>${escapeHtml(s)}</span>
        <button type="button" class="metro-chip-remove" data-station="${escapeHtml(s)}" aria-label="Убрать ${escapeHtml(s)}">&times;</button>
      </div>`).join('');
  };

  const addMetro = (station) => {
    if (!station || selected.includes(station)) return;
    selected.push(station);
    renderChips();
    input.value = '';
    suggestionsBox.style.display = 'none';
    onChange(selected);
  };
  const removeMetro = (station) => {
    selected = selected.filter((s) => s !== station);
    renderChips();
    onChange(selected);
  };

  on(input, 'input', (e) => {
    const q = e.target.value.toLowerCase();
    const matches = stations.filter((s) => s.toLowerCase().includes(q) && !selected.includes(s));
    if (!q || !matches.length) { suggestionsBox.style.display = 'none'; suggestionsBox.innerHTML = ''; return; }
    suggestionsBox.style.display = 'block';
    suggestionsBox.innerHTML = matches.map((s) => `<div class="metro-suggestion-item" data-station="${escapeHtml(s)}" role="option" tabindex="0">${escapeHtml(s)}</div>`).join('');
  });
  on(suggestionsBox, 'click', '.metro-suggestion-item', (e, item) => addMetro(item.dataset.station));
  on(chipsBox, 'click', '.metro-chip-remove', (e, btn) => { e.stopPropagation(); removeMetro(btn.dataset.station); });
  container.querySelectorAll('.popular-metro-btn').forEach((btn) => on(btn, 'click', () => addMetro(btn.dataset.station)));
  on(document, 'click', (e) => { if (!container.contains(e.target)) suggestionsBox.style.display = 'none'; });

  renderChips();

  return {
    // Сбрасывает только UI метро-фильтра; state.metros сбрасывает вызывающий код.
    clear: () => { selected = []; renderChips(); if (input) input.value = ''; suggestionsBox.style.display = 'none'; }
  };
}

export async function initPlacesMap(places) {
  const mapContainer = $('#map');
  if (!mapContainer) return null;

  let map, clusterer;
  const state = { category: 'all', query: '', metros: [], price: '', openNow: false };

  const refresh = () => {
    if (!clusterer) return;
    const list = filterPlaces(places, state);
    clusterer.removeAll();
    list.forEach((p) => p.coords && clusterer.add(createPlacemark(p)));
    if (list.length) map.setBounds(clusterer.getBounds(), { checkZoomRange: true, zoomMargin: 50 });
  };

  try {
    await whenYmapsReady();
    map = new ymaps.Map(mapContainer, { center: [55.751244, 37.618423], zoom: 12, controls: ['zoomControl', 'fullscreenControl'] });
    clusterer = new ymaps.Clusterer({
      clusterDisableClickZoom: true,
      clusterOpenBalloonOnClick: true,
      clusterBalloonContentLayout: 'cluster#balloonCarousel'
    });
    map.geoObjects.add(clusterer);
  } catch (err) {
    console.error('[map] карта мест:', err);
    showMapError(mapContainer);
    return null;
  }

  // Категории
  const catButtons = $$('.map__categories-button');
  const setCategory = (category) => {
    state.category = category;
    setPressed(catButtons, (b) => b.dataset.category === category);
    refresh();
  };
  catButtons.forEach((btn) => on(btn, 'click', (e) => { e.preventDefault(); setCategory(btn.dataset.category); }));

  // Поиск
  const searchInput = $('#map-search-input');
  const clearBtn = $('#map-clear-btn');
  if (searchInput) {
    let timer;
    on(searchInput, 'input', (e) => {
      toggleClear(searchInput, clearBtn);
      clearTimeout(timer);
      timer = setTimeout(() => { state.query = e.target.value; refresh(); }, 300);
    });
  }
  if (clearBtn) {
    on(clearBtn, 'click', () => {
      searchInput.value = '';
      toggleClear(searchInput, clearBtn);
      state.query = '';
      refresh();
      searchInput.focus();
    });
  }

  // Метро
  const metro = initMetroFilter($('#filter-metro'), uniqueMetro(places), {
    onChange: (list) => { state.metros = list; refresh(); }
  });

  // Цена
  const priceContainer = $('#filter-price');
  if (priceContainer) {
    on(priceContainer, 'change', 'input[name="price"]', () => {
      const checked = priceContainer.querySelector('input[name="price"]:checked');
      state.price = checked ? checked.value : '';
      refresh();
    });
  }

  // Открыто сейчас
  const openNowCheckbox = $('#open-now-checkbox');
  if (openNowCheckbox) on(openNowCheckbox, 'change', (e) => { state.openNow = e.target.checked; refresh(); });

  // Переход по балуну/кластеру
  on(document.body, 'click', '.balloon-details-btn, .custom-balloon', (e, el) => {
    const slug = el.dataset.slug;
    if (!slug) return;
    const place = places.find((p) => p.slug === slug);
    if (place) recordView(place);
    window.location.href = placeUrl(slug);
  });

  // Выпадающие фильтры (метро/цена) — класс is-open вместо инлайн-стилей
  const dropdownButtons = $$('.filter-btn[data-toggle]');
  dropdownButtons.forEach((btn) => {
    on(btn, 'click', () => {
      const target = document.getElementById(`filter-${btn.dataset.toggle}`);
      if (!target) return;
      const willOpen = !target.classList.contains('is-open');
      $$('.dropdown-content').forEach((el) => el.classList.remove('is-open'));
      dropdownButtons.forEach((b) => b.setAttribute('aria-expanded', 'false'));
      if (willOpen) { target.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
    });
  });
  on(document, 'click', (e) => {
    if (!e.target.closest('.dropdown-filter')) $$('.dropdown-content').forEach((el) => el.classList.remove('is-open'));
  });

  // Сброс всех фильтров
  const resetBtn = $('.filter-buttons .filter-clear-btn');
  if (resetBtn) {
    on(resetBtn, 'click', () => {
      setCategory('all');
      if (searchInput) searchInput.value = '';
      toggleClear(searchInput, clearBtn);
      state.query = '';
      state.metros = [];
      metro.clear();
      state.price = '';
      const freeRadio = priceContainer?.querySelector('input[value=""]');
      if (freeRadio) freeRadio.checked = true;
      state.openNow = false;
      if (openNowCheckbox) openNowCheckbox.checked = false;
      refresh();
    });
  }

  setCategory('all');
  return { refresh };
}
