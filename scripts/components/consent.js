// components/consent.js — плашка про cookie и согласие на статистику.
// Выбор хранится в localStorage; пока его нет, плашка видна на каждой
// странице. Метрику подключать через onAnalyticsConsent — она запустится
// только после «Хорошо» (сразу, если согласие уже дали раньше).

const KEY = 'locado:cookie-consent'; // 'accepted' | 'declined'
const listeners = [];

const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const save = (value) => { try { localStorage.setItem(KEY, value); } catch { /* приватный режим */ } };

export const consentDecided = () => read() !== null;

/** Запустить fn, когда пользователь разрешил статистику. */
export function onAnalyticsConsent(fn) {
  if (read() === 'accepted') fn();
  else listeners.push(fn);
}

function bannerHtml() {
  return `
  <div class="consent-banner" id="consent-banner" role="region" aria-label="Cookie">
    <p class="consent-banner__text">Cookie помогают понять, что тебе нравится. <a href="privacy/">Подробнее</a></p>
    <div class="consent-banner__actions">
      <button type="button" class="consent-banner__btn consent-banner__btn--ghost" data-consent="declined">Не надо</button>
      <button type="button" class="consent-banner__btn" data-consent="accepted">Хорошо</button>
    </div>
  </div>`;
}

function showBanner() {
  if (document.getElementById('consent-banner')) return;
  document.body.insertAdjacentHTML('beforeend', bannerHtml());
  const banner = document.getElementById('consent-banner');
  document.body.classList.add('has-consent-banner');
  banner.querySelectorAll('[data-consent]').forEach((btn) => btn.addEventListener('click', () => {
    const value = btn.dataset.consent;
    save(value);
    banner.remove();
    document.body.classList.remove('has-consent-banner');
    if (value === 'accepted') listeners.splice(0).forEach((fn) => fn());
    document.dispatchEvent(new CustomEvent('locado:consent', { detail: value }));
  }));
}

export function initConsent() {
  if (!consentDecided()) showBanner();
  // «Изменить выбор по cookie» на странице политики
  document.querySelectorAll('[data-consent-reset]').forEach((btn) => btn.addEventListener('click', () => {
    try { localStorage.removeItem(KEY); } catch { /* no-op */ }
    showBanner();
  }));
}
