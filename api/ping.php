<?php
// api/ping.php — проверка, что PHP на хостинге вообще работает: должен
// показать версию PHP. Если и здесь ошибка 500 — дело в настройках сайта,
// а не в коде погоды
header('Content-Type: text/plain; charset=utf-8');
echo 'PHP работает, версия ' . PHP_VERSION . "\n";
