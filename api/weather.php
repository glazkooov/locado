<?php
// api/weather.php — погода в Москве для блока «Сейчас» (core/weather.js).
// Раз в 30 минут сервер сам спрашивает Open-Meteo (бесплатно, без ключа)
// и кладёт ответ в weather-cache.json рядом; посетители получают кэш.
// IP посетителей никуда не уходит: к Open-Meteo ходит только наш сервер.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=600');

$cache = __DIR__ . '/weather-cache.json';
$ttl = 30 * 60;

if (is_file($cache) && time() - filemtime($cache) < $ttl) {
  readfile($cache);
  exit;
}

$url = 'https://api.open-meteo.com/v1/forecast?latitude=55.7558&longitude=37.6173'
  . '&current=temperature_2m,weather_code&timezone=Europe%2FMoscow';
$raw = @file_get_contents($url, false, stream_context_create(['http' => ['timeout' => 4]]));
$data = $raw ? json_decode($raw, true) : null;

if (!isset($data['current']['temperature_2m'], $data['current']['weather_code'])) {
  // Open-Meteo не ответил — отдаём старый кэш (браузер сам отбросит
  // слишком старый по полю at) или пустой ответ
  if (is_file($cache)) { readfile($cache); } else { http_response_code(503); echo '{}'; }
  exit;
}

$out = json_encode([
  'temp' => round($data['current']['temperature_2m']),
  'code' => (int) $data['current']['weather_code'],
  'at' => time()
]);
@file_put_contents($cache, $out, LOCK_EX);
echo $out;
