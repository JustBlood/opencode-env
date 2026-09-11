# Руководство пользователя `opencode-env`

`opencode-env` создаёт в проекте конфигурацию OpenCode: `AGENTS.md`,
`opencode.json` и выбранные элементы каталога `.opencode`.

## Установка в Windows

1. Запустите `opencode-env-setup.exe` двойным щелчком или из PowerShell:

   ```powershell
   .\opencode-env-setup.exe
   ```

2. Введите папку установки. Если оставить ответ пустым, используется
   `%LOCALAPPDATA%\opencode-env`.
3. Откройте новое окно PowerShell: установщик добавляет папку установки в
   пользовательский `PATH`.

Node.js на компьютере назначения для установленного standalone-файла не нужен.
После обновления `PATH` команда запускается из любого каталога:

```powershell
opencode-env help
```

### Содержимое папки установки

В выбранной папке находятся:

- `opencode-env.exe` — CLI;
- `opencode-env-uninstall.exe` — деинсталлятор;
- `template-manifest.json` — манифест каталога и профилей;
- `.opencode\` — встроенный каталог шаблонов (агенты, skills и команды);
- `opencode-env.install.json` — служебная отметка установки.

Не удаляйте эти файлы вручную до деинсталляции: деинсталлятор проверяет
служебную отметку.

## Удаление

Запустите деинсталлятор из установленной папки:

```powershell
& "$env:LOCALAPPDATA\opencode-env\opencode-env-uninstall.exe"
```

Если при установке была выбрана другая папка, подставьте её путь. Деинсталлятор
удаляет запись этой папки из пользовательского `PATH`, файлы установки и саму
папку. Проекты, в которых ранее была создана конфигурация, не удаляются.
Откройте новый терминал после удаления.

## Команды

Команду выполняйте из каталога проекта. Для другого каталога используйте
`--project <путь>`.

### `help`

Показать справку:

```powershell
opencode-env help
```

Запуск без аргументов также показывает справку и ничего не создаёт:

```powershell
opencode-env
```

### `init`

Создать окружение проекта:

```powershell
opencode-env init
```

В интерактивном режиме команда последовательно предлагает профиль и выбор
компонентов. Доступны профили `backend`, `frontend` и `universal`.
При явном неинтерактивном запуске без `--preset` используется `universal`:

```powershell
opencode-env init --project C:\work\my-app --preset frontend
```

Можно выбрать компоненты списками через запятую:

```powershell
opencode-env init --project C:\work\my-app `
  --agents build,reviewer `
  --skills security-review,react-vite `
  --commands plan,review,test,e2e `
  --mcp context7,playwright
```

Для описания проекта можно передать текстовый файл:

```powershell
opencode-env init --project C:\work\my-app `
  --preset universal --brief C:\work\project-brief.md
```

`init` выполняет `opencode models --refresh`, затем `opencode models` и
назначает найденную модель выбранным агентам. Если обнаружение моделей не
удалось, окружение не генерируется.

### Интерактивный режим

`init` запускается интерактивно, если команда выполняется в терминале без
явного профиля/списков и без `--dry-run`. В меню доступны номера компонентов:
введите номера через запятую, `Enter` оставляет варианты по умолчанию, `0`
не выбирает ничего.

`reinit` запрашивает отдельное подтверждение, а `add` без списков открывает
меню добавляемых компонентов. Для автоматизации передавайте `--preset` или
списки `--agents`, `--skills`, `--commands`, `--mcp`.

### `reinit`

Полностью заменить `.opencode` проекта новым окружением:

```powershell
opencode-env reinit --project C:\work\my-app --preset backend
```

Команда требует подтверждения и удаляет весь существующий каталог
`.opencode`, включая файлы, созданные не этой утилитой. Не используйте её,
если нужно сохранить отдельные файлы; для этого подходит `add`.

### `add`

Добавить компоненты, не пересоздавая всё окружение:

```powershell
opencode-env add --project C:\work\my-app --skills react-vite
opencode-env add --project C:\work\my-app --commands e2e
opencode-env add --project C:\work\my-app --mcp playwright
opencode-env add --project C:\work\my-app --agents architect
```

Добавление агентов требует обнаружения моделей OpenCode. Для skills, команд и
MCP OpenCode для обнаружения моделей не требуется. Существующие выбранные
файлы не заменяются без подтверждения (или `--force`).

### `list`

Показать доступные профили, агентов, skills, MCP и команды:

```powershell
opencode-env list
```

### `validate`

Проверить уже созданное окружение:

```powershell
opencode-env validate
opencode-env validate --project C:\work\my-app
```

Проверяются `opencode.json`, `AGENTS.md`, обязательные элементы `.opencode` и
`model-registry.json`. При ошибке команда перечисляет отсутствующие или
некорректные элементы и завершается с кодом `1`.

## `--force` и `--dry-run`

`--force` разрешает перезапись существующих `AGENTS.md` и `opencode.json` при
`init`, а также замену конфликтующих выбранных файлов при `add`. Для
`reinit` он также заменяет запрос подтверждения:

```powershell
opencode-env init --project C:\work\my-app --preset universal --force
opencode-env reinit --project C:\work\my-app --preset frontend --force
opencode-env add --project C:\work\my-app --skills react-vite --force
```

`--dry-run` показывает планируемые операции и не записывает файлы:

```powershell
opencode-env init --project C:\work\my-app --preset backend --dry-run
opencode-env add --project C:\work\my-app --skills spring-boot-java --dry-run
```

Для `init --dry-run` обнаружение моделей не выполняется. Это режим просмотра,
а не проверка готовности OpenCode.

## Если OpenCode отсутствует

Для `init` и `reinit` OpenCode обязателен; `add` требует его только при
добавлении агентов. В Windows CLI ищет OpenCode в Windows `PATH` и в WSL.

Рекомендуемый вариант — установить OpenCode в WSL:

```bash
curl -fsSL https://opencode.ai/install | bash
```

Запустите команду в терминале WSL. После установки повторите команду
`opencode-env` в новом PowerShell; WSL OpenCode используется через `wsl.exe`.

Поддерживаются также следующие способы в Windows:

```powershell
scoop install opencode
choco install opencode -y
npm install -g opencode-ai
```

После установки закройте и снова откройте терминал, затем повторите исходную
команду. OpenCode должен быть установлен и настроен так, чтобы `opencode
models` возвращала идентификаторы provider/model.

## Типичные ошибки

- **`opencode-env` не найден** — откройте новый терминал после установки или
  проверьте, что выбранная папка добавлена в пользовательский `PATH`.
- **`This directory is not an opencode-env installation.`** — деинсталлятор
  запущен не из папки, созданной установщиком; используйте правильный файл.
- **`Refusing to overwrite ...`** — в проекте уже есть `AGENTS.md` или
  `opencode.json`. Проверьте их и повторите с `--force`, если перезапись нужна.
- **`OpenCode was not found ...` / ошибка model discovery** — установите и
  настройте OpenCode, откройте новый терминал и повторите команду.
- **`'opencode models' returned no provider/model identifiers`** — команда
  OpenCode не вернула модели; завершите настройку OpenCode и попробуйте снова.
- **`Unknown ...`** — указано имя, которого нет в `opencode-env list`; исправьте
  список компонентов.
- **`Reinitialization cancelled`** или **`Add cancelled`** — подтверждение не
  было дано; это штатная отмена, файлы не меняются.
- **`opencode.json is missing or invalid`** при `validate` — восстановите файл
  через `init` или исправьте JSON и запустите проверку снова.

## AI-анализ проекта и документы

В интерактивном `init` можно выбрать источник для `AGENTS.md` и project brief:

- сгенерировать через OpenCode read-only агентом `plan`;
- использовать существующий файл;
- использовать базовый шаблон (для `AGENTS.md`);
- создать brief-шаблон или не создавать brief.

При AI-варианте OpenCode получает запрос на анализ текущего проекта через
локальную команду `opencode run`. Утилита не вызывает API напрямую. Результат
проверяется на пустой вывод, секретоподобные данные и чрезмерный размер до
записи на диск. OpenCode не должен читать `.env`, credentials, tokens, keys или
production-конфигурацию. Перед использованием проверьте preview и результат.

## Состояние задачи и compaction

Каждый новый проект получает обязательный `TASK_STATE.md` и plugin
`.opencode/plugins/compaction-state.ts`. В `opencode.json` включается:

```json
{
  "compaction": {
    "auto": true,
    "prune": true,
    "reserved": 10000
  }
}
```

Перед большой задачей обновляйте `TASK_STATE.md`: цель, статус, решения,
блокеры, следующие шаги и важные файлы. После compaction агент должен сначала
прочитать `AGENTS.md` и `TASK_STATE.md`, затем перечитать важные файлы и снова
активировать нужные skills. Это повышает восстановление контекста, но не
является гарантией сохранения всей истории.
