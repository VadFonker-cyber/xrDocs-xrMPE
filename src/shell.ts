import type { AppContext } from './app-context';
import { getDocCacheKey } from './article';
import { getLabel, labels } from './locales';
import { getAssetUrl, navigateToLink } from './routing';
import { loadSearchIndex } from './search';
import { getNextThemePreference, getResolvedTheme } from './theme';
import { getTocTitle, setActiveHeading, startTocResize } from './toc';
import { escapeHtml } from './utils/html';
import type { Doc } from './docs';
import type { ThemePreference } from './state';

const githubUrl = 'https://github.com/VadFonker-cyber/xrDocs-xrMPE';

type ShellRefs = {
  languageToggle: HTMLButtonElement | null;
  navToggle: HTMLButtonElement | null;
  themeToggle: HTMLButtonElement | null;
  tocToggle: HTMLButtonElement | null;
  navOverlay: HTMLButtonElement | null;
  tocOverlay: HTMLButtonElement | null;
  sidebar: HTMLElement | null;
  tocResizeHandle: HTMLElement | null;
};

let shellRefs: ShellRefs | null = null;

export function renderShell(context: AppContext): void {
  const copy = labels[context.state.lang];
  const activeDoc = context.getActiveDoc();
  const prerenderedArticle = context.appRoot.querySelector<HTMLElement>('#docArticle');
  const prerenderedDocKey = prerenderedArticle?.dataset.docKey;
  const shouldKeepPrerenderedArticle = activeDoc && prerenderedDocKey === getDocCacheKey(activeDoc);
  const prerenderedArticleHtml = shouldKeepPrerenderedArticle ? prerenderedArticle?.innerHTML || '' : '';
  const prerenderedArticleAttributes = shouldKeepPrerenderedArticle
    ? ` data-doc-key="${escapeHtml(prerenderedDocKey || '')}" data-prerendered="true"`
    : '';

  context.appRoot.innerHTML = `
    <div class="layout" data-nav-open="false" data-toc-open="${context.state.tocOpen}" style="--toc-width: ${context.state.tocWidth}px">
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
            <button id="tocToggle" class="icon-button toc-toggle" type="button" aria-label="${getLabel(context.state.lang, 'toc.toggle')}" title="${getLabel(context.state.lang, 'toc.toggle')}" aria-expanded="${context.state.tocOpen}">
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

      <aside id="tocPanel" class="toc-panel" aria-label="${getLabel(context.state.lang, 'toc.title')}">
        <div id="tocResizeHandle" class="toc-resize-handle" role="separator" aria-orientation="vertical" aria-label="${getLabel(context.state.lang, 'aria.resizeContents')}"></div>
        <div class="toc-header">
          <h2>${getLabel(context.state.lang, 'toc.title')}</h2>
          <div class="toc-actions">
            <button id="tocSearchToggle" class="icon-button" type="button" aria-label="${getLabel(context.state.lang, 'toc.search')}" title="${getLabel(context.state.lang, 'toc.search')}" aria-pressed="false">
              <span class="search-icon" aria-hidden="true"></span>
            </button>
            <button id="tocCollapseToggle" class="icon-button toc-collapse-toggle" type="button"></button>
          </div>
        </div>
        <label class="search toc-search">
          <span class="search-icon" aria-hidden="true"></span>
          <input id="tocSearchInput" type="search" placeholder="${getLabel(context.state.lang, 'toc.search')}" autocomplete="off" />
        </label>
        <nav id="tocNav" class="toc-nav"></nav>
      </aside>
    </div>
  `;

  bindShellEvents(context);

  shellRefs = {
    languageToggle: document.querySelector('#languageToggle'),
    navToggle: document.querySelector('#navToggle'),
    themeToggle: document.querySelector('#themeToggle'),
    tocToggle: document.querySelector('#tocToggle'),
    navOverlay: document.querySelector('#navOverlay'),
    tocOverlay: document.querySelector('#tocOverlay'),
    sidebar: document.querySelector('.sidebar'),
    tocResizeHandle: document.querySelector('#tocResizeHandle'),
  };
}

export function updateShellLabels(context: AppContext): void {
  shellRefs?.navOverlay?.setAttribute('aria-label', getLabel(context.state.lang, 'aria.closeNavigation'));
  shellRefs?.tocOverlay?.setAttribute('aria-label', getLabel(context.state.lang, 'aria.closeContents'));
  shellRefs?.sidebar?.setAttribute('aria-label', getLabel(context.state.lang, 'aria.nav'));
  shellRefs?.tocResizeHandle?.setAttribute('aria-label', getLabel(context.state.lang, 'aria.resizeContents'));
  shellRefs?.languageToggle?.setAttribute('aria-label', getLabel(context.state.lang, 'aria.switchLanguage'));
  shellRefs?.themeToggle?.setAttribute('aria-label', getLabel(context.state.lang, 'aria.switchTheme'));
}

export function renderTopbarControls(context: AppContext, activeDoc: Doc): void {
  const { languageToggle, navToggle, themeToggle, tocToggle } = shellRefs ?? {};

  if (languageToggle) {
    languageToggle.textContent = context.state.lang.toUpperCase();
    languageToggle.title = getLabel(context.state.lang, context.state.lang === 'ru' ? 'language.switchToEnglish' : 'language.switchToRussian');
  }

  if (navToggle) {
    navToggle.setAttribute('aria-label', getLabel(context.state.lang, 'menu.label'));
    const label = navToggle.querySelector('span:last-child');
    if (label) {
      label.textContent = getLabel(context.state.lang, 'menu.label');
    }
  }

  if (themeToggle) {
    themeToggle.innerHTML = getThemeIcon(context.state.theme);
    themeToggle.title = getThemeToggleTitle(context, context.state.theme);
    themeToggle.setAttribute('aria-label', getLabel(context.state.lang, 'aria.switchTheme'));
  }

  if (tocToggle) {
    const title = getTocTitle(activeDoc);
    tocToggle.setAttribute('aria-label', title);
    tocToggle.setAttribute('title', title);
    tocToggle.setAttribute('aria-expanded', String(context.state.tocOpen));
  }
}

function bindShellEvents(context: AppContext): void {
  document.querySelector<HTMLInputElement>('#searchInput')?.addEventListener('input', (event) => {
    context.state.search = (event.currentTarget as HTMLInputElement).value;
    context.renderNav();
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

      if (context.state.navExpandedIds.has(id)) {
        context.state.navExpandedIds.delete(id);
      } else {
        context.state.navExpandedIds.add(id);
      }

      const expanded = context.state.navExpandedIds.has(id);
      const item = toggle.closest<HTMLElement>('.nav-item');
      toggle.setAttribute('aria-expanded', String(expanded));
      item?.setAttribute('data-expanded', String(expanded));
      return;
    }

    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a.doc-link');

    if (!link) {
      return;
    }

    navigateToLink(event, link, context.state, context.render);
    context.setNavOpen(false);
  });

  document.querySelector<HTMLButtonElement>('#navToggle')?.addEventListener('click', () => {
    context.setNavOpen(!context.state.navOpen);
  });

  document.querySelector<HTMLButtonElement>('#navOverlay')?.addEventListener('click', () => {
    context.setNavOpen(false);
  });

  document.querySelector<HTMLButtonElement>('#tocOverlay')?.addEventListener('click', () => {
    context.setTocOpen(false);
  });

  document.querySelector<HTMLButtonElement>('#tocToggle')?.addEventListener('click', () => {
    context.setTocOpen(!context.state.tocOpen);
  });

  document.querySelector<HTMLElement>('#tocResizeHandle')?.addEventListener('pointerdown', (event) => {
    startTocResize(context, event);
  });

  document.querySelector<HTMLButtonElement>('#tocSearchToggle')?.addEventListener('click', () => {
    context.state.tocSearchOpen = !context.state.tocSearchOpen;

    if (!context.state.tocSearchOpen) {
      context.state.tocQuery = '';
    }

    context.renderToc();

    if (context.state.tocSearchOpen) {
      document.querySelector<HTMLInputElement>('#tocSearchInput')?.focus();
    }
  });

  document.querySelector<HTMLInputElement>('#tocSearchInput')?.addEventListener('input', (event) => {
    context.state.tocQuery = (event.currentTarget as HTMLInputElement).value;
    context.renderToc();
  });

  document.querySelector<HTMLElement>('#tocNav')?.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    const toggle = target?.closest<HTMLButtonElement>('button.toc-item-toggle');

    if (toggle) {
      const id = toggle.dataset.headingId;

      if (!id) {
        return;
      }

      if (context.state.tocCollapsedIds.has(id)) {
        context.state.tocCollapsedIds.delete(id);
      } else {
        context.state.tocCollapsedIds.add(id);
      }

      context.renderToc();
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

    setActiveHeading(context, id);
    history.replaceState(null, '', `${location.pathname}#${encodeURIComponent(id)}`);
    heading.scrollIntoView({ block: 'start', behavior: 'smooth' });

    if (window.matchMedia('(max-width: 1100px)').matches) {
      context.setTocOpen(false);
    }
  });

  document.querySelector<HTMLButtonElement>('#languageToggle')?.addEventListener('click', () => {
    context.switchLanguage(context.state.lang === 'ru' ? 'en' : 'ru');
  });

  document.querySelector<HTMLButtonElement>('#themeToggle')?.addEventListener('click', () => {
    context.switchTheme(getNextThemePreference(context.state.theme, getResolvedTheme(context)));
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      context.setNavOpen(false);
      context.setTocOpen(false);
    }
  });
}

function getThemeToggleTitle(context: AppContext, theme: ThemePreference): string {
  if (theme === 'auto') {
    return getLabel(context.state.lang, 'theme.followSystem').replace('{theme}', getResolvedTheme(context));
  }

  return theme === 'dark' ? getLabel(context.state.lang, 'theme.switchToLight') : getLabel(context.state.lang, 'theme.switchToDark');
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
