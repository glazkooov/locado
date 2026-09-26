// components/map.js — обёртка над Яндекс.Картами: карта мест на главной
// (кластеризация, фильтры) и одиночная карта места.

import { $, $$, on, toggleClear } from '../core/dom.js';
import { setPressed } from './category-buttons.js';
import { escapeHtml, cssUrl, openStatusLabel } from '../core/format.js';
import { categoryLabel, filterPlaces, placeUrl, uniqueMetro } from '../core/places.js';

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

// ---------- Оформление меток ----------
// Метка — круглое фото места в белой обводке, как маленькая карточка;
// кластер — тёмный кружок с числом. Всё рисуется нашими классами
// (.map-pin, .map-cluster в home.css), а не пресетами Яндекса. Наведение
// и выбор передаются через properties: DOM метки лежит под прозрачным
// слоем событий Яндекса, поэтому CSS :hover на нём не срабатывает.
const PIN_SHAPE = { type: 'Circle', coordinates: [0, -30], radius: 24 };
const CLUSTER_SHAPE = { type: 'Circle', coordinates: [0, 0], radius: 24 };

let layouts = null;
function getLayouts() {
  if (layouts) return layouts;
  const f = ymaps.templateLayoutFactory;
  const pin = (labelAlways) => f.createClass(
    '<div class="map-pin{% if properties.active %} map-pin--active{% endif %}">'
    + '<span class="map-pin__photo" style="background-image: url(\'{{ properties.photo }}\')"></span>'
    + (labelAlways
      ? '<span class="map-pin__label">{{ properties.name }}</span>'
      : '{% if properties.hover %}<span class="map-pin__label">{{ properties.name }}</span>{% endif %}')
    + '</div>'
  );
  layouts = {
    pin: pin(false),
    pinLabeled: pin(true),
    cluster: f.createClass('<div class="map-cluster">{{ properties.geoObjects.length }}</div>')
  };
  return layouts;
}

function createPlacemark(place, { labeled = false } = {}) {
  const placemark = new ymaps.Placemark(
    place.coords,
    { name: place.name, photo: place.photo || '', slug: place.slug },
    {
      iconLayout: labeled ? getLayouts().pinLabeled : getLayouts().pin,
      iconShape: PIN_SHAPE,
      hasBalloon: false,
      hasHint: false
    }
  );
  placemark.events
    .add('mouseenter', () => placemark.properties.set('hover', true))
    .add('mouseleave', () => placemark.properties.set('hover', false));
  return placemark;
}

// Колесо мыши не зумит карту, пока листаешь страницу — зум кнопками/жестами
const PAGE_MAP_OPTIONS = { suppressMapOpenBlock: true, yandexMapDisablePoiInteractivity: true };

// ---------- Карта одного места (place.html) ----------
export async function initPlaceMap(container, place) {
  if (!container || !place?.coords) return null;
  try {
    await whenYmapsReady();
    const map = new ymaps.Map(container, {
      center: place.coords,
      zoom: 16,
      controls: ['zoomControl', 'fullscreenControl']
    }, PAGE_MAP_OPTIONS);
    map.behaviors.disable('scrollZoom');
    map.geoObjects.add(createPlacemark(place, { labeled: true }));
    return map;
  } catch (err) {
    console.error('[map] место:', err);
    showMapError(container);
    return null;
  }
}

// ---------- Мини-карточка места поверх карты (index.html) ----------
// Вместо балуна Яндекса — наша карточка снизу карты, в том же стиле, что
// карточки мест на странице.
function createMapCard(container, { onClose } = {}) {
  const card = document.createElement('div');
  card.className = 'map-card';
  card.hidden = true;
  container.appendChild(card);

  const close = () => {
    if (card.hidden) return;
    card.hidden = true;
    onClose?.();
  };
  const open = (place) => {
    const status = openStatusLabel(place);
    const type = place.type || categoryLabel(place.category);
    card.setAttribute('aria-label', place.name);
    card.innerHTML = `
      <a class="map-card__link" href="${placeUrl(place.slug)}">
        <span class="map-card__photo" style='background-image: ${cssUrl(place.photo)}'></span>
        <span class="map-card__body">
          <span class="map-card__meta">
            <span class="map-card__type">${escapeHtml(type)}</span>
            ${status ? `<span class="map-card__status${status.isOpen ? ' map-card__status--open' : ''}">${escapeHtml(status.text)}</span>` : ''}
          </span>
          <span class="map-card__title">${escapeHtml(place.name)}</span>
          ${place.description ? `<span class="map-card__desc">${escapeHtml(place.description)}</span>` : ''}
          <span class="map-card__more">Подробнее →</span>
        </span>
      </a>
      <button type="button" class="map-card__close" aria-label="Закрыть карточку">×</button>`;
    card.hidden = false;
  };

  on(card, 'click', '.map-card__close', close);
  on(document, 'keydown', (e) => { if (e.key === 'Escape' && !card.hidden) close(); });
  return { open, close, get isOpen() { return !card.hidden; } };
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

  let map, clusterer, card;
  let activePlacemark = null;
  const state = { category: 'all', query: '', metros: [], price: '', openNow: false };

  const setActive = (placemark) => {
    activePlacemark?.properties.set('active', false);
    activePlacemark = placemark;
    placemark?.properties.set('active', true);
  };

  const closeCard = () => card?.close();

  const refresh = () => {
    if (!clusterer) return;
    closeCard();
    const list = filterPlaces(places, state);
    clusterer.removeAll();
    list.forEach((p) => {
      if (!p.coords) return;
      const placemark = createPlacemark(p);
      placemark.events.add('click', () => { setActive(placemark); card.open(p); });
      clusterer.add(placemark);
    });
    if (list.length) map.setBounds(clusterer.getBounds(), { checkZoomRange: true, zoomMargin: 50 });
  };

  try {
    await whenYmapsReady();
    map = new ymaps.Map(mapContainer, {
      center: [55.751244, 37.618423],
      zoom: 12,
      controls: ['zoomControl', 'fullscreenControl']
    }, PAGE_MAP_OPTIONS);
    map.behaviors.disable('scrollZoom');
    // Клик по кластеру приближает карту, а не открывает карусель Яндекса
    clusterer = new ymaps.Clusterer({
      clusterIconLayout: getLayouts().cluster,
      clusterIconShape: CLUSTER_SHAPE,
      clusterDisableClickZoom: false,
      clusterOpenBalloonOnClick: false,
      clusterHasBalloon: false,
      gridSize: 72
    });
    map.geoObjects.add(clusterer);
    // Любое закрытие карточки (крестик, Escape, клик по карте) снимает выделение метки
    card = createMapCard(mapContainer, { onClose: () => setActive(null) });
    // Клик по пустому месту карты закрывает карточку
    map.events.add('click', closeCard);
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
