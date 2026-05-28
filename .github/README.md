<div align="center">
  <h1>xrDocs</h1>

  <h4>Static documentation site for <i>S.T.A.L.K.E.R.</i> modding</h4>

  <p>
    English
    |
    <a href="https://github.com/VadFonker-cyber/xrDocs-xrMPE/blob/main/doc/README.rus.md">Русский</a>
  </p>

  <p>
    <img src="assets/xrdocs-icon.png" alt="xrDocs" width="128" />
  </p>

  <p>
    <a href="https://github.com/VadFonker-cyber/xrDocs-xrMPE/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" />
    </a>
    <a href="https://vite.dev/">
      <img src="https://img.shields.io/badge/Vite-7.3-646CFF.svg?logo=vite&logoColor=white" alt="Vite" />
    </a>
    <a href="https://www.typescriptlang.org/">
      <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6.svg?logo=typescript&logoColor=white" alt="TypeScript" />
    </a>
    <a href="https://github.com/VadFonker-cyber/xrDocs-xrMPE/actions/workflows/pages.yml">
      <img src="https://github.com/VadFonker-cyber/xrDocs-xrMPE/actions/workflows/pages.yml/badge.svg" alt="Deploy Pages" />
    </a>
  </p>
</div>

## Overview

xrDocs is a static documentation site for S.T.A.L.K.E.R. modding. Content is written in Markdown, split by language, and built by Vite into plain static files for GitHub Pages.

## Features

- Russian and English documentation
- Navigation from `docs/ru/init.md` and `docs/en/init.md`
- Hash routes that work well on GitHub Pages
- Search scoped to the current language
- Code highlighting via `highlight.js`
- No backend or server runtime

## Quick start

Requirements:

- Node.js 24 or newer
- npm
- Windows PowerShell or another terminal

On Windows PowerShell, use `npm.cmd` because `npm.ps1` can be blocked by the script execution policy.

```powershell
npm.cmd install
npm.cmd run dev
```

The local server usually opens at `http://127.0.0.1:5173/`.

You can also run:

```bat
dev.bat
```

The script installs dependencies if `node_modules` is missing and starts the dev server.

## Build

```powershell
npm.cmd run build
```

The command runs TypeScript checks and writes the production build to `dist/`.

To preview the production build locally:

```powershell
npm.cmd run preview
```

## Project layout

```text
src/main.ts                 client app, routing, search, Markdown loading
src/styles.css              interface styles
docs/ru/**/*.md             Russian documentation
docs/en/**/*.md             English documentation
docs/ru/init.md             Russian menu order
docs/en/init.md             English menu order
.github/workflows/pages.yml GitHub Pages build and deployment
public/                     static assets
```

The `init.md` files define menu order and section grouping. They are not rendered as articles.

## Adding a page

1. Create a Markdown file in the target language, for example `docs/en/weapons/ballistics.md`.
2. Add frontmatter.
3. Add an H1 heading. It is used as the page title.
4. If needed, add the page to `docs/en/init.md` and add the matching entry to `docs/ru/init.md`.

```md
---
section: Weapons
order: 10
summary: Accuracy, recoil, and damage parameters.
---

# Weapon Ballistics
```

Keep translations at matching relative paths when possible:

```text
docs/ru/addon-structure.md
docs/en/addon-structure.md
```

Internal links to `.md` files are automatically converted into site hash routes.

## Publishing

The `.github/workflows/pages.yml` workflow builds the project on pushes to `main` and publishes the `dist/` folder through GitHub Pages. In the repository settings, GitHub Pages should use **GitHub Actions** as its source.

## Changelog

All significant changes are documented in [.github/CHANGELOG.md](/.github/CHANGELOG.md).

## Contributing

Read [.github/CONTRIBUTING.md](/.github/CONTRIBUTING.md) before making changes. Use GitHub Issues for bug reports and proposals.

## License

Code and documentation are licensed under the [MIT License](/LICENSE).
