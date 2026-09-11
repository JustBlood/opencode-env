# Техническая реализация `opencode-env`

Документ описывает реализацию по текущим файлам репозитория (прежде всего
`opencode-env/src/cli.ts`, `template-manifest.json` и `scripts/build-exe.mjs`).

## Архитектура и CLI dispatch

Точка входа — TypeScript-файл `src/cli.ts`; после компиляции пакет публикует
`dist/cli.js` как bin `opencode-env`. `main()` разбирает
`process.argv.slice(2)`:

- известные первые аргументы: `init`, `reinit`, `add`, `list`, `validate`,
  `migrate-model`, `help`, `install`;
- отсутствие команды означает `help` (не инициализацию);
- неизвестный первый аргумент трактуется как `init`, поэтому опции можно
  передать без явного слова `init`;
- `--help`/`-h` имеют приоритет и печатают справку;
- `--project` разрешается через `resolve`, по умолчанию используется текущий
  каталог.

Основные обработчики: `init()` генерирует окружение, `reinit()` подтверждает и
полностью заменяет `.opencode`, `add()` добавляет компоненты, `list()` выводит
каталог, `validate()` возвращает код ошибки при неполной конфигурации,
`migrate-model()` выполняет буквальную миграцию идентификатора модели.

## Каталог, manifest и пресеты

`template-manifest.json` — декларативный каталог с версиями схемы, списками
agents/skills/commands, MCP-конфигурациями, правилами и пресетами. Источники
шаблонов указаны как `catalog/.opencode/agents`, `catalog/.opencode/skills` и
`catalog/.opencode/command` относительно корня репозитория.

Текущие пресеты:

- `backend`: базовые агенты, discovery/tuning/security skills, `plan/review/test`
  и MCP `context7`;
- `frontend`: то же плюс `playwright-e2e`, команда `e2e` и MCP `playwright`;
- `universal`: базовый набор без Playwright.

Синонимы нормализуются в `normalizePreset`: `generic` → `universal`,
`react-vite` → `frontend`, `spring-boot`, `node`, `python` → `backend`.
Если поле отсутствует в manifest, `loadCatalog()` использует встроенные
значения по умолчанию. `--manifest` позволяет загрузить альтернативный JSON
(путь разрешается относительно текущего процесса).

При генерации создаются `AGENTS.md`, `opencode.json`, выбранные шаблоны и два
служебных файла: `.opencode/environment-manifest.json` (состав генерации и
назначения) и `.opencode/model-registry.json` (результат discovery).

## `embeddedCatalog` и сборка трёх SEA executable

В исходном checkout `src/embeddedCatalog.ts` содержит пустой объект. Скрипт
`npm run build:exe` сначала собирает TypeScript, затем `scripts/build-exe.mjs`:

1. рекурсивно читает `.opencode` рабочего примера и `template-manifest.json`,
   добавляет marker `opencode-env.install.json`;
2. временно записывает весь payload в `src/embeddedCatalog.ts` как
   `embeddedFiles: Record<string,string>`;
3. bundling выполняется `npx esbuild src/cli.ts --bundle --platform=node
   --format=cjs --outfile=release/cli.cjs`;
4. `npx pkg --sea release/cli.cjs --output release/opencode-env.exe` создаёт
   основной standalone executable;
5. генерируется скрипт uninstaller и тем же способом создаётся
   `release/opencode-env-uninstall.exe`;
6. payload основного exe, uninstaller и каталог кодируются в installer source,
   после чего создаётся `release/opencode-env-setup.exe`.

Итого выпускаются три SEA exe: utility, uninstaller и setup installer. В
`finally` исходный `embeddedCatalog.ts` восстанавливается, поэтому каталог не
зашит в рабочее дерево исходников постоянно. Packaged CLI сначала читает
файлы рядом с exe, а при отсутствии использует embedded payload; обычный Node
CLI читает каталог из checkout.

## Installer/uninstaller и PATH

`opencode-env-setup.exe` спрашивает каталог установки; default —
`%LOCALAPPDATA%\opencode-env` (с fallback через `USERPROFILE`). Он записывает
основной exe, uninstaller и embedded файлы, включая manifest, marker и
`.opencode`.

Для добавления каталога в пользовательский PATH installer вызывает:

```powershell
$p=[Environment]::GetEnvironmentVariable('Path','User')
$a=@($p -split ';' | Where-Object { $_ -and $_ -ne $d })
[Environment]::SetEnvironmentVariable('Path', (($a + $d) -join ';'), 'User')
```

Перед записью удаляется существующая точная копия каталога, поэтому добавление
идемпотентно. Новое значение PATH доступно новым терминалам. Команда
`install` основного exe повторяет установку в default-каталог.

Uninstaller проверяет `opencode-env.install.json`, удаляет каталог из User PATH,
стирает основной exe, manifest, marker и `.opencode`, затем запускает detached
`.remove-opencode-env.cmd`, который после задержки удаляет сам uninstaller и
каталог. Он не меняет OpenCode и не удаляет пользовательские проекты.

## Discovery OpenCode: native Windows и WSL

`hasOpenCode()` проверяет `opencode.cmd` через `where.exe` на Windows
(`opencode` через `which` на Unix). `hasWslOpenCode()` на Windows вызывает
`wsl.exe sh -lc "command -v opencode"`.

`runOpenCode()` предпочитает native executable. На Windows он запускает
`opencode.cmd` с `shell: true`; если native недоступен, запускает WSL-команду:

```text
wsl.exe sh -lc "opencode '<arg1>' '<arg2>' ..."
```

Аргументы для WSL получают простое экранирование одинарных кавычек. Если оба
варианта отсутствуют, возвращается статус 127. В интерактивном режиме CLI
может предложить установку: приоритет кандидатов — WSL, Scoop, Chocolatey,
npm. Фактические команды: `curl -fsSL https://opencode.ai/install | bash`,
`scoop install opencode`, `choco install opencode -y`,
`npm install -g opencode-ai`.

## Точные команды и parsing моделей

Discovery всегда состоит из двух вызовов:

```text
opencode models --refresh
opencode models
```

Результат второго вызова объединяется из stdout и stderr, ANSI escape-последовательности удаляются, строки trim-ятся, дубликаты исключаются. Принимается только строка, совпадающая с:

```regex
^[a-zA-Z0-9._-]+/[a-zA-Z0-9._:-]+$
```

То есть идентификатор должен иметь вид `provider/model`. Для записи registry
provider — часть до первого `/`, model — остаток после первого `/`:
`opencode-go/gpt-5.6-luna` превращается в `{provider:"opencode-go",
model:"gpt-5.6-luna"}`. Нулевой список считается ошибкой, и генерация не
выполняется. Ошибка любого запуска также останавливает генерацию.

## `chooseModel` и heavy agents

Для агентов из множества `build`, `plan`, `architect`, `backend`, `frontend`,
`reviewer`, `security` используется список предпочтений:

```text
gpt-5.5, gpt-5.4, claude-opus, gpt-5, claude-sonnet
```

Для остальных:

```text
mini, flash, haiku, nano, gpt-5.4, gpt-5.5, claude-sonnet
```

Для каждого token выбирается первая модель, чьё lowercase-представление
содержит token; выбирается первый успешный token. Если совпадений нет,
используется `models[0]`. При генерации выбранная модель вставляется в agent
markdown сразу после `mode:` (либо после первой строки). Старые строки
`model:` и строки с абсолютными Windows-путями пользователя удаляются.

## Семантика `init`, `reinit`, `add` и `dry-run`

### `init`

Интерактивный режим включается при TTY без явного preset/component selection,
если не задан `--dry-run`; он спрашивает preset и компоненты. В
неинтерактивном режиме preset по умолчанию — `universal`. `--profile` — alias
для `--preset`, а списки компонентов задаются comma-separated опциями.
Неизвестные и небезопасные имена отвергаются. Существующие корневые
`AGENTS.md` или `opencode.json` не перезаписываются без `--force` (dry-run не
пишет и поэтому не блокируется).

### `reinit`

Перед запуском проверяется, что `.opencode` не является symbolic link; затем
требуется `--force`, `--yes` или интерактивное подтверждение. После approval
вызывается `init` с `--reinit-delete`: существующее `.opencode` удаляется
рекурсивно и строится заново. Без явного preset/component selection
`reinit` включает интерактивный выбор. При отмене изменений нет.

### `add`

Добавляет только выбранные agents, skills, commands и MCP. По умолчанию
существующие имена показываются в интерактивном выборе; явные `--agents` и
прочие списки отключают этот выбор. Конфликты файлов требуют `--force`/`--yes`
или подтверждения. Существующие записи manifest объединяются без дубликатов,
корневой `opencode.json` изменяется только при добавлении MCP. При добавлении
agents выполняется discovery и обновляется registry; skills/commands/MCP без
agents discovery не требуют.

### `dry-run`

`init --dry-run` не запускает OpenCode discovery, не удаляет и не пишет файлы,
а печатает операции генерации. Поэтому model assignments в dry-run фактически
не заполняются. `add --dry-run` также не пишет шаблоны, config, manifest или
registry и пропускает discovery для agents, но может выполнить проверки и
интерактивное подтверждение конфликтов. `migrate-model --dry-run` только
показывает файлы, где была бы замена.

## `model-registry`

При `init` registry содержит `source: "opencode models"`, timestamp
`discoveredAt`, массив `{id, provider, model}` и `assignments` по агентам. В
`environment-manifest.json` назначения моделей также сохраняются в поле
`models`. При `add` текущие назначения сливаются с новыми; registry
перезаписывается только если добавлялись agents. Это локальный снимок
успешного discovery, а не хранилище credentials.

## Безопасность и известные ограничения

- Генерируемый `opencode.json` запрещает чтение `.env`, credentials/password/
  secret-файлов, PEM и KEY; bash по умолчанию требует ask, а `git push`,
  `git reset --hard` и `git clean -fd` запрещены. Внешние каталоги запрещены.
- Имена компонентов ограничены `[a-zA-Z0-9._-]+`; шаблоны читаются из
  каталогов исходного checkout либо из embedded payload. Текущий каталог не
  сканируется и не копируется целиком, однако сборщик embedded payload не
  фильтрует произвольные файлы внутри исходного `.opencode`: поддержание
  каталога без secret-like файлов остаётся обязанностью владельца репозитория.
- PATH редактируется только на уровне пользователя, но installer/uninstaller
  доверяют локальному PowerShell и имеют права текущего пользователя.
- Запуск `curl ... | bash`, npm/Scoop/Chocolatey установки и `npx` MCP
  выполняется только по выбранному пользователем пути; это внешняя цепочка
  доверия и не является offline-installation.
- Parsing моделей зависит от табличного вывода OpenCode и строгого regex;
  нестандартные provider/model identifiers будут отброшены. `--refresh`
  намеренно не проверяет статус отдельно перед вторым вызовом.
- Алгоритм выбора — substring-поиск по фиксированным token, а не оценка
  capabilities/стоимости/контекста; fallback на первый результат зависит от
  порядка вывода OpenCode.
- `reinit` намеренно удаляет весь `.opencode` (кроме защиты от symlink), а
  `--force` разрешает перезапись корневых файлов. Нет транзакционного rollback
  при частичной ошибке записи.
- SEA payload и embedded каталог формируются во время сборки; изменение
  исходного `.opencode` требует повторного `build:exe`. Уже установленные
  экземпляры автоматически не обновляются.

## AI-генерация документов

В интерактивном `init` пользователь отдельно выбирает источник для
`AGENTS.md` и project brief: AI-generation, существующий файл или шаблон.
При AI-generation вызывается локальный OpenCode CLI без `--model`, поэтому
используется его default model:

```text
opencode.cmd run --agent plan --format json
```

Текст запроса передаётся через stdin. Для WSL используется эквивалентный
`wsl.exe ... opencode run`. Запрос требует read-only анализа, запрещает чтение
секретов и просит вернуть две delimiter-секции: `PROJECT_BRIEF` и
`AGENTS_FACTS`. JSON events с типом `text` извлекаются из stdout.

До записи проверяются пустой результат, максимальный размер и secret-like
patterns. Фиксированная safety-часть `AGENTS.md` остаётся под контролем
генератора; AI возвращает только project facts. Неинтерактивный запуск не
выполняет AI-generation без явных `--agents-source`/`--brief-source`.

## Persistent state и compaction

`template-manifest.json` задаёт обязательные файлы и skills:

```json
{
  "requiredFiles": ["AGENTS.md", "TASK_STATE.md"],
  "requiredSkills": [
    "opencode-model-discovery-windows",
    "opencode-agent-model-tuning"
  ],
  "compaction": {
    "auto": true,
    "prune": true,
    "reserved": 10000
  }
}
```

`generatedConfig()` переносит compaction policy в `opencode.json` и регистрирует
`.opencode/plugins/compaction-state.ts`. Plugin использует
`experimental.session.compacting` и дописывает в compaction prompt bounded
recovery checklist: перечитать `AGENTS.md`, `TASK_STATE.md`, важные файлы и
повторно активировать skills.

`TASK_STATE.md` создаётся в корне проекта. Он предназначен для цели, статуса,
решений, блокеров, следующих шагов, важных файлов и required skills. Plugin не
может гарантировать полную память модели и не вставляет большие файлы целиком.
`prune: true` уменьшает старые tool outputs, поэтому критические сведения
должны быть зафиксированы в `TASK_STATE.md`.

Перед выпуском нужно проверить совместимость `compaction` и plugin hook с
конкретной установленной версией OpenCode: API и названия полей могут
изменяться между версиями.
