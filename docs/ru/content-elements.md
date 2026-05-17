---
section: Примеры
order: 20
summary: Пример страницы с локальными изображениями, таблицами, галереей и блоками кода.
---

# Пример оформления страницы

Эта страница показывает, какие элементы можно использовать в документации: локальные изображения, краткую таблицу параметров, обычные таблицы, галерею и блоки кода.

![Иконка xrDocs](./assets/examples/xrdocs-icon.png)

## Краткая информация

| Поле | Значение |
| --- | --- |
| Тип материала | Пример документа |
| Изображения | Хранятся в `public/assets/examples` |
| Markdown-ссылка | `./assets/examples/xrdocs-icon.png` |
| Варианты темы | `xrdocs-icon.dark.png` и `xrdocs-icon.light.png` рядом с базовой картинкой |
| Назначение | Проверка оформления импортируемых или вручную написанных страниц |

## Таблица

Выравнивание колонок задаётся строкой-разделителем: `:---` выравнивает влево, `:---:` по центру, `---:` вправо.

| Элемент | Как писать | Для чего использовать |
| --- | --- | --- |
| Картинка | `![Описание](./assets/examples/xrdocs-icon.png)` | Скриншоты, схемы, превью |
| Inline-code | `` `gamedata/configs` `` | Пути, имена секций, команды |
| Code block | fenced code block | XML, LTX, Lua и другие фрагменты |

| Влево | По центру | Вправо |
| :--- | :---: | ---: |
| `sv_host_name` | `0/1` | `100` |
| `g_spawn` | `section` | `1 500` |

## Галерея

![Пример изображения 1](./assets/examples/xrdocs-icon.png)

![Пример изображения 2](./assets/examples/xrdocs-icon.png)

## Пример XML

```xml
<specific_character id="actor_example" team_default="1">
  <name>st_actor_name</name>
  <visual>actors\stalker_mp\stalker_example</visual>
</specific_character>
```

## Пример LTX

```ini
[actor_example]:mp_actor
$spawn = "actors\actor_example"
character_profile = actor_example
visual = actors\stalker_mp\stalker_example.ogf
```
