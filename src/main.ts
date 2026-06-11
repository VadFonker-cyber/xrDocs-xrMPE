import type { AppContext } from './app-context';
import { getDocCacheKey, loadActiveArticle } from './article';
import { docs, getDocById, getDocsByLang, type Doc, type Lang } from './docs';
import { updateDocumentMeta, updateNotFoundMeta } from './document-meta';
import { renderNav as renderNavModule } from './nav';
import { getDocUrl, readRoute } from './routing';
import { renderShell, renderTopbarControls, updateShellLabels, getShellRefs } from './shell';
import { createAppState, type ThemePreference } from './state';
import { collectPageView, collectStateChangeEvent, initStatistics } from './statistics';
import { getResolvedTheme, updateThemeAssets } from './theme';
import {
  renderToc as renderTocModule,
  resetTocState,
  scheduleArticleHeadingObserver,
  setCurrentTocItems,
  setInitialActiveHeadingFromToc,
} from './toc';
import { getLabel } from './locales';
import { escapeHtml } from './utils/html';
import './styles.css';

let lastCollectedPage = '';
let currentTocDocKey = '';
let lastNavKey = '';
let lastPersistedLang: Lang | undefined;

type SharedChromeOptions = {
  activeDoc?: Doc;
  navKey: string;
  notFound: boolean;
  tocDocKey: string;
};

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found.');
}

const initialRoute = readRoute();
const state = createAppState(initialRoute);
const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: light)');
const appRoot = app;

const context: AppContext = {
  appRoot,
  state,
  colorSchemeQuery,
  getActiveDoc,
  render,
  renderNav,
  renderToc,
  setNavOpen,
  setTocOpen,
  switchLanguage,
  switchTheme,
};

document.documentElement.dataset.theme = getResolvedTheme(context);
initStatistics();
renderShell(context);
render();

window.addEventListener('hashchange', () => {
  applyRoute(readRoute());
  render();
});

window.addEventListener('popstate', () => {
  applyRoute(readRoute());
  render();
});

colorSchemeQuery.addEventListener('change', () => {
  if (state.theme === 'auto') {
    document.documentElement.dataset.theme = getResolvedTheme(context);
    const activeDoc = getActiveDoc();
    renderTopbarControls(context, activeDoc);
    updateThemeAssets(context, appRoot);
  }
});

function render(): void {
  const activeDoc = getActiveDoc();

  if (state.notFound) {
    renderNotFound();
    return;
  }

  if (!activeDoc) {
    return;
  }

  if (activeDoc.lang !== state.lang || activeDoc.id !== state.activeId) {
    state.lang = activeDoc.lang;
    state.activeId = activeDoc.id;
    history.replaceState(null, '', getDocUrl(activeDoc.id));
  }

  document.title = `${activeDoc.title} | xrDocs`;
  updateDocumentMeta(activeDoc);
  const tocDocKey = getDocCacheKey(activeDoc);
  const navKey = `${state.lang}:${state.activeId}:${state.search}`;

  renderSharedChrome({ activeDoc, navKey, notFound: false, tocDocKey });
  setNotFoundChromeHidden(false);
  renderToc();
  clearNotFoundArticleBeforeLoad();
  collectCurrentPage(activeDoc);
  void renderActiveArticle(activeDoc);
}

function renderNav(): void {
  renderNavModule(context);
}

function renderToc(): void {
  renderTocModule(context);
}

function renderSharedChrome({ activeDoc, navKey, notFound, tocDocKey }: SharedChromeOptions): void {
  if (state.lang !== lastPersistedLang) {
    lastPersistedLang = state.lang;
    localStorage.setItem('xrDocsLang', state.lang);
  }

  document.documentElement.lang = state.lang;
  document.documentElement.dataset.theme = getResolvedTheme(context);

  const refs = getShellRefs();
  if (notFound) {
    refs?.layout?.setAttribute('data-not-found', 'true');
  } else {
    refs?.layout?.removeAttribute('data-not-found');
  }

  setNavOpen(state.navOpen);
  setTocOpen(state.tocOpen, false);

  if (tocDocKey !== currentTocDocKey) {
    currentTocDocKey = tocDocKey;
    resetTocState(context);
  }

  if (refs?.searchInput) {
    refs.searchInput.placeholder = getLabel(state.lang, 'search.placeholder');
    refs.searchInput.value = state.search;
  }

  updateShellLabels(context);
  renderTopbarControls(context, activeDoc);

  if (navKey !== lastNavKey) {
    lastNavKey = navKey;
    renderNav();
  }
}

function renderNotFound(): void {
  document.title = `${getLabel(state.lang, 'notFound.title')} | xrDocs`;
  updateNotFoundMeta(state.lang);
  const tocDocKey = `404:${state.lang}:${state.requestedPath || state.activeId}`;
  const navKey = `${state.lang}:404:${state.activeId}:${state.search}`;

  renderSharedChrome({ navKey, notFound: true, tocDocKey });
  setCurrentTocItems([]);
  renderToc();
  setNotFoundChromeHidden(true);

  const article = document.querySelector<HTMLElement>('#docArticle');
  if (article && article.dataset.docKey !== tocDocKey) {
    article.innerHTML = renderNotFoundArticle();
    article.dataset.docKey = tocDocKey;
    article.removeAttribute('data-prerendered');
    article.removeAttribute('aria-busy');
  }
}

async function renderActiveArticle(activeDoc: Doc): Promise<void> {
  await loadActiveArticle(activeDoc, (article, cacheKey, renderedDoc) => {
    if (state.lang !== activeDoc.lang || state.activeId !== activeDoc.id) {
      return;
    }

    setCurrentTocItems(renderedDoc.toc);
    setInitialActiveHeadingFromToc(context);
    renderToc();
    scheduleArticleHeadingObserver(context, article, cacheKey);
    updateThemeAssets(context, article);
  });
}

function switchLanguage(nextLang: Lang): void {
  if (nextLang === state.lang) {
    return;
  }

  const previousLang = state.lang;

  if (state.notFound) {
    state.lang = nextLang;
    collectStateChangeEvent('language_switch', {
      from: previousLang,
      to: nextLang,
    });
    render();
    return;
  }

  const nextDocs = getDocsByLang(nextLang);
  const nextDoc = nextDocs.find((doc) => doc.id === state.activeId) || nextDocs[0];

  if (!nextDoc) {
    return;
  }

  const shouldUpdateUrl = nextDoc.id !== state.activeId;
  state.lang = nextLang;
  state.activeId = nextDoc.id;

  if (shouldUpdateUrl) {
    history.pushState(null, '', getDocUrl(nextDoc.id));
  }
  collectStateChangeEvent('language_switch', {
    from: previousLang,
    to: nextLang,
  });
  render();
}

function switchTheme(nextTheme: ThemePreference): void {
  if (nextTheme === state.theme) {
    return;
  }

  const previousTheme = state.theme;
  state.theme = nextTheme;
  localStorage.setItem('xrDocsTheme', nextTheme);
  const resolved = getResolvedTheme(context);
  document.documentElement.dataset.theme = resolved;
  collectStateChangeEvent('theme_switch', {
    from: previousTheme,
    to: nextTheme,
    resolved_theme: resolved,
  });
  const activeDoc = getActiveDoc();
  renderTopbarControls(context, activeDoc);
  updateThemeAssets(context, appRoot);
}

function setNavOpen(open: boolean): void {
  state.navOpen = open;
  const refs = getShellRefs();
  refs?.layout?.setAttribute('data-nav-open', String(open));
  refs?.navToggle?.setAttribute('aria-expanded', String(open));
}

function setTocOpen(open: boolean, persist = true): void {
  state.tocOpen = open;
  const refs = getShellRefs();
  refs?.layout?.setAttribute('data-toc-open', String(open));
  refs?.tocToggle?.setAttribute('aria-expanded', String(open));

  if (persist) {
    localStorage.setItem('xrDocsTocOpen', String(open));
  }
}

function getActiveDoc(): Doc | undefined {
  if (state.notFound) {
    return undefined;
  }

  if (state.activeId) {
    return getDocById(state.activeId, state.lang);
  }

  const langDocs = getDocsByLang(state.lang);
  return langDocs[0] || docs[0];
}

function applyRoute(route: { lang: Lang; id: string; notFound?: boolean; requestedPath?: string }): void {
  state.lang = route.lang;
  state.notFound = Boolean(route.notFound);
  state.requestedPath = route.requestedPath;
  state.activeId = route.id || getDocsByLang(route.lang)[0]?.id || docs[0].id;
}

function collectCurrentPage(doc: Doc): void {
  const path = getDocUrl(doc.id);
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

function clearNotFoundArticleBeforeLoad(): void {
  const article = document.querySelector<HTMLElement>('#docArticle');

  if (!article?.dataset.docKey?.startsWith('404:')) {
    return;
  }

  article.innerHTML = '';
  article.removeAttribute('data-doc-key');
  article.removeAttribute('data-prerendered');
  article.setAttribute('aria-busy', 'true');
}

function setNotFoundChromeHidden(hidden: boolean): void {
  const refs = getShellRefs();
  refs?.sidebar?.toggleAttribute('hidden', hidden);
  refs?.topbar?.toggleAttribute('hidden', hidden);
  refs?.tocPanel?.toggleAttribute('hidden', hidden);
  refs?.navOverlay?.toggleAttribute('hidden', hidden);
  refs?.tocOverlay?.toggleAttribute('hidden', hidden);
}

function renderNotFoundArticle(): string {
  return `
    <div class="not-found">
      <p class="not-found-code">404</p>
      <h1>${escapeHtml(getLabel(state.lang, 'notFound.title'))}</h1>
      <p>${escapeHtml(getLabel(state.lang, 'notFound.message'))}</p>
      <a class="not-found-link" href="${getDocUrl('index')}">${escapeHtml(getLabel(state.lang, 'notFound.homeLink'))}</a>
    </div>
  `;
}
