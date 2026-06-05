# Configuring VSCode/VSCodium for Game Files

This page describes the basic VSCode/VSCodium setup for working with game files.

> [!IMPORTANT]
> Not all game files can be fully opened in VSCode/VSCodium. For example, models, textures, animations, and videos often require separate programs or extensions.

## File Associations

To make VSCode/VSCodium highlight engine files correctly, add extension associations to `settings.json`.

Open the command palette with `Ctrl+Shift+P`. Then open user settings:

```text
Preferences: Open User Settings (JSON)
```

In the `settings.json` file, specify:

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

If `settings.json` already contains other settings, add only the `"files.associations"` block or merge it with the existing block of the same name.

## Step 3: Installing Extensions

You need to install the following extensions:

1. [audio-preview by sukumo28](https://marketplace.visualstudio.com/items?itemName=sukumo28.wav-preview) - provides more detailed data about audio files. Needed for `.ogg` files.

2. [LTX Support by AziatkaVictor](https://marketplace.visualstudio.com/items?itemName=AziatkaVictor.ltx-support) - adds support for `.ltx` files.
   - The extension can be configured. To do this, specify the path to the game scripts in its settings.

3. Two extensions for Lua. Needed for `.script` files:
   - [LUA by keyring](https://marketplace.visualstudio.com/items?itemName=keyring.Lua)
   - [LUA by yinfei](https://marketplace.visualstudio.com/items?itemName=yinfei.luahelper)

   - A fully unpacked `scripts` folder is required for proper work. You also need to create a workspace for your project. Some files will always show error warnings, for example `lua_help`. Such a file can be deleted or added to exclusions in the extension by yinfei.

4. [Open in External App by YuTengjing](https://marketplace.visualstudio.com/items?itemName=YuTengjing.open-in-external-app) - allows opening files in other applications. Needed for `.ogf`, `.object`, `.dm`, `.omf`, `.dds`, `.thm`, `.ogm` files.
   - The extension can be configured by writing the required programs in `settings.json` under `"openInExternalApp.openMapper": [`. Example:

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

5. HLSL support and shader preview:
   - [Shader languages support for VS Code by slevesque](https://marketplace.visualstudio.com/items?itemName=slevesque.shader)
   - [HLSL preview by A2K](https://marketplace.visualstudio.com/items?itemName=A2K.hlsl-preview)

6. [TGA Image Preview by lunarwtr](https://marketplace.visualstudio.com/items?itemName=lunarwtr.tga-image-preview) - preview for `.tga` files.

## Encoding

To avoid changing global VSCode/VSCodium settings, you can create a workspace file for the project.

1. Open the project folder in VSCode/VSCodium.
2. Open the command palette: `Ctrl+Shift+P`.
3. Run the command:

```text
Workspaces: Save Workspace As...
```

4. Save the file, for example as `xrDocs.code-workspace`.

In the workspace file, you can specify settings that will apply only when this workspace is opened:

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

After that, it is better to open the project through the `xrDocs.code-workspace` file instead of opening it as a regular folder.

This workspace file sets the encoding for the whole project. This is useful if most game configs are stored in `windows1251`.

If the project contains files in different encodings, you can enable automatic detection in the same workspace file instead of forcing one encoding:

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
