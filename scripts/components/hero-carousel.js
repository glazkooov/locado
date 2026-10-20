// components/hero-carousel.js — ПРОТОТИП: карточки настроений на телефоне
// барабаном (в центре одна, по бокам выглядывают соседние, свайп крутит
// их по кругу). Включается только по адресу ?moods=depth | arc | stack —
// без параметра главная остаётся как была. Внизу экрана — переключатель
// вариантов, чтобы сравнить на своём телефоне.
//
// Карточки те же, что рисует hero-moods.js: нажатие на центральную
// выбирает настроение как обычно, на боковую — подкручивает к ней.

import { $$ } from '../core/dom.js';

const VARIANTS = {
  // Глубина: соседние карточки уходят назад, чуть повёрнуты и размыты,
  // фото внутри сдвигается медленнее карточки (параллакс)
  depth(d) {
    const a = Math.abs(d), s = Math.sign(d), k = Math.min(a, 1.6);
    return {
      t: `translate3d(${s * (k * 128 - Math.max(0, k - 1) * 30)}px, 0, ${-k * 150}px) rotateY(${-s * Math.min(a, 1) * 24}deg)`,
      filter: `brightness(${1 - Math.min(a, 1) * 0.28}) blur(${Math.min(a, 1) * 1.2}px)`,
      o: a > 2.2 ? 0 : 1, z: 100 - Math.round(a * 10), par: -d * 14, label: 1 - Math.min(a, 1)
    };
  },
  // Дуга: карточки на большом колесе с центром далеко под экраном — как
  // циферблат, боковые ниже и наклонены
  arc(d) {
    const a = Math.abs(d);
    return {
      t: `rotate(${d * 15}deg) scale(${1 - Math.min(a, 1.5) * 0.08})`,
      origin: '50% 1100px',
      filter: `brightness(${1 - Math.min(a, 1) * 0.22})`,
      o: a > 2.3 ? 0 : 1, z: 100 - Math.round(a * 10), par: -d * 10, label: 1 - Math.min(a, 1)
    };
  },
  // Колода: соседние прячутся за центральной и выглядывают краем, при
  // свайпе центральная уезжает, следующая выходит вперёд
  stack(d) {
    const a = Math.abs(d), s = Math.sign(d);
    return {
      t: `translate3d(${a <= 1 ? s * a * 92 : s * (92 + (a - 1) * 14)}px, ${Math.min(a, 1.5) * 14}px, 0) scale(${1 - Math.min(a, 1.5) * 0.12})`,
      filter: `brightness(${1 - Math.min(a, 1) * 0.3})`,
      o: a > 1.9 ? 0 : 1, z: 100 - Math.round(a * 10), par: -d * 12, label: 1 - Math.min(a, 1)
    };
  }
};

export function initHeroCarousel() {
  const kind = new URLSearchParams(window.location.search).get('moods');
  const container = document.getElementById('hero-moods');
  if (!container || !kind || !window.matchMedia('(max-width: 767px)').matches) return;
  // ?moods=off — обычная лента, но с переключателем: сравнить «как сейчас»
  if (kind === 'off' || !VARIANTS[kind]) { addSwitcher('off'); return; }
  const layout = VARIANTS[kind];
  const cards = $$('.mood-card[data-mood]', container);
  const n = cards.length;
  if (n < 3) return;

  container.classList.add('is-carousel', `is-carousel--${kind}`);
  const dots = document.createElement('div');
  dots.className = 'mood-dots';
  dots.innerHTML = cards.map(() => '<i></i>').join('');
  container.after(dots);
  addSwitcher(kind);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Расстояние до центра по кругу: −n/2 … n/2
  const wrap = (d) => ((d % n) + n + n / 2) % n - n / 2;
  let pos = 0, vel = 0, target = 0, raf = 0;

  const draw = () => {
    cards.forEach((card, i) => {
      const d = wrap(i - pos), L = layout(d);
      card.style.transform = L.t;
      if (L.origin) card.style.transformOrigin = L.origin;
      card.style.filter = L.filter;
      card.style.opacity = L.o;
      card.style.zIndex = L.z;
      card.style.setProperty('--par', `${L.par}%`);
      card.style.setProperty('--label', L.label.toFixed(3));
      const front = Math.abs(d) < 0.5;
      card.classList.toggle('is-front', front);
      card.tabIndex = front ? 0 : -1;
    });
    const cur = ((Math.round(pos) % n) + n) % n;
    [...dots.children].forEach((dot, i) => dot.classList.toggle('on', i === cur));
  };

  // Пружина: к цели с затуханием, без перелёта — мягко, как в нативных лентах
  const spring = () => {
    cancelAnimationFrame(raf);
    if (reduce) { pos = target; vel = 0; draw(); return; }
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.032, (now - last) / 1000); last = now;
      const k = 170, c = 2 * Math.sqrt(k); // критическое затухание
      vel += (-(pos - target) * k - vel * c) * dt;
      pos += vel * dt;
      if (Math.abs(pos - target) < 0.001 && Math.abs(vel) < 0.01) { pos = target; vel = 0; draw(); return; }
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };
  const go = (to) => { target = to; spring(); };

  // Свайп: ширина карточки пальцем — одна позиция; бросок пролистывает дальше
  const STEP = 190;
  let startX = 0, startY = 0, startPos = 0, lastX = 0, lastT = 0, flick = 0, dragging = false, moved = false, locked = null;
  container.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false; locked = null;
    startX = lastX = e.clientX; startY = e.clientY; lastT = performance.now(); startPos = pos; flick = 0;
    cancelAnimationFrame(raf); vel = 0;
  });
  container.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (locked === 'x') container.setPointerCapture(e.pointerId);
    }
    if (locked !== 'x') return;
    moved = true;
    const now = performance.now();
    flick = (e.clientX - lastX) / Math.max(1, now - lastT); lastX = e.clientX; lastT = now;
    // У края — сопротивление не нужно: лента бесконечная
    pos = startPos - dx / STEP; target = pos; draw();
  });
  const release = () => {
    if (!dragging) return; dragging = false;
    if (moved) go(Math.round(pos - flick * 2.4));
  };
  container.addEventListener('pointerup', release);
  container.addEventListener('pointercancel', release);

  // Клик: после свайпа — ничего; по боковой — подкрутить; по центральной —
  // дальше, к обработчику hero-moods.js (выбор настроения)
  container.addEventListener('click', (e) => {
    const card = e.target.closest('.mood-card[data-mood]');
    if (!card) return;
    if (moved) { e.preventDefault(); e.stopImmediatePropagation(); moved = false; return; }
    const d = wrap(cards.indexOf(card) - pos);
    if (Math.abs(d) >= 0.5) { e.preventDefault(); e.stopImmediatePropagation(); go(Math.round(pos + d)); }
  }, true);

  container.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(Math.round(target) + 1); focusFront(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(Math.round(target) - 1); focusFront(); }
  });
  const focusFront = () => requestAnimationFrame(() => container.querySelector('.is-front')?.focus({ preventScroll: true }));

  draw();
}

/** Переключатель вариантов внизу экрана — только для прототипа. */
function addSwitcher(current) {
  const bar = document.createElement('nav');
  bar.className = 'moods-proto';
  bar.setAttribute('aria-label', 'Варианты прототипа');
  const items = [['off', 'Как сейчас'], ['depth', 'Глубина'], ['arc', 'Дуга'], ['stack', 'Колода']];
  bar.innerHTML = items.map(([k, label]) => {
    const url = new URL(window.location.href);
    url.searchParams.set('moods', k);
    return `<a href="${url.pathname}${url.search}"${k === current ? ' aria-current="true"' : ''}>${label}</a>`;
  }).join('');
  document.body.append(bar);
}
