// tools/telegram.mjs — посты в Telegram-канал Локадо через Bot API, без
// зависимостей. Правила канала — docs/telegram.md, как писать — скилл
// .claude/skills/locado-telegram. Токен бота — только из переменной
// окружения TELEGRAM_BOT_TOKEN, в файлы и вывод он не попадает.
//
//   node tools/telegram.mjs setup [@канал]   найти личку владельца и канал
//   node tools/telegram.mjs pick <рубрика>    кандидаты, которых давно не было
//   node tools/telegram.mjs preview <post.json>   подпись, как она уйдёт
//   node tools/telegram.mjs draft <post.json>     черновик владельцу в личку
//   node tools/telegram.mjs publish <id> [текст.txt]  опубликовать черновик в канал;
//                                     с файлом — с итоговым текстом владельца
//   node tools/telegram.mjs inbox                 что владелец писал боту (за сутки)
//   node tools/telegram.mjs send <файл.html> owner|channel [--pin]
//                                     своё сообщение: приветствие, навигация
//   node tools/telegram.mjs edit <id> <файл.html> поправить сообщение в канале
//   node tools/telegram.mjs avatar <файл.png>     аватарка канала
//   node tools/telegram.mjs about <файл.txt>      описание канала (до 255 знаков)
//
// post.json: { "rubric": "place", "place": "kolomenskoe", "text": "…" }
// (или "collection": "<slug>" вместо "place"; у «Куда на выходные» —
// "places": [три slug]). Фото, подпись автора и
// ссылку с метками и хэштеги скрипт добавляет сам. Нет фото с подписью — пост уходит
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

/** Рубрики: метка utm_campaign → название, хэштег и что в ней бывает.
 *  Хэштеги — те же, что в навигационном посте (docs/telegram/nav.html). */
const RUBRICS = {
  place: { label: 'Место недели', tag: '#место_недели', kind: 'place' },
  weekend: { label: 'Куда в выходные', tag: '#на_выходные', kind: 'place' },
  route: { label: 'Маршрут', tag: '#маршруты', kind: 'collection' },
  now: { label: 'Сейчас', tag: '#сезон', kind: 'place' },
  occasion: { label: 'Под повод', tag: '#под_повод', kind: 'collection' },
  fact: { label: 'Интересное', tag: '#интересное', kind: 'place' }
};

/** Хэштег категории места — по CATEGORIES из scripts/core/places.js. */
const CATEGORY_TAGS = {
  food: '#еда', nature: '#природа', art: '#искусство',
  photo: '#фотолокации', entertainment: '#развлечения', shops: '#магазины'
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

/** Без фото — сообщение с превью ссылки, одно фото — фото с подписью,
 *  несколько — альбом с подписью под первым. Возвращает первое сообщение. */
async function sendPost(chatId, post) {
  if (!post.photos.length) return api('sendMessage', { chat_id: chatId, text: post.caption, parse_mode: 'HTML' });
  const form = new FormData();
  form.append('chat_id', String(chatId));
  post.photos.forEach((file, i) => form.append(`p${i}`, new Blob([readFileSync(file)]), file.split('/').pop()));
  if (post.photos.length === 1) {
    form.append('photo', 'attach://p0');
    form.append('caption', post.caption);
    form.append('parse_mode', 'HTML');
    return api('sendPhoto', form);
  }
  form.append('media', JSON.stringify(post.photos.map((_, i) => ({
    type: 'photo', media: `attach://p${i}`, ...(i === 0 && { caption: post.caption, parse_mode: 'HTML' })
  }))));
  return (await api('sendMediaGroup', form))[0];
}

// ——— Пост ———

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Длина подписи так, как её считает Telegram: без тегов и сущностей. */
const visibleLength = (html) => html.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot);/g, '_').length;

function photoCreditHtml(credit) {
  const author = escapeHtml(credit.author + (credit.license ? `, ${credit.license}` : ''));
  return credit.source ? `Фото: <a href="${credit.source}">${author}</a>` : `Фото: ${author}`;
}

/** Темы поста: одно место или подборка, у «Куда на выходные» — три места. */
function postTopics(input, rubric) {
  if (input.places) {
    if (input.rubric !== 'weekend') fail('Несколько мест — только в «Куда на выходные».');
    if (input.places.length < 2 || input.places.length > 3) fail('В «Куда на выходные» — два-три места.');
    return input.places.map((slug) => ({ kind: 'place', slug }));
  }
  const kind = input.place ? 'place' : input.collection ? 'collection' : null;
  if (!kind) fail('В посте нужен "place", "collection" или "places" — slug темы.');
  if (kind !== rubric.kind) fail(`Рубрика «${rubric.label}» — про ${rubric.kind === 'place' ? 'место' : 'подборку'}.`);
  return [{ kind, slug: input[kind] }];
}

/** Собирает пост из post.json: проверяет, что темы есть на сайте, берёт их
 *  подписанные фото, добавляет ссылки с метками, подписи авторов и хэштеги. */
function buildPost(input) {
  const rubric = RUBRICS[input.rubric];
  if (!rubric) fail(`Неизвестная рубрика «${input.rubric}». Есть: ${Object.keys(RUBRICS).join(', ')}.`);
  if (!input.text?.trim()) fail('Пустой текст поста.');

  const topics = postTopics(input, rubric).map(({ kind, slug }) => {
    const item = kind === 'place'
      ? places.find((p) => p.slug === slug)
      : collections.find((c) => c.slug === slug);
    if (!item) fail(`Нет ${kind === 'place' ? 'места' : 'подборки'} «${slug}».`);
    // Фото без подписи автора не публикуем (docs/photos.md) — тогда тема без фото
    const file = kind === 'place' ? item.photo : item.cover;
    const photo = file && existsSync(file) && item.photoCredit?.author ? file : null;
    const url = `${SITE}${kind}/${slug}?utm_source=telegram&utm_campaign=${input.rubric}`;
    return { kind, slug, item, photo, url };
  });

  const link = (t, label) => `<a href="${escapeHtml(t.url)}">${escapeHtml(label)}</a>`;
  const links = topics.length === 1
    ? link(topics[0], 'Подробнее на Локадо')
    : `На Локадо: ${topics.map((t) => link(t, t.item.name)).join(' · ')}`;
  const withPhoto = topics.filter((t) => t.photo);
  const categoryTags = topics.filter((t) => t.kind === 'place').map((t) => CATEGORY_TAGS[t.item.category]);

  const caption = [
    escapeHtml(input.text.trim()),
    links,
    withPhoto.map((t) => photoCreditHtml(t.item.photoCredit)).join('\n'),
    [...new Set([rubric.tag, ...categoryTags])].filter(Boolean).join(' ')
  ].filter(Boolean).join('\n\n');

  const limit = withPhoto.length ? CAPTION_LIMIT : TEXT_LIMIT;
  const length = visibleLength(caption);
  if (length > limit) fail(`Текст длиннее ${limit} знаков (${length}) — сократи.`);

  return {
    rubric: input.rubric, topics, text: input.text.trim(),
    photos: withPhoto.map((t) => t.photo), caption, length, limit
  };
}

/** Что записать в журнал о темах поста: place, collection или places. */
function topicFields(post) {
  if (post.rubric === 'weekend' && post.topics.length > 1) return { places: post.topics.map((t) => t.slug) };
  return { [post.topics[0].kind]: post.topics[0].slug };
}

/** Когда тему брали последний раз (черновик тоже считается). */
function lastUsed(log, kind, slug) {
  const dates = log.filter((e) => e[kind] === slug || (kind === 'place' && e.places?.includes(slug)))
    .map((e) => e.publishedAt || e.draftedAt);
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
  console.log(`${post.caption}\n\n— ${post.length} из ${post.limit} знаков, ${post.photos.length ? `фото: ${post.photos.join(', ')}` : 'без фото'}`);
}

async function draft(path, force) {
  const config = readJson(CONFIG, {});
  if (!config.ownerChatId) fail('Нет лички владельца: node tools/telegram.mjs setup');
  const post = readPost(path);
  const log = readJson(LOG, []);

  for (const { kind, slug } of post.topics) {
    const last = lastUsed(log, kind, slug);
    if (!force && weeksSince(last) < REPEAT_WEEKS[kind]) {
      fail(`«${slug}» уже было ${last.slice(0, 10)} — повторять не раньше чем через ${REPEAT_WEEKS[kind]} недель.`);
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  const id = `${date}-${post.rubric === 'weekend' && post.topics.length > 1 ? 'weekend' : post.topics[0].slug}`;
  const sent = await sendPost(config.ownerChatId, post);
  await api('sendMessage', {
    chat_id: config.ownerChatId,
    reply_to_message_id: sent.message_id,
    text: `Черновик · ${RUBRICS[post.rubric].label} · ${id}${post.photos.length ? '' : ' · без фото'}`
  });

  log.push({
    id, rubric: post.rubric, ...topicFields(post), text: post.text,
    status: 'draft', draftedAt: new Date().toISOString()
  });
  writeJson(LOG, log);
  console.log(`Черновик ${id} отправлен владельцу.`);
}

async function publish(id, textFile) {
  const config = readJson(CONFIG, {});
  if (!config.channel) fail('Нет канала: node tools/telegram.mjs setup @канал');
  const log = readJson(LOG, []);
  const entry = log.find((e) => e.id === id);
  if (!entry) fail(`В журнале нет черновика «${id}».`);
  if (entry.status === 'published') fail(`«${id}» уже опубликован.`);
  if (textFile) entry.text = readFile(textFile).trim();

  const post = buildPost(entry);
  const sent = await sendPost(config.channel, post);
  Object.assign(entry, { status: 'published', publishedAt: new Date().toISOString(), messageId: sent.message_id });
  writeJson(LOG, log);
  console.log(`Опубликовано: ${id}, сообщение ${sent.message_id}.`);
}

function readFile(file) {
  const path = file && resolve(startDir, file);
  if (!path || !existsSync(path)) fail(`Нет файла «${file}».`);
  return readFileSync(path, 'utf8');
}

/** Текст, который владелец прислал боту: итоговая версия поста или правка.
 *  Telegram хранит такие сообщения для бота только сутки. */
async function inbox() {
  const config = readJson(CONFIG, {});
  const updates = await api('getUpdates', { allowed_updates: ['message'] });
  const messages = updates.map((u) => u.message).filter((m) => m?.chat.id === config.ownerChatId && m.text && !m.text.startsWith('/'));
  if (!messages.length) console.log('За последние сутки владелец боту ничего не писал.');
  for (const m of messages) {
    const replyTo = m.reply_to_message?.text || m.reply_to_message?.caption;
    console.log(`— ${new Date(m.date * 1000).toISOString().slice(0, 16)}${replyTo ? ` (ответ на «${replyTo.slice(0, 40)}…»)` : ''}\n${m.text}\n`);
  }
}

/** Своё сообщение (HTML-разметка Telegram): владельцу на проверку или в канал. */
async function send(file, to, pin) {
  const config = readJson(CONFIG, {});
  const chatId = { owner: config.ownerChatId, channel: config.channel }[to];
  if (!chatId) fail('Кому: owner или channel (и setup должен знать оба).');
  const sent = await api('sendMessage', { chat_id: chatId, text: readFile(file).trim(), parse_mode: 'HTML' });
  if (pin) await api('pinChatMessage', { chat_id: chatId, message_id: sent.message_id, disable_notification: true });
  console.log(`Отправлено (${to}), сообщение ${sent.message_id}${pin ? ', закреплено' : ''}.`);
}

/** Поправить уже опубликованное сообщение канала (например, закреп). */
async function edit(messageId, file) {
  const { channel } = readJson(CONFIG, {});
  await api('editMessageText', {
    chat_id: channel, message_id: Number(messageId), text: readFile(file).trim(), parse_mode: 'HTML'
  });
  console.log(`Сообщение ${messageId} в канале обновлено.`);
}

async function avatar(file) {
  const { channel } = readJson(CONFIG, {});
  const form = new FormData();
  form.append('chat_id', String(channel));
  form.append('photo', new Blob([readFileSync(resolve(startDir, file))]), 'avatar.png');
  await api('setChatPhoto', form);
  console.log('Аватарка канала обновлена.');
}

async function about(file) {
  const { channel } = readJson(CONFIG, {});
  const description = readFile(file).trim();
  if (description.length > 255) fail(`Описание длиннее 255 знаков (${description.length}).`);
  await api('setChatDescription', { chat_id: channel, description });
  console.log('Описание канала обновлено.');
}

const [command, arg, ...rest] = process.argv.slice(2);
const commands = {
  setup: () => setup(arg),
  pick: () => pick(arg),
  preview: () => preview(arg),
  draft: () => draft(arg, rest.includes('--force')),
  publish: () => publish(arg, rest[0]),
  inbox: () => inbox(),
  send: () => send(arg, rest[0], rest.includes('--pin')),
  edit: () => edit(arg, rest[0]),
  avatar: () => avatar(arg),
  about: () => about(arg)
};
if (!commands[command]) fail('Команды: setup, pick, preview, draft, publish, inbox, send, edit, avatar, about — см. начало tools/telegram.mjs.');
await commands[command]();
