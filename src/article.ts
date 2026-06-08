import type { Doc } from './docs';
import { basePath, getAssetUrl } from './routing';
import type { TocItem, RenderedDoc } from './types';
import { buildTocTree } from './utils/toc-builder';

export type { TocItem, RenderedDoc };

const renderedDocCache = new Map<string, RenderedDoc>();
const renderedDocFetches = new Map<string, Promise<RenderedDoc>>();
let articleRenderRequest = 0;

export async function loadActiveArticle(
  activeDoc: Doc,
  onLoaded: (article: HTMLElement, cacheKey: string, renderedDoc: RenderedDoc) => void,
): Promise<void> {
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

  if (request !== articleRenderRequest) {
    return;
  }

  if (article.dataset.docKey !== cacheKey) {
    article.innerHTML = renderedDoc.html;
    article.dataset.docKey = cacheKey;
  }

  article.removeAttribute('aria-busy');
  onLoaded(article, cacheKey, renderedDoc);
}

export async function loadRenderedDoc(doc: Doc): Promise<RenderedDoc> {
  const cacheKey = getDocCacheKey(doc);
  const cachedFetch = renderedDocFetches.get(cacheKey);

  if (cachedFetch) {
    return cachedFetch;
  }

  const fetchPromise = import.meta.env.DEV ? renderMarkdownDoc(doc) : fetchRenderedDoc(doc);
  renderedDocFetches.set(cacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } catch (error) {
    renderedDocFetches.delete(cacheKey);
    throw error;
  }
}

export async function fetchRenderedDoc(doc: Doc): Promise<RenderedDoc> {
  const response = await fetch(getAssetUrl(getRenderedDocAssetPath(doc)), { cache: 'force-cache' });

  if (!response.ok) {
    throw new Error(`Rendered document request failed for ${doc.path} with ${response.status}.`);
  }

  return response.json() as Promise<RenderedDoc>;
}

export async function renderMarkdownDoc(doc: Doc): Promise<RenderedDoc> {
  const content = await loadDevDocContent(doc);
  const { renderDocContent } = await import('./markdown-renderer');
  return renderDocContent(content, doc.lang, { basePath });
}

export async function loadDevDocContent(doc: Doc): Promise<string> {
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

export function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) {
    return raw;
  }

  const end = raw.indexOf('\n---', 3);

  if (end === -1) {
    return raw;
  }

  return raw.slice(end + 4).replace(/^\s+/, '');
}

export function createTocFromArticle(article: HTMLElement): TocItem[] {
  const headings = article.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]');

  return buildTocTree(
    Array.from(headings).map((heading) => ({
      id: heading.id,
      level: Number(heading.tagName.slice(1)),
      title: heading.textContent?.trim() || heading.id,
    })),
  );
}

export function getDocCacheKey(doc: Doc): string {
  return `${doc.lang}:${doc.id}`;
}

function getRenderedDocAssetPath(doc: Doc): string {
  return `doc-content/${doc.lang}/${doc.id.split('/').map(encodeURIComponent).join('/')}/index.json`;
}
