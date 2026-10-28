<?php
// api/og-image.php — картинка превью 1200×630 для ссылки на место или
// подборку: фото на весь кадр, логотип, тип и крупное название, оранжевая
// полоса снизу. ?place=slug или ?collection=slug.
//
// Рисует один раз и кладёт в api/og-cache/; дальше отдаёт готовый файл.
// Имя файла зависит от названия, типа, фото, логотипа и этого файла —
// поменяли что-то из этого, картинка перерисуется сама. Нет фото или GD — общая картинка сайта.
//
// Шрифт — Unbounded Bold (лицензия OFL, assets/fonts/LICENSE-unbounded.txt),
// собран в TTF из woff2 сайта: GD не читает woff2. Логотип — assets/og/.
// Без нового синтаксиса PHP 7+: на хостинге может стоять старая версия.

require __DIR__ . '/og.php';

define('OG_W', 1200);
define('OG_H', 630);
define('OG_PAD', 64);

function og_fallback() {
  header('Location: ' . og_site() . 'assets/og-image.jpg?v=4', true, 302);
  exit;
}

$root = dirname(__DIR__);
$font = $root . '/assets/og/unbounded-700.ttf';
$logoFile = $root . '/assets/og/logo-white.png';

$item = null;
if (isset($_GET['place'])) {
  $p = og_find($root . '/data/places.json', (string)$_GET['place']);
  if ($p) $item = array('kind' => isset($p['type']) ? $p['type'] : '', 'name' => $p['name'],
    'photo' => isset($p['photo']) ? $p['photo'] : '', 'slug' => 'place-' . $p['slug']);
} elseif (isset($_GET['collection'])) {
  $c = og_find($root . '/data/collections.json', (string)$_GET['collection']);
  if ($c) $item = array('kind' => $c['type'] === 'route' ? 'Маршрут' : 'Подборка', 'name' => $c['title'],
    'photo' => isset($c['cover']) ? $c['cover'] : '', 'slug' => 'collection-' . $c['slug']);
}

$photo = $item && $item['photo'] !== '' && strpos($item['photo'], '..') === false ? $root . '/' . ltrim($item['photo'], '/') : '';
if (!$item || $photo === '' || !is_file($photo) || !function_exists('imagecreatetruecolor') || !is_file($font)) og_fallback();

// Кэш: имя меняется вместе с содержимым картинки
$cacheDir = __DIR__ . '/og-cache';
$key = md5($item['kind'] . '|' . $item['name'] . '|' . $item['photo'] . '|' . filemtime($photo)
  . '|' . (is_file($logoFile) ? filemtime($logoFile) : 0) . '|' . filemtime(__FILE__));
$cacheFile = $cacheDir . '/' . preg_replace('/[^a-z0-9-]/', '', $item['slug']) . '-' . $key . '.jpg';

header('Content-Type: image/jpeg');
header('Cache-Control: public, max-age=86400');
if (is_file($cacheFile)) { readfile($cacheFile); exit; }

// ---------- Фото: заполнить кадр, обрезав лишнее по центру ----------
$info = @getimagesize($photo);
$src = null;
if ($info && $info[2] === IMAGETYPE_JPEG) $src = @imagecreatefromjpeg($photo);
elseif ($info && $info[2] === IMAGETYPE_PNG) $src = @imagecreatefrompng($photo);
elseif ($info && defined('IMAGETYPE_WEBP') && $info[2] === IMAGETYPE_WEBP && function_exists('imagecreatefromwebp')) $src = @imagecreatefromwebp($photo);
if (!$src) { header_remove('Content-Type'); og_fallback(); }

$img = imagecreatetruecolor(OG_W, OG_H);
$sw = imagesx($src); $sh = imagesy($src);
$scale = max(OG_W / $sw, OG_H / $sh);
$cw = (int)round(OG_W / $scale); $ch = (int)round(OG_H / $scale);
imagecopyresampled($img, $src, 0, 0, (int)(($sw - $cw) / 2), (int)(($sh - $ch) / 2), OG_W, OG_H, $cw, $ch);
imagedestroy($src);

// ---------- Затемнение: сверху — под логотип, снизу — под название ----------
imagealphablending($img, true);
for ($y = 0; $y < OG_H; $y++) {
  $t = $y / OG_H;
  if ($t < 0.3) $a = 0.35 * (1 - $t / 0.3);
  elseif ($t < 0.5) $a = 0.15 * (($t - 0.3) / 0.2);
  else $a = 0.15 + 0.67 * (($t - 0.5) / 0.5);
  if ($a <= 0) continue;
  // В GD прозрачность — 127 (нет) … 0 (полностью)
  $col = imagecolorallocatealpha($img, 0, 0, 0, 127 - (int)round($a * 127));
  imageline($img, 0, $y, OG_W, $y, $col);
}

// ---------- Логотип ----------
if (is_file($logoFile)) {
  $logo = @imagecreatefrompng($logoFile);
  if ($logo) {
    $lh = 54; $lw = (int)round(imagesx($logo) * $lh / imagesy($logo));
    imagecopyresampled($img, $logo, OG_PAD, 52, 0, 0, $lw, $lh, imagesx($logo), imagesy($logo));
    imagedestroy($logo);
  }
}

// ---------- Текст ----------
// GD меряет шрифт в пунктах: px = pt × 0.75 → pt = px / 0.75
function og_pt($px) { return $px * 0.75; }

function og_text_width($size, $font, $text) {
  $b = imagettfbbox($size, 0, $font, $text);
  return $b[2] - $b[0];
}

/** Слова по строкам не шире $max; null — не влезло в $maxLines строк. */
function og_wrap($size, $font, $text, $max, $maxLines) {
  $words = preg_split('/\s+/u', trim($text));
  $lines = array(); $line = '';
  foreach ($words as $w) {
    $try = $line === '' ? $w : $line . ' ' . $w;
    if ($line !== '' && og_text_width($size, $font, $try) > $max) { $lines[] = $line; $line = $w; }
    else $line = $try;
  }
  if ($line !== '') $lines[] = $line;
  foreach ($lines as $l) if (og_text_width($size, $font, $l) > $max) return null;
  return count($lines) <= $maxLines ? $lines : null;
}

/** Строка с разрядкой: GD её не умеет, ставим буквы по одной. */
function og_spaced($img, $size, $font, $x, $y, $color, $text, $spacing) {
  $chars = preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY);
  foreach ($chars as $ch) {
    imagettftext($img, $size, 0, (int)round($x), $y, $color, $font, $ch);
    $x += og_text_width($size, $font, $ch) + $spacing;
  }
}

$white = imagecolorallocate($img, 255, 255, 255);
$peach = imagecolorallocate($img, 255, 176, 126);
$maxW = OG_W - OG_PAD * 2;

// Название: 76px в две строки; длинное — мельче, до трёх строк
$lines = null; $px = 76;
foreach (array(array(76, 2), array(64, 2), array(58, 3), array(50, 3), array(44, 4)) as $opt) {
  $lines = og_wrap(og_pt($opt[0]), $font, $item['name'], $maxW, $opt[1]);
  if ($lines) { $px = $opt[0]; break; }
}
if (!$lines) $lines = array($item['name']);
$lineH = (int)round($px * 1.04);

// Снизу вверх: полоса 12px, отступ, название, тип
$baseline = OG_H - 12 - 58;
$nameTop = $baseline - $lineH * (count($lines) - 1);
foreach ($lines as $i => $l) {
  imagettftext($img, og_pt($px), 0, OG_PAD, $nameTop + $lineH * $i, $white, $font, $l);
}
if ($item['kind'] !== '') {
  $kind = function_exists('mb_strtoupper') ? mb_strtoupper($item['kind'], 'UTF-8') : $item['kind'];
  og_spaced($img, og_pt(22), $font, OG_PAD, $nameTop - (int)round($px * 0.82) - 18, $peach, $kind, 2.2);
}

// Оранжевая полоса — узнаваемый край в ленте чата
imagefilledrectangle($img, 0, OG_H - 12, OG_W, OG_H, imagecolorallocate($img, 255, 87, 10));

// ---------- Сохранить и отдать ----------
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755);
// Старые версии картинки этого места больше не нужны
// (после slug — ровно 32 знака хэша: «kolomenskoe-*» задел бы и «kolomenskoe-park»)
foreach ((array)glob($cacheDir . '/' . preg_replace('/[^a-z0-9-]/', '', $item['slug']) . '-' . str_repeat('?', 32) . '.jpg') as $old) @unlink($old);
imageinterlace($img, true);
if (!@imagejpeg($img, $cacheFile, 86)) { imagejpeg($img, null, 86); imagedestroy($img); exit; }
imagedestroy($img);
readfile($cacheFile);
