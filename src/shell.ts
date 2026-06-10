import type { AppContext } from './app-context';
import { getDocCacheKey } from './article';
import type { Doc } from './docs';
import { getLabel, labels } from './locales';
import { basePath, getAssetUrl, navigateToLink, readRouteFromPath } from './routing';
import { getNextThemePreference, getResolvedTheme } from './theme';
import { getTocTitle, highlightHashTarget, highlightHeading, setActiveHeading, startTocResize, bindTocCollapseToggle } from './toc';
import { escapeHtml } from './utils/html';
import type { ThemePreference } from './state';

const githubUrl = 'https://github.com/VadFonker-cyber/xrDocs-xrMPE';
const codeCopyFeedbackMs = 2200;
const codeCopyErrorFeedbackMs = 3000;
const copyToastVisibleMs = 2400;
const copyFeedbackFadeMs = 220;
const copyToastFadeMs = 260;

type ShellRefs = {
  layout: HTMLElement | null;
  searchInput: HTMLInputElement | null;
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
let nextCodeCopyRequestId = 0;
let copyToastTimer: number | undefined;
let searchModulePromise: Promise<typeof import('./search')> | undefined;
const codeCopyRequestIds = new WeakMap<HTMLButtonElement, number>();
const codeCopyResetTimers = new WeakMap<HTMLButtonElement, number>();

export function getShellRefs(): ShellRefs | null {
  return shellRefs;
}

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
                <path fill-rule="evenodd" clip-rule="evenodd" d="M12.026 2c-5.509 0-9.974 4.465-9.974 9.974c0 4.406 2.857 8.145 6.821 9.465c.499.09.679-.217.679-.481c0-.237-.008-.865-.011-1.696c-2.775.602-3.361-1.338-3.361-1.338c-.452-1.152-1.107-1.459-1.107-1.459c-.905-.619.069-.605.069-.605c1.002.07 1.527 1.028 1.527 1.028c.89 1.524 2.336 1.084 2.902.829c.091-.645.351-1.085.635-1.334c-2.214-.251-4.542-1.107-4.542-4.93c0-1.087.389-1.979 1.024-2.675c-.101-.253-.446-1.268.099-2.64c0 0 .837-.269 2.742 1.021a9.582 9.582 0 0 1 2.496-.336a9.554 9.554 0 0 1 2.496.336c1.906-1.291 2.742-1.021 2.742-1.021c.545 1.372.203 2.387.099 2.64c.64.696 1.024 1.587 1.024 2.675c0 3.833-2.33 4.675-4.552 4.922c.355.308.675.916.675 1.846c0 1.334-.012 2.41-.012 2.737c0 .267.178.577.687.479C19.146 20.115 22 16.379 22 11.974C22 6.465 17.535 2 12.026 2z" />
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

      <div id="copyToast" class="copy-toast" role="status" aria-live="polite" aria-atomic="true" hidden></div>
    </div>
  `;

  bindShellEvents(context);

  shellRefs = {
    layout: document.querySelector('.layout'),
    searchInput: document.querySelector('#searchInput'),
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

export function renderTopbarControls(context: AppContext, activeDoc?: Doc): void {
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
    const title = activeDoc ? getTocTitle(activeDoc) : getLabel(context.state.lang, 'toc.toggle');
    tocToggle.setAttribute('aria-label', title);
    tocToggle.setAttribute('title', title);
    tocToggle.setAttribute('aria-expanded', String(context.state.tocOpen));
  }
}

function bindShellEvents(context: AppContext): void {
  const searchInput = document.querySelector<HTMLInputElement>('#searchInput');

  searchInput?.addEventListener('input', (event) => {
    context.state.search = (event.currentTarget as HTMLInputElement).value;
    context.renderNav();
  });

  searchInput?.addEventListener('focus', () => {
    searchModulePromise ??= import('./search');
    void searchModulePromise.then(({ loadSearchIndex }) => {
      void loadSearchIndex(context.state.lang);
    });
  });

  bindTocCollapseToggle(context);

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

  document.querySelector<HTMLElement>('#docArticle')?.addEventListener('click', (event) => {
    const target = event.target as Element | null;

    const copyBtn = target?.closest<HTMLButtonElement>('.code-copy-btn');
    if (copyBtn) {
      if (isPrimaryPlainClick(event)) {
        event.preventDefault();
        event.stopPropagation();
        void handleCodeCopyButton(copyBtn, context);
      }
      return;
    }

    const link = target?.closest<HTMLAnchorElement>('a');

    if (!link) {
      return;
    }

    if (link.classList.contains('heading-anchor')) {
      if (isPrimaryPlainClick(event)) {
        event.preventDefault();
        void copyTextToClipboard(link.href);
      }

      return;
    }

    if (!shouldHandleArticleLink(context, event, link)) {
      return;
    }

    navigateToLink(event, link, context.state, context.render);
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
    highlightHeading(heading);

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

  window.addEventListener('hashchange', () => {
    window.setTimeout(() => {
      highlightHashTarget(context);
    }, 0);
  });
}

function shouldHandleArticleLink(context: AppContext, event: MouseEvent, link: HTMLAnchorElement): boolean {
  if (!isPrimaryPlainClick(event)) {
    return false;
  }

  if (link.hasAttribute('download') || (link.target && link.target.toLowerCase() !== '_self')) {
    return false;
  }

  const href = link.getAttribute('href')?.trim();

  if (!href || href === '#') {
    return false;
  }

  const url = new URL(link.href);

  if (url.origin !== location.origin || !url.pathname.startsWith(basePath)) {
    return false;
  }

  const route = readRouteFromPath(url.pathname, context.state.lang);

  if (!route) {
    return false;
  }

  return true;
}

function isPrimaryPlainClick(event: MouseEvent): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

async function handleCodeCopyButton(copyBtn: HTMLButtonElement, context: AppContext): Promise<void> {
  const code = copyBtn.closest('.code-block')?.querySelector('code');

  if (!code) {
    return;
  }

  const requestId = nextCodeCopyRequestId + 1;
  nextCodeCopyRequestId = requestId;
  codeCopyRequestIds.set(copyBtn, requestId);
  clearCodeCopyResetTimer(copyBtn);
  setCodeCopyState(copyBtn, 'pending', copyBtn.dataset.labelCopy ?? getLabel(context.state.lang, 'code.copy'));

  const copied = await copyTextToClipboard(code.textContent ?? '');

  if (codeCopyRequestIds.get(copyBtn) !== requestId) {
    return;
  }

  const label = copied
    ? copyBtn.dataset.labelCopied ?? getLabel(context.state.lang, 'code.copied')
    : copyBtn.dataset.labelFailed ?? getLabel(context.state.lang, 'code.copyFailed');

  setCodeCopyState(copyBtn, copied ? 'copied' : 'failed', label);

  if (!copied) {
    showCopyToast(label, 'error');
  }

  const resetTimer = window.setTimeout(() => {
    if (codeCopyRequestIds.get(copyBtn) === requestId) {
      fadeOutCodeCopyButton(copyBtn, context, requestId);
    }
  }, copied ? codeCopyFeedbackMs : codeCopyErrorFeedbackMs);

  codeCopyResetTimers.set(copyBtn, resetTimer);
}

function setCodeCopyState(copyBtn: HTMLButtonElement, state: 'pending' | 'copied' | 'failed', label: string): void {
  copyBtn.dataset.copyState = state;
  copyBtn.setAttribute('aria-label', label);
  copyBtn.setAttribute('title', label);
}

function resetCodeCopyButton(copyBtn: HTMLButtonElement, context: AppContext): void {
  clearCodeCopyResetTimer(copyBtn);
  copyBtn.removeAttribute('data-copy-state');
  const copyLabel = copyBtn.dataset.labelCopy ?? getLabel(context.state.lang, 'code.copy');
  copyBtn.setAttribute('aria-label', copyLabel);
  copyBtn.setAttribute('title', copyLabel);
}

function fadeOutCodeCopyButton(copyBtn: HTMLButtonElement, context: AppContext, requestId: number): void {
  const previousState = copyBtn.dataset.copyState;

  if (previousState !== 'copied' && previousState !== 'failed') {
    resetCodeCopyButton(copyBtn, context);
    return;
  }

  copyBtn.dataset.copyState = previousState === 'copied' ? 'copied-leaving' : 'failed-leaving';

  const fadeTimer = window.setTimeout(() => {
    if (codeCopyRequestIds.get(copyBtn) === requestId) {
      resetCodeCopyButton(copyBtn, context);
    }
  }, copyFeedbackFadeMs);

  codeCopyResetTimers.set(copyBtn, fadeTimer);
}

function clearCodeCopyResetTimer(copyBtn: HTMLButtonElement): void {
  const resetTimer = codeCopyResetTimers.get(copyBtn);

  if (resetTimer !== undefined) {
    window.clearTimeout(resetTimer);
    codeCopyResetTimers.delete(copyBtn);
  }
}

function showCopyToast(message: string, variant: 'success' | 'error'): void {
  const toast = document.querySelector<HTMLElement>('#copyToast');

  if (!toast) {
    return;
  }

  if (copyToastTimer !== undefined) {
    window.clearTimeout(copyToastTimer);
    copyToastTimer = undefined;
  }

  toast.hidden = false;
  toast.textContent = message;
  toast.dataset.variant = variant;

  window.requestAnimationFrame(() => {
    toast.dataset.visible = 'true';
  });

  copyToastTimer = window.setTimeout(() => {
    toast.dataset.visible = 'false';
    copyToastTimer = window.setTimeout(() => {
      toast.hidden = true;
      toast.textContent = '';
      delete toast.dataset.variant;
      copyToastTimer = undefined;
    }, copyToastFadeMs);
  }, copyToastVisibleMs);
}

async function copyTextToClipboard(value: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) {
    return fallbackCopyText(value);
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return fallbackCopyText(value);
  }
}

function fallbackCopyText(value: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.append(textarea);
  textarea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
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
