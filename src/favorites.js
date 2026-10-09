places = [];
favoritesContainer = document.getElementById('favorites-container');
document.addEventListener("DOMContentLoaded", loadPlaces);

async function loadPlaces() {
    try {
        const response = await fetch("data.json");
        places = await response.json();

        filterPlaces(places);

    } catch (error) {
        console.error(error);
    }
}

function setupEventListeners() {
  const favButtons = document.querySelectorAll('.fav-btn');
  favButtons.forEach(btn => {
    const slug = btn.dataset.slug;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFavorite(slug);
    });
  });
}



function getFavorites() {
  return JSON.parse(localStorage.getItem('favorites')) || [];
}

function saveFavorites(favs) {
    localStorage.setItem('favorites', JSON.stringify(favs));
}


function removeFavorite(slug) {
    const favorites = getFavorites();
    const index = favorites.indexOf(slug);

    if (index !== -1) {
        favorites.splice(index,1);
    }

    saveFavorites(favorites);
    filterPlaces(places);
    showToast("Место удалено из избранного");
}

function filterPlaces(list) {
    const favorites = getFavorites();

    let filtered = list.filter(place => favorites.includes(place.slug));
    
    renderPlaces(filtered)
    }

function renderPlaces(list) {
  favoritesContainer.innerHTML = "";

  if (list.length === 0) {
    favoritesContainer.innerHTML = "<p>Ничего не найдено.</p>";
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
        <button class="fav-btn" data-slug="${place.slug}">❤️</button>
        ${place.description ? `<p>${place.description}</p>` : ""}
      </div>`;
    favoritesContainer.appendChild(div);
  });
  
  setupEventListeners();
}

function showToast(text) {
    const toast = document.getElementById('toast-container');

    toast.innerHTML = `<p>${text}</p>`;
    toast.style.opacity = '1';
    
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 2000);
}