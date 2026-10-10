// ui.js — общий слой для всех страниц: высота хедера, мобильное меню,
// выпадающее меню пользователя, кнопка "наверх", плавное появление секций
// при скролле. Раньше это было разбито между ui.js и main.js (пункт меню
// пользователя жил в main.js и не работал на place.html) и отдельным файлом
// cozy-enhancements.js (back-to-top дублировался, reveal-on-scroll — нет);
// здесь всё собрано в одном общем модуле, подключаемом на каждой странице.

import { $, $$, on } from './core/dom.js';
import { initInstall } from './components/install.js';
import { icon } from './core/icons.js';
import { CATEGORIES } from './core/places.js';
import { initConsent } from './components/consent.js';
import { initAnalytics, goal } from './core/analytics.js';

const syncHeaderHeight = () => {
  const header = $('.main-header');
  if (!header) return;
  document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
};

// Нижняя часть мобильного меню: поиск, разделы, «Предложить место»,
// почта. Одна разметка на все страницы — вставляется здесь, на компьютере
// скрыта (header.css)
const menuExtraHtml = () => `
  <div class="nav-extra">
    <a href="./#search" class="nav-search" data-search>${icon('search')} Найти место</a>
    <ul class="nav-cats" aria-label="Разделы">
      ${Object.entries(CATEGORIES).map(([key, c]) =>
        `<li><a href="./?category=${key}">${icon(c.icon)} ${c.label}</a></li>`).join('')}
    </ul>
    <a href="vmeste/" class="nav-suggest">${icon('users')} Выбрать вместе с другом</a>
    <a href="suggest/" class="nav-suggest">${icon('heart')} Предложить место</a>
  </div>`;
const menuContactHtml = '<p class="nav-contact">Пиши нам: <a href="mailto:hello@locado.ru">hello@locado.ru</a></p>';

// Прокрутка под открытым меню: overflow: hidden у body Safari на iPhone
// частично игнорирует, поэтому body фиксируем и возвращаем позицию
let lockedY = 0;
const lockScroll = (lock) => {
  const body = document.body;
  if (lock) {
    lockedY = window.scrollY;
    body.style.top = `-${lockedY}px`;
    body.classList.add('nav-open');
  } else {
    body.classList.remove('nav-open');
    body.style.top = '';
    window.scrollTo({ top: lockedY, behavior: 'instant' });
  }
};

// Пока меню открыто, всё, кроме шапки, недоступно: Tab и экранный диктор
// не уходят под меню. inert — на соседях шапки и всех её предков
const setOutsideInert = (header, value) => {
  for (let el = header; el && el !== document.body; el = el.parentElement) {
    [...el.parentElement.children].forEach((sib) => {
      if (sib !== el && !['SCRIPT', 'STYLE'].includes(sib.tagName)) sib.inert = value;
    });
  }
};

const initMobileMenu = () => {
  const toggle = document.getElementById('mobile-menu-toggle');
  const nav = document.getElementById('main-nav');
  if (!toggle || !nav) return;
  const header = toggle.closest('header');
  const install = nav.querySelector('.install-link--nav');
  if (install) install.insertAdjacentHTML('beforebegin', menuExtraHtml());
  else nav.insertAdjacentHTML('beforeend', menuExtraHtml());
  nav.insertAdjacentHTML('beforeend', menuContactHtml);

  const isOpen = () => nav.classList.contains('open');
  const setMenu = (open) => {
    if (open === isOpen()) return;
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    lockScroll(open);
    if (header) setOutsideInert(header, open);
  };

  on(toggle, 'click', (e) => { e.stopPropagation(); setMenu(!isOpen()); });
  // Ссылки закрывают меню. Прокрутку вернуть до перехода: иначе якорь
  // (#all-places) считался бы от зафиксированного body
  $$('a', nav).forEach((link) => on(link, 'click', () => setMenu(false)));
  on(document, 'click', (e) => {
    if (isOpen() && !nav.contains(e.target) && !toggle.contains(e.target)) setMenu(false);
  });
  on(document, 'keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { setMenu(false); toggle.focus(); }
  });
  window.matchMedia('(min-width: 769px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });
};

const initUserMenu = () => {
  const userBtn = document.getElementById('user-btn');
  const userMenu = document.getElementById('user-menu');
  if (!userBtn || !userMenu) return;

  const setOpen = (open) => {
    userMenu.classList.toggle('active', open);
    userBtn.setAttribute('aria-expanded', String(open));
  };

  on(userBtn, 'click', (e) => { e.stopPropagation(); setOpen(!userMenu.classList.contains('active')); });
  on(document, 'click', () => setOpen(false));
  on(document, 'keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
};

const initBackToTop = () => {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;
  // Кнопка появляется, только когда человек сам листает вверх: при
  // прокрутке вниз она закрывала карточки ленты в правом нижнем углу
  let ticking = false;
  let lastY = window.scrollY;
  const sync = () => {
    const y = window.scrollY;
    if (y < 600 || y > lastY + 4) btn.classList.remove('show');
    else if (y < lastY - 4) btn.classList.add('show');
    lastY = y;
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(sync); }
  }, { passive: true });
  on(btn, 'click', () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });
  sync();
};

/** Прозрачная шапка поверх hero на главной: белеет после начала прокрутки. */
const initHeaderOverlay = () => {
  const header = $('.main-header--overlay');
  if (!header) return;
  let ticking = false;
  const sync = () => { header.classList.toggle('is-scrolled', window.scrollY > 24); ticking = false; };
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(sync); }
  }, { passive: true });
  sync();
};

/** Плавное появление крупных секций при скролле (косметика). */
const initScrollReveal = () => {
  // .now не прячем: её начало должно выглядывать из-под hero с первого
  // экрана — это подсказка, что страница продолжается
  const targets = $$('.main-content > section:not(.now), .suggested-grid, .places-grid');
  if (!targets.length) return;

  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  targets.forEach((el) => el.classList.add('reveal-on-scroll'));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });
  targets.forEach((el) => observer.observe(el));
};

/** Кнопка «Скопировать» рядом с почтой в футере. */
const initCopyButtons = () => {
  on(document, 'click', '[data-copy]', (e, btn) => {
    const text = btn.dataset.copy;
    const done = (ok) => import('./components/toast.js')
      .then(({ showToast }) => showToast(ok ? 'Адрес скопирован' : 'Не удалось скопировать', !ok));
    if (!navigator.clipboard) { done(false); return; }
    navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
  });
};

/** «Поиск» в шапке: на главной — к ленте «Все места» и курсор в строку
 *  поиска; с других страниц ссылка ведёт на index.html#search, и то же
 *  происходит после загрузки. */
const initHeaderSearch = () => {
  const goToSearch = ({ smooth = true } = {}) => {
    const input = $('#categories-search-input');
    const feed = $('#all-places');
    if (!input || !feed) return false;
    const header = $('.main-header');
    const top = feed.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight : 0) - 20;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'instant' });
    input.focus({ preventScroll: true });
    return true;
  };
  on(document, 'click', '[data-search]', (e) => {
    if (goToSearch()) e.preventDefault();
  });
  if (window.location.hash === '#search') {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    // Разделы выше ленты дорисовываются после загрузки данных — поправляем
    // прокрутку ещё раз, когда они встанут на место (если человек не ушёл сам)
    window.addEventListener('load', () => {
      goToSearch({ smooth: false });
      const y = window.scrollY;
      setTimeout(() => { if (Math.abs(window.scrollY - y) < 5) goToSearch({ smooth: false }); }, 800);
    }, { once: true });
  }
};

/** Переход по ссылке с якорем с другой страницы (…/#all-places из меню):
 *  браузер прокручивает сразу, а разделы выше ещё дорисовываются после
 *  загрузки данных, и раздел уезжал вниз. Докручиваем, когда страница
 *  встала, — если человек не начал листать сам. */
/** Цель: клик по карточке подборки — какую выбрали и откуда (главная,
 *  список подборок, страница места, «Ещё подборки»). */
const initPlanGoal = () => {
  const path = window.location.pathname;
  const from = /\/collections\/?$/.test(path) ? 'Все подборки'
    : /\/place\//.test(path) ? 'Страница места'
      : /\/collection\//.test(path) ? 'Другая подборка' : 'Главная';
  on(document, 'click', '.collection-card', (e, card) => {
    goal('plan_select', { 'Подборка': { [card.dataset.title || '']: from } });
  });
};

const initAnchorLanding = () => {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id || id === 'search' || !document.getElementById(id)) return;
  const land = () => {
    const el = document.getElementById(id);
    const header = $('.main-header');
    const top = el.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight : 0);
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  };
  let touched = false;
  ['wheel', 'touchstart', 'keydown'].forEach((t) => window.addEventListener(t, () => { touched = true; }, { once: true, passive: true }));
  window.addEventListener('load', () => {
    if (!touched) land();
    setTimeout(() => { if (!touched) land(); }, 800);
  }, { once: true });
};

/** Ссылки на якорь внутри страницы (#place-2, #collection-map). На
 *  страницах в папках стоит <base href="../">, и браузер считал бы «#…»
 *  от корня сайта — уводил бы на главную. Прокручиваем сами. */
const initInPageAnchors = () => {
  on(document, 'click', 'a[href^="#"]', (e, link) => {
    const id = decodeURIComponent(link.getAttribute('href').slice(1));
    const target = id && document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${id}`);
  });
};

syncHeaderHeight();
window.addEventListener('resize', syncHeaderHeight, { passive: true });
window.addEventListener('load', syncHeaderHeight);

initMobileMenu();
initUserMenu();
initBackToTop();
initHeaderOverlay();
initScrollReveal();
initCopyButtons();
initConsent();
initAnalytics();
initInstall();
initHeaderSearch();
initInPageAnchors();
initAnchorLanding();
initPlanGoal();
