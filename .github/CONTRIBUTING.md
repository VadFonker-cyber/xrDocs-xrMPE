# Contributing Guide

English | [Русский](/doc/CONTRIBUTING.rus.md)

Thank you for your interest in xrDocs. The project accepts documentation fixes, new articles, navigation improvements, search updates, styling changes, and infrastructure work.

## Before you start

- Check open Issues and Pull Requests to avoid duplicate work.
- For larger changes, open an Issue first with a short proposal.
- For small typo or link fixes, opening a Pull Request directly is fine.

## Local development

```powershell
npm.cmd install
npm.cmd run dev
```

Build before opening a Pull Request:

```powershell
npm.cmd run build
```

On Windows PowerShell, use `npm.cmd` to avoid execution policy issues.

## Documentation

Every page should include frontmatter:

```md
---
section: Section
order: 10
summary: Short menu and search description.
---
```

Rules:

- The Markdown H1 is the page title.
- File names use lowercase kebab-case, for example `addon-structure.md`.
- Russian pages live in `docs/ru`; English pages live in `docs/en`.
- Keep translations at matching relative paths when possible.
- If a page needs a stable menu position, update the matching `init.md`.
- Write internal links to `.md` files, for example `[addon structure](addon-structure.md)`.

## Code

- TypeScript uses strict mode.
- Keep the existing structure: app logic in `src/main.ts`, styles in `src/styles.css`.
- Do not add backend dependencies: the project should remain a static site.
- Prefer explicit types for shared structures.
- Do not commit `dist/`, `node_modules/`, or log files.

## Pull requests

Include:

- the user-visible change;
- affected documentation files or languages.

CI automatically runs the production build for Pull Requests.

Use short, clear commit messages such as `Add English addon guide` or `Fix search result labels`.

## Conduct

By participating, follow [.github/CODE_OF_CONDUCT.md](/.github/CODE_OF_CONDUCT.md).
