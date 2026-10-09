let places = [];
let visibleItems = 9;
const itemsPerPage = 9;

const categoryButtons = document.querySelectorAll('.category-btn');
const placesContainer = document.getElementById('places-container');
const popularContainer = document.getElementById('popular-places-container');
const pageTitle = document.getElementById('page-title');
const showMoreBtn = document.getElementById('show-more-btn');
const searchInput = document.getElementById('categories-search-input');
const clearBtn = document.getElementById('categories-clear-btn');


document.addEventListener('DOMContentLoaded', loadPlaces);

async function loadPlaces() {
  try {
    const response = await fetch("data.json");
    if (!response.ok) throw new Error("Ошибка загрузки данных");
    places = await response.json();

    const {category, search} = getURLParams()
    updateUI(category, search);
    setupEventListeners();

    if (localStorage.getItem("locado_places_data")) {
      places = JSON.parse(localStorage.getItem("locado_places_data"));
    } else {
      localStorage.setItem("locado_places_data", JSON.stringify(places));
    }

    loadPopularPlace();

  } catch (error) {
    console.error(error);
  }
}



function getURLParams() {
  const URLParams = new URLSearchParams(window.location.search);

  return {
    category: URLParams.get('cat') || 'all',
    search: URLParams.get('search') || ''
  };
}

function setURLParams(category, searchQuery) {
  const newURL = `?cat=${category}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`;
  history.pushState(null, "", newURL);
}


function setupEventListeners() {
   
  let searchTimeout;

  categoryButtons.forEach(button => {
    button.addEventListener("click", (e) => {
      e.preventDefault();
      const category = button.dataset.category;
      const searchQuery = searchInput.value.trim();
      visibleItems = 9;
      setURLParams(category, searchQuery);
      updateUI(category, searchQuery);
    });
  });


  searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const {category} = getURLParams();
            visibleItems = 9;
            updateUI(category, searchInput.value);
        }, 300);
  });


  clearBtn.addEventListener('click', () => {
    const {category} = getURLParams();
    searchInput.value = '';
    visibleItems = 9;
    setURLParams(category);
    updateUI(category, '');
  })


  showMoreBtn.addEventListener('click', () => {
    visibleItems += 9;
    const {category, search} = getURLParams();
    updateUI(category,search, false);
  })

  
  window.addEventListener("popstate", () => {
    const {category, search} = getURLParams();
    updateUI(category, search);
  });  


  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        visibleItems += itemsPerPage;
        const {category, search} = getURLParams();
        updateUI(category, search, false);
      }
    });
  }, {
    rootMargin: '200px',
    threshold: 0.1
  });

  observer.observe(showMoreBtn);

  
}


function updateUI(category, searchQuery = '', resetPagination = true) {
  if (resetPagination) visibleItems = 9;

  highlightActiveCategory(category);

  searchInput.value = searchQuery;
  filterAndRenderPlaces(category, searchQuery);
}


function highlightActiveCategory(category) {
  categoryButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.category === category);
  });
}


function filterAndRenderPlaces(category, searchQuery = '', resetPagination = false) {

    let filtered = category === 'all' 
    ? [...places] 
    : places.filter(place => place.category === category);

  
    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(place => 
            place.name.toLowerCase().includes(query) ||
            (place.description && place.description.toLowerCase().includes(query)));
    }

    const visibleList = filtered.slice(0, visibleItems);

    renderPlaces(visibleList);

    if (filtered.length < visibleItems) {
      showMoreBtn.classList.add('invisible');
    } else {
      showMoreBtn.classList.remove('invisible');
    }

}


function attachCardClickHandlers() {
  const placeCards = document.querySelectorAll('.place-card');

  placeCards.forEach(card => {
    card.addEventListener('click', () => {
      updatePlaceData(card.id, "views");
      const slug = card.dataset.slug;
      window.location.href = `place.html?slug=${slug}`
    })
  })
}


function renderPlaces(list) {
  placesContainer.innerHTML = "";

  if (list.length === 0) {
    placesContainer.innerHTML = "<p>Ничего не найдено.</p>";
    showMoreBtn.style.display = 'none';
    return;
  }



  list.forEach(place => {
    const div = document.createElement("div");
    div.classList.add("place-card");
    div.dataset.slug = place.slug;
    div.innerHTML = `
      <img src="${place.photo}" alt="${place.name}" loading="lazy">
      <div class="place-card_description">
        <h3>${place.name}</h3>
        <button class="fav-btn" data-slug="${place.slug}">🤍</button>
        ${place.description ? `<p>${place.description}</p>` : ""}
      </div>`;
    placesContainer.appendChild(div);
  });

  attachCardClickHandlers() 

  document.querySelectorAll('.fav-btn').forEach(btn => {
  const slug = btn.dataset.slug;

  // актуализируем состояние
  if (getFavorites().includes(slug)) {
    btn.classList.add('active');
    btn.textContent = '❤️';
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // чтобы не срабатывал переход по карточке
    toggleFavorite(slug);

    btn.classList.toggle('active');
    btn.textContent = btn.classList.contains('active') ? '❤️' : '🤍';
  });
});
}



function getFavorites() {
  return JSON.parse(localStorage.getItem('favorites')) || [];
}

function saveFavorites(favs) {
  localStorage.setItem('favorites', JSON.stringify(favs));
}

function toggleFavorite(slug) {
  const favorites = getFavorites();
  const index = favorites.indexOf(slug);

  if (index !== -1) {
    favorites.splice(index, 1); // удалить
  } else {
    favorites.push(slug); // добавить
  }

  saveFavorites(favorites);
  updatePlaceData(slug, "favorites");
}


function loadPopularPlace () {
  const popularPlaces = getPopularPlaces();
  filterAndRenderPopularPlaces(popularPlaces);

}

function getPopularPlaces() {
      const saved = localStorage.getItem('locado_places_data');
    if (saved) {
      return JSON.parse(saved);
    } else {
      return places;
    }
}

function filterAndRenderPopularPlaces(list) {
  const placesWithPopularity = list.map(place => {
    return {
      ...place,
      popularity: place.views + place.favorites
    } 
  });

   const topPopular = placesWithPopularity
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 4);

  renderPopularPlaces(topPopular);
}

function updatePlaceData(slug, type) {
  const popular = getPopularPlaces();

  popular.forEach(place => {
    if (place.slug === slug) {
      place[type] = (place[type] || 0) + 1;
    }
  })
  

}

function renderPopularPlaces(list) {
  popularContainer.innerHTML = "";

   list.forEach(place => {
    const div = document.createElement("div");
    div.classList.add("place-card");
    div.dataset.slug = place.slug;
    div.innerHTML = `
      <img src="${place.photo}" alt="${place.name}" loading="lazy">
      <div class="popular__card-text">
              <h3 class="popular__card-title">${place.name}</h3>
              <div class="popular__card-description">${place.description || ''}</div>
            </div>`;
    popularContainer.appendChild(div);
  });
}