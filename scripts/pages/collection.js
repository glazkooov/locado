// pages/collection.js — точка входа collection.html: авторская подборка
// (маршрут или «под повод»). Текст — из data/collections.json, практические
// данные мест (метро, часы, цена, фото) — из places.json.

import { goal } from '../core/analytics.js';
import { $, on } from '../core/dom.js';
import { escapeHtml, cssUrl, hoursForArticle } from '../core/format.js';
import { loadPlaces, bySlug, placeUrl, metroList, categoryLabel } from '../core/places.js';
import { loadCollections, COLLECTION_TYPES } from '../core/collections.js';
import { collectionCardHtml } from '../components/collection-card.js';
import { bindImageFallback } from '../components/card.js';
import { initCollectionMap, walkingRouteUrl } from '../components/map.js';
import { icon } from '../core/icons.js';
import { initShare } from '../components/share.js';

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
  if (c.cover) $('meta[property="og:image"]')?.setAttribute('content', new URL(c.cover, location.href).href);
}

const META_ICONS = { duration: 'clock', budget: 'ticket', when: 'calendar', area: 'map-pin', start: 'train-front' };

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

function placeBlock(b, place, num, day) {
  const url = placeUrl(place.slug);
  const [metro] = metroList(place);
  // Часы — на день маршрута, а не «открыто сейчас»: статью читают заранее
  const hours = hoursForArticle(place.schedule, day);
  const facts = [
    metro && `${icon('train-front')} м. ${escapeHtml(metro)}`,
    hours && `${icon('clock')} ${escapeHtml(hours)}`,
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
      return placeBlock(b, place, ordered.length, c.day);
    }
    return '';
  }).join('');
  const body = $('#collection-body');
  body.innerHTML = html;
  bindImageFallback(body);
  return ordered;
}

/** «5 минут пешком по Лаврушинскому» → «5 минут пешком»: в плане — только время. */
const walkShort = (text = '') => (text.match(/^[^,]*?\d+[\d–-]*\s*мин\S*(\s+пешком)?/i) || [''])[0];

/** План под обложкой: остановки столбиком с номерами; у маршрута — линия
 *  между ними и время перехода. */
function renderPlan(c, blocks, places) {
  const isRoute = c.type === 'route';
  const stops = [];
  let pendingWalk = '';
  blocks.forEach((b) => {
    if (b.type === 'walk') pendingWalk = walkShort(b.text);
    if (b.type !== 'place') return;
    const place = bySlug(places, b.slug);
    if (!place) return;
    stops.push({ place, walk: stops.length ? pendingWalk : '', kicker: b.kicker });
    pendingWalk = '';
  });
  if (stops.length < 2) return;

  const list = $('#collection-plan-list');
  list.classList.toggle('is-route', isRoute);
  list.innerHTML = stops.map(({ place, walk, kicker }, i) => `
    ${isRoute && walk ? `<li class="collection-plan__walk" aria-hidden="true">${escapeHtml(walk)}</li>` : ''}
    <li class="collection-plan__stop">
      <a href="#place-${i + 1}">
        <span class="collection-plan__num">${i + 1}</span>
        <span class="collection-plan__text">
          <span class="collection-plan__name">${escapeHtml(place.name)}</span>
          <span class="collection-plan__sub">${escapeHtml(isRoute ? (place.type || categoryLabel(place.category)) : (kicker || place.type || ''))}</span>
        </span>
      </a>
    </li>`).join('');
  $('#collection-plan-title').textContent = isRoute ? `Маршрут: ${stops.length} ${stops.length < 5 ? 'остановки' : 'остановок'}` : `${stops.length} ${stops.length < 5 ? 'места' : 'мест'} на выбор`;
  $('#collection-plan').hidden = false;
}

function renderByline(c) {
  // «27 сентября 2026», без «г.»
  const date = c.published
    ? new Date(c.published).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '')
    : '';
  $('#collection-byline').textContent = [c.author || 'Редакция Локадо', date].filter(Boolean).join(' · ');
}

async function renderMap(c, ordered) {
  const isRoute = c.type === 'route';
  $('#collection-map-title').textContent = isRoute ? 'Маршрут на карте' : 'Все места на карте';
  if (isRoute && ordered.length > 1) {
    $('#collection-route-link').href = walkingRouteUrl(ordered);
    on($('#collection-route-link'), 'click', () => goal('route_click', { collection: c.slug }));
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
  goal('collection_open', { collection: c.slug });
  renderHero(c);
  renderByline(c);
  const ordered = renderBody(c, places);
  renderPlan(c, c.blocks || [], places);
  renderMore(c, collections);
  initShare([$('#share-btn')], () => ({ title: c.title, text: c.lead }));
  await renderMap(c, ordered);
}

main();
