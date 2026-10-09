let places = [];

const placeContainer = document.getElementById('place-container');


document.addEventListener('DOMContentLoaded', loadPlaces);

async function loadPlaces() {
  try {
    const response = await fetch("data.json");
    if (!response.ok) throw new Error('Ошибка загрузки данных');
    
    places = await response.json();

    const slug = getIdFromURL();
    const place = places.find(p => p.slug === slug); // находим нужный объект

    if (place) {
      renderPlace(place);
    } else {
      placeContainer.innerHTML = '<p>Место не найдено</p>';
    }
  } catch (error) {
    console.error(error);
    placeContainer.innerHTML = '<p>Ошибка загрузки данных</p>';
  }
}

function getIdFromURL() {
  const URLParams = new URLSearchParams(window.location.search);
  return URLParams.get('slug');
}

function renderPlace(place) {
    document.title = `${place.name} | Locado`;

    placeContainer.innerHTML = `
      <article class="place-full">
        <div class="place-header">
        <nav class="breadcrumbs">
            <a href="index.html">Главная</a> /
            <a href="places.html?cat=${place.category}">${getCategoryName(place.category)}</a> /
            <span>${place.name}</span>
        </nav>
          <h1>${place.name}</h1>
        </div>
  
        <div class="place-gallery">
          <img src="${place.photo}" alt="${place.name}">
        </div>
  
        <div class="place-content">
          <section class="place-description">
            <h2>Описание</h2>
            <p>${place.description}</p>
          </section>
  
          <section class="place-info">
            <p><strong>Адрес:</strong> ${place.address || 'Не указан'}</p>
            <p><strong>Часы работы:</strong> ${place.hours || 'Не указано'}</p>
            ${place.website ? `<p><strong>Сайт:</strong> <a href="${place.website}" target="_blank">${place.website}</a></p>` : ''}
          </section>
        </div>
      </article>
    `;
  }
  

function getCategoryName(key) {
    const categories = {
        park: "Парк",
        food: "Еда",
        museum: "Музей",
        theater: "Театр",
        park: "Парк",
        park: "Парк"
    }

    return categories[key] || 'Категория'
}