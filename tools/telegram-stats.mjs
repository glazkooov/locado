// tools/telegram-stats.mjs — недельный разбор Telegram-канала. Берёт
// подписчиков и просмотры из открытого превью t.me/s/<канал> (бот статистику
// канала не видит), считает охват, сравнивает с прошлым снимком и печатает
// сводку. Снимки копятся в data/telegram-stats.json.
//
//   node tools/telegram-stats.mjs          сводка в консоль и снимок
//   node tools/telegram-stats.mjs --send   то же и сводка владельцу в личку
//
// Пост оцениваем через неделю: за первые сутки он набирает около половины
// просмотров (скилл social, раздел Telegram).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RUBRICS } from './telegram-rubrics.mjs';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const CONFIG = 'tools/telegram.json';
const SNAPSHOTS = 'data/telegram-stats.json';
const METRIKA = 'https://metrika.yandex.ru/dashboard?id=113169704';
const DAY = 24 * 3600 * 1000;

const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback);
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decode = (s) => s.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** «1.2K» → 1200. */
function count(text) {
  const match = /([\d.]+)\s*([KM]?)/.exec(text.replace(/\s/g, ''));
  return match ? Math.round(parseFloat(match[1]) * ({ K: 1e3, M: 1e6 }[match[2]] || 1)) : 0;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const tagToRubric = Object.fromEntries(Object.values(RUBRICS).map((r) => [r.tag, r.label]));

/** Посты со страницы превью. Служебные (создание канала, закреп) — без просмотров. */
function parsePosts(page, channel) {
  return page.split('<div class="tgme_widget_message_wrap').slice(1).map((block) => {
    const id = new RegExp(`data-post="${channel}/(\\d+)"`).exec(block);
    const views = /tgme_widget_message_views">([^<]+)</.exec(block);
    const date = /datetime="([^"]+)"/.exec(block);
    if (!id || !views || !date) return null;
    const textMatch = /tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/.exec(block);
    const text = textMatch ? decode(textMatch[1]) : '';
    const rubrics = (text.match(/#[\p{L}_]+/gu) || []).map((tag) => tagToRubric[tag]).filter(Boolean);
    return {
      id: Number(id[1]),
      date: new Date(date[1]),
      views: count(views[1]),
      title: text.split('\n')[0].trim(),
      // Навигация перечисляет все рубрики, приветствие — ни одной: это не посты
      rubric: rubrics.length >= 1 && rubrics.length <= 2 ? rubrics[0] : null
    };
  }).filter(Boolean);
}

async function fetchChannel(channel) {
  const get = async (query = '') => (await fetch(`https://t.me/s/${channel}${query}`)).text();
  const first = await get();
  const subscribers = count(/counter_value">([^<]+)<\/span> <span class="counter_type">subscribers/.exec(first)?.[1] || '0');
  const posts = parsePosts(first, channel);
  // Листаем назад, пока страницы не кончатся (каналу немного постов)
  for (let page = 0; page < 30 && posts.length; page++) {
    const older = parsePosts(await get(`?before=${Math.min(...posts.map((p) => p.id))}`), channel)
      .filter((p) => !posts.some((q) => q.id === p.id));
    if (!older.length) break;
    posts.push(...older);
  }
  return { subscribers, posts: posts.sort((a, b) => a.id - b.id) };
}

const dayMonth = (date) => date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
const percent = (views, subscribers) => (subscribers ? `${Math.round((views / subscribers) * 100)}%` : '—');
const short = (title) => escapeHtml(title.length > 60 ? `${title.slice(0, 57)}…` : title);

function buildReport({ subscribers, posts }, previous, now) {
  const content = posts.filter((p) => p.rubric);
  const age = (p) => (now - p.date) / DAY;
  const thisWeek = content.filter((p) => age(p) < 7);
  const mature = content.filter((p) => age(p) >= 7 && age(p) < 14);
  const lines = [`<b>Канал за неделю: ${dayMonth(new Date(now - 7 * DAY))} — ${dayMonth(new Date(now))}</b>`, ''];

  const growth = previous ? subscribers - previous.subscribers : null;
  lines.push(`Подписчики: ${subscribers}${growth === null ? '' : ` (${growth >= 0 ? '+' : ''}${growth} за неделю)`}`);
  lines.push(`Вышло постов: ${thisWeek.length}`);

  if (mature.length) {
    lines.push('', '<b>Итоги постов недельной давности</b>');
    const sorted = [...mature].sort((a, b) => b.views - a.views);
    for (const p of sorted) lines.push(`${p.views} · ${percent(p.views, subscribers)} · ${p.rubric} · ${short(p.title)}`);
    if (sorted.length > 2 && sorted[0].views > sorted.at(-1).views) {
      lines.push(`Лучше всех: «${short(sorted[0].title)}». Слабее всех: «${short(sorted.at(-1).title)}».`);
    }
  } else {
    lines.push('', 'Постов старше недели пока нет: итоги будут в следующем разборе.');
  }

  if (thisWeek.length) {
    lines.push('', '<b>Свежие, ещё набирают просмотры</b>');
    for (const p of thisWeek) lines.push(`${p.views} · ${p.rubric} · ${short(p.title)}`);
  }

  // Рубрики сравниваем только по постам, которые уже отлежались неделю
  const settled = content.filter((p) => age(p) >= 7);
  const byRubric = Object.entries(Object.groupBy(settled, (p) => p.rubric));
  if (byRubric.length > 1) {
    lines.push('', '<b>Рубрики за всё время</b> (медиана просмотров)');
    for (const [rubric, list] of byRubric.sort((a, b) => median(b[1].map((p) => p.views)) - median(a[1].map((p) => p.views)))) {
      lines.push(`${rubric}: ${median(list.map((p) => p.views))} (постов: ${list.length})`);
    }
  }

  if (subscribers < 300) {
    lines.push('', 'Подписчиков пока мало, проценты охвата скачут от пары человек. Смотрим на рост подписчиков и на переходы на сайт.');
  }
  lines.push('', `Переходы на сайт — в <a href="${METRIKA}">Метрике</a>: Источники → Метки UTM, utm_source = telegram; рубрика — в utm_campaign.`);
  return lines.join('\n');
}

const config = readJson(CONFIG, {});
const channel = String(config.channel || '').replace(/^@/, '');
if (!channel) {
  console.error('Нет канала в tools/telegram.json.');
  process.exit(1);
}

const now = Date.now();
const stats = await fetchChannel(channel);
if (!stats.posts.length) {
  console.error(`Превью t.me/s/${channel} не отдало ни одного поста — разбор пропущен.`);
  process.exit(1);
}

const snapshots = readJson(SNAPSHOTS, []);
const today = new Date(now).toISOString().slice(0, 10);
// Прошлый снимок — не позже чем 6 дней назад, чтобы прирост был недельным
const previous = snapshots.filter((s) => (now - new Date(s.date)) / DAY >= 6).at(-1);
const report = buildReport(stats, previous, now);
console.log(report.replace(/<[^>]+>/g, ''));

snapshots.splice(0, snapshots.length, ...snapshots.filter((s) => s.date !== today));
snapshots.push({
  date: today,
  subscribers: stats.subscribers,
  views: Object.fromEntries(stats.posts.map((p) => [p.id, p.views]))
});
writeFileSync(SNAPSHOTS, `${JSON.stringify(snapshots, null, 2)}\n`);

if (process.argv.includes('--send')) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !config.ownerChatId) {
    console.error('Нет TELEGRAM_BOT_TOKEN или лички владельца — сводка не отправлена.');
    process.exit(1);
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.ownerChatId, text: report, parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
  });
  const data = await response.json();
  if (!data.ok) {
    console.error(`Telegram: ${data.description}`);
    process.exit(1);
  }
  console.log('\nСводка отправлена владельцу.');
}
