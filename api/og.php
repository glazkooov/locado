<?php
// api/og.php — заголовок, описание и фото конкретного места или подборки
// прямо в HTML страницы. Telegram, ВКонтакте и WhatsApp строят превью
// ссылки по исходному HTML и скрипты не запускают: без этого любая ссылка
// на место выглядела как «Место в Москве — Локадо» с общей картинкой.
//
// Подключают place/index.php и collection/index.php. Шаблон — index.html
// той же папки: страницу по-прежнему рисует скрипт, сервер меняет только
// мета-теги в <head>. Без нового синтаксиса PHP 7+: на хостинге может
// стоять старая версия PHP.

// Версию PHP наружу не показываем (то же в .htaccess — на случай, если
// PHP на хостинге работает так, что Apache этот заголовок не видит)
header_remove('X-Powered-By');

// Главный адрес сайта для canonical: у копии на test.locado.ru он тоже
// указывает сюда — поисковик считает основной именно эту страницу
define('OG_CANONICAL_SITE', 'https://locado.ru/');

function og_esc($s) {
  return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

/** Место или подборка по slug из data/*.json; null — нет такого или файл не читается. */
function og_find($jsonFile, $slug) {
  if ($slug === '' || !is_file($jsonFile)) return null;
  $data = json_decode(file_get_contents($jsonFile), true);
  if (!is_array($data)) return null;
  foreach ($data as $item) {
    if (is_array($item) && isset($item['slug']) && $item['slug'] === $slug) return $item;
  }
  return null;
}

/** Адрес сайта из запроса: тот же код работает и на test.locado.ru. */
function og_site() {
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
  $host = isset($_SERVER['HTTP_HOST']) ? preg_replace('/[^a-z0-9.\-:]/i', '', $_SERVER['HTTP_HOST']) : '';
  if ($host === '') $host = 'locado.ru';
  return ($https ? 'https' : 'http') . '://' . $host . '/';
}

/** Меняет content у <meta {attr}="{name}">; нет такого тега — добавляет перед </head>. */
function og_set_meta($html, $attr, $name, $value) {
  $tag = '<meta ' . $attr . '="' . $name . '" content="' . og_esc($value) . '">';
  $re = '~<meta ' . $attr . '="' . preg_quote($name, '~') . '" content="[^"]*">~';
  $count = 0;
  $html = preg_replace_callback($re, function () use ($tag) { return $tag; }, $html, 1, $count);
  if (!$count) $html = str_replace('</head>', '  ' . $tag . "\n</head>", $html);
  return $html;
}

/** Отдаёт шаблон с мета-тегами $meta = [title, description, image (фото,
 *  путь от корня сайта), card (параметр api/og-image.php: place=… или
 *  collection=…), kind, url, preload]. $meta === null — шаблон как есть
 *  (общее превью). preload — [путь => 'high'|'low']: картинки, которые
 *  браузеру стоит начать грузить сразу, не дожидаясь скриптов. */
function og_render($template, $meta) {
  $html = is_file($template) ? file_get_contents($template) : '';
  header('Content-Type: text/html; charset=utf-8');
  if ($meta) {
    $site = og_site();
    $title = $meta['title'];
    $desc = isset($meta['description']) ? $meta['description'] : '';
    $html = preg_replace_callback('~<title>.*?</title>~s',
      function () use ($title) { return '<title>' . og_esc($title) . ' — Локадо</title>'; }, $html, 1);
    if ($desc !== '') {
      $html = og_set_meta($html, 'name', 'description', $desc);
      $html = og_set_meta($html, 'property', 'og:description', $desc);
    }
    $html = og_set_meta($html, 'property', 'og:title', $title);
    if (!empty($meta['url'])) {
      $html = og_set_meta($html, 'property', 'og:url', $site . $meta['url']);
      $html = str_replace('</head>', '  <link rel="canonical" href="' . og_esc(OG_CANONICAL_SITE . $meta['url']) . "\">\n</head>", $html);
    }

    if (!empty($meta['preload'])) {
      $links = '';
      foreach ($meta['preload'] as $href => $priority) {
        if (strpos($href, '..') !== false || !is_file(dirname(__DIR__) . '/' . $href)) continue;
        $links .= '  <link rel="preload" as="image" href="' . og_esc($href) . '" fetchpriority="' . og_esc($priority) . "\">\n";
      }
      $html = str_replace('</head>', $links . '</head>', $html);
    }

    // Картинка превью — своя для места или подборки (api/og-image.php:
    // фото, логотип, название), только если фото есть на сервере. ?v —
    // от названия и фото: поменялись — мессенджеры запросят картинку заново
    $image = isset($meta['image']) ? ltrim((string)$meta['image'], '/') : '';
    $file = $image !== '' ? dirname(__DIR__) . '/' . $image : '';
    if ($file !== '' && !empty($meta['card']) && strpos($image, '..') === false && is_file($file)) {
      $v = substr(md5($title . '|' . (isset($meta['kind']) ? $meta['kind'] : '') . '|' . $image . '|' . filemtime($file)), 0, 8);
      $url = $site . 'api/og-image.php?' . $meta['card'] . '&v=' . $v;
      $html = og_set_meta($html, 'property', 'og:image', $url);
      $html = og_set_meta($html, 'name', 'twitter:image', $url);
      $html = og_set_meta($html, 'property', 'og:image:alt', $title);
      $html = og_set_meta($html, 'property', 'og:image:width', '1200');
      $html = og_set_meta($html, 'property', 'og:image:height', '630');
    }
  }
  echo $html;
}
