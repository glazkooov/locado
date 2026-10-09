// pages/together.js — vmeste/: «Выбрать вместе». Сервера нет — всё
// состояние лежит в адресе ссылки:
//   без параметров — старт: выбираешь, из чего листать, листаешь колоду,
//                    отправляешь другу свои «хочу»;
//   ?p=1,5,9       — друга позвали: он листает только эти места (больше ни
//                    одно не может совпасть) и сразу видит совпадения;
//   &m=5           — совпадения, которые уже есть (после «Предложить своё»);
//   ?m=5,9         — ответ другу: только экран совпадений.
// В ссылке — id мест из places.json: они постоянные и короче slug.

import { $, $$, on } from '../core/dom.js';
import { loadPlaces, placeUrl, metroList, categoryLabel, filterPlaces } from '../core/places.js';
import { MOODS, resolveMoodFilters } from '../core/moods.js';
import { loadNow } from '../core/now.js';
import { escapeHtml, pluralize, openStatusLabel } from '../core/format.js';
import { icon } from '../core/icons.js';
import { showToast } from '../components/toast.js';
import { goal } from '../core/analytics.js';

const SWIPE_THRESHOLD = 90; // px: дальше — карточка улетает
const SEASON_HEAD = 8; // места из «Сейчас» замешиваем в первые N карточек

const placesWord = (n) => pluralize(n, ['место', 'места', 'мест']);

const state = {
  places: [],
  byId: new Map(),
  mode: 'start', // start | own | friend
  deck: [], // очередь мест
  liked: [], // id «хочу» в этой колоде
  toRate: [], // ?p= — что оценивает друг
  matches: [] // ?m= — уже совпавшие
};

// --- адрес ---

const parseIds = (value) => (value || '').split(',')
  .map((x) => Number.parseInt(x, 10))
  .filter((id) => state.byId.has(id))
  .filter((id, i, arr) => arr.indexOf(id) === i);

function linkFor(params) {
  const url = new URL('vmeste/', document.baseURI);
  Object.entries(params).forEach(([k, ids]) => { if (ids.length) url.searchParams.set(k, ids.join(',')); });
  // запятые в адресе читаются лучше, чем %2C
  return url.toString().replace(/%2C/g, ',');
}

// --- колода ---

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Случайный порядок, но места из «Сейчас» — среди первых карточек. */
async function ownDeck(pool) {
  const deck = shuffle(pool);
  const now = await loadNow();
  const seasonal = new Set(now?.places || []);
  const season = deck.filter((p) => seasonal.has(p.slug));
  const rest = deck.filter((p) => !seasonal.has(p.slug));
  season.forEach((p) => rest.splice(Math.floor(Math.random() * Math.min(SEASON_HEAD, rest.length + 1)), 0, p));
  return rest;
}

function cardHtml(place, isTop) {
  const meta = [place.type || categoryLabel(place.category), metroList(place)[0] && `м. ${metroList(place)[0]}`].filter(Boolean).join(' · ');
  // Верхней карточке — крупное фото, следующей хватит маленького
  const photo = isTop ? (place.photo || place.photoSm) : (place.photoSm || place.photo);
  return `
    <article class="together-card${isTop ? ' is-top' : ''}" data-id="${place.id}">
      <img class="together-card__photo" src="${escapeHtml(photo || '')}" alt="" draggable="false">
      <span class="together-card__stamp together-card__stamp--yes" aria-hidden="true">Хочу</span>
      <span class="together-card__stamp together-card__stamp--no" aria-hidden="true">Не сейчас</span>
      <div class="together-card__info">
        <p class="together-card__meta">${escapeHtml(meta)}</p>
        <h2 class="together-card__name">${escapeHtml(place.name)}</h2>
        <p class="together-card__text">${escapeHtml(place.description || '')}</p>
        <a class="together-card__more" href="${placeUrl(place.slug)}" target="_blank" rel="noopener">Подробнее о месте</a>
      </div>
    </article>`;
}

function renderDeck() {
  const deckEl = $('#together-deck');
  const [top, next] = state.deck;
  deckEl.innerHTML = (next ? cardHtml(next, false) : '') + (top ? cardHtml(top, true) : '');
  updateCount();
  if (top) bindSwipe($('.together-card.is-top', deckEl));
  // следующее крупное фото — заранее, чтобы не ждать его после свайпа
  if (next?.photo) new Image().src = next.photo;
}

function updateCount() {
  const count = $('#together-count');
  if (state.mode === 'friend') {
    const total = state.toRate.length;
    const done = total - state.deck.length;
    count.textContent = `${Math.min(done + 1, total)} из ${total}`;
  } else {
    count.innerHTML = `Хочу: <b>${state.liked.length}</b>`;
  }
}

function vote(yes) {
  const [top] = state.deck;
  if (!top) return;
  if (yes) state.liked.push(top.id);
  state.deck.shift();
  if (!state.deck.length) { deckFinished(); return; }
  renderDeck();
}

/** Карточка улетает влево или вправо, потом голос. */
function flyOut(card, yes) {
  if (!card || card.classList.contains('is-leaving')) return;
  card.classList.add('is-leaving');
  card.style.transform = `translateX(${yes ? 140 : -140}%) rotate(${yes ? 18 : -18}deg)`;
  card.style.opacity = '0';
  setTimeout(() => vote(yes), 220);
}

function bindSwipe(card) {
  let startX = 0;
  let dx = 0;
  let dragging = false;
  const setStamp = () => {
    card.style.setProperty('--yes', String(Math.max(0, Math.min(1, dx / SWIPE_THRESHOLD))));
    card.style.setProperty('--no', String(Math.max(0, Math.min(1, -dx / SWIPE_THRESHOLD))));
  };
  on(card, 'pointerdown', (e) => {
    if (e.target.closest('a')) return;
    dragging = true;
    startX = e.clientX;
    dx = 0;
    card.setPointerCapture(e.pointerId);
    card.classList.add('is-dragging');
  });
  on(card, 'pointermove', (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    setStamp();
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('is-dragging');
    if (Math.abs(dx) > SWIPE_THRESHOLD) { flyOut(card, dx > 0); return; }
    card.style.transform = '';
    dx = 0;
    setStamp();
  };
  on(card, 'pointerup', end);
  on(card, 'pointercancel', end);
}

// --- экраны ---

function show(screen) {
  $('#together-loading').hidden = true;
  $$('.together__screen').forEach((s) => { s.hidden = s.dataset.screen !== screen; });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function startDeck(deck, mode) {
  state.mode = mode;
  state.deck = deck;
  state.liked = [];
  $('#together-done').hidden = mode === 'friend';
  $('#together-hint').textContent = mode === 'friend'
    ? 'Вправо — хочу, влево — не сейчас'
    : 'Вправо — хочу, влево — не сейчас. Листай сколько хочется';
  show('deck');
  renderDeck();
}

function deckFinished() {
  if (state.mode === 'friend') { showResult(); return; }
  if (!state.liked.length) {
    // всё пролистал и ничего не отметил
    $('#together-deck').innerHTML = '<p class="together__empty">Места закончились, а «хочу» пока нет. Начнём заново?</p>';
    $('#together-done').hidden = true;
    return;
  }
  showSend();
}

function renderSources() {
  const options = [
    { id: 'all', label: 'Из всего', note: 'Все места вперемешку', icon: 'wand-sparkles' },
    ...MOODS.map((m) => ({ id: m.id, label: m.label, icon: m.icon }))
  ];
  $('#together-sources').innerHTML = options.map((o, i) => `
    <button type="button" class="together-source${i === 0 ? ' is-active' : ''}" role="radio" aria-checked="${i === 0}" data-source="${o.id}">
      ${icon(o.icon)}<span>${escapeHtml(o.label)}${o.note ? `<small>${escapeHtml(o.note)}</small>` : ''}</span>
    </button>`).join('');
  on($('#together-sources'), 'click', '.together-source', (e, btn) => {
    $$('.together-source').forEach((b) => {
      b.classList.toggle('is-active', b === btn);
      b.setAttribute('aria-checked', String(b === btn));
    });
  });
}

async function beginOwn(exclude = []) {
  const source = $('.together-source.is-active')?.dataset.source || 'all';
  const skip = new Set(exclude);
  const pool = (source === 'all' ? state.places : filterPlaces(state.places, resolveMoodFilters(state.places, source)))
    .filter((p) => !skip.has(p.id));
  goal('together_start', { 'Выбрать вместе': source });
  startDeck(await ownDeck(pool), 'own');
}

// --- отправка другу ---

function shareLink(url, text, what) {
  const payload = { title: 'Локадо', text, url };
  if ('share' in navigator && window.matchMedia('(pointer: coarse)').matches) {
    navigator.share(payload)
      .then(() => goal('together_send', { 'Выбрать вместе: отправил': what }))
      .catch(() => {});
    return;
  }
  navigator.clipboard.writeText(url)
    .then(() => { goal('together_send', { 'Выбрать вместе: отправил': what }); showToast('Ссылка скопирована — отправь её другу'); })
    .catch(() => showToast('Не удалось скопировать ссылку', true));
}

function bindApps(url, text, what) {
  $('#together-copy').onclick = () => navigator.clipboard.writeText(url)
    .then(() => { goal('together_send', { 'Выбрать вместе: отправил': what }); showToast('Ссылка скопирована'); })
    .catch(() => showToast('Не удалось скопировать ссылку', true));
  $('#together-share').onclick = () => shareLink(url, text, what);
}

function pickedHtml(id) {
  const p = state.byId.get(id);
  return `
    <li class="together-picked" data-id="${id}">
      <img src="${escapeHtml(p.photoSm || p.photo || '')}" alt="">
      <span>${escapeHtml(p.name)}</span>
      <button type="button" class="together-picked__remove" aria-label="Убрать «${escapeHtml(p.name)}»">${icon('x')}</button>
    </li>`;
}

function showSend() {
  const n = state.liked.length;
  if (!n) { backToDeck(); return; }
  const url = linkFor({ p: state.liked, m: state.matches });
  const text = 'Выберем, куда пойти? Отметь места, которые нравятся, — посмотрим, где совпадём';
  $('#together-send-title').textContent = `${n} ${placesWord(n)} — теперь очередь друга`;
  $('#together-send-lead').textContent = 'Друг пролистает твои находки и отметит, куда хочет он. Где вы сойдётесь — туда и идти.'
    + (state.matches.length ? ' Совпадения, которые уже есть, он тоже увидит.' : '');
  $('#together-picked').innerHTML = state.liked.map(pickedHtml).join('');
  $('#together-back').textContent = state.deck.length ? 'Добавить ещё места' : 'Полистать другие места';
  bindApps(url, text, 'Свой выбор');
  show('send');
}

/** Назад к колоде — с того же места; если она кончилась, новая из оставшихся. */
async function backToDeck() {
  if (!state.deck.length) {
    const skip = new Set([...state.liked, ...state.toRate, ...state.matches]);
    state.deck = await ownDeck(state.places.filter((p) => !skip.has(p.id)));
    if (!state.deck.length) { showToast('Ты пролистал все места'); return; }
  }
  $('#together-done').hidden = false;
  show('deck');
  renderDeck();
}

// --- совпадения ---

function matchHtml(place) {
  const status = openStatusLabel(place);
  const meta = [place.type || categoryLabel(place.category), status?.text].filter(Boolean).join(' · ');
  return `
    <a class="together-match" href="${placeUrl(place.slug)}">
      <img src="${escapeHtml(place.photoSm || place.photo || '')}" alt="">
      <span><b>${escapeHtml(place.name)}</b><small>${escapeHtml(meta)}</small></span>
    </a>`;
}

/** Пешеходный маршрут по совпадениям в Яндекс Картах (до 8 точек). */
function routeUrl(places) {
  const points = places.filter((p) => Array.isArray(p.coords)).slice(0, 8).map((p) => p.coords.join(','));
  return `https://yandex.ru/maps/?rtext=${points.join('~')}&rtt=pd`;
}

function showResult() {
  const fromFriend = state.mode === 'friend';
  const matchIds = [...new Set([...state.matches, ...state.liked])];
  const matches = matchIds.map((id) => state.byId.get(id));
  const n = matches.length;
  goal('together_result', { 'Выбрать вместе: совпадений': String(n) });

  $('#together-result-title').textContent = n
    ? `Вам обоим ${pluralize(n, ['понравилось', 'понравились', 'понравились'])} ${n} ${placesWord(n)}`
    : 'Пока без совпадений';
  $('#together-result-lead').textContent = n
    ? 'Открой место, чтобы посмотреть часы и как добраться.'
    : 'Не беда: предложи свои места — друг их оценит.';
  $('#together-matches').innerHTML = matches.map(matchHtml).join('');

  const route = $('#together-route');
  route.hidden = !n;
  if (n === 1) {
    route.textContent = 'Открыть место';
    route.href = placeUrl(matches[0].slug);
    route.removeAttribute('target');
  } else if (n > 1) {
    route.textContent = 'Маршрут по совпадениям';
    route.href = routeUrl(matches);
  }

  // Ответ другу — только тому, кто сейчас оценивал чужой выбор
  const answer = $('#together-answer');
  answer.hidden = !fromFriend || !n;
  answer.onclick = () => shareLink(linkFor({ m: matchIds }), 'Вот где мы совпали:', 'Ответ с совпадениями');

  const more = $('#together-more');
  more.classList.toggle('together__btn--ghost', Boolean(n));
  more.onclick = () => {
    state.matches = matchIds;
    beginOwn([...state.toRate, ...matchIds]);
  };

  const missed = fromFriend ? state.toRate.filter((id) => !state.liked.includes(id)).map((id) => state.byId.get(id).name) : [];
  $('#together-result-note').textContent = missed.length
    ? `Друг хотел ещё: ${missed.join(', ')}. Может, передумаешь?`
    : '';
  show('result');
}

// --- запуск ---

async function main() {
  try {
    state.places = (await loadPlaces()).filter((p) => p.photo);
  } catch (err) {
    $('#together-loading').textContent = 'Не получилось загрузить места. Обнови страницу — обычно помогает.';
    return;
  }
  state.byId = new Map(state.places.map((p) => [p.id, p]));
  renderSources();
  on($('#together-begin'), 'click', () => beginOwn());
  on($('#together-yes'), 'click', () => flyOut($('.together-card.is-top'), true));
  on($('#together-no'), 'click', () => flyOut($('.together-card.is-top'), false));
  on($('#together-back'), 'click', () => backToDeck());
  on($('#together-picked'), 'click', '.together-picked__remove', (e, btn) => {
    const id = Number(btn.closest('.together-picked').dataset.id);
    state.liked = state.liked.filter((x) => x !== id);
    showSend();
  });
  on($('#together-done'), 'click', () => {
    if (!state.liked.length) { showToast('Отметь хотя бы одно место'); return; }
    showSend();
  });
  on(document, 'keydown', (e) => {
    if ($('[data-screen="deck"]').hidden) return;
    if (e.key === 'ArrowRight') flyOut($('.together-card.is-top'), true);
    if (e.key === 'ArrowLeft') flyOut($('.together-card.is-top'), false);
  });

  const params = new URLSearchParams(window.location.search);
  state.toRate = parseIds(params.get('p'));
  state.matches = parseIds(params.get('m'));

  if (state.toRate.length) {
    goal('together_open', { 'Выбрать вместе': 'Открыл ссылку друга' });
    $('#together-intro').hidden = false;
    $('#together-intro').textContent = state.matches.length
      ? 'Друг предложил ещё места. Отметь, куда хочешь, — совпадения добавятся к прошлым.'
      : 'Тебя позвали выбрать, куда пойти. Отметь места, которые нравятся, — и сразу увидишь совпадения.';
    startDeck(shuffle(state.toRate.map((id) => state.byId.get(id))), 'friend');
  } else if (state.matches.length) {
    state.mode = 'answer';
    showResult();
  } else {
    show('start');
  }
}

main();
