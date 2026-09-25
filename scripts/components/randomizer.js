// components/randomizer.js — модалка "Случайное место".

import { $, $$, on } from '../core/dom.js';
import { escapeHtml } from '../core/format.js';
import { categoryLabel, pickRandom, recordView, placeUrl } from '../core/places.js';
import { createModal } from './modal.js';

export function initRandomizer(places) {
  const modalEl = $('#randomizer-modal');
  if (!modalEl) return null;

  const chips = $$('#randomizer-categories .chip', modalEl);
  const submitBtn = $('#randomizer-submit', modalEl);
  const acceptBtn = $('#randomizer-accept', modalEl);
  const rerollBtn = $('#randomizer-reroll', modalEl);
  const preview = $('#randomizer-preview', modalEl);
  const previewImg = $('#preview-img', modalEl);
  const previewName = $('#preview-name', modalEl);
  const previewCategory = $('#preview-category', modalEl);
  const previewDesc = $('#preview-desc', modalEl);

  let category = 'all';
  let current = null;

  const pool = () => (category === 'all' ? places : places.filter((p) => p.category === category));

  const showPreview = (place) => {
    current = place;
    previewImg.src = place.photo || '';
    previewImg.alt = place.name;
    previewName.textContent = place.name;
    previewCategory.textContent = place.type || categoryLabel(place.category);
    previewDesc.textContent = place.description || '';
    preview.style.display = 'flex';
    submitBtn.style.display = 'none';
    acceptBtn.style.display = 'block';
    rerollBtn.style.display = 'block';
  };

  const resetState = () => {
    current = null;
    preview.style.display = 'none';
    submitBtn.style.display = 'block';
    acceptBtn.style.display = 'none';
    rerollBtn.style.display = 'none';
  };

  const roll = () => {
    const candidates = pool();
    if (!candidates.length) {
      import('./toast.js').then(({ showToast }) => showToast('В этой категории пока нет мест', true));
      return;
    }
    showPreview(pickRandom(candidates));
  };

  const reroll = () => {
    const candidates = pool();
    if (candidates.length <= 1) {
      import('./toast.js').then(({ showToast }) => showToast('В категории только одно место', true));
      return;
    }
    showPreview(pickRandom(candidates, current?.slug));
  };

  const goToPlace = () => {
    if (!current) return;
    recordView(current);
    window.location.href = placeUrl(current.slug);
  };

  // Окно сразу показывает случайное место: пользователь и так «затрудняется
  // выбрать», поэтому категория — лишь необязательное уточнение.
  const modal = createModal(modalEl, {
    onOpen: () => {
      category = 'all';
      chips.forEach((c) => c.classList.toggle('active', c.dataset.category === 'all'));
      resetState();
      roll();
    }
  });

  on($('#hero-random-icon'), 'click', (e) => { e.preventDefault(); modal.open(); });

  chips.forEach((chip) => {
    on(chip, 'click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      category = chip.dataset.category;
      resetState();
      roll();
    });
  });

  on(submitBtn, 'click', roll);
  on(rerollBtn, 'click', reroll);
  on(acceptBtn, 'click', goToPlace);
  on(preview, 'click', (e) => { if (!e.target.closest('.randomizer-actions')) goToPlace(); });
  on(preview, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToPlace(); } });

  return modal;
}
