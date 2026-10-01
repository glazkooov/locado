// components/share.js — «Поделиться» для страницы места и подборки. На
// телефоне — системное меню (сразу все мессенджеры человека), на компьютере
// и без поддержки — наше окно #share-modal (разметка в place.html,
// collection.html).

import { $, on } from '../core/dom.js';
import { createModal } from './modal.js';
import { showToast } from './toast.js';
import { goal } from '../core/analytics.js';

/** triggers — кнопки, открывающие «Поделиться»; getData() → { title, text }.
 *  what — что делятся, для Метрики («Место: Коломенское»). */
export function initShare(triggers, getData, { what = document.title } = {}) {
  // share_open — нажали «Поделиться»; share — выбрали, куда отправить.
  // В «Параметрах визитов»: Поделиться → что → куда
  const done = (channel) => goal('share', { 'Поделиться': { [what]: channel } });
  const shareModal = createModal($('#share-modal'));
  const canShareNatively = 'share' in navigator && window.matchMedia('(pointer: coarse)').matches;
  const url = () => window.location.href;

  const share = () => {
    goal('share_open', { 'Нажал «Поделиться»': what });
    const { title, text } = getData();
    if (!canShareNatively) { shareModal?.open(); return; }
    // Системное меню не говорит, какое приложение выбрали, — только что отправили
    navigator.share({ title, text: text || '', url: url() })
      .then(() => done('Системное меню телефона'))
      .catch((err) => { if (err?.name !== 'AbortError') shareModal?.open(); });
  };
  triggers.filter(Boolean).forEach((btn) => on(btn, 'click', share));

  const title = () => getData().title;
  on($('#share-close'), 'click', () => shareModal?.close());
  on($('.share-vk'), 'click', () => done('ВКонтакте'));
  on($('.share-telegram'), 'click', () => done('Telegram'));
  on($('.share-whatsapp'), 'click', () => done('WhatsApp'));
  on($('.share-vk'), 'click', () => window.open(`https://vk.com/share.php?url=${encodeURIComponent(url())}&title=${encodeURIComponent(title())}`, '_blank'));
  on($('.share-telegram'), 'click', () => window.open(`https://t.me/share/url?url=${encodeURIComponent(url())}&text=${encodeURIComponent(title())}`, '_blank'));
  on($('.share-whatsapp'), 'click', () => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`${title()} ${url()}`)}`, '_blank'));
  on($('.share-copy'), 'click', () => {
    navigator.clipboard.writeText(url())
      .then(() => { done('Скопировал ссылку'); showToast('Ссылка скопирована'); shareModal?.close(); })
      .catch(() => showToast('Не удалось скопировать ссылку', true));
  });
}
