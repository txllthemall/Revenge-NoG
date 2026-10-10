# StreamClean v0.1.0 — Revenge Classic

Экспериментальный open-source плагин для Discord Android с **Revenge Classic**, который пытается убрать виньетку и скругления при просмотре демонстрации экрана.

**Совместимость:** Revenge Classic, манифест `spec: 3`. Для Revenge Next нужен другой формат.

## Установка из Revenge

В **Revenge → Plugins → Repositories** добавьте URL репозитория (обязательно со слешем в конце):

```text
https://raw.githubusercontent.com/txllthemall/Revenge-NoG/main/
```

Затем найдите **StreamClean**, установите и включите. Если установленная версия Revenge не принимает raw.githubusercontent.com как источник, используйте GitHub Pages, включив его в **Settings → Pages → Deploy from a branch → main → /(root)**, после чего добавьте:

```text
https://txllthemall.github.io/Revenge-NoG/
```

GitHub Pages требует отдельного включения в настройках репозитория.

## Что делает

- Находит компоненты React Native, имеющие `Gradient` в названии, с чёрным полупрозрачным градиентом и делает градиент прозрачным.
- Пытается убрать `borderRadius` у компонентов, названия которых связаны с трансляциями и видео.
- Дополнительно перехватывает `ReactNativeAttributePayload.create/diff` для нативных компонентов с `testID` или `nativeID`, содержащими признаки видеоплеера.
- Позволяет отдельно отключить каждый тип изменения.
- Через **Copy diagnostics** даёт отчёт о найденных и изменённых элементах.

**Это эксперимент:** закрытые компоненты Discord могут использовать другой способ рисования виньетки. Локальные тесты проходят, но на реальном Android эта версия ещё не проверена. Возможны побочные изменения похожих градиентов в других частях Discord.

## Если виньетка остаётся

Откройте полноэкранную демонстрацию → **Revenge → Plugins → StreamClean → Copy diagnostics**. Скопируйте отчёт и сообщите версию Discord. В отчёте нет сообщений или содержимого трансляции.

## Содержимое

- `repo.json` — индекс репозитория для Revenge Classic;
- `builds/streamclean/manifest.json` — манифест формата `spec: 3`;
- `builds/streamclean/index.js` — исходный код и устанавливаемый JS;
- `tests/test.js` — локальные тесты, запускаемые командой `node tests/test.js`;
- `index.html` — страница каталога для GitHub Pages.

## Источники API

- https://github.com/revenge-mod/revenge-bundle
- https://github.com/LukasDerBaum42/discord-theme/tree/main/plugins/unrounding

Плагин не отправляет телеметрию, сообщения, данные аккаунта или видеопотоки. Отключение или удаление плагина снимает программные перехваты.
