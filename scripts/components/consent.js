// components/consent.js — плашка про cookie и статистику.
// Плашка только уведомляет: продолжая пользоваться сайтом, человек
// соглашается на cookie. Кнопка «Хорошо» лишь закрывает плашку.
// Метрика запускается сразу — кроме тех, кто отключил статистику
// кнопкой в политике (или нажал «Не надо» в прежней версии плашки).

const KEY = 'locado:cookie-consent'; // 'accepted' | 'declined'
const listeners = [];

const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const save = (value) => { try { localStorage.setItem(KEY, value); } catch { /* приватный режим */ } };

export const consentDecided = () => read() !== null;

/** Запустить fn, если человек не отключал статистику. */
export function onAnalyticsConsent(fn) {
  if (read() !== 'declined') fn();
  else listeners.push(fn);
}

function bannerHtml() {
  return `
  <div class="consent-banner" id="consent-banner" role="region" aria-label="Cookie">
    <p class="consent-banner__text">Мы используем cookie для статистики в соответствии с <a href="privacy/">политикой конфиденциальности</a>.</p>
    <div class="consent-banner__actions">
      <button type="button" class="consent-banner__btn" data-consent="accepted">Хорошо</button>
    </div>
  </div>`;
}

function showBanner() {
  if (document.getElementById('consent-banner')) return;
  document.body.insertAdjacentHTML('beforeend', bannerHtml());
  const banner = document.getElementById('consent-banner');
  document.body.classList.add('has-consent-banner');
  banner.querySelector('[data-consent]').addEventListener('click', () => {
    save('accepted');
    banner.remove();
    document.body.classList.remove('has-consent-banner');
    document.dispatchEvent(new CustomEvent('locado:consent', { detail: 'accepted' }));
  });
}

// Кнопка в политике: отключить статистику или включить обратно
function initToggle(btn) {
  const label = () => {
    btn.textContent = read() === 'declined' ? 'Включить статистику' : 'Отключить статистику';
  };
  label();
  btn.addEventListener('click', () => {
    if (read() === 'declined') {
      save('accepted');
      listeners.splice(0).forEach((fn) => fn());
    } else {
      // Метрика на этой странице уже загружена — перестанет считать
      // со следующей страницы
      save('declined');
    }
    label();
    const note = btn.parentElement.nextElementSibling;
    if (note?.matches('[data-consent-note]')) {
      note.hidden = false;
      note.textContent = read() === 'declined'
        ? 'Готово: со следующей страницы статистика не собирается.'
        : 'Готово: статистика снова включена.';
    }
  });
}

export function initConsent() {
  if (!consentDecided()) showBanner();
  document.querySelectorAll('[data-consent-toggle]').forEach(initToggle);
}
