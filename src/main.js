// script.js — централизованный модуль для Locado с исправлениями

// =====================
// Storage: работа с localStorage
// =====================
const Storage = (() => {
  const KEY = 'locado_places_data';

  function load() {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function init(defaults) {
    const existing = load();
    if (existing.length) return existing;
    save(defaults);
    return defaults;
  }

  function increment(slug, field) {
    const data = load();
    const item = data.find(p => p.slug === slug);
    if (item) item[field] = (item[field] || 0) + 1;
    save(data);
    return data;
  }

  return { init, load, save, increment };
})();

// =====================
// PlacesService: загрузка и доступ к данным
// =====================
const PlacesService = (() => {
  let _places = [];

  async function loadDefaults() {
    const res = await fetch('data.json');
    _places = await res.json();
    return _places;
  }

  function all() {
    return _places.map(p => ({ ...p }));
  }

  function byCategory(cat) {
    return cat === 'all' ? all() : _places.filter(p => p.category === cat);
  }

  return { loadDefaults, all, byCategory };
})();

// =====================
// Filter: поиск, категория, популярность, пагинация
// =====================
const Filter = {
  search(list, query) {
    const q = query.trim().toLowerCase();
    return q
      ? list.filter(p => p.name.toLowerCase().includes(q) ||
                         (p.description || '').toLowerCase().includes(q))
      : list;
  },
  paginate(list, start, count) {
    return list.slice(start, start + count);
  },
  popular(list, topN = 6) {
    return list
      .map(p => ({ ...p, popularity: (p.views||0) + (p.favorites||0) }))
      .sort((a,b) => b.popularity - a.popularity)
      .slice(0, topN);
  }
};

// =====================
// Renderer: отрисовка UI
// =====================
const Renderer = (() => {
  const placesGrid = document.getElementById('places-container');
  const popularGrid = document.getElementById('popular-places-container');

  function cardHTML(p) {


    return `
      <div class="place-card" data-category="${p.category?.toLowerCase()}" data-slug="${p.slug}">
        <div class="place-card__top">
          <div class="place-card__category">${p.type}</div>
          <button class="fav-btn" data-slug="${p.slug}">
            ${(p.favorites || 0) > 0 ? '❤️' : '🤍'}
          </button>
        </div>
        <img src="${p.photo}" alt="${p.name}" class="place-card__img" loading="lazy">
        <div class="place-card__info">
          <h3>${p.name}</h3>
        </div>
      </div>`;
  }


  function renderList(container, list) {
    container.innerHTML = list.map(cardHTML).join('');
  }

  function renderPopular(list) {
    renderList(popularGrid, list);
  }

  function renderPlaces(list) {
    renderList(placesGrid, list);
  }

  return { renderPopular, renderPlaces };
})();

// =====================
// UI state and events
// =====================
let currentCategory = 'all';
let searchQuery = '';
let displayed = 0;
const PAGE_SIZE = 9;

function setupUI() {
  // Категории
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      currentCategory = btn.dataset.category;
      document.querySelectorAll('.category-btn').forEach(b => b.classList.toggle('active', b === btn));
      displayed = 0;
      updatePlaces();
    });
  });

  // Внутренний поиск (ниже категории)
  const searchInput = document.getElementById('categories-search-input');
  const clearBtn = document.getElementById('categories-clear-btn');

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    displayed = 0;
    updatePlaces();
  });
  clearBtn.addEventListener('click', () => {
    searchQuery = '';
    searchInput.value = '';
    displayed = 0;
    updatePlaces();
  });

    // Главный поисковик в hero
  const heroInput = document.getElementById('main-search-input');
  const heroBtn = document.getElementById('main-search-btn');
  const heroTagsContainer = document.getElementById('hero__search-tags');
  if (heroInput && heroBtn) {
    // По клику кнопки
    heroBtn.addEventListener('click', () => {
      searchQuery = heroInput.value;
      displayed = 0;
      document.getElementById('categories-search-input').value = searchQuery;
      updatePlaces();
      
        const target = document.getElementById('places-container');
        const offset = -300;
        const top = target.getBoundingClientRect().top + window.scrollY + offset;
        window.scrollTo({ top, behavior: 'smooth' });
    });
    // По нажатию Enter
    heroInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchQuery = heroInput.value;
        displayed = 0;
        document.getElementById('categories-search-input').value = searchQuery;
        heroInput.value = '';
        updatePlaces();

        const target = document.getElementById('places-container');
        const offset = -300;
        const top = target.getBoundingClientRect().top + window.scrollY + offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  }


  heroInput.addEventListener('input', () => {
    if (heroInput.value !== '') {
      heroTagsContainer.style.display = 'none';
    } else {
      heroTagsContainer.style.display = 'block';
    }

  })

  const heroSearchTags = document.querySelectorAll('.hero__search-tag');
  heroSearchTags.forEach(tag => {
    tag.addEventListener('click', () => {
      heroInput.value = tag.dataset.value;

      heroTagsContainer.style.display = 'none';
      heroInput.focus();
    })
  })


  // Кнопка "показать ещё"
  const showMoreBtn = document.getElementById('show-more-btn');
  showMoreBtn.addEventListener('click', () => {
    updatePlaces(false);
  });

  // Автоподгрузка при прокрутке
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        updatePlaces(false);
      }
    });
  }, {
    rootMargin: '200px',
    threshold: 0.1
  });
  observer.observe(showMoreBtn);


  // Клики по карточкам и избранное
  document.body.addEventListener('click', e => {
    const card = e.target.closest('.place-card');
    if (card && !e.target.matches('.fav-btn')) {
      const slug = card.dataset.slug;
      Storage.increment(slug, 'views');
      window.location.href = `place.html?slug=${slug}`;
      return;
    }
    if (e.target.matches('.fav-btn')) {
      const slug2 = e.target.dataset.slug;
      Storage.increment(slug2, 'favorites');
      e.target.textContent = '❤️';
    }
  });
}

async function updatePlaces(reset = true) {
  let list = PlacesService.byCategory(currentCategory);
  list = Filter.search(list, searchQuery);
  if (reset) displayed = 0;
  const page = Filter.paginate(list, displayed, PAGE_SIZE);
  displayed += page.length;
  Renderer.renderPlaces(reset ? page : list.slice(0, displayed));
  document.getElementById('show-more-btn').classList.toggle('invisible', displayed >= list.length);
}


async function initMap() {
  try {
    // 1. Загружаем данные из JSON
    const response = await fetch('data.json');
    if (!response.ok) throw new Error('Ошибка загрузки данных');
    const places = await response.json();

    // 2. Инициализируем карту
    const map = new ymaps.Map('map', {
      center: [55.751244, 37.618423], // Центр Москвы
      zoom: 12,
      controls: ['zoomControl', 'fullscreenControl']
    });

    // 3. Создаем кластер для меток
    const clusterer = new ymaps.Clusterer({
      clusterDisableClickZoom: true,
      clusterOpenBalloonOnClick: true,
      clusterBalloonContentLayout: 'cluster#balloonCarousel'
    });

    // 4. Обрабатываем каждое место из JSON
    places.forEach(place => {
      const placemark = createPlacemark(place);
      clusterer.add(placemark);
    });

    map.geoObjects.add(clusterer);

    // 5. Добавляем фильтрацию
    setupFilterControls(map, clusterer, places);

  } catch (error) {
    console.error('Ошибка при инициализации карты:', error);
    document.getElementById('map').innerHTML = 
      '<div class="error">Не удалось загрузить карту. Попробуйте позже.</div>';
  }
}

// Создание метки с кастомным дизайном
function createPlacemark(place) {
  const placemark = new ymaps.Placemark(
    place.coords,
    {
      balloonContentHeader: `<strong>${place.name}</strong>`,
      balloonContentBody: `
        <img src="${place.photo}" alt="${place.name}" class="balloon-image">
        <p>${place.description}</p>
        ${place.address ? `<p><i class="fas fa-map-marker-alt"></i> ${place.address}</p>` : ''}
        ${place.metro ? `<p><i class="fas fa-subway"></i> ${place.metro}</p>` : ''}
        ${place.price ? `<p><i class="fas fa-tag"></i> ${place.price}</p>` : ''}
        <div class="tags">${(place.tags || []).map(tag => `<span>#${tag}</span>`).join(' ')}</div>
      `,
      balloonContentFooter: `
        <div class="balloon-footer">
          ${place.website ? `<a href="${place.website}" target="_blank">Сайт</a>` : ''}
          ${place.phone ? `<a href="tel:${place.phone.replace(/\D/g, '')}">Позвонить</a>` : ''}
        </div>
      `,
      hintContent: place.name
    },
    {
      preset: getPresetByCategory(place.category),
      iconColor: getColorByCategory(place.category),
      hideIconOnBalloonOpen: false
    }
  );

  // Добавляем кастомные данные для фильтрации
  placemark.properties.set('category', place.category);
  return placemark;
}

// Настройка пресетов по категориям
function getPresetByCategory(category) {
  const presets = {
    park: 'islands#greenDotIcon',
    food: 'islands#pinkDotIcon',
    museum: 'islands#blueDotIcon',
    theater: 'islands#orangeDotIcon',
    photo: 'islands#redDotIcon',
    default: 'islands#violetDotIcon'
  };
  return presets[category] || presets.default;
}

// Цвета иконок по категориям
function getColorByCategory(category) {
  const colors = {
    park: '#34A853',
    food: '#fc3adb',
    museum: '#3F51B5',
    theater: '#FF7043',
    photo: '#f50e0e',
    default: '#8312da'
  };
  return colors[category] || colors.default;
}

// Фильтрация меток
function setupFilterControls(map, clusterer, places) {
  const filterButtons = document.querySelectorAll('.map__categories-button');
  
  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      const category = button.dataset.category;
      
      // Обновляем активную кнопку
      filterButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Фильтруем метки
      clusterer.removeAll();
      const filteredPlaces = category === 'all' 
        ? places 
        : places.filter(place => place.category === category);
      
      filteredPlaces.forEach(place => {
        clusterer.add(createPlacemark(place));
      });
      
      // Автоматически подбираем масштаб
      if (filteredPlaces.length > 0) {
        map.setBounds(clusterer.getBounds(), {
          checkZoomRange: true,
          zoomMargin: 50
        });
      }
    });
  });
}



// =====================
// Инициализация страницы
// =====================
// Инициализация страницы
(async function init() {
  const defaults = await PlacesService.loadDefaults();
  Storage.init(defaults);
  setupUI();

  // Популярное
  const allData = Storage.load();
  const popular = Filter.popular(allData, 4);
  Renderer.renderPopular(popular);

  // Основной фид мест
  updatePlaces();

  // Если есть карта — инициализируем её
  if (typeof initMap === 'function') {
    initMap();
  }

  // Показать скрытые категории
  const showMoreCategoriesBtn = document.getElementById('showMoreCategories');
  if (showMoreCategoriesBtn) {
    showMoreCategoriesBtn.addEventListener('click', function () {
      const hiddenCards = document.querySelectorAll('.category-cart.hidden');
      hiddenCards.forEach(card => card.classList.remove('hidden'));
      this.style.display = 'none';
    });
  }
})();






