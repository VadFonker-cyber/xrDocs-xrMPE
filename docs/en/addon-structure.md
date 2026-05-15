---
section: Basics
order: 2
summary: Basic folder layout for a modification.
---

# Addon Structure

A typical addon stores modified resources in `gamedata`. Keep the structure close to the original game layout: it makes files easier to compare, disable, and debug.

## Minimal layout

```text
gamedata/
  configs/
  scripts/
  meshes/
  textures/
  sounds/
```

## Practice

- Split changes by subsystem: weapons, NPCs, quests, interface.
- Keep temporary tests away from release files.
- Add a short note for conflicting configs that explains why the change exists.

> The fewer hidden dependencies between files, the easier it is to maintain the mod build.
