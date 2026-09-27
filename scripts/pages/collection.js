// pages/collection.js — точка входа collection.html: авторская подборка
// (маршрут или «под повод»). Текст — из data/collections.json, практические
// данные мест (метро, часы, цена, фото) — из places.json.

import { $ } from '../core/dom.js';
import { escapeHtml, cssUrl, openStatusLabel } from '../core/format.js';
import { loadPlaces, bySlug, placeUrl, metroList, categoryLabel } from '../core/places.js';
import { loadCollections, COLLECTION_TYPES } from '../core/collections.js';
import { collectionCardHtml } from '../components/collection-card.js';
import { bindImageFallback } from '../components/card.js';
import { initCollectionMap, walkingRouteUrl } from '../components/map.js';
import { icon } from '../core/icons.js';

function showNotFound() {
  $('#collection-content').hidden = true;
  $('.main-header')?.classList.remove('main-header--overlay');
  $('#collection-error').hidden = false;
}

function setMeta(c) {
  document.title = `${c.title} — Локадо`;
  $('meta[name="description"]')?.setAttribute('content', c.lead || '');
  $('meta[property="og:title"]')?.setAttribute('content', c.title);
  $('meta[property="og:description"]')?.setAttribute('content', c.lead || '');
  $('meta[property="og:image"]')?.setAttribute('content', c.cover || '');
}

const META_ICONS = { duration: 'clock', budget: 'ticket', when: 'wand-sparkles', area: 'map-pin' };

function renderHero(c) {
  const hero = $('.collection-hero');
  hero.classList.remove('is-loading');
  // Обложка — только если загрузилась; иначе тёплый градиент, как у мест без фото
  const img = new Image();
  img.onload = () => { $('#hero-bg').style.backgroundImage = cssUrl(c.cover); };
  img.onerror = () => hero.classList.add('place-hero--no-photo');
  if (c.cover) img.src = c.cover; else hero.classList.add('place-hero--no-photo');

  $('#collection-type').textContent = COLLECTION_TYPES[c.type] || 'Подборка';
  $('#collection-title').textContent = c.title;
  $('#collection-lead').textContent = c.lead || '';
  $('#collection-meta').innerHTML = Object.entries(c.meta || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `<li class="hero-fact">${icon(META_ICONS[k] || 'tag')} ${escapeHtml(v)}</li>`)
    .join('');
}

const paragraphs = (list = []) => list.map((t) => `<p>${escapeHtml(t)}</p>`).join('');

function textBlock(b) {
  return `
    <section class="c-text">
      ${b.title ? `<h2 class="c-text__title">${escapeHtml(b.title)}</h2>` : ''}
      ${paragraphs(b.paragraphs)}
    </section>`;
}

function walkBlock(b) {
  return `<p class="c-walk">${icon('route')} ${escapeHtml(b.text)}</p>`;
}

function placeBlock(b, place, num) {
  const url = placeUrl(place.slug);
  const [metro] = metroList(place);
  const status = openStatusLabel(place);
  const facts = [
    metro && `${icon('train-front')} м. ${escapeHtml(metro)}`,
    status && `<span class="c-place__status${status.isOpen ? ' is-open' : ''}">${icon('clock')} ${escapeHtml(status.text)}</span>`,
    place.price && `${icon('ticket')} ${escapeHtml(place.price)}`
  ].filter(Boolean);
  return `
    <section class="c-place" id="place-${num}">
      <div class="c-place__head">
        <span class="c-place__num" aria-hidden="true">${num}</span>
        <div>
          ${b.kicker ? `<p class="c-place__kicker">${escapeHtml(b.kicker)}</p>` : ''}
          <h2 class="c-place__name"><a href="${url}">${escapeHtml(place.name)}</a></h2>
          <p class="c-place__type">${escapeHtml(place.type || categoryLabel(place.category))}</p>
        </div>
      </div>
      ${place.photo ? `
      <a class="c-place__photo" href="${url}" tabindex="-1" aria-hidden="true">
        <img src="${escapeHtml(place.photo)}" alt="" loading="lazy">
      </a>` : ''}
      <div class="c-place__text">${paragraphs(b.paragraphs)}</div>
      ${b.tip ? `<p class="c-place__tip"><strong>Совет</strong> ${escapeHtml(b.tip)}</p>` : ''}
      <div class="c-place__footer">
        <ul class="c-place__facts">${facts.map((f) => `<li>${f}</li>`).join('')}</ul>
        <a class="c-place__more" href="${url}">Подробнее о месте →</a>
      </div>
    </section>`;
}

/** Статья по блокам; возвращает места в порядке упоминания (для карты). */
function renderBody(c, places) {
  const ordered = [];
  const html = (c.blocks || []).map((b) => {
    if (b.type === 'text') return textBlock(b);
    if (b.type === 'walk') return walkBlock(b);
    if (b.type === 'place') {
      const place = bySlug(places, b.slug);
      if (!place) return ''; // место убрали из базы — блок молча пропускаем
      ordered.push(place);
      return placeBlock(b, place, ordered.length);
    }
    return '';
  }).join('');
  const body = $('#collection-body');
  body.innerHTML = html;
  bindImageFallback(body);
  return ordered;
}

function renderByline(c) {
  const date = c.published
    ? new Date(c.published).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  $('#collection-byline').textContent = [c.author || 'Редакция Локадо', date].filter(Boolean).join(' · ');
}

async function renderMap(c, ordered) {
  const isRoute = c.type === 'route';
  $('#collection-map-mini').textContent = isRoute ? 'Маршрут целиком' : 'Все места';
  if (isRoute && ordered.length > 1) {
    $('#collection-route-link').href = walkingRouteUrl(ordered);
    $('#collection-route').hidden = false;
  }
  await initCollectionMap($('#collection-map-container'), ordered, {
    onSelect: (num) => $(`#place-${num}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  });
}

function renderMore(c, collections) {
  const others = collections.filter((x) => x.slug !== c.slug).slice(0, 3);
  if (!others.length) return;
  $('#collection-more-grid').innerHTML = others.map(collectionCardHtml).join('');
  $('#collection-more').hidden = false;
}

async function main() {
  const slug = new URLSearchParams(window.location.search).get('slug');
  if (!slug) { showNotFound(); return; }

  let collections;
  let places;
  try {
    [collections, places] = await Promise.all([loadCollections(), loadPlaces()]);
  } catch (err) {
    console.error('[collection] не удалось загрузить данные:', err);
    $('#collection-error-text').textContent = 'Не получилось загрузить подборку. Обнови страницу — обычно помогает.';
    showNotFound();
    return;
  }

  const c = collections.find((x) => x.slug === slug);
  if (!c) { showNotFound(); return; }

  setMeta(c);
  renderHero(c);
  renderByline(c);
  const ordered = renderBody(c, places);
  renderMore(c, collections);
  await renderMap(c, ordered);
}

main();
