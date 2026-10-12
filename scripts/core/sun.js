// core/sun.js — восход и закат в Москве без внешних сервисов: формула
// NOAA, точность — пара минут, для «закат в 17:52» хватает.

const RAD = Math.PI / 180;
const MOSCOW = { lat: 55.7558, lng: 37.6173 };

/** { sunrise, sunset } — Date на календарный день date. */
export function sunTimes(date = new Date(), { lat, lng } = MOSCOW) {
  const y = date.getFullYear();
  const dayStart = Date.UTC(y, date.getMonth(), date.getDate());
  const dayOfYear = Math.round((dayStart - Date.UTC(y, 0, 0)) / 864e5);
  const g = (2 * Math.PI / 365) * (dayOfYear - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosHa = Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
  const ha = Math.acos(Math.max(-1, Math.min(1, cosHa))) / RAD;
  const at = (minutesUtc) => new Date(dayStart + minutesUtc * 6e4);
  return {
    sunrise: at(720 - 4 * (lng + ha) - eqTime),
    sunset: at(720 - 4 * (lng - ha) - eqTime)
  };
}

/** «17:52» по московскому времени. */
export const moscowTime = (date) =>
  date.toLocaleTimeString('ru-RU', { hour: 'numeric', minute: '2-digit', timeZone: 'Europe/Moscow' });
