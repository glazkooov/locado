<?php
// collection/index.php — страница подборки с её названием, вступлением и
// обложкой в мета-тегах: превью ссылки в мессенджерах показывает саму
// подборку (подробнее — api/og.php). Сама страница — index.html рядом.
require dirname(__DIR__) . '/api/og.php';

$slug = isset($_GET['slug']) ? (string)$_GET['slug'] : '';
$c = og_find(dirname(__DIR__) . '/data/collections.json', $slug);

if ($slug !== '' && !$c && is_file(dirname(__DIR__) . '/data/collections.json')) http_response_code(404);

// Описание для поисковиков и превью: своё (seoDescription), иначе тизер
// или вступление
$desc = '';
if ($c) {
  if (!empty($c['seoDescription'])) $desc = $c['seoDescription'];
  else $desc = !empty($c['teaser']) ? $c['teaser'] : (isset($c['lead']) ? $c['lead'] : '');
}

/** Иконка из спрайта — как icon() в scripts/core/icons.js. */
function col_icon($name) {
  return '<svg class="icon" aria-hidden="true" focusable="false"><use href="assets/icons.svg#' . og_esc($name) . '"></use></svg>';
}

function col_paragraphs($list) {
  $html = '';
  foreach ((array)$list as $t) $html .= '<p>' . og_esc($t) . '</p>';
  return $html;
}

/** Статья подборки той же разметкой, что рисует pages/collection.js
 *  (textBlock, walkBlock, placeBlock), без часов работы и подписи к фото:
 *  их скрипт допишет. Возвращает [HTML, места по порядку]. */
function col_body($c, $places) {
  $bySlug = array();
  foreach ($places as $p) if (is_array($p) && isset($p['slug'])) $bySlug[$p['slug']] = $p;
  $categories = array('food' => 'Еда', 'nature' => 'Природа', 'art' => 'Искусство',
    'photo' => 'Фотолокации', 'entertainment' => 'Развлечения', 'shops' => 'Магазины');
  $html = '';
  $ordered = array();
  foreach (isset($c['blocks']) ? $c['blocks'] : array() as $b) {
    $type = isset($b['type']) ? $b['type'] : '';
    if ($type === 'text') {
      $html .= '<section class="c-text">'
        . (!empty($b['title']) ? '<h2 class="c-text__title">' . og_esc($b['title']) . '</h2>' : '')
        . col_paragraphs(isset($b['paragraphs']) ? $b['paragraphs'] : array()) . '</section>';
    } elseif ($type === 'walk') {
      $html .= '<p class="c-walk">' . col_icon('route') . ' ' . og_esc(isset($b['text']) ? $b['text'] : '') . '</p>';
    } elseif ($type === 'place' && isset($b['slug']) && isset($bySlug[$b['slug']])) {
      $p = $bySlug[$b['slug']];
      $ordered[] = $p;
      $num = count($ordered);
      $url = 'place/' . rawurlencode($p['slug']);
      $kind = !empty($p['type']) ? $p['type'] : (isset($categories[$p['category']]) ? $categories[$p['category']] : '');
      $metro = og_metro_list($p);
      $facts = '';
      if ($metro) $facts .= '<li>' . col_icon('train-front') . ' м. ' . og_esc($metro[0]) . '</li>';
      if (!empty($p['price'])) $facts .= '<li>' . col_icon('ticket') . ' ' . og_esc($p['price']) . '</li>';
      $photo = '';
      if (!empty($p['photo']) && strpos($p['photo'], '..') === false && is_file(dirname(__DIR__) . '/' . $p['photo'])) {
        $photo = '<div class="c-place__media"><a class="c-place__photo" href="' . $url . '" tabindex="-1" aria-hidden="true">'
          . '<img src="' . og_esc($p['photo']) . '" alt="" loading="lazy"></a></div>';
      }
      $html .= '<section class="c-place" id="place-' . $num . '">'
        . '<div class="c-place__head"><span class="c-place__num" aria-hidden="true">' . $num . '</span><div>'
        . (!empty($b['kicker']) ? '<p class="c-place__kicker">' . og_esc($b['kicker']) . '</p>' : '')
        . '<h2 class="c-place__name"><a href="' . $url . '">' . og_esc($p['name']) . '</a></h2>'
        . '<p class="c-place__type">' . og_esc($kind) . '</p></div></div>'
        . $photo
        . '<div class="c-place__text">' . col_paragraphs(isset($b['paragraphs']) ? $b['paragraphs'] : array()) . '</div>'
        . (!empty($b['tip']) ? '<p class="c-place__tip"><strong>Совет</strong> ' . og_esc($b['tip']) . '</p>' : '')
        . '<div class="c-place__footer"><ul class="c-place__facts">' . $facts . '</ul>'
        . '<a class="c-place__more" href="' . $url . '">Подробнее о месте →</a></div>'
        . '</section>';
    }
  }
  return array($html, $ordered);
}

/** «2026-10-06» → «6 октября 2026», как в pages/collection.js. */
function col_date($iso) {
  if (!preg_match('~^(\d{4})-(\d{2})-(\d{2})~', (string)$iso, $m)) return '';
  $months = array('января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
    'августа', 'сентября', 'октября', 'ноября', 'декабря');
  return (int)$m[3] . ' ' . $months[(int)$m[2] - 1] . ' ' . $m[1];
}

$fill = array();
$jsonld = null;
if ($c) {
  $placesFile = dirname(__DIR__) . '/data/places.json';
  $places = is_file($placesFile) ? json_decode(file_get_contents($placesFile), true) : array();
  if (!is_array($places)) $places = array();
  list($body, $ordered) = col_body($c, $places);

  $types = array('route' => 'Маршрут', 'occasion' => 'Под повод');
  $metaIcons = array('duration' => 'clock', 'budget' => 'ticket', 'when' => 'calendar', 'area' => 'map-pin', 'start' => 'train-front');
  $facts = '';
  foreach (isset($c['meta']) ? $c['meta'] : array() as $k => $v) {
    if ($v) $facts .= '<li class="hero-fact">' . col_icon(isset($metaIcons[$k]) ? $metaIcons[$k] : 'tag') . ' ' . og_esc($v) . '</li>';
  }
  $author = !empty($c['author']) ? $c['author'] : 'Редакция Локадо';
  $date = col_date(isset($c['published']) ? $c['published'] : '');

  $fill['collection-type'] = og_esc(isset($types[$c['type']]) ? $types[$c['type']] : 'Подборка');
  $fill['collection-title'] = og_esc($c['title']);
  $fill['collection-lead'] = og_esc(isset($c['lead']) ? $c['lead'] : '');
  $fill['collection-meta'] = $facts;
  $fill['collection-byline'] = og_esc($author . ($date !== '' ? ' · ' . $date : ''));
  $fill['collection-body'] = $body;

  // Разметка: статья редакции, список мест по порядку и «хлебные крошки»
  $url = OG_CANONICAL_SITE . 'collection/' . rawurlencode($c['slug']);
  $items = array();
  foreach ($ordered as $i => $p) {
    $items[] = array('@type' => 'ListItem', 'position' => $i + 1, 'name' => $p['name'],
      'url' => OG_CANONICAL_SITE . 'place/' . rawurlencode($p['slug']));
  }
  $article = array(
    '@type' => 'Article',
    '@id' => $url . '#article',
    'headline' => $c['title'],
    'description' => $desc,
    'url' => $url,
    'mainEntityOfPage' => $url,
    'inLanguage' => 'ru',
    'author' => array('@type' => 'Organization', 'name' => $author, 'url' => OG_CANONICAL_SITE),
    'publisher' => array('@type' => 'Organization', 'name' => 'Локадо', 'url' => OG_CANONICAL_SITE),
    'about' => array('@type' => 'ItemList', 'name' => $c['title'], 'numberOfItems' => count($items), 'itemListElement' => $items)
  );
  if (!empty($c['published'])) $article['datePublished'] = $c['published'];
  if (!empty($c['cover']) && strpos($c['cover'], '..') === false && is_file(dirname(__DIR__) . '/' . $c['cover'])) {
    $article['image'] = OG_CANONICAL_SITE . $c['cover'];
  }
  $jsonld = array('@context' => 'https://schema.org', '@graph' => array($article, array(
    '@type' => 'BreadcrumbList',
    'itemListElement' => array(
      array('@type' => 'ListItem', 'position' => 1, 'name' => 'Локадо', 'item' => OG_CANONICAL_SITE),
      array('@type' => 'ListItem', 'position' => 2, 'name' => 'Подборки', 'item' => OG_CANONICAL_SITE . 'collections/'),
      array('@type' => 'ListItem', 'position' => 3, 'name' => $c['title'], 'item' => $url)
    )
  )));
}

og_render(__DIR__ . '/index.html', $c ? array(
  'title' => $c['title'],
  'seoTitle' => !empty($c['seoTitle']) ? $c['seoTitle'] : '',
  'description' => $desc,
  'image' => isset($c['cover']) ? $c['cover'] : '',
  'card' => 'collection=' . rawurlencode($c['slug']),
  'kind' => $c['type'],
  'url' => 'collection/' . rawurlencode($c['slug']),
  'fill' => $fill,
  'jsonld' => $jsonld
) : null);
