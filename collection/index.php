<?php
// collection/index.php — страница подборки с её названием, вступлением и
// обложкой в мета-тегах: превью ссылки в мессенджерах показывает саму
// подборку (подробнее — api/og.php). Сама страница — index.html рядом.
require dirname(__DIR__) . '/api/og.php';

$slug = isset($_GET['slug']) ? (string)$_GET['slug'] : '';
$c = og_find(dirname(__DIR__) . '/data/collections.json', $slug);

if ($slug !== '' && !$c && is_file(dirname(__DIR__) . '/data/collections.json')) http_response_code(404);

$desc = '';
if ($c) $desc = !empty($c['teaser']) ? $c['teaser'] : (isset($c['lead']) ? $c['lead'] : '');

og_render(__DIR__ . '/index.html', $c ? array(
  'title' => $c['title'],
  'description' => $desc,
  'image' => isset($c['cover']) ? $c['cover'] : '',
  'card' => 'collection=' . rawurlencode($c['slug']),
  'kind' => $c['type'],
  'url' => 'collection/' . rawurlencode($c['slug'])
) : null);
