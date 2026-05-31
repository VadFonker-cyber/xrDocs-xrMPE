import type { Doc, Lang } from './docs';

const siteMeta: Record<Lang, { description: string; locale: string }> = {
  ru: {
    description: '\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430\u0446\u0438\u044f \u043f\u043e \u043c\u043e\u0434\u0434\u0438\u043d\u0433\u0443 S.T.A.L.K.E.R. \u0434\u043b\u044f xrMPE.',
    locale: 'ru_RU',
  },
  en: {
    description: 'S.T.A.L.K.E.R. modding documentation for xrMPE.',
    locale: 'en_US',
  },
};

export function updateDocumentMeta(doc: Doc): void {
  const title = `${doc.title} | xrDocs`;
  const description = siteMeta[doc.lang].description;

  setMetaContent('name', 'description', description);
  setMetaContent('property', 'og:title', title);
  setMetaContent('property', 'og:description', description);
  setMetaContent('property', 'og:locale', siteMeta[doc.lang].locale);
  setMetaContent('name', 'twitter:title', title);
  setMetaContent('name', 'twitter:description', description);
}

function setMetaContent(attribute: 'name' | 'property', value: string, content: string): void {
  let element = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${value}"]`);

  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, value);
    document.head.append(element);
  }

  element.content = content;
}
