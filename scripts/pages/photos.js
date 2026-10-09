// pages/photos.js — photos/: автор, источник и лицензия каждого фото мест
// и обложек подборок. Список собирается из данных сам — отдельно вести
// не нужно (поле photoCredit, см. core/credits.js).

import { loadPlaces, placeUrl } from '../core/places.js';
import { loadCollections, collectionUrl } from '../core/collections.js';
import { creditHtml, hasCredit } from '../core/credits.js';
import { escapeHtml } from '../core/format.js';

const item = (name, url, credit) =>
  `<li><a class="credits-list__name" href="${url}">${escapeHtml(name)}</a><span>${creditHtml(credit)}</span></li>`;

/** Фото действительно лежит на сайте: подпись вносят иногда раньше файла. */
const photoExists = (src) => new Promise((resolve) => {
  if (!src) { resolve(false); return; }
  const img = new Image();
  img.onload = () => resolve(true);
  img.onerror = () => resolve(false);
  img.src = src;
});
const withPhoto = async (items, photoOf) => {
  const ok = await Promise.all(items.map((x) => photoExists(photoOf(x))));
  return items.filter((_, i) => ok[i]);
};

async function main() {
  const placesEl = document.getElementById('credits-places');
  try {
    const [places, collections] = await Promise.all([loadPlaces(), loadCollections().catch(() => [])]);
    const withCredit = await withPhoto(places.filter((p) => p.photo && hasCredit(p.photoCredit)), (p) => p.photoSm || p.photo);
    placesEl.innerHTML = withCredit.length
      ? withCredit.map((p) => item(p.name, placeUrl(p.slug), p.photoCredit)).join('')
      : '<li>Подписи появятся здесь вместе с фото.</li>';
    const covers = await withPhoto(collections.filter((c) => c.cover && hasCredit(c.photoCredit)), (c) => c.coverSm || c.cover);
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
