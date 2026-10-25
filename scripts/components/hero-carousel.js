// components/hero-carousel.js — карточки настроений на телефоне колодой:
// сверху одна карточка, из-под неё веером выглядывают соседние. Свайп
// влево уносит верхнюю за край (она всё время поверх остальных), из-под неё
// поднимается следующая; свайп вправо возвращает улетевшую. Карточки идут по
// кругу. С 768px — обычный ряд из пяти карточек (home.css), колоды нет.
//
// Карточки те же, что рисует hero-moods.js: нажатие на верхнюю выбирает
// настроение как обычно, на выглядывающую — подкручивает к ней.

import { $$ } from '../core/dom.js';

// Места в стопке: 0 — сверху, 1 — справа, 2 — слева, 3 — спрятана
const SLOTS = [
  { x: 0, y: 0, r: 0, s: 1, shade: 0 },
  { x: 38, y: 10, r: 5, s: 0.9, shade: 0.28 },
  { x: -38, y: 18, r: -5, s: 0.82, shade: 0.45 },
  { x: 0, y: 26, r: 0, s: 0.74, shade: 0.6 }
];

/** Как лежит карточка в d позициях от верха (d дробное во время свайпа). */
function layout(d) {
  if (d < 0) {
    // Улетает влево с поворотом и всё время лежит поверх стопки
    const a = -d;
    return { t: `translate3d(${d * 330}px, ${a * 18}px, 0) rotate(${d * 14}deg)`,
      o: Math.max(0, Math.min(1, (1 - a) / 0.25)), z: 300 - Math.round(a * 100), shade: 0, par: d * 10, label: 1 - Math.min(1, a * 1.6) };
  }
  // Между местами в стопке — плавно
  const k = Math.min(Math.floor(d), 2), f = d - k;
  const A = SLOTS[k], B = SLOTS[k + 1];
  const m = (p) => A[p] + (B[p] - A[p]) * f;
  return { t: `translate3d(${m('x')}px, ${m('y')}px, 0) rotate(${m('r')}deg) scale(${m('s')})`,
    o: Math.max(0, Math.min(1, (2.5 - d) / 0.4)), z: 200 - Math.round(d * 30), shade: m('shade'), par: d * 6, label: 1 - Math.min(1, d * 1.6) };
}

export function initHeroCarousel() {
  const container = document.getElementById('hero-moods');
  if (!container) return;
  const cards = $$('.mood-card[data-mood]', container);
  const n = cards.length;
  if (n < 3) return;

  const narrow = window.matchMedia('(max-width: 767px)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Расстояние до верха стопки по кругу: −n/2 … n/2
  const wrap = (d) => ((d % n) + n + n / 2) % n - n / 2;
  let active = false, pos = 0, vel = 0, target = 0, raf = 0, shown = null;
  let startX = 0, startY = 0, startPos = 0, lastX = 0, lastT = 0, flick = 0, dragging = false, moved = false, locked = null;

  const draw = () => {
    cards.forEach((card, i) => {
      const d = wrap(i - pos), L = layout(d);
      card.style.transform = L.t;
      card.style.opacity = L.o;
      card.style.zIndex = L.z;
      // Затемнение — прозрачностью слоя (::before), а не filter: фильтр
      // перерисовывает фото на каждом кадре и тормозит на телефонах
      card.style.setProperty('--shade', L.shade.toFixed(3));
      card.style.setProperty('--par', `${L.par}%`);
      card.style.setProperty('--label', L.label.toFixed(3));
      const front = Math.abs(d) < 0.5;
      card.classList.toggle('is-front', front);
      card.tabIndex = front ? 0 : -1;
    });
    // Лёгкий отклик пальцу при смене карточки (Android; iOS не умеет)
    const cur = ((Math.round(pos) % n) + n) % n;
    if (cur !== shown) {
      if (shown !== null && dragging) navigator.vibrate?.(6);
      shown = cur;
    }
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

  // Свайп: ширина карточки пальцем — одна позиция. Вертикальное движение
  // отдаём странице: колода не мешает листать вниз
  const STEP = 165;
  container.addEventListener('pointerdown', (e) => {
    if (!active) return;
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
    pos = startPos - dx / STEP; target = pos; draw();
  });
  const release = () => {
    if (!dragging) return; dragging = false;
    if (!moved) return;
    // Бросок досылает карточку, даже если палец прошёл меньше половины;
    // за свайп — не больше одной карточки, как в настоящей колоде
    const to = Math.round(pos - Math.max(-1.4, Math.min(1.4, flick * 2.4)));
    go(Math.max(Math.round(startPos) - 1, Math.min(Math.round(startPos) + 1, to)));
  };
  container.addEventListener('pointerup', release);
  container.addEventListener('pointercancel', release);

  // Клик: после свайпа — ничего; по выглядывающей — подкрутить; по верхней —
  // дальше, к обработчику hero-moods.js (выбор настроения)
  container.addEventListener('click', (e) => {
    if (!active) return;
    const card = e.target.closest('.mood-card[data-mood]');
    if (!card) return;
    if (moved) { e.preventDefault(); e.stopImmediatePropagation(); moved = false; return; }
    const d = wrap(cards.indexOf(card) - pos);
    if (Math.abs(d) >= 0.5) { e.preventDefault(); e.stopImmediatePropagation(); go(Math.round(pos + d)); }
  }, true);

  container.addEventListener('keydown', (e) => {
    if (!active) return;
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    go(Math.round(target) + step);
    requestAnimationFrame(() => container.querySelector('.is-front')?.focus({ preventScroll: true }));
  });

  // Повернули телефон или растянули окно шире 768px — обычный ряд
  const enable = () => {
    active = true;
    container.classList.add('is-carousel');
    draw();
  };
  const disable = () => {
    active = false; dragging = false;
    cancelAnimationFrame(raf);
    container.classList.remove('is-carousel');
    cards.forEach((card) => {
      ['transform', 'opacity', 'z-index', '--shade', '--par', '--label'].forEach((p) => card.style.removeProperty(p));
      card.classList.remove('is-front');
      card.removeAttribute('tabindex');
    });
  };
  narrow.addEventListener('change', () => (narrow.matches ? enable() : disable()));
  if (!narrow.matches) return;
  enable();
  hint();

  // Подсказка «листается»: один раз за визит, когда колода видна, верхняя
  // карточка чуть отъезжает и возвращается. Человек ещё не трогал колоду
  function hint() {
    if (reduce || !('IntersectionObserver' in window)) return;
    try { if (sessionStorage.getItem('moods-hint')) return; } catch (e) { /* без хранилища — покажем */ }
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      setTimeout(() => {
        if (!active || dragging || pos !== 0) return;
        try { sessionStorage.setItem('moods-hint', '1'); } catch (e) { /* не важно */ }
        target = 0.32; spring();
        setTimeout(() => { if (!dragging) go(0); }, 420);
      }, 900);
    }, { threshold: 0.6 });
    io.observe(container);
  }
}
