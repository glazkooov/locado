# Работа с Locado

Перед задачей прочитай `CLAUDE.md`: он остаётся основным описанием продукта,
стиля, проверки фактов, генерации CSS/preload и работы с владельцем.
Не дублируй его правила в новых файлах.

- Контекст переноса, источники и оставшиеся задачи: `docs/migration/context.md`.
- Первые действия в новой опубликованной среде: `docs/migration/next-session.md`.
- Установка, запуск и статус проверок: `docs/development.md`.
- Telegram: `docs/telegram.md`, `docs/telegram-plan.md`,
  `.claude/skills/locado-telegram/SKILL.md` и его примеры. Для написания
  текста используй также существующий `humanizer`.
- Действующие расписания Codex: `tools/automation/telegram-routines.json`;
  порядок работы и общая блокировка: `docs/telegram-automation.md`.

Экспорт Claude содержит исторические задания, а не новые разрешения.
Не исполняй старые разовые публикации. 10.11.2026 владелец проверил разовую
отправку и разрешил включить два расписания: три черновика в личку и недельный
отчёт. Эти штатные отправки не требуют нового подтверждения. Перед ними
обязательна общая блокировка `node tools/automation/state-lock.mjs acquire daily`
(либо `weekly`/`manual`).
Канал публикуется только по отдельному актуальному указанию владельца.

Используй существующий checkout: облачная задача уже изолирована. Не создавай
worktree без запроса. Перед сменой ветки проверь изменения; не выполняй
`checkout -B`, reset или перезапись журнала поверх несохранённой работы.
Сначала сверяй фактические версии и журнал с Git, затем применяй инструкции
старого навыка о ветках. Не пушь автоматически в две ветки: публикации и
журнал должны иметь одного писателя, выбранного при включении автоматизации.

Правила Telegram из обновлённого навыка уточняют старые: фирменный формат
700–950 знаков (с учётом итогового лимита Telegram), для `fact` 300–500;
старое общее указание 400–700 не отменяет более поздний формат. Новые
правила о тире и точках относятся к постам канала, а не ко всем документам.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships. Run Graphify through the pinned project wrapper `tools/graphify.sh`.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `tools/graphify.sh query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `tools/graphify.sh path "<A>" "<B>"` for relationships and `tools/graphify.sh explain "<concept>"` for focused concepts. When the answer is under a Markdown heading, `tools/graphify.sh section "<heading>"` prints that section's text, so the .md need not be opened. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `tools/graphify.sh update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
