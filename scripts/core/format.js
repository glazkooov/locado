// core/format.js — экранирование, безопасные URL, склонения и расписание.

export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const SAFE_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

/** Возвращает value, если это безопасная (не javascript:/data: и т.п.) ссылка,
 *  иначе — fallback. Понимает как абсолютные, так и относительные пути. */
export function safeUrl(value, fallback = '#') {
  if (!value || typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  // управляющие символы иногда используют, чтобы обмануть простой .startsWith('javascript:')
  // eslint-disable-next-line no-control-regex
  const stripped = trimmed.replace(/[\u0000-\u001F\s]/g, '').toLowerCase();
  if (stripped.startsWith('javascript:') || stripped.startsWith('vbscript:') || stripped.startsWith('data:')) {
    return fallback;
  }
  try {
    const url = new URL(trimmed, window.location.origin);
    if (!SAFE_SCHEMES.includes(url.protocol)) return fallback;
    return trimmed;
  } catch {
    // относительный путь без протокола — считаем безопасным
    return trimmed;
  }
}

/** Экранирует путь для безопасной подстановки в инлайновый background: url(...). */
export function cssUrl(path) {
  const safe = safeUrl(path, '');
  if (!safe) return 'none';
  const escaped = safe.replace(/["'()\s\\]/g, (ch) => '%' + ch.charCodeAt(0).toString(16));
  return `url("${escaped}")`;
}

/** Русское склонение: plural(5, ['место', 'места', 'мест']) */
export function pluralize(n, forms) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}
export const plural = pluralize;

// ---------- Расписание ----------
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_KEYS_ORDERED = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS_RU = {
  mon: 'Понедельник', tue: 'Вторник', wed: 'Среда', thu: 'Четверг',
  fri: 'Пятница', sat: 'Суббота', sun: 'Воскресенье'
};

const parseTime = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Определяет, открыто ли место сейчас, корректно обрабатывая ночные смены
 * (например, 18:00–02:00): если "сегодня" ещё не наступило открытие, но
 * вчерашняя смена перешла через полночь и ещё не закрылась — место открыто.
 */
/** «00:00–23:59» (или до 24:00) — в базе так записаны места без часов
 *  работы: парки, набережные, улицы. */
export const isRoundTheClock = (hours) => Boolean(hours) && hours[0] === '00:00' && (hours[1] === '23:59' || hours[1] === '24:00');

export function getOpenStatus(place, now = new Date()) {
  if (!place || !place.schedule) {
    return { isOpen: false, hoursToday: null, nextChangeAt: null };
  }
  const todayIdx = now.getDay();
  const todayKey = DAY_KEYS[todayIdx];
  // Круглосуточно: открыто без «закроется через …» (иначе в 23:59 на минуту
  // «закрывалось» и таймер считал время до полуночи)
  if (isRoundTheClock(place.schedule[todayKey])) {
    return { isOpen: true, hoursToday: place.schedule[todayKey], nextChangeAt: null, roundTheClock: true };
  }
  const yesterdayKey = DAY_KEYS[(todayIdx + 6) % 7];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const hoursToday = place.schedule[todayKey] || null;
  const hoursYesterday = place.schedule[yesterdayKey] || null;

  // 1. Вчерашняя ночная смена ещё не закончилась?
  if (hoursYesterday) {
    const open = parseTime(hoursYesterday[0]);
    const close = parseTime(hoursYesterday[1]);
    if (close < open && currentMinutes < close) {
      const closeAt = new Date(now);
      closeAt.setHours(Math.floor(close / 60), close % 60, 0, 0);
      return { isOpen: true, hoursToday: hoursYesterday, nextChangeAt: closeAt };
    }
  }

  // 2. Сегодняшняя смена
  if (hoursToday) {
    const open = parseTime(hoursToday[0]);
    const close = parseTime(hoursToday[1]);
    const overnight = close < open;
    const isOpenNow = overnight
      ? (currentMinutes >= open || currentMinutes <= close)
      : (currentMinutes >= open && currentMinutes <= close);

    if (isOpenNow) {
      const closeAt = new Date(now);
      if (overnight && currentMinutes >= open) closeAt.setDate(closeAt.getDate() + 1);
      closeAt.setHours(Math.floor(close / 60), close % 60, 0, 0);
      return { isOpen: true, hoursToday, nextChangeAt: closeAt };
    }

    // ещё не открылись сегодня
    if (currentMinutes < open) {
      const openAt = new Date(now);
      openAt.setHours(Math.floor(open / 60), open % 60, 0, 0);
      return { isOpen: false, hoursToday, nextChangeAt: openAt };
    }
  }

  // 3. Сегодня выходной (или уже закрылись) — ищем ближайшее открытие вперёд
  for (let i = 1; i <= 7; i++) {
    const key = DAY_KEYS[(todayIdx + i) % 7];
    const hours = place.schedule[key];
    if (hours) {
      const open = parseTime(hours[0]);
      const openAt = new Date(now);
      openAt.setDate(openAt.getDate() + i);
      openAt.setHours(Math.floor(open / 60), open % 60, 0, 0);
      return { isOpen: false, hoursToday: hoursToday, nextChangeAt: openAt };
    }
  }

  return { isOpen: false, hoursToday, nextChangeAt: null };
}

export function isOpenNow(place, now = new Date()) {
  return getOpenStatus(place, now).isOpen;
}

/** Человекочитаемая подпись таймера: "Закроется через 2 ч 15 мин" и т.п. */
export function describeStatusTimer(status, now = new Date()) {
  if (!status.nextChangeAt) return '';
  const diffMs = status.nextChangeAt - now;
  if (diffMs <= 0) return '';
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours} ${pluralize(hours, ['час', 'часа', 'часов'])}`);
  parts.push(`${minutes} ${pluralize(minutes, ['минута', 'минуты', 'минут'])}`);
  const verb = status.isOpen ? 'Закроется через' : 'Откроется через';
  return `${verb} ${parts.join(' ')}`;
}

export function formatHours(hours) {
  if (isRoundTheClock(hours)) return 'круглосуточно';
  return hours ? `${hours[0]}–${hours[1]}` : 'выходной';
}

/** Возвращает markup сегодняшнего расписания + сворачиваемый список на все дни.
 *  Модалка использует атрибут hidden — переключать его должен вызывающий код
 *  (core/format.js ничего не знает про DOM-события). */
export function scheduleHtml(schedule, now = new Date()) {
  if (!schedule) return '<span class="no-schedule">Расписание не указано</span>';
  const todayKey = DAY_KEYS[now.getDay()];
  const todayHours = schedule[todayKey];
  const todayLine = todayHours ? `Сегодня: ${formatHours(todayHours)}` : 'Сегодня: выходной';

  const rows = DAY_KEYS_ORDERED.map((key) => {
    const isToday = key === todayKey;
    return `<div${isToday ? ' class="is-today"' : ''}><strong>${DAY_LABELS_RU[key]}</strong> ${escapeHtml(formatHours(schedule[key]))}</div>`;
  }).join('');

  return `
    <div class="today-schedule">
      <span>${escapeHtml(todayLine)}</span>
      <button type="button" class="show-full-schedule-btn" aria-expanded="false">Все дни</button>
    </div>
    <div class="full-schedule-modal" hidden>
      <div class="full-schedule-list">${rows}</div>
    </div>
  `;
}

/** Ссылка tel: с сохранением ведущего «+» — без него номер «+7 (495) …»
 *  превращался в tel:7495…, и набор мог не сработать (роуминг, часть
 *  телефонов). */
export function telHref(phone = '') {
  const digits = phone.replace(/\D/g, '');
  return digits ? `tel:${phone.trim().startsWith('+') ? '+' : ''}${digits}` : '';
}

/** «https://www.park-gorkogo.ru/» → «park-gorkogo.ru» для подписи ссылки. */
export function displayHost(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return url;
  }
}

const hhmm = (date) => `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

/** Короткий статус для плашек: «Открыто до 23:00» / «Откроется в 10:00» /
 *  «Сейчас закрыто». null — если расписания нет. */
export function openStatusLabel(place, now = new Date()) {
  if (!place?.schedule) return null;
  const status = getOpenStatus(place, now);
  if (status.roundTheClock) return { isOpen: true, text: 'Открыто круглосуточно' };
  if (status.isOpen && status.hoursToday) return { isOpen: true, text: `Открыто до ${status.hoursToday[1]}` };
  const opensToday = status.nextChangeAt && status.nextChangeAt.toDateString() === now.toDateString();
  return { isOpen: false, text: opensToday ? `Откроется в ${hhmm(status.nextChangeAt)}` : 'Сейчас закрыто' };
}
