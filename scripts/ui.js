// ui.js — общий слой для всех страниц: высота хедера, мобильное меню,
// выпадающее меню пользователя, кнопка "наверх", плавное появление секций
// при скролле. Раньше это было разбито между ui.js и main.js (пункт меню
// пользователя жил в main.js и не работал на place.html) и отдельным файлом
// cozy-enhancements.js (back-to-top дублировался, reveal-on-scroll — нет);
// здесь всё собрано в одном общем модуле, подключаемом на каждой странице.

import { $, $$, on } from './core/dom.js';
import { initInstall } from './components/install.js';
import { initConsent } from './components/consent.js';

const syncHeaderHeight = () => {
  const header = $('.main-header');
  if (!header) return;
  document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
};

const initMobileMenu = () => {
  const toggle = document.getElementById('mobile-menu-toggle');
  const nav = document.getElementById('main-nav');
  if (!toggle || !nav) return;

  const setMenu = (open) => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    document.body.classList.toggle('nav-open', open);
  };

  on(toggle, 'click', (e) => { e.stopPropagation(); setMenu(!nav.classList.contains('open')); });
  $$('a', nav).forEach((link) => on(link, 'click', () => setMenu(false)));
  on(document, 'click', (e) => {
    if (nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) setMenu(false);
  });
  on(document, 'keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); toggle.focus(); }
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
  // .popular не прячем: её начало должно выглядывать из-под hero с первого
  // экрана — это подсказка, что страница продолжается
  const targets = $$('.main-content > section:not(.popular), .suggested-grid, .places-grid');
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
    document.body.classList.contains('nav-open') && $('#mobile-menu-toggle')?.click();
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
initInstall();
initHeaderSearch();
