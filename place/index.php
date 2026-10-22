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

og_render(__DIR__ . '/index.html', $place ? array(
  'title' => $place['name'],
  'description' => isset($place['description']) ? $place['description'] : '',
  'image' => isset($place['photo']) ? $place['photo'] : '',
  'card' => 'place=' . rawurlencode($place['slug']),
  'kind' => isset($place['type']) ? $place['type'] : '',
  'url' => 'place/' . rawurlencode($place['slug'])
) : null);
