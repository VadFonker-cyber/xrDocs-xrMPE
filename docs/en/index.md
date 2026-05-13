---
title: Quick Start
section: Basics
order: 1
tags: workflow, github pages, markdown
summary: How to add pages and build the static site.
---

# Quick Start

This site collects Markdown files from `docs/ru` for the Russian version and `docs/en` for the English version.

## Adding a page

1. Create a new file, for example `docs/en/weapons/ballistics.md`.
2. Add frontmatter at the top of the file.
3. Write the article in regular Markdown.

```md
---
title: Weapon Ballistics
section: Weapons
order: 10
tags: weapons, configs
summary: Accuracy, recoil, and damage parameters.
---

# Weapon Ballistics
```

After the build, the document appears in the current language menu. Internal links to `.md` files are converted to hash routes, for example [addon structure](addon-structure.md).

## GitHub Pages

The site does not need a backend. `npm.cmd run build` creates the `dist/` folder for GitHub Pages.
