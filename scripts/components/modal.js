// components/modal.js — общий контроллер модалки: класс .is-open вместо
// инлайновых style.display, блокировка скролла body, закрытие по Escape/клику
// на фон/[data-modal-close], простая ловушка фокуса.

import { $, on } from '../core/dom.js';

export function createModal(element, { onOpen, onClose } = {}) {
  if (!element) return null;
  let lastFocused = null;

  const focusables = () =>
    Array.from(element.querySelectorAll('a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'));

  const isOpen = () => element.classList.contains('is-open');

  const open = () => {
    if (isOpen()) return;
    lastFocused = document.activeElement;
    element.classList.add('is-open');
    document.body.classList.add('modal-open');
    element.setAttribute('aria-hidden', 'false');
    const autofocus = element.querySelector('[data-autofocus]') || focusables()[0];
    autofocus?.focus();
    onOpen?.();
  };

  const close = () => {
    if (!isOpen()) return;
    element.classList.remove('is-open');
    document.body.classList.remove('modal-open');
    element.setAttribute('aria-hidden', 'true');
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
    onClose?.();
  };

  on(element, 'click', (e) => {
    if (e.target === element || e.target.closest('[data-modal-close]')) close();
  });

  on(document, 'keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Tab') {
      const items = focusables();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  return { element, open, close, isOpen };
}
