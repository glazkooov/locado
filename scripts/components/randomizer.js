// components/randomizer.js — окно «Случайное место».
//
// Два режима: «Сейчас» — только места, открытые ещё хотя бы час (успеть
// доехать), и «На потом» — все, с часами работы вместо статуса. Режим
// запоминается. Места не повторяются, пока не покажутся все из выбора;
// закрыл окно и открыл снова — то же место, а не новое.

import { goal, categoryGoal } from '../core/analytics.js';
import { $, $$, on } from '../core/dom.js';
import { escapeHtml, getOpenStatus, openStatusLabel, scheduleSummary } from '../core/format.js';
import { categoryLabel, pickRandom, placeUrl, metroList, CATEGORIES, inCategory } from '../core/places.js';
import { createModal } from './modal.js';
import { setPressed } from './category-buttons.js';
import { icon } from '../core/icons.js';

const MODE_KEY = 'locado:randomizer-mode';
const MIN_OPEN_MS = 60 * 60000; // «открыто сейчас» — ещё хотя бы час

const readMode = () => { try { return localStorage.getItem(MODE_KEY) === 'any' ? 'any' : 'now'; } catch { return 'now'; } };
const saveMode = (mode) => { try { localStorage.setItem(MODE_KEY, mode); } catch { /* приватный режим */ } };

/** Открыто сейчас и не закроется в ближайший час. */
function openForAWhile(place, now = new Date()) {
  if (!place.schedule) return false;
  const status = getOpenStatus(place, now);
  if (!status.isOpen) return false;
  return status.roundTheClock || !status.nextChangeAt || status.nextChangeAt - now >= MIN_OPEN_MS;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initRandomizer(places) {
  const modalEl = $('#randomizer-modal');
  if (!modalEl) return null;

  const chips = $$('#randomizer-categories .chip', modalEl);
  const modeBtns = $$('.randomizer__mode-btn', modalEl);
  const acceptBtn = $('#randomizer-accept', modalEl);
  const rerollBtn = $('#randomizer-reroll', modalEl);
  const actions = $('#randomizer-actions', modalEl);
  const preview = $('#randomizer-preview', modalEl);
  const empty = $('#randomizer-empty', modalEl);
  const dice = $('.randomizer__dice', modalEl);
  const previewImg = $('#preview-img', modalEl);

  // Нет фото или не загрузилось — остаётся тёплая подложка (card.css)
  previewImg?.addEventListener('error', () => previewImg.classList.add('is-broken'));

  let category = 'all';
  let mode = readMode();
  let current = null;
  const seen = new Set(); // уже показанные в текущем выборе — без повторов

  const pool = () => {
    const now = new Date();
    return places.filter((p) => (category === 'all' || inCategory(p, category))
      && (mode === 'any' || openForAWhile(p, now)));
  };

  const facts = (place) => {
    const [metro] = metroList(place);
    const status = mode === 'now' ? openStatusLabel(place)?.text : scheduleSummary(place.schedule);
    return [
      metro && `<li>${icon('train-front')} м. ${escapeHtml(metro)}</li>`,
      status && `<li class="${mode === 'now' ? 'is-open' : ''}">${icon('clock')} ${escapeHtml(status)}</li>`
    ].filter(Boolean).join('');
  };

  const render = (place) => {
    current = place;
    previewImg.classList.remove('is-broken');
    previewImg.src = place.photoSm || place.photo || '';
    $('#preview-name', modalEl).textContent = place.name;
    $('#preview-category', modalEl).textContent = place.type || categoryLabel(place.category);
    $('#preview-desc', modalEl).textContent = place.description || '';
    $('#preview-facts', modalEl).innerHTML = facts(place);
    preview.hidden = false;
    empty.hidden = true;
    actions.hidden = false;
  };

  const showEmpty = () => {
    current = null;
    $('#randomizer-empty-text', modalEl).textContent = category === 'all'
      ? 'Сейчас почти всё закрыто или скоро закроется.'
      : `Сейчас в категории «${CATEGORIES[category]?.label || ''}» всё закрыто или скоро закроется.`;
    preview.hidden = true;
    empty.hidden = false;
    actions.hidden = true;
  };

  /** Бросок с короткой анимацией: кубик крутится, карточка сменяется. */
  const roll = ({ animate = true } = {}) => {
    const candidates = pool();
    if (!candidates.length) { showEmpty(); return; }
    let fresh = candidates.filter((p) => !seen.has(p.slug) && p.slug !== current?.slug);
    if (!fresh.length) { // показали всё — начинаем круг заново
      seen.clear();
      fresh = candidates.filter((p) => p.slug !== current?.slug);
      if (!fresh.length) fresh = candidates;
    }
    const next = pickRandom(fresh);
    seen.add(next.slug);
    if (!animate || reducedMotion()) { render(next); return; }
    dice?.classList.remove('is-rolling');
    void dice?.getBoundingClientRect(); // перезапуск анимации
    dice?.classList.add('is-rolling');
    preview.classList.add('is-changing');
    setTimeout(() => { render(next); preview.classList.remove('is-changing'); }, 180);
  };

  const restart = () => { seen.clear(); current = null; roll(); };

  const setMode = (value) => {
    mode = value;
    saveMode(mode);
    setPressed(modeBtns, (b) => b.dataset.mode === mode);
  };

  const goToPlace = () => { if (current) window.location.href = placeUrl(current.slug); };

  const modal = createModal(modalEl, {
    onOpen: () => {
      goal('random_open');
      setPressed(modeBtns, (b) => b.dataset.mode === mode);
      // Повторное открытие показывает прежнее место, если оно ещё подходит
      if (current && pool().some((p) => p.slug === current.slug)) { render(current); return; }
      roll({ animate: false });
    }
  });

  on($('#hero-random-icon'), 'click', (e) => { e.preventDefault(); modal.open(); });

  chips.forEach((chip) => on(chip, 'click', () => {
    category = chip.dataset.category;
    categoryGoal(category, 'Случайное место');
    setPressed(chips, (c) => c === chip);
    chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    restart();
  }));
  modeBtns.forEach((btn) => on(btn, 'click', () => {
    if (btn.dataset.mode === mode) return;
    setMode(btn.dataset.mode);
    restart();
  }));
  on($('#randomizer-any', modalEl), 'click', () => { setMode('any'); restart(); });

  on(rerollBtn, 'click', () => roll());
  on(acceptBtn, 'click', goToPlace);
  on(preview, 'click', goToPlace);
  on(preview, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToPlace(); } });

  return modal;
}
