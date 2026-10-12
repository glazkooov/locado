// core/weather.js — погода в Москве для блока «Сейчас».
// Браузер ходит только на наш сервер (api/weather.php): тот раз в полчаса
// сам берёт погоду у Open-Meteo и отдаёт из кэша. Данные посетителей
// никуда не уходят. Нет ответа или он старый — блок живёт без погоды.

const URL_ = 'api/weather.php';
const MAX_AGE = 3 * 60 * 60 * 1000; // старше трёх часов — не показываем

// Коды погоды WMO → вид и подпись
const KINDS = [
  [[0, 1], 'clear', 'ясно', 'sun'],
  [[2], 'clouds', 'переменная облачность', 'cloud'],
  [[3], 'clouds', 'пасмурно', 'cloud'],
  [[45, 48], 'fog', 'туман', 'cloud-fog'],
  [[51, 53, 55, 56, 57], 'rain', 'морось', 'cloud-rain'],
  [[61, 63, 66, 80], 'rain', 'дождь', 'cloud-rain'],
  [[65, 67, 81, 82], 'rain', 'ливень', 'cloud-rain'],
  [[71, 73, 77, 85], 'snow', 'снег', 'cloud-snow'],
  [[75, 86], 'snow', 'снегопад', 'cloud-snow'],
  [[95, 96, 99], 'storm', 'гроза', 'cloud-lightning']
];

const kindOf = (code) => KINDS.find(([codes]) => codes.includes(code));
const WET = ['rain', 'storm', 'snow'];

/** { temp, kind, label, icon, heavy, next: [{ t: '21:00', kind, temp, p }] } или null. */
export async function loadWeather() {
  try {
    // Погода — приятное дополнение: ждём недолго, чтобы не держать блок
    const res = await fetch(URL_, { cache: 'no-cache', signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.temp !== 'number' || typeof data.code !== 'number') return null;
    if (data.at && Date.now() - data.at * 1000 > MAX_AGE) return null;
    const row = kindOf(data.code);
    if (!row) return null;
    const [, kind, label, iconName] = row;
    const next = (Array.isArray(data.next) ? data.next : [])
      .map((h) => ({ t: h.t, temp: h.temp, p: h.p ?? 0, kind: kindOf(h.code)?.[1] }))
      .filter((h) => h.kind && typeof h.t === 'string');
    return { temp: Math.round(data.temp), kind, label, icon: iconName, heavy: [65, 67, 75, 81, 82, 86].includes(data.code), next };
  } catch {
    return null;
  }
}

/** Погода для выбора мест: 'bad' — под крышу, 'hot' — к воде и в тень,
 *  'good' — гулять, null — неизвестно. */
export function weatherMode(w) {
  if (!w) return null;
  if (w.kind === 'rain' || w.kind === 'storm' || (w.kind === 'snow' && w.heavy) || w.temp <= -15) return 'bad';
  if (w.temp >= 27) return 'hot';
  return 'good';
}

export const tempLabel = (t) => `${t > 0 ? '+' : t < 0 ? '−' : ''}${Math.abs(t)}°`;

/** Что будет в ближайшие часы — одной фразой, или ''.
 *  Первый час прогноза — текущий, его пропускаем. */
export function forecastPhrase(w) {
  if (!w?.next?.length) return '';
  const ahead = w.next.slice(1);
  const wetNow = WET.includes(w.kind);
  const isWet = (h) => WET.includes(h.kind) && h.p >= 50;
  if (wetNow) {
    const dry = ahead.find((h) => !WET.includes(h.kind));
    const what = w.kind === 'snow' ? 'Снег' : 'Дождь';
    return dry ? `${what} стихнет примерно к ${dry.t} — потом можно гулять` : `${what}, похоже, надолго — до ночи лучше под крышу`;
  }
  const wet = ahead.find(isWet);
  if (wet) {
    const what = wet.kind === 'snow' ? 'снег' : 'дождь';
    return `К ${wet.t} обещают ${what} — успей погулять до него`;
  }
  const temps = ahead.map((h) => h.temp);
  if (temps.length && Math.min(...temps) <= w.temp - 4) return 'К вечеру заметно похолодает — возьми что-то тёплое';
  return '';
}
