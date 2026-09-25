// core/daypart.js — время суток и день недели для «живого» заголовка на
// главной («Пятница, вечер. Куда пойдём сегодня?») и порядка настроений.

const DAY_NAMES = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const DAYPART_NAMES = { morning: 'утро', day: 'день', evening: 'вечер', night: 'ночь' };

const QUESTIONS = {
  morning: { weekday: 'С чего начнём день?', weekend: 'С чего начнём выходной?' },
  day: { weekday: 'Сбежим ненадолго?', weekend: 'Куда выберемся?' },
  evening: { weekday: 'Куда пойдём вечером?', weekend: 'Куда пойдём сегодня?' },
  night: { weekday: 'Куда ещё успеем?', weekend: 'Куда ещё успеем?' }
};

/** 'morning' 5–11, 'day' 12–16, 'evening' 17–22, 'night' 23–4. */
export function getDaypart(now = new Date()) {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'day';
  if (h >= 17 && h < 23) return 'evening';
  return 'night';
}

/** Выходные — суббота, воскресенье и вечер пятницы. */
function isWeekendMood(now, daypart) {
  const d = now.getDay();
  return d === 0 || d === 6 || (d === 5 && (daypart === 'evening' || daypart === 'night'));
}

export function heroGreeting(now = new Date()) {
  const daypart = getDaypart(now);
  const kind = isWeekendMood(now, daypart) ? 'weekend' : 'weekday';
  return {
    daypart,
    when: `${DAY_NAMES[now.getDay()]}, ${DAYPART_NAMES[daypart]}`,
    question: QUESTIONS[daypart][kind]
  };
}
