import type { AppContext } from './app-context';
import type { TocItem } from './types';
import type { Doc, Lang } from './docs';
import { getLabel } from './locales';
import { resolveHeadingAlias } from './heading-aliases';
import { clamp, escapeHtml } from './utils/html';
import { normalizeSearch } from './utils/search';
import { flattenToc } from './utils/toc-builder';
import { maxTocWidth, minTocWidth } from './state';

let headingObserver: IntersectionObserver | undefined;
let headingObserverFrame: number | undefined;
let currentTocItems: TocItem[] = [];
// Cached flat item map — invalidated when the document changes
let tocItemById: Map<string, TocItem> | undefined;
let cachedCollapsibleIds: string[] | undefined;
// Last link that received aria-current — enables O(1) active-link updates
let lastActiveTocLink: HTMLAnchorElement | undefined;
const headingHighlightTimers = new WeakMap<HTMLElement, number>();

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

export function bindTocCollapseToggle(context: AppContext): void {
  const collapseToggle = document.querySelector<HTMLButtonElement>('#tocCollapseToggle');
  if (!collapseToggle) return;

  collapseToggle.addEventListener('click', () => {
    const allCollapsed = collapseToggle.dataset.allCollapsed === 'true';
    const collapsibleIds = collapseToggle.dataset.collapsibleIds
      ? collapseToggle.dataset.collapsibleIds.split(',').filter(Boolean)
      : [];
    context.state.tocCollapsedIds = allCollapsed ? new Set<string>() : new Set(collapsibleIds);
    renderToc(context);
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
  collapseToggle.dataset.allCollapsed = String(allCollapsed);
  collapseToggle.dataset.collapsibleIds = collapsibleIds.join(',');

  if (!visibleItems.length) {
    nav.innerHTML = `<p class="empty">${escapeHtml(getLabel(context.state.lang, 'toc.noResults'))}</p>`;
    return;
  }

  nav.innerHTML = renderTocList(context, visibleItems, Boolean(query));
}

// Cached layout element — set on first use, valid for the lifetime of the shell
let cachedLayoutEl: HTMLElement | null | undefined;

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
    localStorage.setItem('xrDocsTocWidth', String(context.state.tocWidth));
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
  if (cachedLayoutEl === undefined) {
    cachedLayoutEl = document.querySelector<HTMLElement>('.layout');
  }
  cachedLayoutEl?.style.setProperty('--toc-width', `${context.state.tocWidth}px`);
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

export function highlightHeading(heading: HTMLElement): void {
  const currentTimer = headingHighlightTimers.get(heading);

  if (currentTimer !== undefined) {
    window.clearTimeout(currentTimer);
  }

  heading.classList.remove('heading-target-highlight');
  void heading.offsetWidth;
  heading.classList.add('heading-target-highlight');

  headingHighlightTimers.set(
    heading,
    window.setTimeout(() => {
      heading.classList.remove('heading-target-highlight');
      headingHighlightTimers.delete(heading);
    }, 2000),
  );
}

export function highlightHashTarget(context: AppContext, scroll = false): boolean {
  const rawHashId = decodeURIComponent(location.hash.replace(/^#/, ''));

  if (!rawHashId) {
    return false;
  }

  const hashId = resolveHeadingAlias(context.state.lang, context.state.activeId, rawHashId);
  const target = document.getElementById(hashId);

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (hashId !== rawHashId) {
    history.replaceState(null, '', `${location.pathname}${location.search}#${encodeURIComponent(hashId)}`);
  }

  setActiveHeading(context, hashId);

  if (scroll) {
    target.scrollIntoView({ block: 'start' });
  }

  highlightHeading(target);
  return true;
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

  const rawHashId = decodeURIComponent(location.hash.replace(/^#/, ''));
  const hashId = rawHashId ? resolveHeadingAlias(context.state.lang, context.state.activeId, rawHashId) : '';
  const hashTarget = hashId ? headings.find((heading) => heading.id === hashId) : undefined;

  if (hashTarget) {
    if (hashId !== rawHashId) {
      history.replaceState(null, '', `${location.pathname}${location.search}#${encodeURIComponent(hashId)}`);
    }

    setActiveHeading(context, hashId);
    window.requestAnimationFrame(() => {
      hashTarget.scrollIntoView({ block: 'start' });
      setActiveHeading(context, hashId);
      highlightHeading(hashTarget);
      headings.forEach((heading) => headingObserver?.observe(heading));
    });
    return;
  }

  headings.forEach((heading) => headingObserver?.observe(heading));
  setActiveHeading(context, headings[0].id);
}

function expandTocAncestors(context: AppContext, id: string): boolean {
  if (!tocItemById) {
    const map = new Map<string, TocItem>();
    flattenToc(currentTocItems).forEach((item) => map.set(item.id, item));
    tocItemById = map;
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

function updateActiveTocLink(context: AppContext): void {
  const nav = tocRefs?.nav ?? document.querySelector<HTMLElement>('#tocNav');

  if (!nav) {
    return;
  }

  if (lastActiveTocLink?.isConnected) {
    lastActiveTocLink.removeAttribute('aria-current');
  }

  lastActiveTocLink = undefined;

  const activeId = context.state.activeHeadingId;

  if (!activeId) {
    return;
  }

  const link = nav.querySelector<HTMLAnchorElement>(`a.toc-link[data-heading-id="${CSS.escape(activeId)}"]`);

  if (link) {
    link.setAttribute('aria-current', 'true');
    lastActiveTocLink = link;
  }
}
