import type { AppContext } from './app-context';
import type { TocItem } from './types';
import type { Doc, Lang } from './docs';
import { normalizeSearch } from './search';
import { getLabel } from './locales';
import { clamp, escapeHtml } from './utils/html';
import { maxTocWidth, minTocWidth } from './state';

let headingObserver: IntersectionObserver | undefined;
let headingObserverFrame: number | undefined;
let currentTocItems: TocItem[] = [];
// Cached flat item map — invalidated when the document changes
let tocItemById: Map<string, TocItem> | undefined;
let cachedCollapsibleIds: string[] | undefined;

// Cached DOM references — valid for the lifetime of the shell
type TocRefs = {
  panel: HTMLElement;
  nav: HTMLElement;
  input: HTMLInputElement | null;
  collapseToggle: HTMLButtonElement;
  searchToggle: HTMLButtonElement | null;
  tocToggle: HTMLButtonElement | null;
  heading: HTMLHeadingElement | null;
};

let tocRefs: TocRefs | undefined;

function getOrInitTocRefs(): TocRefs | undefined {
  if (tocRefs) return tocRefs;

  const panel = document.querySelector<HTMLElement>('#tocPanel');
  const nav = document.querySelector<HTMLElement>('#tocNav');
  const collapseToggle = document.querySelector<HTMLButtonElement>('#tocCollapseToggle');

  if (!panel || !nav || !collapseToggle) return undefined;

  return (tocRefs = {
    panel,
    nav,
    input: document.querySelector<HTMLInputElement>('#tocSearchInput'),
    collapseToggle,
    searchToggle: document.querySelector<HTMLButtonElement>('#tocSearchToggle'),
    tocToggle: document.querySelector<HTMLButtonElement>('#tocToggle'),
    heading: panel.querySelector<HTMLHeadingElement>('.toc-header h2'),
  });
}

export function getCurrentTocItems(): TocItem[] {
  return currentTocItems;
}

export function setCurrentTocItems(items: TocItem[]): void {
  currentTocItems = items;
  tocItemById = undefined;
  cachedCollapsibleIds = undefined;
}

export function resetTocState(context: AppContext): void {
  context.state.tocQuery = '';
  context.state.tocCollapsedIds = new Set<string>();
  context.state.activeHeadingId = '';
  currentTocItems = [];
  tocItemById = undefined;
  cachedCollapsibleIds = undefined;
  headingObserver?.disconnect();
  cancelScheduledHeadingObserver();
}

export function setInitialActiveHeadingFromToc(context: AppContext): void {
  const firstHeading = currentTocItems[0];

  if (!context.state.activeHeadingId && firstHeading) {
    context.state.activeHeadingId = firstHeading.id;
  }
}

export function scheduleArticleHeadingObserver(context: AppContext, article: HTMLElement, cacheKey: string): void {
  cancelScheduledHeadingObserver();

  headingObserverFrame = window.requestAnimationFrame(() => {
    headingObserverFrame = undefined;

    if (article.dataset.docKey !== cacheKey) {
      return;
    }

    observeArticleHeadings(context, article);
  });
}

export function cancelScheduledHeadingObserver(): void {
  if (headingObserverFrame === undefined) {
    return;
  }

  window.cancelAnimationFrame(headingObserverFrame);
  headingObserverFrame = undefined;
}

export function renderToc(context: AppContext): void {
  const refs = getOrInitTocRefs();

  if (!refs) {
    return;
  }

  const { panel, nav, input, collapseToggle, searchToggle, tocToggle, heading } = refs;

  panel.hidden = false;
  panel.setAttribute('aria-label', getLabel(context.state.lang, 'toc.title'));
  panel.dataset.searchOpen = String(context.state.tocSearchOpen);
  if (heading) {
    heading.textContent = getLabel(context.state.lang, 'toc.title');
  }

  if (tocToggle) {
    tocToggle.hidden = false;
    tocToggle.setAttribute('aria-expanded', String(context.state.tocOpen));
  }

  if (input) {
    input.placeholder = getLabel(context.state.lang, 'toc.search');
    input.value = context.state.tocQuery;
  }

  if (searchToggle) {
    searchToggle.setAttribute('aria-label', getLabel(context.state.lang, 'toc.search'));
    searchToggle.setAttribute('title', getLabel(context.state.lang, 'toc.search'));
    searchToggle.setAttribute('aria-pressed', String(context.state.tocSearchOpen));
  }

  if (!currentTocItems.length) {
    nav.innerHTML = `<p class="empty">${escapeHtml(getLabel(context.state.lang, 'toc.empty'))}</p>`;
    collapseToggle.hidden = true;
    return;
  }

  const query = context.state.tocQuery.trim();
  const visibleItems = query ? filterTocItems(currentTocItems, query, context.state.lang) : currentTocItems;
  const collapsibleIds = cachedCollapsibleIds ??= getCollapsibleTocIds(currentTocItems);
  const allCollapsed = collapsibleIds.length > 0 && collapsibleIds.every((id) => context.state.tocCollapsedIds.has(id));

  collapseToggle.hidden = false;
  collapseToggle.innerHTML = getCollapseIcon(allCollapsed);
  collapseToggle.setAttribute('aria-label', getLabel(context.state.lang, allCollapsed ? 'toc.expandAll' : 'toc.collapseAll'));
  collapseToggle.setAttribute('title', getLabel(context.state.lang, allCollapsed ? 'toc.expandAll' : 'toc.collapseAll'));
  collapseToggle.onclick = () => {
    context.state.tocCollapsedIds = allCollapsed ? new Set<string>() : new Set(collapsibleIds);
    renderToc(context);
  };

  if (!visibleItems.length) {
    nav.innerHTML = `<p class="empty">${escapeHtml(getLabel(context.state.lang, 'toc.noResults'))}</p>`;
    return;
  }

  nav.innerHTML = renderTocList(context, visibleItems, Boolean(query));
}

export function startTocResize(context: AppContext, event: PointerEvent): void {
  if (event.button !== 0 || window.matchMedia('(max-width: 1100px)').matches) {
    return;
  }

  event.preventDefault();
  document.documentElement.dataset.tocResizing = 'true';

  const resize = (moveEvent: PointerEvent) => {
    setTocWidth(context, window.innerWidth - moveEvent.clientX);
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

export function setTocWidth(context: AppContext, width: number): void {
  context.state.tocWidth = clamp(Math.round(width), minTocWidth, maxTocWidth);
  document.querySelector<HTMLElement>('.layout')?.style.setProperty('--toc-width', `${context.state.tocWidth}px`);
  localStorage.setItem('xrDocsTocWidth', String(context.state.tocWidth));
}

export function setActiveHeading(context: AppContext, id: string): void {
  if (!id || context.state.activeHeadingId === id) {
    return;
  }

  context.state.activeHeadingId = id;
  if (expandTocAncestors(context, id)) {
    renderToc(context);
  } else {
    updateActiveTocLink(context);
  }
}

export function getTocTitle(doc: Doc): string {
  const fileName = doc.id.split('/').filter(Boolean).at(-1) || doc.id || doc.title;
  return `${getLabel(doc.lang, 'toc.toggle')} ${fileName}`;
}

export function getCollapseIcon(expand: boolean): string {
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

function renderTocList(context: AppContext, items: TocItem[], forceOpen: boolean): string {
  return `
    <ol class="toc-list">
      ${items.map((item) => renderTocItem(context, item, forceOpen)).join('')}
    </ol>
  `;
}

function renderTocItem(context: AppContext, item: TocItem, forceOpen: boolean): string {
  const hasChildren = item.children.length > 0;
  const collapsed = !forceOpen && context.state.tocCollapsedIds.has(item.id);
  const active = item.id === context.state.activeHeadingId ? ' aria-current="true"' : '';
  const toggle = hasChildren
    ? `<button class="toc-item-toggle" type="button" data-heading-id="${escapeHtml(item.id)}" aria-label="${getLabel(context.state.lang, 'aria.toggleSection')}" aria-expanded="${!collapsed}"></button>`
    : '<span class="toc-item-spacer" aria-hidden="true"></span>';
  const children = hasChildren && !collapsed ? renderTocList(context, item.children, forceOpen) : '';

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

function getCollapsibleTocIds(items: TocItem[], result: string[] = []): string[] {
  for (const item of items) {
    if (item.children.length) {
      result.push(item.id);
      getCollapsibleTocIds(item.children, result);
    }
  }
  return result;
}

function observeArticleHeadings(context: AppContext, article: HTMLElement): void {
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
        setActiveHeading(context, visible.target.id);
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
    setActiveHeading(context, hashId);
    window.setTimeout(() => document.getElementById(hashId)?.scrollIntoView({ block: 'start' }), 0);
  } else {
    setActiveHeading(context, headings[0].id);
  }
}

function expandTocAncestors(context: AppContext, id: string): boolean {
  if (!tocItemById) {
    tocItemById = new Map<string, TocItem>();
    flattenToc(currentTocItems).forEach((item) => tocItemById!.set(item.id, item));
  }

  let current = tocItemById.get(id);
  let changed = false;

  while (current?.parentId) {
    if (context.state.tocCollapsedIds.delete(current.parentId)) {
      changed = true;
    }

    current = tocItemById.get(current.parentId);
  }

  return changed;
}

function flattenToc(items: TocItem[], result: TocItem[] = []): TocItem[] {
  for (const item of items) {
    result.push(item);
    flattenToc(item.children, result);
  }
  return result;
}

function updateActiveTocLink(context: AppContext): void {
  const nav = tocRefs?.nav ?? document.querySelector<HTMLElement>('#tocNav');

  if (!nav) {
    return;
  }

  nav.querySelectorAll<HTMLAnchorElement>('a.toc-link').forEach((link) => {
    if (link.dataset.headingId === context.state.activeHeadingId) {
      link.setAttribute('aria-current', 'true');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}
