// АРХИВ: логика hero-поиска. См. scripts/_archive/hero-search.html для
// статуса и инструкции по возврату. Этот файл НЕ импортируется из
// scripts/pages/home.js — код рабочий, просто не подключён.
//
// initHeroSearch(feed) — обработчик поля #main-search-input + кнопки
// #main-search-btn: по вводу/клику фильтрует ленту и скроллит к ней.
//
// initPlaceholderTyping() — анимация "печатающегося" плейсхолдера в поле
// #main-search-input (перебор фраз-подсказок).
//
// initRandomTooltip() — всплывающая подсказка «Выбрать случайное место»
// у иконки-кубика внутри поля поиска (показывается через 2 с на 3 с).
// Нужна была, пока кубик был иконкой без подписи; сейчас на живой странице
// у кнопки-рандомайзера есть видимый текст, поэтому подсказка убрана.
//
// Чтобы вернуть: импортировать функции в home.js и вызвать их в main()
// так же, как это было раньше (initPlaceholderTyping() и initRandomTooltip()
// без аргументов, initHeroSearch(feed, { onSearch: scrollToFeed }) — после
// того как feed создан через initFeed()).

import { $, on, toggleClear } from '../core/dom.js';

export function initHeroSearch(feed, { onSearch } = {}) {
  const input = $('#main-search-input');
  const btn = $('#main-search-btn');
  const clearBtn = $('#hero-clear-btn');
  if (!input) return;

  const performSearch = () => {
    const query = input.value.trim();
    feed?.setFilters({ category: 'all', query }, { syncInput: true });
    onSearch?.();
  };

  on(btn, 'click', performSearch);
  on(input, 'keydown', (e) => { if (e.key === 'Enter') performSearch(); });
  on(input, 'input', () => toggleClear(input, clearBtn));
  on(clearBtn, 'click', () => { input.value = ''; toggleClear(input, clearBtn); input.focus(); });
}

export function initRandomTooltip() {
  const icon = $('#hero-random-icon');
  const tooltip = $('#random-tooltip');
  if (!icon || !tooltip) return;
  setTimeout(() => {
    tooltip.classList.add('show');
    setTimeout(() => tooltip.classList.remove('show'), 3000);
  }, 2000);
}

export function initPlaceholderTyping() {
  const input = $('#main-search-input');
  if (!input || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const phrases = ['Погулять по парку', 'Вкусно поесть', 'Сходить на выставку', 'Активный отдых', 'Романтический вечер', 'Бесплатные музеи'];
  let phraseIndex = 0, charIndex = 0, isDeleting = false;

  const tick = () => {
    if (document.activeElement === input || input.value) { setTimeout(tick, 1000); return; }
    const fullText = phrases[phraseIndex];
    charIndex += isDeleting ? -1 : 1;
    input.placeholder = fullText.substring(0, charIndex);

    if (!isDeleting && charIndex === fullText.length) { isDeleting = true; setTimeout(tick, 1500); }
    else if (isDeleting && charIndex === 0) { isDeleting = false; phraseIndex = (phraseIndex + 1) % phrases.length; setTimeout(tick, 300); }
    else setTimeout(tick, isDeleting ? 50 : 100);
  };
  tick();
}
