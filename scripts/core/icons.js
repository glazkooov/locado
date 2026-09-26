// core/icons.js — SVG-иконки из спрайта assets/icons.svg (Lucide) вместо
// Font Awesome с CDN: не зависят от стороннего сервера, весят ~9 КБ на
// весь набор. Размер и цвет — классом .icon (currentColor, 1em).

const SPRITE = 'assets/icons.svg';

/** icon('map-pin', 'masonry-icon') → <svg class="icon masonry-icon">…</svg> */
export function icon(name, extraClass = '') {
  return `<svg class="icon${extraClass ? ` ${extraClass}` : ''}" aria-hidden="true" focusable="false"><use href="${SPRITE}#${name}"></use></svg>`;
}
