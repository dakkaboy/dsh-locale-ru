# dsh-locale-ru

![check](https://github.com/dakkaboy/dsh-locale-ru/actions/workflows/check.yml/badge.svg)

**Русская локализация веб-интерфейса [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).**
Плагин добавляет язык **«Русский»** и переводит весь клиентский интерфейс: чат, диалог, настройки,
боковые панели, траекторию выполнения, магазин и менеджер плагинов, расписание, фоновые задачи,
голосовой ввод, инспектор сессий и многое другое.

> **English:** Russian localization pack for the DeepSeek Harness web GUI. It is a regular DSH client
> plugin that registers the `ru` language and 64 namespaced dictionaries (2737 strings) through the
> official `@deepseek-ai/dsh-client-locale` extension point — no patching of `app.asar` is involved.

- **2737 строк** в **64** пространствах имён (полное покрытие клиентских словарей DSH 0.2.1-rc.2).
- Ничего не патчит: `app.asar` и файлы установленной программы остаются нетронутыми.
- Безопасно при неполном покрытии: отсутствующий ключ автоматически показывается по-английски.
- Обновления DSH русификатор не ломают — новые строки просто остаются английскими до перевода.

## Установка

Пакет объявляет `dsh.bundle`, поэтому его можно ставить двумя способами: **как bundle** (штатно,
через менеджер плагинов или маркет) или **напрямую** скриптом/вручную. Смешивать режимы нельзя —
иначе запись `locale-ru` смонтируется дважды.

### Из индекса плагинного маркета (bundle)

```text
https://dakkaboy.github.io/dsh-locale-ru/index.json
```

Вкладка **Discover** в настройках плагинов → добавить этот URL индекса → установить «Русификатор
интерфейса». Маркет поставляется в DSH как экспериментальный bundle
`@deepseek-ai/dsh-experimental-plugin-market-bundle`; если вкладки нет, добавьте его в
`dsh.profile.bundles` своего профиля.

Установка из индекса ставит пакет по закреплённому коммиту репозитория и добавляет
`dsh-locale-ru` в `dsh.profile.bundles` — дальше профиль собирает слой-патч сам.

### Одной командой (Windows, напрямую)

```powershell
irm https://github.com/dakkaboy/dsh-locale-ru/releases/latest/download/install.ps1 | iex
```

Скрипт скачивает пакет из последнего релиза, кладёт его в профиль, связывает с `node_modules`
и включает в `cordis.patch.yml`. Ничего не патчит в самой программе.

Параметры (если нужен другой профиль или каталог DSH):

```powershell
irm https://github.com/dakkaboy/dsh-locale-ru/releases/latest/download/install.ps1 -OutFile install.ps1
.\install.ps1 -Profile web -DshHome "D:\dsh-data" -Version v1.1.0
```

Удаление одной командой:

```powershell
irm https://github.com/dakkaboy/dsh-locale-ru/releases/latest/download/uninstall.ps1 | iex
```

### Через pnpm как bundle

```powershell
cd "$env:USERPROFILE\.dsh\profiles\desktop"
pnpm add https://github.com/dakkaboy/dsh-locale-ru/releases/latest/download/dsh-locale-ru.tgz
```

Затем добавить `"dsh-locale-ru"` в `dsh.profile.bundles` профиля (`package.json`).
Запись в `cordis.patch.yml` в этом режиме не нужна: её вставляет сам bundle.

### Вручную (напрямую)

Плагин ставится в профиль DSH (`$DSH_HOME/profiles/<profile>`, по умолчанию `desktop`) тремя шагами:

```powershell
# 1. положить пакет в профиль
$profile = "$env:USERPROFILE\.dsh\profiles\desktop"
git clone https://github.com/dakkaboy/dsh-locale-ru "$profile\plugins\dsh-locale-ru"

# 2. связать его с node_modules профиля (Windows: junction, без прав администратора)
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-locale-ru" `
  -Target "$profile\plugins\dsh-locale-ru"

# 3. включить плагин в конфигурации профиля
#    добавить в конец $profile\cordis.patch.yml:
#      - insert:
#          - id: locale-ru
#            name: dsh-locale-ru
```

Затем перезагрузить окно DSH (F5) или перезапустить приложение.

Вместо шагов 1–2 можно установить пакет как зависимость профиля:

```powershell
cd "$env:USERPROFILE\.dsh\profiles\desktop"
pnpm add file:./plugins/dsh-locale-ru
```

### Язык

Если система или браузер русскоязычные, язык подхватывается автоматически при загрузке страницы.

Переключить вручную: **Настройки → Общие → Язык → «Русский»**. Выбор сохраняется на хосте
(`$DSH_HOME/cordis.patch.yml`, настройка `locale.preference`) и действует во всех вкладках.

### Удаление (напрямую)

```powershell
$profile = "$env:USERPROFILE\.dsh\profiles\desktop"
Remove-Item "$profile\node_modules\dsh-locale-ru" -Force
Remove-Item "$profile\plugins\dsh-locale-ru" -Recurse -Force
```

И убрать блок `- insert:` с `id: locale-ru` из `$profile\cordis.patch.yml`.

В bundle-режиме удаление — это снять `dsh-locale-ru` из `dsh.profile.bundles` профиля
и удалить пакет; `uninstall.ps1` делает и то, и другое автоматически.

## Как это работает

DSH предоставляет штатную точку расширения локализации
([`@deepseek-ai/dsh-client-locale`](https://github.com/deepseek-ai/deepseek-harness)): языковой пакет —
это обычный клиентский плагин, который объявляет язык и словари.

```js
export const inject = ['locale']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.addLanguage({ id: 'ru', label: 'Русский', fallback: 'en' }), 'ru: language')
  ctx.effect(() => ctx.locale.register('chat', 'ru', { 'input.send': 'Отправить сообщение' }), 'ru: chat')
}
```

Пакет состоит из двух половин плюс слой-патч:

| Файл | Роль |
|---|---|
| `lib/index.js` | хостовая половина: пустая, плагину не нужен код на стороне хоста |
| `lib/client.js` | браузерный бандл: регистрирует язык `ru` и 64 словаря |
| `cordis.patch.yml` | слой-патч bundle: вставляет запись `locale-ru` в дерево профиля |
| `package.json` | манифест: `dsh.client` (`platform: web`) и `dsh.bundle.patch` |

Ключи и пространства имён взяты из самих клиентских пакетов DSH, поэтому перевод попадает ровно
в те места интерфейса, где программа вызывает `t('ключ')`. Поиск идёт по цепочке `ru → en`,
поэтому частичный перевод деградирует в английский, а не в «сырые» ключи.

## Разработка

```
translate/     глоссарий, партии (batch-Gxx.json), переводы (ru-Gxx.json), overrides и rewrites
inspect/       corpus.json — английские и китайские оригиналы всех строк
tools/         конвейер: извлечение, нарезка, проверка, сборка, установка
lib/           собранный бандл плагина (то, что исполняет браузер)
```

Сборка и проверки:

```bash
node tools/check-all.cjs                                   # ключи, плейсхолдеры, полное покрытие
node tools/build-pack.cjs translate inspect/corpus.json .  # собрать package.json и lib/
node tools/verify-pack.cjs . inspect/corpus.json --strict  # исполнить бандл и проверить регистрацию
```

Установка в локальный профиль:

```bash
node tools/install-pack.cjs .            # скопировать пакет и прописать в профиль desktop
node tools/install-pack.cjs . --remove   # удалить
```

### Как обновлять перевод после релиза DSH

1. `node tools/extract-dicts.cjs "<...>/resources/app.asar" inspect/dicts` — выгрузить словари из
   установленной версии.
2. `node tools/build-corpus.cjs inspect/dicts inspect/corpus.json` — пересобрать корпус.
3. `node tools/make-batches.cjs inspect/corpus.json translate` — нарезать новые партии.
4. Перевести новые ключи в `ru-Gxx.json` (глоссарий — `translate/GLOSSARY.md`).
5. `check-all` → `build-pack` → `verify-pack` → коммит.

Точечные правки удобнее делать в `translate/overrides.json` (по ключу) или
`translate/rewrites.json` (сквозные замены формулировок) — они применяются при сборке.

## Соглашения перевода

- Единый глоссарий терминов (`translate/GLOSSARY.md`): *session → сессия*, *turn → ход*,
  *tool call → вызов инструмента*, *workspace → рабочая область*, *approval → подтверждение* и т. д.
- Плейсхолдеры `{name}`, `{count}`, `{size}` сохраняются дословно.
- Бренды, названия моделей, форматы и горячие клавиши не переводятся
  (DeepSeek, DSH, MCP, JSON, Bash, `Ctrl+Enter` и т. п.).
- Склонения числительных там, где число неизвестно, обходятся нейтральной формой
  («Файлов: {count}»).

## Ограничения

- Текст, который формирует хостовая часть DSH (описания команд, ошибки провайдеров, заголовки
  сессий), локализуется самой программой, а не клиентскими словарями, и может оставаться
  на английском.
- Переводы рассчитаны на версию DSH `0.2.1-rc.2`; в новых версиях появляются новые ключи —
  они показываются по-английски до перевода.

## Лицензия

[MIT](LICENSE) для кода инструментов и переводов.

Английские и китайские строки в `inspect/corpus.json` извлечены из
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (MIT, © DeepSeek) и используются
как исходный материал для перевода. Проект не связан с DeepSeek и не является официальной
локализацией.
