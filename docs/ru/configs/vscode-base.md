# Настройка VSCode/VSCodium

Эта страница описывает базовую настройку VSCode/VSCodium для работы с игровыми файлами.

```admonish warning
Не все игровые файлы можно полноценно открыть в VSCode/VSCodium. Например, для просмотра моделей, текстур, анимаций и видео часто нужны отдельные программы или расширения.
```

## Ассоциации файлов

Чтобы VSCode/VSCodium корректно подсвечивал файлы движка, добавьте ассоциации расширений в `settings.json`.

Открыть командную палитру можно сочетанием клавиш `Ctrl+Shift+P`. Затем откройте пользовательские настройки:

```text
Preferences: Open User Settings (JSON)
```

В файле `settings.json` укажите:

```json
{
  "files.associations": {
    "*.script": "lua",
    "*.ps": "hlsl",
    "*.cs": "hlsl",
    "*.gs": "hlsl",
    "*.vs": "hlsl",
    "*.s": "lua",
    "*.level": "ini",
    "*.ltx": "ini",
    "*.seq": "ini",
    "*.part": "ini",
    "*.part1": "ini"
  }
}
```

Если в `settings.json` уже есть другие настройки, добавьте только блок `"files.associations"` или объедините его с существующим одноименным блоком.

## Шаг 3: Установка расширений

Вам нужно установить следующие расширения:

1. [audio-preview by sukumo28](https://marketplace.visualstudio.com/items?itemName=sukumo28.wav-preview) - предоставляет более подробные данные об аудиофайлах. Нужно для файлов `.ogg`.

2. [LTX Support by AziatkaVictor](https://marketplace.visualstudio.com/items?itemName=AziatkaVictor.ltx-support) - добавляет поддержку файлов `.ltx`.
   - Расширение можно настроить. Для этого в его настройках нужно указать путь к скриптам игры.

3. Два расширения для Lua. Нужны для файлов `.script`:
   - [LUA by keyring](https://marketplace.visualstudio.com/items?itemName=keyring.Lua)
   - [LUA by yinfei](https://marketplace.visualstudio.com/items?itemName=yinfei.luahelper)

   - Для работы нужна полностью распакованная папка `scripts`. Также нужно создать workspace для проекта. Некоторые файлы всегда будут давать предупреждения об ошибках, например `lua_help`. Такой файл можно удалить или добавить в исключения расширения от yinfei.

4. [Open in External App by YuTengjing](https://marketplace.visualstudio.com/items?itemName=YuTengjing.open-in-external-app) - возможность открывать файл в других приложениях. Нужно для файлов `.ogf`, `.object`, `.dm`, `.omf`, `.dds`, `.thm`, `.ogm`.
   - Расширение можно настроить, прописав в `settings.json` в `"openInExternalApp.openMapper": [` нужные программы. Пример:

    ```json
    {
      "openInExternalApp.openMapper": [
        {
          "extensionName": "ogf",
          "apps": "D:\\Needed\\Modding Tools\\OGF.Editor\\OGF tool.exe"
        },
        {
          "extensionName": "object",
          "apps": "D:\\Needed\\Modding Tools\\Object.Editor.4.35\\Object tool.exe"
        },
        {
          "extensionName": "dm",
          "apps": "D:\\Needed\\Modding Tools\\OGF.Editor\\OGF tool.exe"
        },
        {
          "extensionName": "thm",
          "apps": "D:\\Needed\\Modding Tools\\THM_Editor_by_ValeroK\\THM Editor.exe"
        },
        {
          "extensionName": "dds",
          "apps": "C:\\Program Files\\paint.net\\paintdotnet.exe"
        },
        {
          "extensionName": "ogm",
          "apps": "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe"
        },
        {
          "extensionName": "omf",
          "apps": "D:\\Needed\\Modding Tools\\OMF.Editor.1.2\\OMF_Editor.exe"
        }
      ]
    }
    ```

5. Поддержка HLSL и предпросмотр шейдеров:
   - [Shader languages support for VS Code by slevesque](https://marketplace.visualstudio.com/items?itemName=slevesque.shader)
   - [HLSL preview by A2K](https://marketplace.visualstudio.com/items?itemName=A2K.hlsl-preview)

6. [TGA Image Preview by lunarwtr](https://marketplace.visualstudio.com/items?itemName=lunarwtr.tga-image-preview) - предпросмотр файлов `.tga`.

## Кодировка

Чтобы не менять глобальные настройки VSCode/VSCodium, можно создать workspace-файл для проекта.

1. Откройте папку проекта в VSCode/VSCodium.
2. Откройте командную палитру: `Ctrl+Shift+P`.
3. Выполните команду:

```text
Workspaces: Save Workspace As...
```

4. Сохраните файл, например `xrDocs.code-workspace`.

В workspace-файле можно указать настройки, которые будут применяться только при открытии этого workspace:

```json
{
  "folders": [
    {
      "path": "."
    }
  ],
  "settings": {
    "files.associations": {
      "*.script": "lua",
      "*.ps": "hlsl",
      "*.cs": "hlsl",
      "*.gs": "hlsl",
      "*.vs": "hlsl",
      "*.s": "lua",
      "*.level": "ini",
      "*.ltx": "ini",
      "*.seq": "ini",
      "*.part": "ini",
      "*.part1": "ini"
    },
    "files.encoding": "windows1251"
  }
}
```

После этого проект лучше открывать не как обычную папку, а через файл `xrDocs.code-workspace`.

Такой workspace-файл задает кодировку для всего проекта. Это удобно, если основная часть игровых конфигов хранится в `windows1251`.

Если в проекте встречаются файлы в разных кодировках, вместо жесткой настройки можно включить автоопределение в этом же workspace-файле:

```json
{
  "folders": [
    {
      "path": "."
    }
  ],
  "settings": {
    "files.autoGuessEncoding": true
  }
}
```
