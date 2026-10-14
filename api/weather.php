<?php
// api/weather.php — погода в Москве для блока «Сейчас» (core/weather.js).
// Раз в 30 минут сервер сам спрашивает Open-Meteo (бесплатно, без ключа)
// и кладёт ответ в weather-cache.json рядом; посетители получают кэш.
// IP посетителей никуда не уходит: к Open-Meteo ходит только наш сервер.

// Без нового синтаксиса PHP 7+: на хостинге у сайта может стоять старая
// версия PHP, и тогда файл падал бы с ошибкой 500
function pick($arr, $key, $default = null) {
  return (is_array($arr) && isset($arr[$key])) ? $arr[$key] : $default;
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=600');

$cache = __DIR__ . '/weather-cache.json';
$ttl = 30 * 60;

// Самопроверка: /api/weather.php?check — что умеет сервер и пришла ли
// погода. Без кэша, ничего не записывает; посетителям не нужна
$check = isset($_GET['check']);

if (!$check && is_file($cache) && time() - filemtime($cache) < $ttl) {
  readfile($cache);
  exit;
}

$url = 'https://api.open-meteo.com/v1/forecast?latitude=55.7558&longitude=37.6173'
  . '&current=temperature_2m,weather_code'
  . '&hourly=temperature_2m,weather_code,precipitation_probability&forecast_hours=7'
  . '&timezone=Europe%2FMoscow';
// На части хостингов file_get_contents не ходит по сети (allow_url_fopen
// выключен) — тогда пробуем через curl
$raw = ini_get('allow_url_fopen')
  ? @file_get_contents($url, false, stream_context_create(['http' => ['timeout' => 4]]))
  : false;
if (!$raw && function_exists('curl_init')) {
  $ch = curl_init($url);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 4, CURLOPT_CONNECTTIMEOUT => 3]);
  $raw = curl_exec($ch);
  curl_close($ch);
}
$data = $raw ? json_decode($raw, true) : null;

if ($check) {
  echo json_encode([
    'php' => PHP_VERSION,
    'allow_url_fopen' => (bool) ini_get('allow_url_fopen'),
    'curl' => function_exists('curl_init'),
    'cache_writable' => is_writable(__DIR__),
    'cache_age_min' => is_file($cache) ? round((time() - filemtime($cache)) / 60) : null,
    'open_meteo' => isset($data['current']) ? 'ok' : 'нет ответа',
    'now' => pick($data, 'current')
  ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
  exit;
}

if (!isset($data['current']['temperature_2m'], $data['current']['weather_code'])) {
  // Open-Meteo не ответил — отдаём старый кэш (браузер сам отбросит
  // слишком старый по полю at) или пустой ответ
  if (is_file($cache)) { readfile($cache); } else { http_response_code(503); echo '{}'; }
  exit;
}

// Прогноз на ближайшие часы — для «дождь закончится к 21:00»
$next = [];
$hourly = pick($data, 'hourly', array());
foreach (pick($hourly, 'time', array()) as $i => $time) {
  $next[] = [
    't' => substr($time, 11, 5),
    'temp' => round(pick(pick($hourly, 'temperature_2m'), $i, 0)),
    'code' => (int) pick(pick($hourly, 'weather_code'), $i, 0),
    'p' => (int) pick(pick($hourly, 'precipitation_probability'), $i, 0)
  ];
}

$out = json_encode([
  'temp' => round($data['current']['temperature_2m']),
  'code' => (int) $data['current']['weather_code'],
  'next' => $next,
  'at' => time()
]);
@file_put_contents($cache, $out, LOCK_EX);
echo $out;
