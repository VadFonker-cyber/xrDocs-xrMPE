import type { Doc, Lang } from './docs';
import { siteMeta, siteName } from './site-meta';
import { getLabel } from './locales';
import { getDocUrl } from './routing';

export function updateDocumentMeta(doc: Doc): void {
  const title = `${doc.title} | ${siteName}`;
  const description = siteMeta[doc.lang].description;
  const canonicalUrl = new URL(getDocUrl(doc.id), window.location.origin).toString();

  setMetaContent('name', 'description', description);
  setMetaContent('property', 'og:title', title);
  setMetaContent('property', 'og:description', description);
  setMetaContent('property', 'og:url', canonicalUrl);
  setMetaContent('property', 'og:locale', siteMeta[doc.lang].locale);
  setMetaContent('name', 'twitter:title', title);
  setMetaContent('name', 'twitter:description', description);
  removeMeta('name', 'robots');
}

export function updateNotFoundMeta(lang: Lang): void {
  const title = `${getLabel(lang, 'notFound.title')} | ${siteName}`;
  const description = getLabel(lang, 'notFound.message');

  setMetaContent('name', 'description', description);
  setMetaContent('property', 'og:title', title);
  setMetaContent('property', 'og:description', description);
  setMetaContent('property', 'og:locale', siteMeta[lang].locale);
  setMetaContent('name', 'twitter:title', title);
  setMetaContent('name', 'twitter:description', description);
  setMetaContent('name', 'robots', 'noindex, nofollow');
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

function removeMeta(attribute: 'name' | 'property', value: string): void {
  const cacheKey = `${attribute}:${value}`;
  const cached = metaCache.get(cacheKey);
  const element = cached ?? document.querySelector<HTMLMetaElement>(`meta[${attribute}="${value}"]`);

  element?.remove();
  metaCache.delete(cacheKey);
}
