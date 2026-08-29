import type { AppContext } from './app-context';
import { getDocCacheKey } from './article';
import type { Doc } from './docs';
import { getLabel, labels } from './locales';
import { basePath, getAssetUrl, navigateToLink, readRouteFromPath } from './routing';
import { loadSearchModule } from './search-loader';
import { getNextThemePreference, getResolvedTheme } from './theme';
import { getTocTitle, highlightHashTarget, highlightHeading, setActiveHeading, startTocResize, bindTocCollapseToggle } from './toc';
import { debounce } from './utils/debounce';
import { escapeHtml } from './utils/html';
import type { ThemePreference } from './state';
import { githubUrl } from './site-meta';
import { renderShellHtml } from '../scripts/shell-template.mjs';

const codeCopyFeedbackMs = 2200;
const codeCopyErrorFeedbackMs = 3000;
const copyToastVisibleMs = 2400;
const copyFeedbackFadeMs = 220;
const copyToastFadeMs = 260;
// Rendering the full nav/TOC on every keystroke is wasteful — the input state
// updates immediately, only the re-render is debounced.
const navSearchRenderDelayMs = 180;
const tocSearchRenderDelayMs = 120;

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
  topbar: HTMLElement | null;
  tocPanel: HTMLElement | null;
  tocResizeHandle: HTMLElement | null;
};

let shellRefs: ShellRefs | null = null;
let nextCodeCopyRequestId = 0;
let copyToastTimer: number | undefined;
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

  context.appRoot.innerHTML = renderShellHtml({
    articleAttributes: prerenderedArticleAttributes,
    articleHtml: prerenderedArticleHtml,
    copy,
    getAssetUrl,
    githubUrl,
    lang: context.state.lang,
    notFound: context.state.notFound,
    tocOpen: context.state.tocOpen,
    tocWidth: context.state.tocWidth,
  });

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
    topbar: document.querySelector('.topbar'),
    tocPanel: document.querySelector('#tocPanel'),
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
  const renderNavOnSearch = debounce(() => context.renderNav(), navSearchRenderDelayMs);

  searchInput?.addEventListener('input', (event) => {
    context.state.search = (event.currentTarget as HTMLInputElement).value;
    renderNavOnSearch();
  });

  searchInput?.addEventListener('focus', () => {
    void loadSearchModule().then(({ loadSearchIndex }) => {
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

  const renderTocOnSearch = debounce(() => context.renderToc(), tocSearchRenderDelayMs);

  document.querySelector<HTMLInputElement>('#tocSearchInput')?.addEventListener('input', (event) => {
    context.state.tocQuery = (event.currentTarget as HTMLInputElement).value;
    renderTocOnSearch();
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
    window.requestAnimationFrame(() => {
      highlightHashTarget(context);
    });
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
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
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
