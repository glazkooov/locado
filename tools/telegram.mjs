// tools/telegram.mjs — посты в Telegram-канал Локадо через Bot API, без
// зависимостей. Правила канала — docs/telegram.md, как писать — скилл
// .claude/skills/locado-telegram. Токен бота — только из переменной
// окружения TELEGRAM_BOT_TOKEN, в файлы и вывод он не попадает.
//
//   node tools/telegram.mjs setup [@канал]   найти личку владельца и канал
//   node tools/telegram.mjs pick <рубрика>    кандидаты, которых давно не было
//   node tools/telegram.mjs preview <post.json>   подпись, как она уйдёт
//   node tools/telegram.mjs draft <post.json>     черновик владельцу в личку
//   node tools/telegram.mjs publish <id>          опубликовать черновик в канал
//
// post.json: { "rubric": "place", "place": "kolomenskoe", "text": "…" }
// (или "collection": "<slug>" вместо "place"). Фото, подпись автора и
// ссылку с метками скрипт добавляет сам. Нет фото с подписью — пост уходит
// текстом, Telegram покажет превью страницы сайта.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Файл поста — относительно папки, откуда запустили; остальное — от корня
const startDir = process.cwd();
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const SITE = 'https://locado.ru/';
const CONFIG = 'tools/telegram.json';
const LOG = 'data/telegram-log.json';
const CAPTION_LIMIT = 1024; // столько Telegram разрешает в подписи к фото
const TEXT_LIMIT = 4096; // а столько — в обычном сообщении

/** Рубрики: метка utm_campaign → название и что в ней бывает. */
const RUBRICS = {
  place: { label: 'Место недели', kind: 'place' },
  weekend: { label: 'Куда в выходные', kind: 'place' },
  route: { label: 'Маршрут', kind: 'collection' },
  now: { label: 'Сейчас', kind: 'place' },
  occasion: { label: 'Под повод', kind: 'collection' }
};

/** Через сколько недель можно снова взять то же место или подборку. */
const REPEAT_WEEKS = { place: 8, collection: 6 };

const places = JSON.parse(readFileSync('data/places.json', 'utf8'));
const collections = JSON.parse(readFileSync('data/collections.json', 'utf8'));

const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback);
const writeJson = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);

function fail(message) {
  console.error(message);
  process.exit(1);
}

// ——— Bot API ———

async function api(method, params = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) fail('Нет TELEGRAM_BOT_TOKEN в окружении.');
  const isForm = params instanceof FormData;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? params : JSON.stringify(params)
  });
  const data = await response.json();
  if (!data.ok) fail(`Telegram (${method}): ${data.description}`);
  return data.result;
}

/** Пост с фото — фото с подписью, без фото — сообщение с превью ссылки. */
async function sendPost(chatId, post) {
  if (!post.photo) return api('sendMessage', { chat_id: chatId, text: post.caption, parse_mode: 'HTML' });
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('photo', new Blob([readFileSync(post.photo)]), post.photo.split('/').pop());
  form.append('caption', post.caption);
  form.append('parse_mode', 'HTML');
  return api('sendPhoto', form);
}

// ——— Пост ———

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Длина подписи так, как её считает Telegram: без тегов и сущностей. */
const visibleLength = (html) => html.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot);/g, '_').length;

function photoCreditHtml(credit) {
  const author = escapeHtml(credit.author + (credit.license ? `, ${credit.license}` : ''));
  return credit.source ? `Фото: <a href="${credit.source}">${author}</a>` : `Фото: ${author}`;
}

/** Собирает пост из post.json: проверяет, что тема есть на сайте и у неё
 *  подписанное фото, добавляет ссылку с метками и подпись автора. */
function buildPost(input) {
  const rubric = RUBRICS[input.rubric];
  if (!rubric) fail(`Неизвестная рубрика «${input.rubric}». Есть: ${Object.keys(RUBRICS).join(', ')}.`);
  if (!input.text?.trim()) fail('Пустой текст поста.');

  const kind = input.place ? 'place' : input.collection ? 'collection' : null;
  if (!kind) fail('В посте нужен "place" или "collection" — slug темы.');
  if (kind !== rubric.kind) fail(`Рубрика «${rubric.label}» — про ${rubric.kind === 'place' ? 'место' : 'подборку'}.`);

  const slug = input[kind];
  const item = kind === 'place'
    ? places.find((p) => p.slug === slug)
    : collections.find((c) => c.slug === slug);
  if (!item) fail(`Нет ${kind === 'place' ? 'места' : 'подборки'} «${slug}».`);

  // Фото без подписи автора не публикуем (docs/photos.md) — тогда пост без фото
  const file = kind === 'place' ? item.photo : item.cover;
  const photo = file && existsSync(file) && item.photoCredit?.author ? file : null;

  const url = `${SITE}${kind}/${slug}?utm_source=telegram&utm_campaign=${input.rubric}`;
  const caption = [
    escapeHtml(input.text.trim()),
    `<a href="${escapeHtml(url)}">Подробнее на Локадо</a>`,
    photo && photoCreditHtml(item.photoCredit)
  ].filter(Boolean).join('\n\n');

  const limit = photo ? CAPTION_LIMIT : TEXT_LIMIT;
  const length = visibleLength(caption);
  if (length > limit) fail(`Текст длиннее ${limit} знаков (${length}) — сократи.`);

  return { rubric: input.rubric, kind, slug, text: input.text.trim(), photo, caption, length, limit };
}

/** Когда тему брали последний раз (черновик тоже считается). */
function lastUsed(log, kind, slug) {
  const dates = log.filter((e) => e[kind] === slug).map((e) => e.publishedAt || e.draftedAt);
  return dates.sort().at(-1) || null;
}

function weeksSince(date) {
  return date ? (Date.now() - new Date(date).getTime()) / (7 * 24 * 3600 * 1000) : Infinity;
}

// ——— Команды ———

async function setup(channelArg) {
  const config = readJson(CONFIG, {});
  const updates = await api('getUpdates', { allowed_updates: ['message', 'my_chat_member', 'channel_post'] });

  const start = updates.map((u) => u.message).filter((m) => m?.chat.type === 'private' && m.text?.startsWith('/start')).at(-1);
  if (start) config.ownerChatId = start.chat.id;

  const channels = updates.map((u) => u.my_chat_member).filter((m) => m?.chat.type === 'channel');
  if (channelArg) config.channel = channelArg;
  else if (channels.length) config.channel = channels.at(-1).chat.id;

  if (config.channel) {
    const me = await api('getMe');
    const chat = await api('getChat', { chat_id: config.channel });
    const member = await api('getChatMember', { chat_id: config.channel, user_id: me.id });
    if (!member.can_post_messages) fail(`Бот в «${chat.title}» без права публиковать — дай его в настройках админов.`);
    config.channel = chat.username ? `@${chat.username}` : chat.id;
    console.log(`Канал: ${chat.title} (${config.channel}), бот может публиковать.`);
  } else {
    console.log('Канал не найден: добавь бота в канал админом или передай @имя канала.');
  }
  console.log(config.ownerChatId ? 'Личка владельца найдена.' : 'Лички нет: напиши боту /start и запусти setup снова.');
  writeJson(CONFIG, config);
}

function pick(rubricName) {
  const rubric = RUBRICS[rubricName];
  if (!rubric) fail(`Рубрики: ${Object.keys(RUBRICS).join(', ')}.`);
  const log = readJson(LOG, []);

  let items;
  if (rubric.kind === 'collection') {
    const type = rubricName === 'route' ? 'route' : 'occasion';
    items = collections.filter((c) => c.type === type)
      .map((c) => ({ slug: c.slug, title: c.title, teaser: c.teaser, photo: Boolean(c.cover && c.photoCredit) }));
  } else {
    let pool = places;
    if (rubricName === 'now') {
      const season = currentSeason();
      if (!season) fail('В data/now.json нет блока на сегодня.');
      console.log(`Сейчас: «${season.title}» — ${season.lead}\n`);
      pool = season.places.map((slug) => places.find((p) => p.slug === slug)).filter(Boolean);
    }
    // Без расписания (schedule: null) — часы не известны или открыто всегда: не отсекаем
    if (rubricName === 'weekend') pool = places.filter((p) => !p.schedule || p.schedule.sat || p.schedule.sun);
    items = pool.map((p) => ({
      slug: p.slug, name: p.name, type: p.type, metro: p.metro, description: p.description,
      photo: Boolean(p.photo && p.photoCredit)
    }));
  }

  const fresh = items
    .map((item) => ({ ...item, last: lastUsed(log, rubric.kind, item.slug), order: Math.random() }))
    .filter((item) => weeksSince(item.last) >= REPEAT_WEEKS[rubric.kind])
    // Сначала то, чего ещё не было, остальное — по давности; внутри — вперемешку
    .sort((a, b) => (a.last || '').localeCompare(b.last || '') || a.order - b.order)
    .map(({ order, ...item }) => item);
  console.log(JSON.stringify(fresh.slice(0, 8), null, 2));
  if (!fresh.length) console.log('Все темы рубрики были недавно — возьми другую рубрику.');
}

/** Блок «Сейчас» на сегодня: даты в now.json — ММ-ДД, бывают через Новый год. */
function currentSeason() {
  const today = new Date().toISOString().slice(5, 10);
  return readJson('data/now.json', []).find(({ from, to }) =>
    from <= to ? today >= from && today <= to : today >= from || today <= to);
}

function readPost(file) {
  const path = file && resolve(startDir, file);
  if (!path || !existsSync(path)) fail('Укажи файл поста: node tools/telegram.mjs draft post.json');
  return buildPost(JSON.parse(readFileSync(path, 'utf8')));
}

function preview(path) {
  const post = readPost(path);
  console.log(`${post.caption}\n\n— ${post.length} из ${post.limit} знаков, ${post.photo ? `фото ${post.photo}` : 'без фото'}`);
}

async function draft(path, force) {
  const config = readJson(CONFIG, {});
  if (!config.ownerChatId) fail('Нет лички владельца: node tools/telegram.mjs setup');
  const post = readPost(path);
  const log = readJson(LOG, []);

  const last = lastUsed(log, post.kind, post.slug);
  if (!force && weeksSince(last) < REPEAT_WEEKS[post.kind]) {
    fail(`«${post.slug}» уже было ${last.slice(0, 10)} — повторять не раньше чем через ${REPEAT_WEEKS[post.kind]} недель.`);
  }

  const date = new Date().toISOString().slice(0, 10);
  const id = `${date}-${post.slug}`;
  const sent = await sendPost(config.ownerChatId, post);
  await api('sendMessage', {
    chat_id: config.ownerChatId,
    reply_to_message_id: sent.message_id,
    text: `Черновик · ${RUBRICS[post.rubric].label} · ${id}${post.photo ? '' : ' · без фото'}`
  });

  log.push({
    id, rubric: post.rubric, [post.kind]: post.slug, text: post.text,
    status: 'draft', draftedAt: new Date().toISOString()
  });
  writeJson(LOG, log);
  console.log(`Черновик ${id} отправлен владельцу.`);
}

async function publish(id) {
  const config = readJson(CONFIG, {});
  if (!config.channel) fail('Нет канала: node tools/telegram.mjs setup @канал');
  const log = readJson(LOG, []);
  const entry = log.find((e) => e.id === id);
  if (!entry) fail(`В журнале нет черновика «${id}».`);
  if (entry.status === 'published') fail(`«${id}» уже опубликован.`);

  const post = buildPost(entry);
  const sent = await sendPost(config.channel, post);
  Object.assign(entry, { status: 'published', publishedAt: new Date().toISOString(), messageId: sent.message_id });
  writeJson(LOG, log);
  console.log(`Опубликовано: ${id}, сообщение ${sent.message_id}.`);
}

const [command, arg, flag] = process.argv.slice(2);
const commands = {
  setup: () => setup(arg),
  pick: () => pick(arg),
  preview: () => preview(arg),
  draft: () => draft(arg, flag === '--force'),
  publish: () => publish(arg)
};
if (!commands[command]) fail('Команды: setup, pick, preview, draft, publish — см. начало tools/telegram.mjs.');
await commands[command]();
