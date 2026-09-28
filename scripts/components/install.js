// components/install.js — «Локадо на экране телефона» (PWA).
//
// Сайт можно добавить на экран «Домой» как приложение (manifest.webmanifest).
// Подсказываем об этом тихо: строка в футере и в мобильном меню, а плашка
// внизу — только на телефоне, со второго визита и один раз. Если сайт уже
// открыт как приложение — не показываем ничего.
// Android/Chrome: кнопка сразу открывает системное окно установки
// (beforeinstallprompt). iPhone: такого окна нет — показываем инструкцию.

import { $$, on } from '../core/dom.js';
import { createModal } from './modal.js';

const VISITS_KEY = 'locado:visits';
const DISMISSED_KEY = 'locado:install-dismissed';
const BANNER_FROM_VISIT = 2;

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } }
};

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isPhone = () => window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900;

const svg = (id) => `<svg class="icon" aria-hidden="true" focusable="false"><use href="assets/icons.svg#${id}"></use></svg>`;

/** Визит = новая вкладка/сессия, а не каждая страница. */
function countVisit() {
  try {
    if (sessionStorage.getItem(VISITS_KEY)) return Number(store.get(VISITS_KEY) || 1);
    sessionStorage.setItem(VISITS_KEY, '1');
  } catch { /* без sessionStorage считаем каждую страницу */ }
  const n = Number(store.get(VISITS_KEY) || 0) + 1;
  store.set(VISITS_KEY, String(n));
  return n;
}

function modalHtml() {
  const ios = isIOS();
  const steps = ios
    ? `<li><span class="install-step__icon">${svg('share-ios')}</span><span>Нажми «Поделиться» внизу экрана Safari</span></li>
       <li><span class="install-step__icon">${svg('square-plus')}</span><span>Выбери «На экран „Домой“»</span></li>
       <li><span class="install-step__icon">${svg('check')}</span><span>Нажми «Добавить» — иконка Локадо появится рядом с приложениями</span></li>`
    : `<li><span class="install-step__icon">${svg('more-vertical')}</span><span>Открой меню браузера (три точки справа вверху)</span></li>
       <li><span class="install-step__icon">${svg('square-plus')}</span><span>Выбери «Установить приложение» или «Добавить на главный экран»</span></li>
       <li><span class="install-step__icon">${svg('check')}</span><span>Подтверди — иконка Локадо появится рядом с приложениями</span></li>`;
  return `
  <div class="modal" id="install-modal" role="dialog" aria-modal="true" aria-labelledby="install-title">
    <div class="modal-content modal-content--sm">
      <div class="modal-header">
        <h3 id="install-title"><img src="assets/app/icon-192.png" alt="" class="install-modal__app"> Локадо на экране</h3>
        <button type="button" class="modal-close" data-modal-close aria-label="Закрыть">${svg('x')}</button>
      </div>
      <div class="modal-body">
        <p class="modal-hint">Будет под рукой, как приложение: открывается с одного касания, без адресной строки.</p>
        <button type="button" class="btn install-modal__native" id="install-native" hidden>Установить</button>
        <ol class="install-steps" id="install-steps">${steps}</ol>
        ${ios ? '<p class="install-modal__note">Работает в Safari. Если открыл сайт в другом браузере — скопируй ссылку в Safari.</p>' : ''}
      </div>
    </div>
  </div>`;
}

function bannerHtml() {
  return `
  <div class="install-banner" id="install-banner" role="region" aria-label="Добавить Локадо на экран" hidden>
    <img src="assets/app/icon-192.png" alt="" class="install-banner__icon">
    <p class="install-banner__text">Добавь Локадо на экран — будет под рукой, как приложение</p>
    <button type="button" class="install-banner__how" data-install>Как?</button>
    <button type="button" class="install-banner__close" aria-label="Не показывать">${svg('x')}</button>
  </div>`;
}

export function initInstall() {
  if (isStandalone()) return; // уже открыто как приложение

  const visits = countVisit();
  document.body.insertAdjacentHTML('beforeend', modalHtml() + bannerHtml());
  const modal = createModal(document.getElementById('install-modal'));
  const banner = document.getElementById('install-banner');
  const nativeBtn = document.getElementById('install-native');
  let deferredPrompt = null;

  // Ссылки видны только на телефоне: на компьютере установка на экран не про нас
  if (isPhone()) $$('.install-link[data-install]').forEach((el) => { el.hidden = false; });

  const hideBanner = () => {
    banner.hidden = true;
    document.body.classList.remove('has-install-banner');
    store.set(DISMISSED_KEY, '1');
  };

  // Android/Chrome: запоминаем системное окно установки
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    nativeBtn.hidden = false;
    $$('#install-steps').forEach((el) => { el.hidden = true; });
  });
  window.addEventListener('appinstalled', () => {
    hideBanner();
    modal?.close();
    $$('[data-install]').forEach((el) => { el.hidden = true; });
  });

  const open = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(() => { deferredPrompt = null; });
      return;
    }
    modal?.open();
  };
  on(document, 'click', '[data-install]', (e) => { e.preventDefault(); open(); });
  on(nativeBtn, 'click', open);
  on(banner.querySelector('.install-banner__close'), 'click', hideBanner);

  // Плашка — со второго визита, один раз, только на телефоне; не сразу,
  // а когда человек уже огляделся
  if (isPhone() && visits >= BANNER_FROM_VISIT && !store.get(DISMISSED_KEY)) {
    setTimeout(() => {
      if (document.body.classList.contains('modal-open')) return;
      banner.hidden = false;
      document.body.classList.add('has-install-banner');
      store.set(DISMISSED_KEY, '1'); // показали — больше не навязываем
    }, 6000);
  }
}
