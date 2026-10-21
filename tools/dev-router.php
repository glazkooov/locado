<?php
// tools/dev-router.php — правила .htaccess для встроенного сервера PHP
// (на Beget их выполняет Apache). Нужен tools/check.mjs и для ручного
// запуска:  php -S 127.0.0.1:8766 tools/dev-router.php  (из корня проекта)
$root = dirname(__DIR__);
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$q = isset($_SERVER['QUERY_STRING']) ? $_SERVER['QUERY_STRING'] : '';

// Старые ?slug=… — переадресация на /place/slug, /collection/slug
if (preg_match('~^/(place|collection)/(?:index\.(?:html|php))?$~', $uri, $m)
    && preg_match('~(?:^|&)slug=([a-z0-9-]+)(?:&|$)~i', $q, $s)) {
  header('Location: /' . $m[1] . '/' . $s[1], true, 301);
  exit;
}
// /place/slug и /collection/slug — index.php папки
if (preg_match('~^/(place|collection)/([a-z0-9-]+)/?$~', $uri, $m)) {
  $_GET['slug'] = $m[2];
  chdir($root . '/' . $m[1]);
  require $root . '/' . $m[1] . '/index.php';
  exit;
}
if (preg_match('~^/(place|collection)/$~', $uri, $m)) {
  chdir($root . '/' . $m[1]);
  require $root . '/' . $m[1] . '/index.php';
  exit;
}
return false;
