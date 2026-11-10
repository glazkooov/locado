// Read-only Bot API check. Never send messages or print the token/request URL.
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN недоступен в процессе. Проверь версию среды и привязку секрета.');
  process.exit(1);
}

try {
  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) {
    console.error(`Bot API: HTTP ${response.status}. Проверь доступ и подстановку HTTP-секрета.`);
    process.exitCode = 1;
  } else {
    const data = await response.json();
    if (!data.ok || data.result?.is_bot !== true) {
      console.error('Bot API не подтвердил авторизацию бота.');
      process.exitCode = 1;
    } else {
      console.log('Авторизация бота подтверждена. Сообщения не отправлялись.');
    }
  }
} catch {
  // Error objects may contain the credential-bearing URL. Do not log them.
  console.error('Не удалось выполнить getMe: проверь сеть, TLS и доступность Bot API.');
  process.exitCode = 1;
}
