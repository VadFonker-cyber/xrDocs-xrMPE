import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import './styles.css';

type Lang = 'ru' | 'en';
type Theme = 'dark' | 'light';

type DocMeta = {
  section: string;
  order: number;
  summary: string;
};

type Doc = {
  id: string;
  lang: Lang;
  path: string;
  title: string;
  content: string;
  meta: DocMeta;
};

type Route = {
  lang: Lang;
  id: string;
};

type NavEntry = {
  order: number;
  section?: string;
};

type SearchResult = {
  doc: Doc;
  score: number;
  excerpt: string;
};

type NavConfig = Record<Lang, Map<string, NavEntry>>;

const githubUrl = 'https://github.com/VadFonker/xrDocs';

const markdownFiles = import.meta.glob('../docs/{ru,en}/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const labels: Record<Lang, Record<string, string>> = {
  ru: {
    ariaNav: 'Навигация по документации',
    ariaInfo: 'Информация о документе',
    search: 'Поиск по базе',
    searchResults: 'Результаты поиска',
    kicker: 'Markdown база знаний',
    file: 'Файл',
    section: 'Раздел',
    materials: 'Материалы',
    empty: 'Ничего не найдено.',
    menu: 'Меню',
    untitled: 'Без названия',
    defaultSection: 'Материалы',
    fallbackSummary: 'Добавьте Markdown-файлы в docs/ru или docs/en.',
    fallbackBody: 'Создайте файлы в `docs/ru` и `docs/en`, и они появятся в навигации после сборки.',
  },
  en: {
    ariaNav: 'Documentation navigation',
    ariaInfo: 'Document information',
    search: 'Search knowledge base',
    searchResults: 'Search results',
    kicker: 'Markdown knowledge base',
    file: 'File',
    section: 'Section',
    materials: 'Documents',
    empty: 'No results found.',
    menu: 'Menu',
    untitled: 'Untitled',
    defaultSection: 'Materials',
    fallbackSummary: 'Add Markdown files to docs/ru or docs/en.',
    fallbackBody: 'Create files in `docs/ru` and `docs/en`, and they will appear in navigation after build.',
  },
};

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  langPrefix: 'language-',
  highlight: highlightCode,
});

const navConfig = createNavConfig(markdownFiles);

let docs = Object.entries(markdownFiles)
  .filter(([path]) => !isInitFile(path))
  .map(([path, content]) => createDoc(path, content))
  .sort(compareDocs);

if (docs.length === 0) {
  docs = [
    createDoc(
      '../docs/ru/start.md',
      [
        '---',
        'section: База',
        'order: 1',
        `summary: ${labels.ru.fallbackSummary}`,
        '---',
        '',
        '# Старт',
        '',
        labels.ru.fallbackBody,
      ].join('\n'),
    ),
    createDoc(
      '../docs/en/start.md',
      [
        '---',
        'section: Basics',
        'order: 1',
        `summary: ${labels.en.fallbackSummary}`,
        '---',
        '',
        '# Start',
        '',
        labels.en.fallbackBody,
      ].join('\n'),
    ),
  ];
}

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found.');
}

const appRoot = app;
const initialRoute = readRoute();
const state = {
  search: '',
  lang: initialRoute.lang,
  activeId: initialRoute.id || getDocsByLang(initialRoute.lang)[0]?.id || docs[0].id,
  navOpen: false,
  theme: readTheme(),
};

document.documentElement.dataset.theme = state.theme;
renderShell();
render();

window.addEventListener('hashchange', () => {
  const route = readRoute();
  state.lang = route.lang;
  state.activeId = route.id || getDocsByLang(route.lang)[0]?.id || docs[0].id;
  render();
});

function createDoc(path: string, raw: string): Doc {
  const { meta, content } = parseFrontmatter(raw);
  const cleanPath = path.replace('../docs/', 'docs/');
  const match = cleanPath.match(/^docs\/(ru|en)\/(.+)\.md$/);
  const lang = (match?.[1] || 'ru') as Lang;
  const id = match?.[2] || cleanPath.replace(/^docs\//, '').replace(/\.md$/, '');
  const navEntry = navConfig[lang].get(id);

  return {
    id,
    lang,
    path: cleanPath,
    title: extractTitle(content) || labels[lang].untitled,
    content,
    meta: {
      summary: '',
      ...meta,
      section: navEntry?.section || String(meta.section || labels[lang].defaultSection),
      order: navEntry?.order ?? Number(meta.order || 999),
    },
  };
}

function compareDocs(a: Doc, b: Doc): number {
  if (a.lang !== b.lang) {
    return a.lang.localeCompare(b.lang);
  }

  const aNav = navConfig[a.lang].get(a.id);
  const bNav = navConfig[b.lang].get(b.id);

  if (aNav || bNav) {
    return (aNav?.order ?? 9999) - (bNav?.order ?? 9999);
  }

  if (a.meta.section !== b.meta.section) {
    return a.meta.section.localeCompare(b.meta.section, a.lang);
  }

  if (a.meta.order !== b.meta.order) {
    return a.meta.order - b.meta.order;
  }

  return a.title.localeCompare(b.title, a.lang);
}

function createNavConfig(files: Record<string, string>): NavConfig {
  const config: NavConfig = {
    ru: new Map(),
    en: new Map(),
  };

  for (const [path, content] of Object.entries(files)) {
    if (!isInitFile(path)) {
      continue;
    }

    const lang = getLangFromPath(path);
    parseInit(content, lang).forEach((entry, id) => {
      config[lang].set(id, entry);
    });
  }

  return config;
}

function parseInit(content: string, lang: Lang): Map<string, NavEntry> {
  const entries = new Map<string, NavEntry>();
  let order = 0;
  let currentSection: string | undefined;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    const link = line.match(/^\s*[-*]\s+\[([^\]]+)\]\(([^)]+\.md)\)/);

    if (heading) {
      currentSection = heading[1].trim();
      continue;
    }

    if (!link) {
      continue;
    }

    const id = normalizeDocId(link[2], lang);

    if (id && id !== 'init') {
      entries.set(id, {
        order,
        section: currentSection,
      });
      order += 1;
    }
  }

  return entries;
}

function isInitFile(path: string): boolean {
  return /\/init\.md$|\\init\.md$/.test(path);
}

function getLangFromPath(path: string): Lang {
  return path.includes('/en/') || path.includes('\\en\\') ? 'en' : 'ru';
}

function normalizeDocId(path: string, lang: Lang): string {
  return path
    .split('#')[0]
    .replace(/^\.\//, '')
    .replace(/^docs\//, '')
    .replace(new RegExp(`^${lang}/`), '')
    .replace(/^(ru|en)\//, '')
    .replace(/\.md$/, '');
}

function parseFrontmatter(raw: string): { meta: Partial<DocMeta>; content: string } {
  if (!raw.startsWith('---')) {
    return { meta: {}, content: raw };
  }

  const end = raw.indexOf('\n---', 3);

  if (end === -1) {
    return { meta: {}, content: raw };
  }

  const block = raw.slice(3, end).trim();
  const content = raw.slice(end + 4).replace(/^\s+/, '');
  const meta: Record<string, string> = {};

  for (const line of block.split('\n')) {
    const separator = line.indexOf(':');

    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    meta[key] = value;
  }

  return { meta: meta as Partial<DocMeta>, content };
}

function extractTitle(content: string): string {
  const heading = content.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : '';
}

function renderShell(): void {
  const copy = labels[state.lang];

  appRoot.innerHTML = `
    <div class="layout" data-nav-open="false">
      <button id="navOverlay" class="nav-overlay" type="button" aria-label="Close navigation"></button>
      <aside class="sidebar" aria-label="${copy.ariaNav}">
        <div class="brand">
          <img class="brand-mark" src="./xrdocs-icon.png" alt="" aria-hidden="true" />
          <div>
            <div class="brand-title">xrDocs</div>
            <div class="brand-subtitle">S.T.A.L.K.E.R. modding</div>
          </div>
        </div>

        <div class="search-panel">
          <label class="search">
            <span class="search-icon" aria-hidden="true"></span>
            <input id="searchInput" type="search" placeholder="${copy.search}" autocomplete="off" />
          </label>
        </div>

        <nav id="docNav" class="doc-nav"></nav>
      </aside>

      <main class="workspace">
        <section class="topbar">
          <div>
            <div id="pageKicker" class="kicker">${copy.kicker}</div>
          </div>
          <div class="topbar-controls">
            <button id="navToggle" class="control-button nav-toggle" type="button" aria-label="${copy.menu}" aria-expanded="false">
              <span class="menu-icon" aria-hidden="true"></span>
              <span>${copy.menu}</span>
            </button>
            <button id="languageToggle" class="control-button" type="button" aria-label="Switch language"></button>
            <button id="themeToggle" class="icon-button" type="button" aria-label="Switch theme" title="Switch theme"></button>
            <a class="icon-button" href="${githubUrl}" target="_blank" rel="noreferrer" aria-label="GitHub" title="GitHub">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.38-3.37-1.38-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.93.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.31.1-2.72 0 0 .84-.28 2.75 1.05A9.38 9.38 0 0 1 12 6.96c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.46.1 2.72.64.72 1.03 1.64 1.03 2.76 0 3.94-2.34 4.8-4.57 5.06.36.32.68.95.68 1.91 0 1.38-.01 2.49-.01 2.83 0 .27.18.59.69.49A10.16 10.16 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
              </svg>
            </a>
          </div>
        </section>

        <section class="content-grid">
          <article id="docArticle" class="doc-article"></article>
        </section>
      </main>
    </div>
  `;

  document.querySelector<HTMLInputElement>('#searchInput')?.addEventListener('input', (event) => {
    state.search = (event.currentTarget as HTMLInputElement).value;
    renderNav();
  });

  document.querySelector<HTMLButtonElement>('#navToggle')?.addEventListener('click', () => {
    setNavOpen(!state.navOpen);
  });

  document.querySelector<HTMLButtonElement>('#navOverlay')?.addEventListener('click', () => {
    setNavOpen(false);
  });

  document.querySelector<HTMLButtonElement>('#languageToggle')?.addEventListener('click', () => {
    switchLanguage(state.lang === 'ru' ? 'en' : 'ru');
  });

  document.querySelector<HTMLButtonElement>('#themeToggle')?.addEventListener('click', () => {
    switchTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setNavOpen(false);
    }
  });
}

function render(): void {
  const langDocs = getDocsByLang(state.lang);
  const activeDoc = langDocs.find((doc) => doc.id === state.activeId) || langDocs[0] || docs[0];

  if (!activeDoc) {
    return;
  }

  if (activeDoc.lang !== state.lang || activeDoc.id !== state.activeId) {
    state.lang = activeDoc.lang;
    state.activeId = activeDoc.id;
    history.replaceState(null, '', `#/${activeDoc.lang}/${activeDoc.id}`);
  }

  const copy = labels[state.lang];
  localStorage.setItem('xrDocsLang', state.lang);
  document.documentElement.lang = state.lang;
  document.documentElement.dataset.theme = state.theme;
  document.title = `${activeDoc.title} | xrDocs`;
  setNavOpen(state.navOpen);

  setText('#pageKicker', copy.kicker);

  const searchInput = document.querySelector<HTMLInputElement>('#searchInput');
  if (searchInput) {
    searchInput.placeholder = copy.search;
    searchInput.value = state.search;
  }

  renderTopbarControls();

  const article = document.querySelector<HTMLElement>('#docArticle');
  if (article) {
    article.innerHTML = rewriteDocLinks(md.render(activeDoc.content), state.lang);
  }

  renderNav();
}

function renderTopbarControls(): void {
  const languageToggle = document.querySelector<HTMLButtonElement>('#languageToggle');
  if (languageToggle) {
    languageToggle.textContent = state.lang.toUpperCase();
    languageToggle.title = state.lang === 'ru' ? 'Switch to English' : 'Switch to Russian';
  }

  const navToggle = document.querySelector<HTMLButtonElement>('#navToggle');
  if (navToggle) {
    navToggle.setAttribute('aria-label', labels[state.lang].menu);
    const label = navToggle.querySelector('span:last-child');
    if (label) {
      label.textContent = labels[state.lang].menu;
    }
  }

  const themeToggle = document.querySelector<HTMLButtonElement>('#themeToggle');
  if (themeToggle) {
    themeToggle.innerHTML = getThemeIcon(state.theme);
    themeToggle.title = state.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  }
}

function getThemeIcon(theme: Theme): string {
  if (theme === 'dark') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20.2 14.4A7.7 7.7 0 0 1 9.6 3.8 8.5 8.5 0 1 0 20.2 14.4Z" />
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0-3a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 17a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM3 11h1a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2Zm17 0h1a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2ZM5.64 4.22l.7.7A1 1 0 1 1 4.93 6.34l-.7-.7a1 1 0 0 1 1.41-1.42Zm13.43 13.43.7.7a1 1 0 0 1-1.41 1.42l-.7-.7a1 1 0 0 1 1.41-1.42ZM19.78 5.64l-.7.7a1 1 0 0 1-1.42-1.41l.7-.7a1 1 0 0 1 1.42 1.41ZM6.34 19.07l-.7.7a1 1 0 0 1-1.42-1.41l.7-.7a1 1 0 0 1 1.42 1.41Z" />
    </svg>
  `;
}

function renderNav(): void {
  const nav = document.querySelector<HTMLElement>('#docNav');

  if (!nav) {
    return;
  }

  const query = state.search.trim();

  if (query) {
    renderSearchResults(nav, query);
    return;
  }

  const groups = new Map<string, Doc[]>();

  for (const doc of getDocsByLang(state.lang)) {
    const group = groups.get(doc.meta.section) || [];
    group.push(doc);
    groups.set(doc.meta.section, group);
  }

  nav.innerHTML = Array.from(groups.entries())
    .map(([section, sectionDocs]) => {
      const links = sectionDocs
        .map((doc) => {
          const active = doc.id === state.activeId ? ' aria-current="page"' : '';

          return `
            <a class="doc-link" href="#/${doc.lang}/${doc.id}"${active}>
              <span>${escapeHtml(doc.title)}</span>
              <small>${escapeHtml(doc.meta.summary || doc.path)}</small>
            </a>
          `;
        })
        .join('');

      return `
        <section class="nav-section">
          <h2>${escapeHtml(section)}</h2>
          ${links}
        </section>
      `;
    })
    .join('');

  if (!getDocsByLang(state.lang).length) {
    nav.innerHTML = `<p class="empty">${labels[state.lang].empty}</p>`;
  }

  nav.querySelectorAll<HTMLAnchorElement>('a.doc-link').forEach((link) => {
    link.addEventListener('click', () => {
      setNavOpen(false);
    });
  });
}

function renderSearchResults(nav: HTMLElement, query: string): void {
  const results = getSearchResults(query);

  if (!results.length) {
    nav.innerHTML = `<p class="empty">${labels[state.lang].empty}</p>`;
    return;
  }

  nav.innerHTML = `
    <section class="nav-section search-results">
      <h2>${escapeHtml(labels[state.lang].searchResults)} <span>${results.length}</span></h2>
      ${results
        .map(({ doc, excerpt }) => {
          const active = doc.id === state.activeId ? ' aria-current="page"' : '';

          return `
            <a class="doc-link search-result" href="#/${doc.lang}/${doc.id}"${active}>
              <span>${highlight(doc.title, query, state.lang)}</span>
              <small>${escapeHtml(doc.meta.section)} · ${escapeHtml(doc.path)}</small>
              <p>${highlight(excerpt, query, state.lang)}</p>
            </a>
          `;
        })
        .join('')}
    </section>
  `;

  nav.querySelectorAll<HTMLAnchorElement>('a.doc-link').forEach((link) => {
    link.addEventListener('click', () => {
      setNavOpen(false);
    });
  });
}

function getSearchResults(query: string): SearchResult[] {
  const normalizedQuery = normalizeSearch(query, state.lang);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);

  if (!terms.length) {
    return [];
  }

  return getDocsByLang(state.lang)
    .map((doc) => {
      const title = normalizeSearch(doc.title, state.lang);
      const section = normalizeSearch(doc.meta.section, state.lang);
      const summary = normalizeSearch(doc.meta.summary, state.lang);
      const content = normalizeSearch(stripMarkdown(doc.content), state.lang);
      let score = 0;

      for (const term of terms) {
        if (title.includes(term)) {
          score += 80;
        }

        if (section.includes(term)) {
          score += 35;
        }

        if (summary.includes(term)) {
          score += 25;
        }

        if (content.includes(term)) {
          score += 10;
        }
      }

      return {
        doc,
        score,
        excerpt: createExcerpt(doc, terms),
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || compareDocs(a.doc, b.doc));
}

function createExcerpt(doc: Doc, terms: string[]): string {
  const text = [doc.meta.summary, stripMarkdown(doc.content)].filter(Boolean).join(' ');
  const normalized = normalizeSearch(text, doc.lang);
  const firstMatch = terms
    .map((term) => normalized.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const start = Math.max(0, (firstMatch ?? 0) - 70);
  const end = Math.min(text.length, start + 180);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';

  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/^---[\s\S]*?\n---/, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[#>*_~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSearch(value: string, lang: Lang): string {
  return value.toLocaleLowerCase(lang).replace(/\s+/g, ' ').trim();
}

function highlight(value: string, query: string, lang: Lang): string {
  const terms = normalizeSearch(query, lang)
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);

  if (!terms.length) {
    return escapeHtml(value);
  }

  const pattern = new RegExp(`(${terms.join('|')})`, 'giu');
  return escapeHtml(value).replace(pattern, '<mark>$1</mark>');
}

function highlightCode(source: string, language: string): string {
  const lang = language.trim().toLowerCase();

  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(source, { language: lang, ignoreIllegals: true }).value;
    }

    return hljs.highlightAuto(source).value;
  } catch {
    return escapeHtml(source);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function switchLanguage(nextLang: Lang): void {
  if (nextLang === state.lang) {
    return;
  }

  const nextDocs = getDocsByLang(nextLang);
  const nextDoc = nextDocs.find((doc) => doc.id === state.activeId) || nextDocs[0];

  if (!nextDoc) {
    return;
  }

  state.lang = nextLang;
  state.activeId = nextDoc.id;
  history.pushState(null, '', `#/${nextLang}/${nextDoc.id}`);
  render();
}

function switchTheme(nextTheme: Theme): void {
  if (nextTheme === state.theme) {
    return;
  }

  state.theme = nextTheme;
  localStorage.setItem('xrDocsTheme', nextTheme);
  document.documentElement.dataset.theme = nextTheme;
  render();
}

function setNavOpen(open: boolean): void {
  state.navOpen = open;
  document.querySelector<HTMLElement>('.layout')?.setAttribute('data-nav-open', String(open));
  document.querySelector<HTMLButtonElement>('#navToggle')?.setAttribute('aria-expanded', String(open));
}

function getDocsByLang(lang: Lang): Doc[] {
  return docs.filter((doc) => doc.lang === lang);
}

function readRoute(): Route {
  const value = decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\.md$/, '');
  const [maybeLang, ...rest] = value.split('/').filter(Boolean);
  const savedLang = localStorage.getItem('xrDocsLang') === 'en' ? 'en' : 'ru';

  if (maybeLang === 'ru' || maybeLang === 'en') {
    return {
      lang: maybeLang,
      id: rest.join('/'),
    };
  }

  return {
    lang: savedLang,
    id: value,
  };
}

function readTheme(): Theme {
  return localStorage.getItem('xrDocsTheme') === 'light' ? 'light' : 'dark';
}

function rewriteDocLinks(html: string, currentLang: Lang): string {
  return html.replace(/href="([^"]+)\.md"/g, (_match, link: string) => {
    const normalized = link
      .replace(/^\.\//, '')
      .replace(/^docs\//, '')
      .replace(/^(ru|en)\//, '');

    return `href="#/${currentLang}/${normalized}"`;
  });
}

function setText(selector: string, value: string): void {
  const element = document.querySelector(selector);

  if (element) {
    element.textContent = value;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
