import { escapeHtml } from './string-utils.mjs';

export function renderShellHtml({
  articleAttributes = '',
  articleHtml = '',
  copy,
  getAssetUrl,
  githubUrl,
  lang,
  navHtml = '',
  notFound = false,
  tocOpen = false,
  tocWidth = 360,
}) {
  const hiddenAttribute = notFound ? ' hidden' : '';
  const layoutAttributes = notFound ? ' data-not-found="true"' : '';
  const closeNavigationLabel = label(copy, 'aria.closeNavigation');
  const closeContentsLabel = label(copy, 'aria.closeContents');
  const navLabel = label(copy, 'aria.nav', 'Documentation navigation');
  const menuLabel = label(copy, 'menu.label', 'Menu');
  const resizeContentsLabel = label(copy, 'aria.resizeContents');
  const searchPlaceholder = label(copy, 'search.placeholder');
  const switchLanguageLabel = label(copy, 'aria.switchLanguage');
  const switchThemeLabel = label(copy, 'aria.switchTheme');
  const tocTitle = label(copy, 'toc.title', 'Contents');
  const tocToggleLabel = label(copy, 'toc.toggle');
  const tocSearchLabel = label(copy, 'toc.search');

  return `
    <div class="layout"${layoutAttributes} data-nav-open="false" data-toc-open="${tocOpen}" style="--toc-width: ${tocWidth}px">
      <button id="navOverlay" class="nav-overlay" type="button" aria-label="${closeNavigationLabel}"${hiddenAttribute}></button>
      <button id="tocOverlay" class="toc-overlay" type="button" aria-label="${closeContentsLabel}"${hiddenAttribute}></button>
      <aside class="sidebar" aria-label="${navLabel}"${hiddenAttribute}>
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
            <input id="searchInput" type="search" placeholder="${searchPlaceholder}" autocomplete="off" />
          </label>
        </div>

        <nav id="docNav" class="doc-nav">${navHtml}</nav>
      </aside>

      <main class="workspace">
        <section class="topbar"${hiddenAttribute}>
          <div class="topbar-controls">
            <button id="navToggle" class="control-button nav-toggle" type="button" aria-label="${menuLabel}" aria-expanded="false">
              <span class="menu-icon" aria-hidden="true"></span>
              <span>${menuLabel}</span>
            </button>
            <button id="languageToggle" class="control-button" type="button" aria-label="${switchLanguageLabel}">${escapeHtml(lang.toUpperCase())}</button>
            <button id="themeToggle" class="icon-button" type="button" aria-label="${switchThemeLabel}" title="${switchThemeLabel}"></button>
            <button id="tocToggle" class="icon-button toc-toggle" type="button" aria-label="${tocToggleLabel}" title="${tocToggleLabel}" aria-expanded="${tocOpen}">
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
          <article id="docArticle" class="doc-article"${articleAttributes}>${articleHtml}</article>
        </section>
      </main>

      <aside id="tocPanel" class="toc-panel" aria-label="${tocTitle}"${hiddenAttribute}>
        <div id="tocResizeHandle" class="toc-resize-handle" role="separator" aria-orientation="vertical" aria-label="${resizeContentsLabel}"></div>
        <div class="toc-header">
          <h2>${tocTitle}</h2>
          <div class="toc-actions">
            <button id="tocSearchToggle" class="icon-button" type="button" aria-label="${tocSearchLabel}" title="${tocSearchLabel}" aria-pressed="false">
              <span class="search-icon" aria-hidden="true"></span>
            </button>
            <button id="tocCollapseToggle" class="icon-button toc-collapse-toggle" type="button"></button>
          </div>
        </div>
        <label class="search toc-search">
          <span class="search-icon" aria-hidden="true"></span>
          <input id="tocSearchInput" type="search" placeholder="${tocSearchLabel}" autocomplete="off" />
        </label>
        <nav id="tocNav" class="toc-nav"></nav>
      </aside>

      <div id="copyToast" class="copy-toast" role="status" aria-live="polite" aria-atomic="true" hidden></div>
    </div>
  `;
}

function label(copy, key, fallback = '') {
  return escapeHtml(copy[key] || fallback);
}

/**
 * Shared 404 article markup — used by the prerender script (Node) and the SPA
 * router (browser) so the not-found page renders identically in both paths.
 */
export function renderNotFoundArticle({ title, message, homeLink, homeUrl }) {
  return `
    <div class="not-found">
      <p class="not-found-code">404</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <a class="not-found-link" href="${homeUrl}">${escapeHtml(homeLink)}</a>
    </div>
  `;
}
