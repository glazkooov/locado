// core/dom.js — маленькие помощники для работы с DOM, чтобы не тянуть jQuery
// ради десятка селекторов и делегирования событий.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/**
 * on(target, type, handler, options?)              — обычный листенер
 * on(target, type, selector, handler, options?)     — делегирование событий:
 *   вызывает handler(event, matchedElement), только если event.target
 *   лежит внутри элемента, подходящего под selector.
 */
export function on(target, type, selectorOrHandler, handlerOrOptions, options) {
  if (!target) return () => {};

  if (typeof selectorOrHandler === 'string') {
    const selector = selectorOrHandler;
    const handler = handlerOrOptions;
    const listener = (event) => {
      const match = event.target.closest(selector);
      if (match && target.contains(match)) handler(event, match);
    };
    target.addEventListener(type, listener, options);
    return () => target.removeEventListener(type, listener, options);
  }

  const handler = selectorOrHandler;
  target.addEventListener(type, handler, handlerOrOptions);
  return () => target.removeEventListener(type, handler, handlerOrOptions);
}

/** Показывает/скрывает крестик "очистить поле" рядом с input. */
export function toggleClear(input, button) {
  if (!button) return;
  button.hidden = !(input && input.value);
}
