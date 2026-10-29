<?php
// place/index.php — страница места с названием, описанием и фото в
// мета-тегах: превью ссылки в мессенджерах показывает само место
// (подробнее — api/og.php). Сама страница — index.html рядом.
require dirname(__DIR__) . '/api/og.php';

$slug = isset($_GET['slug']) ? (string)$_GET['slug'] : '';
$place = og_find(dirname(__DIR__) . '/data/places.json', $slug);

// Такого места нет — страница сама покажет «Такого места у нас нет»;
// поисковикам отвечаем 404
if ($slug !== '' && !$place && is_file(dirname(__DIR__) . '/data/places.json')) http_response_code(404);

// Фото первого экрана браузер начинает грузить сразу, вместе со стилями:
// иначе оно ждёт скриптов и данных о месте — на мобильном интернете это
// секунды тёмной заглушки. Маленькая копия (sm/) — первой, она появляется
// почти сразу; большое фото подменит её, когда загрузится
$preload = array();
if ($place && !empty($place['photo']) && preg_match('~^assets/images/places/([^/]+)$~', $place['photo'], $m)) {
  $preload['assets/images/places/sm/' . $m[1]] = 'high';
  $preload[$place['photo']] = 'low';
}

// Текст страницы — прямо в HTML (og_fill): поисковики и нейросети видят
// его без скриптов. place.js потом рисует то же самое поверх
$fill = array();
$jsonld = null;
if ($place) {
  $categories = array('food' => 'Еда', 'nature' => 'Природа', 'art' => 'Искусство',
    'photo' => 'Фотолокации', 'entertainment' => 'Развлечения', 'shops' => 'Магазины');
  $category = isset($place['category']) && isset($categories[$place['category']]) ? $categories[$place['category']] : '';
  $type = !empty($place['type']) ? $place['type'] : $category;
  $short = !empty($place['subtitle']) ? $place['subtitle'] : (isset($place['description']) ? $place['description'] : '');
  $long = !empty($place['description_long']) ? $place['description_long'] : (isset($place['description']) ? $place['description'] : '');
  $metro = og_metro_list($place);

  $fill['place-category'] = og_esc($type);
  $fill['place-name'] = og_esc($place['name']);
  $fill['place-subtitle'] = og_esc($short);
  if (!empty($place['address'])) $fill['place-address'] = og_esc($place['address']);
  if ($metro) $fill['place-metro'] = og_esc('м. ' . implode(', м. ', $metro));
  if (!empty($place['price'])) $fill['place-price'] = og_esc($place['price']);
  // Пустая строка в тексте (\n\n) — новый абзац, как в place.js
  $paragraphs = array_filter(array_map('trim', preg_split('/\n\s*\n/u', $long)), 'strlen');
  if ($paragraphs) $fill['place-description'] = '<p>' . implode('</p><p>', array_map('og_esc', $paragraphs)) . '</p>';

  $jsonld = og_place_jsonld($place, $type, implode(' ', $paragraphs));
}

og_render(__DIR__ . '/index.html', $place ? array(
  'title' => $place['name'],
  'description' => isset($place['description']) ? $place['description'] : '',
  'image' => isset($place['photo']) ? $place['photo'] : '',
  'card' => 'place=' . rawurlencode($place['slug']),
  'kind' => isset($place['type']) ? $place['type'] : '',
  'url' => 'place/' . rawurlencode($place['slug']),
  'preload' => $preload,
  'fill' => $fill,
  'jsonld' => $jsonld
) : null);
