import themeAssetManifest from './generated/theme-assets.json';
import { collectEvent, collectPageView, initStatistics } from './statistics';
import { labels, type LabelKey } from './locales';
import { compareDocs, docs, findNavNodePath, getDocByKey, getDocsByLang, navTree, type Doc, type Lang, type NavNode } from './docs';
import './styles.css';

type Theme = 'dark' | 'light';
type ThemePreference = Theme | 'auto';

type Route = {
  lang: Lang;
  id: string;
};

type SearchResult = {
  doc: Doc;
  score: number;
  excerpt: string;
};

type SearchIndexEntry = {
  id: string;
  lang: Lang;
  path: string;
  title: string;
  section: string;
  summary: string;
  text: string;
  searchText?: string;
};

type SearchIndex = {
  docs: SearchIndexEntry[];
};

type TocItem = {
  id: string;
  title: string;
  level: number;
  children: TocItem[];
  parentId?: string;
};

type RenderedDoc = {
  html: string;
  toc: TocItem[];
};

const githubUrl = 'https://github.com/VadFonker-cyber/xrDocs-xrMPE';
const basePath = normalizeBasePath(import.meta.env.BASE_URL);
const themeAssetExtensions = 'avif|gif|jpe?g|png|svg|webp';
const themeAssetPaths = new Set((themeAssetManifest as string[]).map(normalizeAssetManifestPath));
const siteMeta: Record<Lang, { description: string; locale: string }> = {
  ru: {
    description: 'Документация по моддингу S.T.A.L.K.E.R. для xrMPE.',
    locale: 'ru_RU',
  },
  en: {
    description: 'S.T.A.L.K.E.R. modding documentation for xrMPE.',
    locale: 'en_US',
  },
};

let lastCollectedPage = '';
let searchStatisticsTimer: number | undefined;
let lastCollectedSearch = '';
let searchIndexPromise: Promise<SearchIndexEntry[]> | undefined;
let searchEntries: SearchIndexEntry[] | undefined;
let searchRenderRequest = 0;
let headingObserver: IntersectionObserver | undefined;
let headingObserverFrame: number | undefined;
let currentTocDocKey = '';
let currentTocItems: TocItem[] = [];
let articleRenderRequest = 0;
const renderedDocCache = new Map<string, RenderedDoc>();
const renderedDocFetches = new Map<string, Promise<RenderedDoc>>();
const minTocWidth = 280;
const maxTocWidth = 560;

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
  tocOpen: readTocOpen(),
  tocSearchOpen: false,
  tocWidth: readTocWidth(),
  tocQuery: '',
  tocCollapsedIds: new Set<string>(),
  navExpandedIds: new Set<string>(),
  activeHeadingId: '',
  theme: readTheme(),
};
const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: light)');

document.documentElement.dataset.theme = getResolvedTheme();
initStatistics();
renderShell();
render();

window.addEventListener('hashchange', () => {
  const route = readRoute();
  state.lang = route.lang;
  state.activeId = route.id || getDocsByLang(route.lang)[0]?.id || docs[0].id;
  render();
});

window.addEventListener('popstate', () => {
  const route = readRoute();
  state.lang = route.lang;
  state.activeId = route.id || getDocsByLang(route.lang)[0]?.id || docs[0].id;
  render();
});

colorSchemeQuery.addEventListener('change', () => {
  if (state.theme === 'auto') {
    document.documentElement.dataset.theme = getResolvedTheme();
    const activeDoc = getActiveDoc();
    if (activeDoc) {
      renderTopbarControls(activeDoc);
    }
    updateThemeAssets(appRoot);
  }
});

function renderShell(): void {
  const copy = labels[state.lang];
  const activeDoc = getActiveDoc();
  const prerenderedArticle = appRoot.querySelector<HTMLElement>('#docArticle');
  const prerenderedDocKey = prerenderedArticle?.dataset.docKey;
  const shouldKeepPrerenderedArticle = activeDoc && prerenderedDocKey === getDocCacheKey(activeDoc);
  const prerenderedArticleHtml = shouldKeepPrerenderedArticle ? prerenderedArticle?.innerHTML || '' : '';
  const prerenderedArticleAttributes = shouldKeepPrerenderedArticle
    ? ` data-doc-key="${escapeHtml(prerenderedDocKey || '')}" data-prerendered="true"`
    : '';

  appRoot.innerHTML = `
    <div class="layout" data-nav-open="false" data-toc-open="${state.tocOpen}" style="--toc-width: ${state.tocWidth}px">
      <button id="navOverlay" class="nav-overlay" type="button" aria-label="${copy['aria.closeNavigation']}"></button>
      <button id="tocOverlay" class="toc-overlay" type="button" aria-label="${copy['aria.closeContents']}"></button>
      <aside class="sidebar" aria-label="${copy['aria.nav']}">
        <div class="brand">
          <picture>
            <source srcset="${getAssetUrl('./xrdocs-brand.webp')}" type="image/webp" />
            <img class="brand-mark" src="${getAssetUrl('./xrdocs-brand.png')}" width="42" height="42" alt="" aria-hidden="true" />
          </picture>
          <div>
            <div class="brand-title">xrDocs</div>
            <div class="brand-subtitle">S.T.A.L.K.E.R. modding</div>
          </div>
        </div>

        <div class="search-panel">
          <label class="search">
            <span class="search-icon" aria-hidden="true"></span>
            <input id="searchInput" type="search" placeholder="${copy['search.placeholder']}" autocomplete="off" />
          </label>
        </div>

        <nav id="docNav" class="doc-nav"></nav>
      </aside>

      <main class="workspace">
        <section class="topbar">
          <div class="topbar-controls">
            <button id="navToggle" class="control-button nav-toggle" type="button" aria-label="${copy['menu.label']}" aria-expanded="false">
              <span class="menu-icon" aria-hidden="true"></span>
              <span>${copy['menu.label']}</span>
            </button>
            <button id="languageToggle" class="control-button" type="button" aria-label="${copy['aria.switchLanguage']}"></button>
            <button id="themeToggle" class="icon-button" type="button" aria-label="${copy['aria.switchTheme']}" title="${copy['aria.switchTheme']}"></button>
            <button id="tocToggle" class="icon-button toc-toggle" type="button" aria-label="${getLabel(state.lang, 'toc.toggle')}" title="${getLabel(state.lang, 'toc.toggle')}" aria-expanded="${state.tocOpen}">
              <span class="toc-icon" aria-hidden="true"></span>
            </button>
            <a class="icon-button" href="${githubUrl}" target="_blank" rel="noreferrer" aria-label="GitHub" title="GitHub">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.38-3.37-1.38-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.93.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.31.1-2.72 0 0 .84-.28 2.75 1.05A9.38 9.38 0 0 1 12 6.96c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.46.1 2.72.64.72 1.03 1.64 1.03 2.76 0 3.94-2.34 4.8-4.57 5.06.36.32.68.95.68 1.91 0 1.38-.01 2.49-.01 2.83 0 .27.18.59.69.49A10.16 10.16 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
              </svg>
            </a>
          </div>
        </section>

        <section class="content-grid">
          <article id="docArticle" class="doc-article"${prerenderedArticleAttributes}>${prerenderedArticleHtml}</article>
        </section>
      </main>

      <aside id="tocPanel" class="toc-panel" aria-label="${getLabel(state.lang, 'toc.title')}">
        <div id="tocResizeHandle" class="toc-resize-handle" role="separator" aria-orientation="vertical" aria-label="${getLabel(state.lang, 'aria.resizeContents')}"></div>
        <div class="toc-header">
          <h2>${getLabel(state.lang, 'toc.title')}</h2>
          <div class="toc-actions">
            <button id="tocSearchToggle" class="icon-button" type="button" aria-label="${getLabel(state.lang, 'toc.search')}" title="${getLabel(state.lang, 'toc.search')}" aria-pressed="false">
              <span class="search-icon" aria-hidden="true"></span>
            </button>
            <button id="tocCollapseToggle" class="icon-button toc-collapse-toggle" type="button"></button>
          </div>
        </div>
        <label class="search toc-search">
          <span class="search-icon" aria-hidden="true"></span>
          <input id="tocSearchInput" type="search" placeholder="${getLabel(state.lang, 'toc.search')}" autocomplete="off" />
        </label>
        <nav id="tocNav" class="toc-nav"></nav>
      </aside>
    </div>
  `;

  document.querySelector<HTMLInputElement>('#searchInput')?.addEventListener('input', (event) => {
    state.search = (event.currentTarget as HTMLInputElement).value;
    renderNav();
  });

  document.querySelector<HTMLInputElement>('#searchInput')?.addEventListener('focus', () => {
    void loadSearchIndex();
  });

  document.querySelector<HTMLElement>('#docNav')?.addEventListener('click', (event) => {
    const toggle = (event.target as Element | null)?.closest<HTMLButtonElement>('button.nav-item-toggle');

    if (toggle) {
      const id = toggle.dataset.navId;

      if (!id) {
        return;
      }

      if (state.navExpandedIds.has(id)) {
        state.navExpandedIds.delete(id);
      } else {
        state.navExpandedIds.add(id);
      }

      const expanded = state.navExpandedIds.has(id);
      const item = toggle.closest<HTMLElement>('.nav-item');
      toggle.setAttribute('aria-expanded', String(expanded));
      item?.setAttribute('data-expanded', String(expanded));
      return;
    }

    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a.doc-link');

    if (!link) {
      return;
    }

    navigateToLink(event, link);
    setNavOpen(false);
  });

  document.querySelector<HTMLButtonElement>('#navToggle')?.addEventListener('click', () => {
    setNavOpen(!state.navOpen);
  });

  document.querySelector<HTMLButtonElement>('#navOverlay')?.addEventListener('click', () => {
    setNavOpen(false);
  });

  document.querySelector<HTMLButtonElement>('#tocOverlay')?.addEventListener('click', () => {
    setTocOpen(false);
  });

  document.querySelector<HTMLButtonElement>('#tocToggle')?.addEventListener('click', () => {
    setTocOpen(!state.tocOpen);
  });

  document.querySelector<HTMLElement>('#tocResizeHandle')?.addEventListener('pointerdown', startTocResize);

  document.querySelector<HTMLButtonElement>('#tocSearchToggle')?.addEventListener('click', () => {
    state.tocSearchOpen = !state.tocSearchOpen;

    if (!state.tocSearchOpen) {
      state.tocQuery = '';
    }

    renderToc();

    if (state.tocSearchOpen) {
      document.querySelector<HTMLInputElement>('#tocSearchInput')?.focus();
    }
  });

  document.querySelector<HTMLInputElement>('#tocSearchInput')?.addEventListener('input', (event) => {
    state.tocQuery = (event.currentTarget as HTMLInputElement).value;
    renderToc();
  });

  document.querySelector<HTMLElement>('#tocNav')?.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    const toggle = target?.closest<HTMLButtonElement>('button.toc-item-toggle');

    if (toggle) {
      const id = toggle.dataset.headingId;

      if (!id) {
        return;
      }

      if (state.tocCollapsedIds.has(id)) {
        state.tocCollapsedIds.delete(id);
      } else {
        state.tocCollapsedIds.add(id);
      }

      renderToc();
      return;
    }

    const link = target?.closest<HTMLAnchorElement>('a.toc-link');
    if (!link) {
      return;
    }

    event.preventDefault();
    const id = link.dataset.headingId;
    const heading = id ? document.getElementById(id) : null;

    if (!id || !heading) {
      return;
    }

    setActiveHeading(id);
    history.replaceState(null, '', `${location.pathname}#${encodeURIComponent(id)}`);
    heading.scrollIntoView({ block: 'start', behavior: 'smooth' });

    if (window.matchMedia('(max-width: 1100px)').matches) {
      setTocOpen(false);
    }
  });

  document.querySelector<HTMLButtonElement>('#languageToggle')?.addEventListener('click', () => {
    switchLanguage(state.lang === 'ru' ? 'en' : 'ru');
  });

  document.querySelector<HTMLButtonElement>('#themeToggle')?.addEventListener('click', () => {
    switchTheme(getNextThemePreference(state.theme));
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setNavOpen(false);
      setTocOpen(false);
    }
  });
}

function render(): void {
  const activeDoc = getActiveDoc();

  if (!activeDoc) {
    return;
  }

  if (activeDoc.lang !== state.lang || activeDoc.id !== state.activeId) {
    state.lang = activeDoc.lang;
    state.activeId = activeDoc.id;
    history.replaceState(null, '', getDocUrl(activeDoc.lang, activeDoc.id));
  }

  const copy = labels[state.lang];
  localStorage.setItem('xrDocsLang', state.lang);
  document.documentElement.lang = state.lang;
  document.documentElement.dataset.theme = getResolvedTheme();
  document.title = `${activeDoc.title} | xrDocs`;
  updateDocumentMeta(activeDoc);
  setNavOpen(state.navOpen);
  setTocOpen(state.tocOpen, false);

  const tocDocKey = `${activeDoc.lang}:${activeDoc.id}`;
  if (tocDocKey !== currentTocDocKey) {
    currentTocDocKey = tocDocKey;
    state.tocQuery = '';
    state.tocCollapsedIds = new Set<string>();
    state.activeHeadingId = '';
    currentTocItems = [];
    headingObserver?.disconnect();
    cancelScheduledHeadingObserver();
  }

  const searchInput = document.querySelector<HTMLInputElement>('#searchInput');
  if (searchInput) {
    searchInput.placeholder = copy['search.placeholder'];
    searchInput.value = state.search;
  }

  updateShellLabels();
  renderTopbarControls(activeDoc);
  renderNav();
  renderToc();
  collectCurrentPage(activeDoc);
  void renderActiveArticle(activeDoc);
}

async function renderActiveArticle(activeDoc: Doc): Promise<void> {
  const request = ++articleRenderRequest;
  const article = document.querySelector<HTMLElement>('#docArticle');
  const cacheKey = getDocCacheKey(activeDoc);
  let renderedDoc = renderedDocCache.get(cacheKey);

  if (!article) {
    return;
  }

  if (!renderedDoc && article.dataset.docKey === cacheKey && article.dataset.prerendered === 'true' && article.innerHTML.trim()) {
    renderedDoc = {
      html: article.innerHTML,
      toc: createTocFromArticle(article),
    };
    renderedDocCache.set(cacheKey, renderedDoc);
  }

  if (!renderedDoc) {
    article.setAttribute('aria-busy', 'true');
    renderedDoc = await loadRenderedDoc(activeDoc);
    renderedDocCache.set(cacheKey, renderedDoc);
  }

  if (request !== articleRenderRequest || state.lang !== activeDoc.lang || state.activeId !== activeDoc.id) {
    return;
  }

  currentTocItems = renderedDoc.toc;
  if (article.dataset.docKey !== cacheKey) {
    article.innerHTML = renderedDoc.html;
    article.dataset.docKey = cacheKey;
  }
  article.removeAttribute('aria-busy');
  setInitialActiveHeadingFromToc();
  renderToc();
  scheduleArticleHeadingObserver(article, cacheKey);
  updateThemeAssets(article);
}

async function loadRenderedDoc(doc: Doc): Promise<RenderedDoc> {
  const cacheKey = getDocCacheKey(doc);
  const cachedFetch = renderedDocFetches.get(cacheKey);

  if (cachedFetch) {
    return cachedFetch;
  }

  const fetchPromise = import.meta.env.DEV ? renderMarkdownDoc(doc) : fetchPrerenderedDoc(doc);
  renderedDocFetches.set(cacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } catch (error) {
    renderedDocFetches.delete(cacheKey);
    throw error;
  }
}

async function fetchPrerenderedDoc(doc: Doc): Promise<RenderedDoc> {
  const response = await fetch(getDocUrl(doc.lang, doc.id), { cache: 'force-cache' });

  if (!response.ok) {
    throw new Error(`Prerendered document request failed for ${doc.path} with ${response.status}.`);
  }

  const page = new DOMParser().parseFromString(await response.text(), 'text/html');
  const article = page.querySelector<HTMLElement>('#docArticle');

  if (!article) {
    throw new Error(`Prerendered article was not found for ${doc.path}.`);
  }

  return {
    html: article.innerHTML,
    toc: createTocFromArticle(article),
  };
}

async function renderMarkdownDoc(doc: Doc): Promise<RenderedDoc> {
  const content = await loadDevDocContent(doc);
  const { renderDocContent } = await import('./markdown-renderer');
  return renderDocContent(content, doc.lang, { basePath });
}

async function loadDevDocContent(doc: Doc): Promise<string> {
  const markdownLoaders = import.meta.glob(['../docs/{ru,en}/**/*.md', '!../docs/{ru,en}/init.md'], {
    query: '?raw',
    import: 'default',
  }) as Record<string, () => Promise<string>>;
  const loader = markdownLoaders[`../${doc.path}`];

  if (!loader) {
    throw new Error(`Markdown loader was not found for ${doc.path}.`);
  }

  return stripFrontmatter(await loader());
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) {
    return raw;
  }

  const end = raw.indexOf('\n---', 3);

  if (end === -1) {
    return raw;
  }

  return raw.slice(end + 4).replace(/^\s+/, '');
}

function createTocFromArticle(article: HTMLElement): TocItem[] {
  const roots: TocItem[] = [];
  const stack: TocItem[] = [];

  article.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]').forEach((heading) => {
    const level = Number(heading.tagName.slice(1));
    const item: TocItem = {
      id: heading.id,
      title: heading.textContent?.trim() || heading.id,
      level,
      children: [],
    };

    while (stack.length && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      item.parentId = parent.id;
      parent.children.push(item);
    } else {
      roots.push(item);
    }

    stack.push(item);
  });

  return roots;
}

function setInitialActiveHeadingFromToc(): void {
  const firstHeading = currentTocItems[0];

  if (!state.activeHeadingId && firstHeading) {
    state.activeHeadingId = firstHeading.id;
  }
}

function scheduleArticleHeadingObserver(article: HTMLElement, cacheKey: string): void {
  cancelScheduledHeadingObserver();

  headingObserverFrame = window.requestAnimationFrame(() => {
    headingObserverFrame = undefined;

    if (article.dataset.docKey !== cacheKey) {
      return;
    }

    observeArticleHeadings(article);
  });
}

function cancelScheduledHeadingObserver(): void {
  if (headingObserverFrame === undefined) {
    return;
  }

  window.cancelAnimationFrame(headingObserverFrame);
  headingObserverFrame = undefined;
}

function renderToc(): void {
  const panel = document.querySelector<HTMLElement>('#tocPanel');
  const nav = document.querySelector<HTMLElement>('#tocNav');
  const input = document.querySelector<HTMLInputElement>('#tocSearchInput');
  const collapseToggle = document.querySelector<HTMLButtonElement>('#tocCollapseToggle');
  const searchToggle = document.querySelector<HTMLButtonElement>('#tocSearchToggle');
  const tocToggle = document.querySelector<HTMLButtonElement>('#tocToggle');
  const heading = panel?.querySelector<HTMLHeadingElement>('.toc-header h2');

  if (!panel || !nav || !collapseToggle) {
    return;
  }

  panel.hidden = false;
  panel.setAttribute('aria-label', getLabel(state.lang, 'toc.title'));
  panel.dataset.searchOpen = String(state.tocSearchOpen);
  if (heading) {
    heading.textContent = getLabel(state.lang, 'toc.title');
  }

  if (tocToggle) {
    tocToggle.hidden = false;
    tocToggle.setAttribute('aria-expanded', String(state.tocOpen));
  }

  if (input) {
    input.placeholder = getLabel(state.lang, 'toc.search');
    input.value = state.tocQuery;
  }

  if (searchToggle) {
    searchToggle.setAttribute('aria-label', getLabel(state.lang, 'toc.search'));
    searchToggle.setAttribute('title', getLabel(state.lang, 'toc.search'));
    searchToggle.setAttribute('aria-pressed', String(state.tocSearchOpen));
  }

  if (!currentTocItems.length) {
    nav.innerHTML = `<p class="empty">${escapeHtml(getLabel(state.lang, 'toc.empty'))}</p>`;
    collapseToggle.hidden = true;
    return;
  }

  const query = state.tocQuery.trim();
  const visibleItems = query ? filterTocItems(currentTocItems, query, state.lang) : currentTocItems;
  const collapsibleIds = getCollapsibleTocIds(currentTocItems);
  const allCollapsed = collapsibleIds.length > 0 && collapsibleIds.every((id) => state.tocCollapsedIds.has(id));

  collapseToggle.hidden = false;
  collapseToggle.innerHTML = getCollapseIcon(allCollapsed);
  collapseToggle.setAttribute('aria-label', getLabel(state.lang, allCollapsed ? 'toc.expandAll' : 'toc.collapseAll'));
  collapseToggle.setAttribute('title', getLabel(state.lang, allCollapsed ? 'toc.expandAll' : 'toc.collapseAll'));
  collapseToggle.onclick = () => {
    state.tocCollapsedIds = allCollapsed ? new Set<string>() : new Set(collapsibleIds);
    renderToc();
  };

  if (!visibleItems.length) {
    nav.innerHTML = `<p class="empty">${escapeHtml(getLabel(state.lang, 'toc.noResults'))}</p>`;
    return;
  }

  nav.innerHTML = renderTocList(visibleItems, Boolean(query));
}

function renderTocList(items: TocItem[], forceOpen: boolean): string {
  return `
    <ol class="toc-list">
      ${items.map((item) => renderTocItem(item, forceOpen)).join('')}
    </ol>
  `;
}

function renderTocItem(item: TocItem, forceOpen: boolean): string {
  const hasChildren = item.children.length > 0;
  const collapsed = !forceOpen && state.tocCollapsedIds.has(item.id);
  const active = item.id === state.activeHeadingId ? ' aria-current="true"' : '';
  const toggle = hasChildren
    ? `<button class="toc-item-toggle" type="button" data-heading-id="${escapeHtml(item.id)}" aria-label="${getLabel(state.lang, 'aria.toggleSection')}" aria-expanded="${!collapsed}"></button>`
    : '<span class="toc-item-spacer" aria-hidden="true"></span>';
  const children = hasChildren && !collapsed ? renderTocList(item.children, forceOpen) : '';

  return `
    <li class="toc-item" data-level="${item.level}">
      <div class="toc-item-row">
        ${toggle}
        <a class="toc-link" href="#${encodeURIComponent(item.id)}" data-heading-id="${escapeHtml(item.id)}"${active}>
          ${escapeHtml(item.title)}
        </a>
      </div>
      ${children}
    </li>
  `;
}

function filterTocItems(items: TocItem[], query: string, lang: Lang): TocItem[] {
  const terms = normalizeSearch(query, lang).split(/\s+/).filter(Boolean);

  if (!terms.length) {
    return items;
  }

  return items
    .map((item) => filterTocItem(item, terms, lang))
    .filter((item): item is TocItem => Boolean(item));
}

function filterTocItem(item: TocItem, terms: string[], lang: Lang): TocItem | undefined {
  const title = normalizeSearch(item.title, lang);
  const selfMatches = terms.every((term) => title.includes(term));
  const children = item.children
    .map((child) => filterTocItem(child, terms, lang))
    .filter((child): child is TocItem => Boolean(child));

  if (!selfMatches && !children.length) {
    return undefined;
  }

  return {
    ...item,
    children: selfMatches ? item.children : children,
  };
}

function getCollapsibleTocIds(items: TocItem[]): string[] {
  return items.flatMap((item) => [
    ...(item.children.length ? [item.id] : []),
    ...getCollapsibleTocIds(item.children),
  ]);
}

function observeArticleHeadings(article: HTMLElement): void {
  headingObserver?.disconnect();
  const headings = Array.from(article.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]'));

  if (!headings.length) {
    return;
  }

  headingObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

      if (visible?.target instanceof HTMLElement) {
        setActiveHeading(visible.target.id);
      }
    },
    {
      rootMargin: '-18% 0px -70% 0px',
      threshold: [0, 1],
    },
  );

  headings.forEach((heading) => headingObserver?.observe(heading));

  const hashId = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (hashId && headings.some((heading) => heading.id === hashId)) {
    setActiveHeading(hashId);
    window.setTimeout(() => document.getElementById(hashId)?.scrollIntoView({ block: 'start' }), 0);
  } else {
    setActiveHeading(headings[0].id);
  }
}

function setActiveHeading(id: string): void {
  if (!id || state.activeHeadingId === id) {
    return;
  }

  state.activeHeadingId = id;
  if (expandTocAncestors(id)) {
    renderToc();
  } else {
    updateActiveTocLink();
  }
}

function expandTocAncestors(id: string): boolean {
  const itemById = new Map<string, TocItem>();
  flattenToc(currentTocItems).forEach((item) => itemById.set(item.id, item));
  let current = itemById.get(id);
  let changed = false;

  while (current?.parentId) {
    if (state.tocCollapsedIds.delete(current.parentId)) {
      changed = true;
    }

    current = itemById.get(current.parentId);
  }

  return changed;
}

function flattenToc(items: TocItem[]): TocItem[] {
  return items.flatMap((item) => [item, ...flattenToc(item.children)]);
}

function updateActiveTocLink(): void {
  const nav = document.querySelector<HTMLElement>('#tocNav');

  if (!nav) {
    return;
  }

  nav.querySelectorAll<HTMLAnchorElement>('a.toc-link[aria-current="true"]').forEach((link) => {
    link.removeAttribute('aria-current');
  });

  nav.querySelectorAll<HTMLAnchorElement>('a.toc-link').forEach((link) => {
    if (link.dataset.headingId === state.activeHeadingId) {
      link.setAttribute('aria-current', 'true');
    }
  });
}

function collectCurrentPage(doc: Doc): void {
  const path = getDocUrl(doc.lang, doc.id);
  const key = `${doc.lang}:${doc.id}:${doc.title}`;

  if (key === lastCollectedPage) {
    return;
  }

  lastCollectedPage = key;
  collectPageView({
    lang: doc.lang,
    path,
    title: `${doc.title} | xrDocs`,
  });
}

function scheduleSearchStatistics(query: string, resultCount: number): void {
  const normalizedQuery = query.trim();

  if (searchStatisticsTimer !== undefined) {
    window.clearTimeout(searchStatisticsTimer);
    searchStatisticsTimer = undefined;
  }

  if (normalizedQuery.length < 2) {
    return;
  }

  searchStatisticsTimer = window.setTimeout(() => {
    const key = `${state.lang}:${normalizedQuery.toLocaleLowerCase(state.lang)}`;

    if (key === lastCollectedSearch) {
      return;
    }

    lastCollectedSearch = key;
    collectEvent('search', {
      lang: state.lang,
      query_length: normalizedQuery.length,
      results: resultCount,
    });
  }, 600);
}

function updateShellLabels(): void {
  document.querySelector<HTMLButtonElement>('#navOverlay')?.setAttribute('aria-label', getLabel(state.lang, 'aria.closeNavigation'));
  document.querySelector<HTMLButtonElement>('#tocOverlay')?.setAttribute('aria-label', getLabel(state.lang, 'aria.closeContents'));
  document.querySelector<HTMLElement>('.sidebar')?.setAttribute('aria-label', getLabel(state.lang, 'aria.nav'));
  document.querySelector<HTMLElement>('#tocResizeHandle')?.setAttribute('aria-label', getLabel(state.lang, 'aria.resizeContents'));
  document.querySelector<HTMLButtonElement>('#languageToggle')?.setAttribute('aria-label', getLabel(state.lang, 'aria.switchLanguage'));
  document.querySelector<HTMLButtonElement>('#themeToggle')?.setAttribute('aria-label', getLabel(state.lang, 'aria.switchTheme'));
}

function renderTopbarControls(activeDoc: Doc): void {
  const languageToggle = document.querySelector<HTMLButtonElement>('#languageToggle');
  if (languageToggle) {
    languageToggle.textContent = state.lang.toUpperCase();
    languageToggle.title = getLabel(state.lang, state.lang === 'ru' ? 'language.switchToEnglish' : 'language.switchToRussian');
  }

  const navToggle = document.querySelector<HTMLButtonElement>('#navToggle');
  if (navToggle) {
    navToggle.setAttribute('aria-label', getLabel(state.lang, 'menu.label'));
    const label = navToggle.querySelector('span:last-child');
    if (label) {
      label.textContent = getLabel(state.lang, 'menu.label');
    }
  }

  const themeToggle = document.querySelector<HTMLButtonElement>('#themeToggle');
  if (themeToggle) {
    themeToggle.innerHTML = getThemeIcon(state.theme);
    themeToggle.title = getThemeToggleTitle(state.theme);
    themeToggle.setAttribute('aria-label', getLabel(state.lang, 'aria.switchTheme'));
  }

  const tocToggle = document.querySelector<HTMLButtonElement>('#tocToggle');
  if (tocToggle) {
    const title = getTocTitle(activeDoc);
    tocToggle.setAttribute('aria-label', title);
    tocToggle.setAttribute('title', title);
    tocToggle.setAttribute('aria-expanded', String(state.tocOpen));
  }
}

function getThemeIcon(theme: ThemePreference): string {
  if (theme === 'auto') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-4v3h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-3H7a3 3 0 0 1-3-3V5Zm3-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7Z" />
      </svg>
    `;
  }

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

function getCollapseIcon(expand: boolean): string {
  return expand
    ? `
      <svg class="toc-fold-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m7 10 5-5 5 5" />
        <path d="m7 14 5 5 5-5" />
      </svg>
    `
    : `
      <svg class="toc-fold-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m7 5 5 5 5-5" />
        <path d="m7 19 5-5 5 5" />
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
    void renderSearchResults(nav, query);
    return;
  }

  searchRenderRequest += 1;
  const activePath = findNavNodePath(state.lang, state.activeId);
  const activeAncestorKeys = new Set(activePath.slice(0, -1).map(getNavNodeKey));
  const sections = navTree[state.lang] || [];

  nav.innerHTML = sections
    .map(
      (section) => `
        <section class="nav-section">
          <h2>${escapeHtml(section.title)}</h2>
          ${renderNavNodes(section.children, activeAncestorKeys)}
        </section>
      `,
    )
    .join('');

  if (!getDocsByLang(state.lang).length) {
    nav.innerHTML = `<p class="empty">${getLabel(state.lang, 'doc.empty')}</p>`;
  }
}

function renderNavNodes(nodes: NavNode[], activeAncestorKeys: Set<string>): string {
  if (!nodes.length) {
    return '';
  }

  return `
    <ul class="nav-list">
      ${nodes.map((node) => renderNavNode(node, activeAncestorKeys)).join('')}
    </ul>
  `;
}

function renderNavNode(node: NavNode, activeAncestorKeys: Set<string>): string {
  const key = getNavNodeKey(node);
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && (activeAncestorKeys.has(key) || state.navExpandedIds.has(key));
  const active = node.id === state.activeId ? ' aria-current="page"' : '';
  const toggle = hasChildren
    ? `
      <button
        class="nav-item-toggle"
        type="button"
        data-nav-id="${escapeHtml(key)}"
        aria-label="${escapeHtml(node.title)}"
        aria-expanded="${expanded}"
      ></button>
    `
    : '<span class="nav-item-spacer" aria-hidden="true"></span>';
  const label = node.id
    ? `
      <a class="doc-link" href="${getDocUrl(state.lang, node.id)}"${active}>
        <span>${escapeHtml(node.title)}</span>
        <small>${escapeHtml(getDocByKey(state.lang, node.id)?.meta.summary || node.path || '')}</small>
      </a>
    `
    : `<span class="nav-folder-label">${escapeHtml(node.title)}</span>`;
  const children = hasChildren ? renderNavNodes(node.children, activeAncestorKeys) : '';

  return `
    <li class="nav-item" data-depth="${node.depth}" data-expanded="${expanded}">
      <div class="nav-item-row">
        ${toggle}
        ${label}
      </div>
      ${children}
    </li>
  `;
}

function getNavNodeKey(node: NavNode): string {
  return node.id || `${node.depth}:${node.order}:${node.title}`;
}

async function renderSearchResults(nav: HTMLElement, query: string): Promise<void> {
  const request = ++searchRenderRequest;
  const entries = searchEntries || await loadSearchIndex();

  if (request !== searchRenderRequest || query !== state.search.trim()) {
    return;
  }

  const results = getSearchResults(query, entries);
  scheduleSearchStatistics(query, results.length);

  if (!results.length) {
    nav.innerHTML = `<p class="empty">${getLabel(state.lang, 'doc.empty')}</p>`;
    return;
  }

  nav.innerHTML = `
    <section class="nav-section search-results">
      <h2>${escapeHtml(getLabel(state.lang, 'search.results'))} <span>${results.length}</span></h2>
      ${results
        .map(({ doc, excerpt }) => {
          const active = doc.id === state.activeId ? ' aria-current="page"' : '';

          return `
            <a class="doc-link search-result" href="${getDocUrl(doc.lang, doc.id)}"${active}>
              <span>${highlight(doc.title, query, state.lang)}</span>
              <small>${escapeHtml(doc.meta.section)} · ${escapeHtml(doc.path)}</small>
              <p>${highlight(excerpt, query, state.lang)}</p>
            </a>
          `;
        })
        .join('')}
    </section>
  `;
}

async function loadSearchIndex(): Promise<SearchIndexEntry[]> {
  if (searchEntries) {
    return searchEntries;
  }

  if (!searchIndexPromise) {
    searchIndexPromise = fetch(getAssetUrl('search-index.json'), { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Search index request failed with ${response.status}.`);
        }

        return response.json() as Promise<SearchIndex>;
      })
      .then((index) => {
        searchEntries = index.docs;
        return searchEntries;
      });
  }

  return searchIndexPromise;
}

function getSearchResults(query: string, entries: SearchIndexEntry[]): SearchResult[] {
  const normalizedQuery = normalizeSearch(query, state.lang);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);

  if (!terms.length) {
    return [];
  }

  return entries
    .filter((entry) => entry.lang === state.lang)
    .map((entry) => {
      const doc = getDocByKey(entry.lang, entry.id);

      if (!doc) {
        return undefined;
      }

      const title = normalizeSearch(entry.title, state.lang);
      const section = normalizeSearch(entry.section, state.lang);
      const summary = normalizeSearch(entry.summary, state.lang);
      const content = getSearchEntryText(entry);
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
        excerpt: createExcerpt(entry, terms),
      };
    })
    .filter((result): result is SearchResult => Boolean(result))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || compareDocs(a.doc, b.doc));
}

function createExcerpt(entry: SearchIndexEntry, terms: string[]): string {
  const text = [entry.summary, entry.text].filter(Boolean).join(' ');
  const normalized = normalizeSearch(text, entry.lang);
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

function getSearchEntryText(entry: SearchIndexEntry): string {
  if (!entry.searchText) {
    entry.searchText = normalizeSearch(entry.text, entry.lang);
  }

  return entry.searchText;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function switchLanguage(nextLang: Lang): void {
  if (nextLang === state.lang) {
    return;
  }

  const previousLang = state.lang;
  const nextDocs = getDocsByLang(nextLang);
  const nextDoc = nextDocs.find((doc) => doc.id === state.activeId) || nextDocs[0];

  if (!nextDoc) {
    return;
  }

  state.lang = nextLang;
  state.activeId = nextDoc.id;
  history.pushState(null, '', getDocUrl(nextLang, nextDoc.id));
  collectEvent('language_switch', {
    from: previousLang,
    to: nextLang,
  });
  render();
}

function switchTheme(nextTheme: ThemePreference): void {
  if (nextTheme === state.theme) {
    return;
  }

  state.theme = nextTheme;
  localStorage.setItem('xrDocsTheme', nextTheme);
  document.documentElement.dataset.theme = getResolvedTheme();
  collectEvent('theme_switch', {
    theme: nextTheme,
    resolved_theme: getResolvedTheme(),
  });
  const activeDoc = getActiveDoc();
  if (activeDoc) {
    renderTopbarControls(activeDoc);
  }
  updateThemeAssets(appRoot);
}

function setNavOpen(open: boolean): void {
  state.navOpen = open;
  document.querySelector<HTMLElement>('.layout')?.setAttribute('data-nav-open', String(open));
  document.querySelector<HTMLButtonElement>('#navToggle')?.setAttribute('aria-expanded', String(open));
}

function setTocOpen(open: boolean, persist = true): void {
  state.tocOpen = open;
  document.querySelector<HTMLElement>('.layout')?.setAttribute('data-toc-open', String(open));
  document.querySelector<HTMLButtonElement>('#tocToggle')?.setAttribute('aria-expanded', String(open));

  if (persist) {
    localStorage.setItem('xrDocsTocOpen', String(open));
  }
}

function startTocResize(event: PointerEvent): void {
  if (event.button !== 0 || window.matchMedia('(max-width: 1100px)').matches) {
    return;
  }

  event.preventDefault();
  document.documentElement.dataset.tocResizing = 'true';

  const resize = (moveEvent: PointerEvent) => {
    setTocWidth(window.innerWidth - moveEvent.clientX);
  };

  const stop = () => {
    document.documentElement.removeAttribute('data-toc-resizing');
    window.removeEventListener('pointermove', resize);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  };

  window.addEventListener('pointermove', resize);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
}

function setTocWidth(width: number): void {
  state.tocWidth = clamp(Math.round(width), minTocWidth, maxTocWidth);
  document.querySelector<HTMLElement>('.layout')?.style.setProperty('--toc-width', `${state.tocWidth}px`);
  localStorage.setItem('xrDocsTocWidth', String(state.tocWidth));
}

function getActiveDoc(): Doc | undefined {
  const langDocs = getDocsByLang(state.lang);
  return langDocs.find((doc) => doc.id === state.activeId) || langDocs[0] || docs[0];
}

function getDocCacheKey(doc: Doc): string {
  return `${doc.lang}:${doc.id}`;
}

function readRoute(): Route {
  const savedLang = readSavedLang() || detectBrowserLang();

  if (location.hash.startsWith('#/')) {
    const value = decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\.md$/, '');
    const [maybeLang, ...rest] = value.split('/').filter(Boolean);

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

  const route = readRouteFromPath(location.pathname);

  if (route) {
    return route;
  }

  const prerenderedRoute = readPrerenderedRoute();

  if (prerenderedRoute) {
    return prerenderedRoute;
  }

  return {
    lang: savedLang,
    id: '',
  };
}

function readPrerenderedRoute(): Route | undefined {
  const docKey = document.querySelector<HTMLElement>('#docArticle[data-prerendered="true"]')?.dataset.docKey;
  const [lang, ...idParts] = docKey?.split(':') || [];

  if ((lang === 'ru' || lang === 'en') && idParts.length) {
    return {
      lang,
      id: idParts.join(':'),
    };
  }

  return undefined;
}

function readRouteFromPath(pathname: string): Route | undefined {
  const path = stripBasePath(decodeURIComponent(pathname))
    .replace(/\/index\.html$/, '/')
    .replace(/^\/+|\/+$/g, '');
  const [maybeLang, ...rest] = path.split('/').filter(Boolean);

  if (maybeLang === 'ru' || maybeLang === 'en') {
    return {
      lang: maybeLang,
      id: rest.join('/').replace(/\.md$/i, ''),
    };
  }

  const langIndex = path.split('/').findIndex((part) => part === 'ru' || part === 'en');

  if (langIndex >= 0) {
    const parts = path.split('/').slice(langIndex);
    const [lang, ...idParts] = parts;

    return {
      lang: lang as Lang,
      id: idParts.join('/').replace(/\.md$/i, ''),
    };
  }

  return undefined;
}

function readTheme(): ThemePreference {
  const savedTheme = localStorage.getItem('xrDocsTheme');

  if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'auto') {
    return savedTheme;
  }

  return 'auto';
}

function readTocOpen(): boolean {
  const savedValue = localStorage.getItem('xrDocsTocOpen');

  if (savedValue === 'true') {
    return true;
  }

  if (savedValue === 'false') {
    return false;
  }

  return false;
}

function readTocWidth(): number {
  return clamp(Number(localStorage.getItem('xrDocsTocWidth')) || 360, minTocWidth, maxTocWidth);
}

function readSavedLang(): Lang | undefined {
  const savedLang = localStorage.getItem('xrDocsLang');
  return savedLang === 'ru' || savedLang === 'en' ? savedLang : undefined;
}

function detectBrowserLang(): Lang {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((lang) => lang.toLocaleLowerCase().startsWith('ru')) ? 'ru' : 'en';
}

function getResolvedTheme(): Theme {
  if (state.theme !== 'auto') {
    return state.theme;
  }

  return colorSchemeQuery.matches ? 'light' : 'dark';
}

function getNextThemePreference(theme: ThemePreference): ThemePreference {
  if (theme === 'auto') {
    return 'light';
  }

  return theme === 'light' ? 'dark' : 'auto';
}

function getThemeToggleTitle(theme: ThemePreference): string {
  if (theme === 'auto') {
    return getLabel(state.lang, 'theme.followSystem').replace('{theme}', getResolvedTheme());
  }

  return theme === 'dark' ? getLabel(state.lang, 'theme.switchToAuto') : getLabel(state.lang, 'theme.switchToDark');
}

function getTocTitle(doc: Doc): string {
  const fileName = doc.id.split('/').filter(Boolean).at(-1) || doc.id || doc.title;
  return `${getLabel(doc.lang, 'toc.toggle')} ${fileName}`;
}

function getDocUrl(lang: Lang, id: string): string {
  return `${basePath}${lang}/${id.split('/').map(encodeURIComponent).join('/')}/`;
}

function getAssetUrl(src: string): string {
  if (!isLocalAssetSrc(src)) {
    return src;
  }

  return `${basePath}${src.replace(/^\.?\//, '')}`;
}

function isLocalAssetSrc(src: string): boolean {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(src);
}

function navigateToLink(event: MouseEvent, link: HTMLAnchorElement): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }

  const url = new URL(link.href);

  if (url.origin !== location.origin || !url.pathname.startsWith(basePath)) {
    return;
  }

  const route = readRouteFromPath(url.pathname);

  if (!route) {
    return;
  }

  event.preventDefault();
  state.lang = route.lang;
  state.activeId = route.id || getDocsByLang(route.lang)[0]?.id || docs[0].id;
  history.pushState(null, '', `${url.pathname}${url.hash}`);
  render();
}

function normalizeBasePath(value: string): string {
  const normalized = value.replace(/^\/+|\/+$/g, '');

  if (!normalized || value === './') {
    return '/';
  }

  return `/${normalized}/`;
}

function stripBasePath(pathname: string): string {
  if (basePath === '/') {
    return pathname;
  }

  return pathname.startsWith(basePath) ? `/${pathname.slice(basePath.length)}` : pathname;
}

function updateDocumentMeta(doc: Doc): void {
  const title = `${doc.title} | xrDocs`;
  const description = [doc.meta.summary, siteMeta[doc.lang].description]
    .filter(Boolean)
    .join(' ');

  setMetaContent('name', 'description', description);
  setMetaContent('property', 'og:title', title);
  setMetaContent('property', 'og:description', description);
  setMetaContent('property', 'og:locale', siteMeta[doc.lang].locale);
  setMetaContent('name', 'twitter:title', title);
  setMetaContent('name', 'twitter:description', description);
}

function setMetaContent(attribute: 'name' | 'property', value: string, content: string): void {
  let element = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${value}"]`);

  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, value);
    document.head.append(element);
  }

  element.content = content;
}

function updateThemeAssets(root: ParentNode): void {
  const theme = getResolvedTheme();

  root.querySelectorAll<HTMLImageElement>('img[data-theme-asset-base]').forEach((image) => {
    const baseSrc = image.dataset.themeAssetBase;

    if (!baseSrc) {
      return;
    }

    const requestKey = `${theme}:${baseSrc}`;
    image.dataset.themeAssetRequest = requestKey;
    const nextSrc = resolveThemeAssetSrc(baseSrc, theme);

    if (image.dataset.themeAssetRequest !== requestKey) {
      return;
    }

    if (image.getAttribute('src') !== nextSrc) {
      image.setAttribute('src', nextSrc);
    }
  });
}

function resolveThemeAssetSrc(baseSrc: string, theme: Theme): string {
  const candidates = createThemeAssetCandidates(baseSrc, theme);

  for (const candidate of candidates) {
    if (assetExists(candidate)) {
      return candidate;
    }
  }

  return baseSrc;
}

function createThemeAssetCandidates(baseSrc: string, theme: Theme): string[] {
  const fallbackTheme = theme === 'dark' ? 'light' : 'dark';

  return unique([
    createThemeAssetSrc(baseSrc, theme),
    createThemeAssetSrc(baseSrc, fallbackTheme),
    baseSrc,
  ]);
}

function createThemeAssetSrc(baseSrc: string, theme: Theme): string {
  const { path, suffix } = splitAssetSrc(baseSrc);
  const extension = new RegExp(`\\.(${themeAssetExtensions})$`, 'i');

  if (!extension.test(path)) {
    return baseSrc;
  }

  return `${path.replace(extension, `.${theme}.$1`)}${suffix}`;
}

function splitAssetSrc(src: string): { path: string; suffix: string } {
  const match = src.match(/^([^?#]+)([?#].*)?$/);

  return {
    path: match?.[1] || src,
    suffix: match?.[2] || '',
  };
}

function assetExists(src: string): boolean {
  return themeAssetPaths.has(normalizeAssetManifestPath(stripBasePath(new URL(src, document.baseURI).pathname)));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalizeAssetManifestPath(src: string): string {
  return decodeURIComponent(src).replace(/^\/+|^\.\//g, '');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getLabel(lang: Lang, key: LabelKey): string {
  return labels[lang][key] || labels.en[key] || key;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
