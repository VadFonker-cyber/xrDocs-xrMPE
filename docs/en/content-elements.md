---
section: Examples
order: 20
summary: Example page with local images, tables, a gallery, and code blocks.
---

# Content Elements Example

This page shows the content elements supported by the documentation: local images, a compact information table, regular tables, a gallery, and code blocks.

![xrDocs icon](./assets/examples/xrdocs-icon.png)

## Quick Info

| Field | Value |
| --- | --- |
| Material type | Example document |
| Images | Stored in `public/assets/examples` |
| Markdown link | `./assets/examples/xrdocs-icon.png` |
| Theme variants | `xrdocs-icon.dark.png` and `xrdocs-icon.light.png` next to the base image |
| Purpose | Visual check for imported or manually written pages |

## Table

Column alignment is controlled by the separator row: `:---` aligns left, `:---:` centers, and `---:` aligns right.

| Element | Markdown | Use case |
| --- | --- | --- |
| Image | `![Description](./assets/examples/xrdocs-icon.png)` | Screenshots, diagrams, previews |
| Inline code | `` `gamedata/configs` `` | Paths, section names, commands |
| Code block | fenced code block | XML, LTX, Lua, and other snippets |

| Left | Center | Right |
| :--- | :---: | ---: |
| `sv_host_name` | `0/1` | `100` |
| `g_spawn` | `section` | `1 500` |

## Gallery

![Example image 1](./assets/examples/xrdocs-icon.png)

![Example image 2](./assets/examples/xrdocs-icon.png)

## XML Example

```xml
<specific_character id="actor_example" team_default="1">
  <name>st_actor_name</name>
  <visual>actors\stalker_mp\stalker_example</visual>
</specific_character>
```

## LTX Example

```ini
[actor_example]:mp_actor
$spawn = "actors\actor_example"
character_profile = actor_example
visual = actors\stalker_mp\stalker_example.ogf
```
