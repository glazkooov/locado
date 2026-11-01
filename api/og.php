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

/** Вписывает готовый HTML внутрь элемента с id="$id" и снимает с него
 *  hidden. Элементы в шаблонах пустые или с одной строкой текста, поэтому
 *  хватает поиска до первого закрывающего тега того же имени. */
function og_fill($html, $id, $inner) {
  $re = '~(<([a-z0-9]+)\b[^>]*\bid="' . preg_quote($id, '~') . '"[^>]*>)(.*?)(</\2>)~s';
  return preg_replace_callback($re, function ($m) use ($inner) {
    $open = preg_replace('~\shidden(?=[\s>])~', '', $m[1], 1);
    return $open . $inner . $m[4];
  }, $html, 1);
}

/** Метро места списком: в данных и строка, и массив. */
function og_metro_list($place) {
  $metro = isset($place['metro']) ? $place['metro'] : array();
  return array_values(array_filter(is_array($metro) ? $metro : array($metro)));
}

/** Разметка schema.org одним <script> перед </head>. Флаги json_encode:
 *  кириллица как есть, а «<» и «>» — кодами, чтобы текст из данных не
 *  мог закрыть тег <script>. */
function og_jsonld($html, $data) {
  $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP);
  if ($json === false) return $html;
  return str_replace('</head>', '  <script type="application/ld+json">' . $json . "</script>\n</head>", $html);
}

/** Тип schema.org по типу места на сайте («Музей», «Кофейня»…). Что не
 *  узнали — достопримечательность, у еды и магазинов — общий тип. */
function og_place_schema_type($place) {
  $type = isset($place['type']) ? (string)$place['type'] : '';
  $rules = array(
    'Museum' => '~музей|галерея~iu',
    'AmusementPark' => '~парк развлечений|аквапарк~iu',
    'Park' => '~парк|сад|сквер~iu',
    'BookStore' => '~книжн~iu',
    'Bakery' => '~пекарня|кондитерская~iu',
    'BarOrPub' => '~бар|паб|рюмочная~iu',
    'CafeOrCoffeeShop' => '~кафе|кофейня|чайная|бистро|антикафе~iu',
    'Restaurant' => '~ресторан|раменная|гриль|кухня|пиццерия~iu',
    'MovieTheater' => '~кинотеатр~iu',
    'PerformingArtsTheater' => '~театр~iu',
    'Library' => '~библиотека~iu',
    'Church' => '~храм~iu',
    'Store' => '~магазин|рынок~iu'
  );
  foreach ($rules as $schema => $re) if (preg_match($re, $type)) return $schema;
  $category = isset($place['category']) ? $place['category'] : '';
  if ($category === 'food') return 'FoodEstablishment';
  if ($category === 'shops') return 'Store';
  return 'TouristAttraction';
}

/** Часы для schema.org: дни с одинаковыми часами — одной записью. У мест
 *  с сезоном (season) часы не пишем: вне сезона они были бы неправдой. */
function og_opening_hours($place) {
  if (empty($place['schedule']) || !empty($place['season'])) return array();
  $names = array('mon' => 'Monday', 'tue' => 'Tuesday', 'wed' => 'Wednesday', 'thu' => 'Thursday',
    'fri' => 'Friday', 'sat' => 'Saturday', 'sun' => 'Sunday');
  $groups = array();
  foreach ($names as $key => $day) {
    $h = isset($place['schedule'][$key]) ? $place['schedule'][$key] : null;
    if (!is_array($h) || count($h) < 2) continue;
    $k = $h[0] . '-' . $h[1];
    if (!isset($groups[$k])) $groups[$k] = array('@type' => 'OpeningHoursSpecification',
      'dayOfWeek' => array(), 'opens' => $h[0], 'closes' => $h[1]);
    $groups[$k]['dayOfWeek'][] = 'https://schema.org/' . $day;
  }
  return array_values($groups);
}

/** Разметка страницы места: само место и «хлебные крошки». Только то, что
 *  есть на странице: название, описание, фото, адрес, телефон, сайт, часы.
 *  Метро в schema.org описать нечем, его нет. */
function og_place_jsonld($place, $type, $description) {
  $url = OG_CANONICAL_SITE . 'place/' . rawurlencode($place['slug']);
  $item = array(
    '@type' => og_place_schema_type($place),
    '@id' => $url . '#place',
    'name' => $place['name'],
    'url' => $url
  );
  if ($description !== '') $item['description'] = $description;
  if (!empty($place['photo']) && strpos($place['photo'], '..') === false && is_file(dirname(__DIR__) . '/' . $place['photo'])) {
    $item['image'] = OG_CANONICAL_SITE . $place['photo'];
  }
  if (!empty($place['address'])) $item['address'] = array('@type' => 'PostalAddress',
    'streetAddress' => $place['address'], 'addressLocality' => 'Москва', 'addressCountry' => 'RU');
  if (!empty($place['coords']) && count($place['coords']) === 2) $item['geo'] = array('@type' => 'GeoCoordinates',
    'latitude' => $place['coords'][0], 'longitude' => $place['coords'][1]);
  if (!empty($place['phone'])) $item['telephone'] = $place['phone'];
  $same = array();
  if (!empty($place['website'])) $same[] = $place['website'];
  if (!empty($place['links']) && is_array($place['links'])) {
    foreach ($place['links'] as $link) if ($link) $same[] = $link;
  }
  if ($same) $item['sameAs'] = $same;
  $hours = og_opening_hours($place);
  if ($hours) $item['openingHoursSpecification'] = $hours;
  if (isset($place['price_level']) && $place['price_level'] === 'free') $item['isAccessibleForFree'] = true;

  return array('@context' => 'https://schema.org', '@graph' => array($item, array(
    '@type' => 'BreadcrumbList',
    'itemListElement' => array(
      array('@type' => 'ListItem', 'position' => 1, 'name' => 'Локадо', 'item' => OG_CANONICAL_SITE),
      array('@type' => 'ListItem', 'position' => 2, 'name' => $place['name'], 'item' => $url)
    )
  )));
}

/** Отдаёт шаблон с мета-тегами $meta = [title, description, image (фото,
 *  путь от корня сайта), card (параметр api/og-image.php: place=… или
 *  collection=…), kind, url, preload]. $meta === null — шаблон как есть
 *  (общее превью). preload — [путь => 'high'|'low']: картинки, которые
 *  браузеру стоит начать грузить сразу, не дожидаясь скриптов.
 *  Необязательные: seoTitle — <title> для поисковиков (og:title остаётся
 *  title: в превью мессенджера нужно живое название); fill — [id => HTML]:
 *  текст страницы прямо в HTML, чтобы поисковики и нейросети видели его без
 *  скриптов (скрипт потом перерисует то же самое); jsonld — разметка
 *  schema.org. */
function og_render($template, $meta) {
  $html = is_file($template) ? file_get_contents($template) : '';
  header('Content-Type: text/html; charset=utf-8');
  if ($meta) {
    $site = og_site();
    $title = $meta['title'];
    $pageTitle = !empty($meta['seoTitle']) ? $meta['seoTitle'] : $title;
    $desc = isset($meta['description']) ? $meta['description'] : '';
    $html = preg_replace_callback('~<title>.*?</title>~s',
      function () use ($pageTitle) { return '<title>' . og_esc($pageTitle) . ' — Локадо</title>'; }, $html, 1);
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

    // Текст страницы с сервера. is-prefilled — заглушка hero больше не
    // прячет название и описание, мерцает только фон до загрузки фото
    if (!empty($meta['fill'])) {
      foreach ($meta['fill'] as $id => $inner) $html = og_fill($html, $id, $inner);
      $html = preg_replace('~(class="place-hero[^"]*\bis-loading)"~', '$1 is-prefilled"', $html, 1);
    }
    if (!empty($meta['jsonld'])) $html = og_jsonld($html, $meta['jsonld']);
  }
  echo $html;
}
