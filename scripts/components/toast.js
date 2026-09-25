// components/toast.js — единственный тост на страницу, создаётся лениво.

let toastEl = null;
let hideTimer = null;

function ensureToast() {
  if (toastEl && toastEl.isConnected) return toastEl;
  toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastEl);
  return toastEl;
}

export function showToast(message, isError = false) {
  const el = ensureToast();
  el.textContent = message;
  el.classList.toggle('toast--error', isError);

  clearTimeout(hideTimer);
  // requestAnimationFrame — чтобы CSS-переход сработал, даже если тост уже был показан
  requestAnimationFrame(() => el.classList.add('show'));
  hideTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
