import type { Doc } from './docs';
import { siteMeta, siteName } from './site-meta';

export function updateDocumentMeta(doc: Doc): void {
  const title = `${doc.title} | ${siteName}`;
  const description = siteMeta[doc.lang].description;

  setMetaContent('name', 'description', description);
  setMetaContent('property', 'og:title', title);
  setMetaContent('property', 'og:description', description);
  setMetaContent('property', 'og:locale', siteMeta[doc.lang].locale);
  setMetaContent('name', 'twitter:title', title);
  setMetaContent('name', 'twitter:description', description);
}

const metaCache = new Map<string, HTMLMetaElement>();

function setMetaContent(attribute: 'name' | 'property', value: string, content: string): void {
  const cacheKey = `${attribute}:${value}`;
  let element = metaCache.get(cacheKey);

  if (!element) {
    const existing = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${value}"]`);
    element = existing ?? document.createElement('meta');
    if (!existing) {
      element.setAttribute(attribute, value);
      document.head.append(element);
    }
    metaCache.set(cacheKey, element);
  }

  element.content = content;
}
