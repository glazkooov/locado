// pages/photos.js — photos/: автор, источник и лицензия каждого фото мест
// и обложек подборок. Список собирается из данных сам — отдельно вести
// не нужно (поле photoCredit, см. core/credits.js).

import { loadPlaces, placeUrl } from '../core/places.js';
import { loadCollections, collectionUrl } from '../core/collections.js';
import { creditHtml } from '../core/credits.js';
import { escapeHtml } from '../core/format.js';

const item = (name, url, credit) =>
  `<li><a class="credits-list__name" href="${url}">${escapeHtml(name)}</a><span>${creditHtml(credit)}</span></li>`;

async function main() {
  const placesEl = document.getElementById('credits-places');
  try {
    const [places, collections] = await Promise.all([loadPlaces(), loadCollections().catch(() => [])]);
    const withCredit = places.filter((p) => p.photo && p.photoCredit?.author);
    placesEl.innerHTML = withCredit.length
      ? withCredit.map((p) => item(p.name, placeUrl(p.slug), p.photoCredit)).join('')
      : '<li>Пока у всех мест — фото Локадо.</li>';
    const covers = collections.filter((c) => c.cover && c.photoCredit?.author);
    if (covers.length) {
      document.getElementById('credits-collections').innerHTML = covers.map((c) => item(c.title, collectionUrl(c.slug), c.photoCredit)).join('');
      document.getElementById('credits-collections').hidden = false;
      document.getElementById('credits-collections-title').hidden = false;
    }
  } catch (err) {
    console.error('[photos] не удалось загрузить данные:', err);
    placesEl.innerHTML = '<li>Не получилось загрузить список. Обнови страницу — обычно помогает.</li>';
  }
}

main();
