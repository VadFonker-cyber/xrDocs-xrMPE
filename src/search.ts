import type { AppContext } from './app-context';
import { compareDocs, getDocByKey, type Doc, type Lang } from './docs';
import { getLabel } from './locales';
import { getAssetUrl, getDocUrl } from './routing';
import { collectEvent } from './statistics';
import { escapeHtml, escapeRegExp } from './utils/html';
import { normalizeSearch } from './utils/search';

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
  text: string;
  searchText?: string;
  searchTitle?: string;
  searchSection?: string;
};

type SearchIndex = {
  docs: SearchIndexEntry[];
};

let searchStatisticsTimer: number | undefined;
let lastCollectedSearch = '';
let cachedHighlighterKey = '';
let cachedHighlighter: ((value: string) => string) | undefined;
const searchIndexPromises = new Map<Lang, Promise<SearchIndexEntry[]>>();
const searchEntriesByLang = new Map<Lang, SearchIndexEntry[]>();

export async function loadSearchIndex(lang: Lang): Promise<SearchIndexEntry[]> {
  const cachedEntries = searchEntriesByLang.get(lang);

  if (cachedEntries) {
    return cachedEntries;
  }

  let promise = searchIndexPromises.get(lang);

  if (!promise) {
    promise = fetch(getAssetUrl(`search-index.${lang}.json`), { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Search index request failed with ${response.status}.`);
        }

        return response.json() as Promise<SearchIndex>;
      })
      .then((index) => {
        const entries = index.docs.filter((entry) => entry.lang === lang);
        searchEntriesByLang.set(lang, entries);
        return entries;
      });
    searchIndexPromises.set(lang, promise);
  }

  return promise;
}

export async function renderSearchResults(
  context: AppContext,
  nav: HTMLElement,
  query: string,
  request: number,
  getCurrentRequest: () => number,
): Promise<void> {
  const entries = searchEntriesByLang.get(context.state.lang) ?? await loadSearchIndex(context.state.lang);

  if (request !== getCurrentRequest() || query !== context.state.search.trim()) {
    return;
  }

  const results = getSearchResults(query, entries, context.state.lang);
  scheduleSearchStatistics(context, query, results.length);

  if (!results.length) {
    nav.innerHTML = `<p class="empty">${getLabel(context.state.lang, 'doc.empty')}</p>`;
    return;
  }

  const hlFn = buildHighlighter(query, context.state.lang);

  nav.innerHTML = `
    <section class="nav-section search-results">
      <h2>${escapeHtml(getLabel(context.state.lang, 'search.results'))} <span>${results.length}</span></h2>
      ${results
        .map(({ doc, excerpt }) => {
          const active = doc.id === context.state.activeId ? ' aria-current="page"' : '';

          return `
            <a class="doc-link search-result" href="${getDocUrl(doc.id)}"${active}>
              <span>${hlFn(doc.title)}</span>
              <small>${escapeHtml(doc.section)} &middot; ${escapeHtml(doc.path)}</small>
              <p>${hlFn(excerpt)}</p>
            </a>
          `;
        })
        .join('')}
    </section>
  `;
}

function getSearchResults(query: string, entries: SearchIndexEntry[], lang: Lang): SearchResult[] {
  const normalizedQuery = normalizeSearch(query, lang);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);

  if (!terms.length) {
    return [];
  }

  return entries
    .map((entry) => {
      const doc = getDocByKey(entry.lang, entry.id);

      if (!doc) {
        return undefined;
      }

      const title = getEntryTitle(entry);
      const section = getEntrySection(entry);
      const content = getSearchEntryText(entry);
      let score = 0;

      for (const term of terms) {
        if (title.includes(term)) {
          score += 80;
        }

        if (section.includes(term)) {
          score += 35;
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
  const text = entry.text;
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

function getEntryTitle(entry: SearchIndexEntry): string {
  if (!entry.searchTitle) {
    entry.searchTitle = normalizeSearch(entry.title, entry.lang);
  }

  return entry.searchTitle;
}

function getEntrySection(entry: SearchIndexEntry): string {
  if (!entry.searchSection) {
    entry.searchSection = normalizeSearch(entry.section, entry.lang);
  }

  return entry.searchSection;
}

function buildHighlighter(query: string, lang: Lang): (value: string) => string {
  const cacheKey = `${lang}:${query}`;

  if (cacheKey === cachedHighlighterKey && cachedHighlighter) {
    return cachedHighlighter;
  }

  const terms = normalizeSearch(query, lang)
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);

  cachedHighlighterKey = cacheKey;

  if (!terms.length) {
    cachedHighlighter = escapeHtml;
    return cachedHighlighter;
  }

  const pattern = new RegExp(`(${terms.join('|')})`, 'giu');
  cachedHighlighter = (value: string) => escapeHtml(value).replace(pattern, '<mark>$1</mark>');
  return cachedHighlighter;
}

function scheduleSearchStatistics(context: AppContext, query: string, resultCount: number): void {
  const normalizedQuery = query.trim();

  if (searchStatisticsTimer !== undefined) {
    window.clearTimeout(searchStatisticsTimer);
    searchStatisticsTimer = undefined;
  }

  if (normalizedQuery.length < 2) {
    return;
  }

  searchStatisticsTimer = window.setTimeout(() => {
    const key = `${context.state.lang}:${normalizedQuery.toLocaleLowerCase(context.state.lang)}`;

    if (key === lastCollectedSearch) {
      return;
    }

    lastCollectedSearch = key;
    collectEvent('search', {
      lang: context.state.lang,
      query_length: normalizedQuery.length,
      results: resultCount,
    });
  }, 600);
}
