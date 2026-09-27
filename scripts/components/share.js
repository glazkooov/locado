// components/share.js — «Поделиться» для страницы места и подборки. На
// телефоне — системное меню (сразу все мессенджеры человека), на компьютере
// и без поддержки — наше окно #share-modal (разметка в place.html,
// collection.html).

import { $, on } from '../core/dom.js';
import { createModal } from './modal.js';
import { showToast } from './toast.js';

/** triggers — кнопки, открывающие «Поделиться»; getData() → { title, text }. */
export function initShare(triggers, getData) {
  const shareModal = createModal($('#share-modal'));
  const canShareNatively = 'share' in navigator && window.matchMedia('(pointer: coarse)').matches;
  const url = () => window.location.href;

  const share = () => {
    const { title, text } = getData();
    if (!canShareNatively) { shareModal?.open(); return; }
    navigator.share({ title, text: text || '', url: url() })
      .catch((err) => { if (err?.name !== 'AbortError') shareModal?.open(); });
  };
  triggers.filter(Boolean).forEach((btn) => on(btn, 'click', share));

  const title = () => getData().title;
  on($('#share-close'), 'click', () => shareModal?.close());
  on($('.share-vk'), 'click', () => window.open(`https://vk.com/share.php?url=${encodeURIComponent(url())}&title=${encodeURIComponent(title())}`, '_blank'));
  on($('.share-telegram'), 'click', () => window.open(`https://t.me/share/url?url=${encodeURIComponent(url())}&text=${encodeURIComponent(title())}`, '_blank'));
  on($('.share-whatsapp'), 'click', () => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`${title()} ${url()}`)}`, '_blank'));
  on($('.share-copy'), 'click', () => {
    navigator.clipboard.writeText(url())
      .then(() => { showToast('Ссылка скопирована'); shareModal?.close(); })
      .catch(() => showToast('Не удалось скопировать ссылку', true));
  });
}
