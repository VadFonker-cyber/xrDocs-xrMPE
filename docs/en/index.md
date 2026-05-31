# Quick Start

This site collects Markdown files from `docs/ru` for the Russian version and `docs/en` for the English version.

## Adding a page

1. Create a new file, for example `docs/en/weapons/ballistics.md`.
2. Write the article in regular Markdown.
3. Add the page to `docs/en/init.md`.

```md
# Weapon Ballistics
```

After the build, the document appears in the current language menu. Internal links to `.md` files are converted to document routes, for example [addon structure](addon-structure.md).

## GitHub Pages

The site does not need a backend. `npm.cmd run build` creates the `dist/` folder for GitHub Pages.
