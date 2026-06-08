import type { AppContext } from './app-context';
import { getDocCacheKey, loadActiveArticle } from './article';
import { docs, getDocsByLang, type Doc, type Lang } from './docs';
import { updateDocumentMeta } from './document-meta';
import { renderNav as renderNavModule } from './nav';
import { getDocUrl, readRoute } from './routing';
import { renderShell, renderTopbarControls, updateShellLabels } from './shell';
import { createAppState, type ThemePreference } from './state';
import { collectEvent, collectPageView, initStatistics } from './statistics';
import { getResolvedTheme, updateThemeAssets } from './theme';
import {
  renderToc as renderTocModule,
  resetTocState,
  scheduleArticleHeadingObserver,
  setCurrentTocItems,
  setInitialActiveHeadingFromToc,
} from './toc';
import { getLabel } from './locales';
import './styles.css';

let lastCollectedPage = '';
let currentTocDocKey = '';
let lastNavKey = '';
let lastPersistedLang: Lang | undefined;

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
    if (activeDoc) {
      renderTopbarControls(context, activeDoc);
    }
    updateThemeAssets(context, appRoot);
  }
});

function render(): void {
  const activeDoc = getActiveDoc();

  if (!activeDoc) {
    return;
  }

  if (activeDoc.lang !== state.lang || activeDoc.id !== state.activeId) {
    state.lang = activeDoc.lang;
    state.activeId = activeDoc.id;
    history.replaceState(null, '', getDocUrl(activeDoc.id));
  }

  if (state.lang !== lastPersistedLang) {
    lastPersistedLang = state.lang;
    localStorage.setItem('xrDocsLang', state.lang);
  }
  document.documentElement.lang = state.lang;
  document.documentElement.dataset.theme = getResolvedTheme(context);
  document.title = `${activeDoc.title} | xrDocs`;
  updateDocumentMeta(activeDoc);
  setNavOpen(state.navOpen);
  setTocOpen(state.tocOpen, false);

  const tocDocKey = getDocCacheKey(activeDoc);
  if (tocDocKey !== currentTocDocKey) {
    currentTocDocKey = tocDocKey;
    resetTocState(context);
  }

  const searchInput = document.querySelector<HTMLInputElement>('#searchInput');
  if (searchInput) {
    searchInput.placeholder = getLabel(state.lang, 'search.placeholder');
    searchInput.value = state.search;
  }

  updateShellLabels(context);
  renderTopbarControls(context, activeDoc);

  const navKey = `${state.lang}:${state.activeId}:${state.search}`;
  if (navKey !== lastNavKey) {
    lastNavKey = navKey;
    renderNav();
  }

  renderToc();
  collectCurrentPage(activeDoc);
  void renderActiveArticle(activeDoc);
}

function renderNav(): void {
  renderNavModule(context);
}

function renderToc(): void {
  renderTocModule(context);
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
  const resolved = getResolvedTheme(context);
  document.documentElement.dataset.theme = resolved;
  collectEvent('theme_switch', {
    theme: nextTheme,
    resolved_theme: resolved,
  });
  const activeDoc = getActiveDoc();
  if (activeDoc) {
    renderTopbarControls(context, activeDoc);
  }
  updateThemeAssets(context, appRoot);
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

function getActiveDoc(): Doc | undefined {
  const langDocs = getDocsByLang(state.lang);
  return langDocs.find((doc) => doc.id === state.activeId) || langDocs[0] || docs[0];
}

function applyRoute(route: { lang: Lang; id: string }): void {
  state.lang = route.lang;
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
