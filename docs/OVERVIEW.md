# Обзор opencode-env

`opencode-env` — Windows-first генератор локального окружения OpenCode для
проекта. Он создаёт или дополняет конфигурацию `.opencode`, `AGENTS.md` и
`opencode.json` на основе пресета и выбранных компонентов.

## Целевой Windows flow

1. На целевом ПК один раз запускается `opencode-env-setup.exe`; установщик
   размещает утилиту в `%LOCALAPPDATA%\opencode-env` по умолчанию и добавляет
   каталог в пользовательский `PATH`.
2. В новом PowerShell выполняется `opencode-env init`.
3. CLI выбирает пресет (`backend`, `frontend` или `universal`) и компоненты.
   Для агентов получает доступные модели через локальный `opencode models`;
   при необходимости проверяет OpenCode также через WSL.
4. После генерации OpenCode следует перезапустить. Для проверки существующей
   конфигурации используется `opencode-env validate`.

Node.js на целевой машине не требуется при использовании standalone-версии.

## Архитектурные компоненты

- **CLI** — TypeScript/Node-реализация в `opencode-env/src/cli.ts`; поддерживает
  `init`, `reinit`, `add`, `list`, `validate` и служебные команды.
- **Каталог шаблонов** — `catalog/.opencode/agents`,
  `catalog/.opencode/skills`, `catalog/.opencode/command` и
  `template-manifest.json`.
- **Модельная часть** — обнаружение вывода `opencode models` и назначение модели
  каждому выбранному агенту; результаты сохраняются в
  `.opencode/model-registry.json`.
- **Конфигурация** — `opencode.json` содержит MCP и разрешения; генерируемые
  правила запрещают чтение секретных файлов и требуют подтверждения опасных
  операций.
- **Упаковка** — `opencode-env/scripts/build-exe.mjs` собирает standalone
  executable и установщик для Windows.

## Структура репозитория

- `catalog/.opencode/agents/` — основной и специализированные агенты;
- `catalog/.opencode/skills/` — навыки и рабочие процессы;
- `catalog/.opencode/command/` — команды планирования, проверки и тестирования;
- `src/`, `test/`, `scripts/` — исходники CLI, тесты и сборка EXE;
- `docs/` — документация проекта;
- `template-manifest.json` — каталог, пресеты и compaction policy;
- `opencode-env.cmd` и `install-opencode-env.ps1` — Windows-обвязка для source checkout;

## Жизненный цикл команд

### `init`

Генерирует новое окружение в текущем или указанном через `--project` каталоге.
В интерактивном режиме предлагает выбрать пресет и компоненты; без явного
пресета в неинтерактивном режиме используется `universal`. `--dry-run` только
показывает план. Существующие `AGENTS.md` и `opencode.json` не заменяются без
`--force`.

### `reinit`

После подтверждения полностью заменяет каталог `.opencode`, затем выполняет
инициализацию с выбранными параметрами. Символьная ссылка `.opencode` отклоняется.
Без подтверждения (`--force` или `--yes`) операция не выполняется.

### `add`

Добавляет выбранные агенты, skills, команды и MCP к существующему окружению,
объединяя записи в `environment-manifest.json`. Конфликты файлов требуют
подтверждения либо `--force`/`--yes`. Добавление агентов запускает обнаружение
моделей; добавление только skills, команд или MCP его не требует.

Подробнее о пользовательском сценарии и технической реализации: [USER_GUIDE.md](USER_GUIDE.md) и [TECHNICAL.md](TECHNICAL.md).
