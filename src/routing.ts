import { docs, getDocsByLang, type Lang } from './docs';
import { detectBrowserLang, readSavedLang, type AppState } from './state';

export type Route = {
  lang: Lang;
  id: string;
};

export const basePath = normalizeBasePath(import.meta.env.BASE_URL);

export function readRoute(): Route {
  const savedLang = readSavedLang() || detectBrowserLang();

  if (location.hash.startsWith('#/')) {
    const value = decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\.md$/, '');
    const [maybeLang, ...rest] = value.split('/').filter(Boolean);

    if (maybeLang === 'ru' || maybeLang === 'en') {
      return {
        lang: maybeLang,
        id: rest.join('/'),
      };
    }

    return {
      lang: savedLang,
      id: value,
    };
  }

  const route = readRouteFromPath(location.pathname);

  if (route) {
    return route;
  }

  const prerenderedRoute = readPrerenderedRoute();

  if (prerenderedRoute) {
    return prerenderedRoute;
  }

  return {
    lang: savedLang,
    id: '',
  };
}

export function readRouteFromPath(pathname: string): Route | undefined {
  const path = stripBasePath(decodeURIComponent(pathname))
    .replace(/\/index\.html$/, '/')
    .replace(/^\/+|\/+$/g, '');
  const [maybeLang, ...rest] = path.split('/').filter(Boolean);

  if (maybeLang === 'ru' || maybeLang === 'en') {
    return {
      lang: maybeLang,
      id: rest.join('/').replace(/\.md$/i, ''),
    };
  }

  const langIndex = path.split('/').findIndex((part) => part === 'ru' || part === 'en');

  if (langIndex >= 0) {
    const parts = path.split('/').slice(langIndex);
    const [lang, ...idParts] = parts;

    return {
      lang: lang as Lang,
      id: idParts.join('/').replace(/\.md$/i, ''),
    };
  }

  return undefined;
}

export function getDocUrl(lang: Lang, id: string): string {
  return `${basePath}${lang}/${id.split('/').map(encodeURIComponent).join('/')}/`;
}

export function getAssetUrl(src: string): string {
  if (!isLocalAssetSrc(src)) {
    return src;
  }

  return `${basePath}${src.replace(/^\.?\//, '')}`;
}

function isLocalAssetSrc(src: string): boolean {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(src);
}

export function navigateToLink(event: MouseEvent, link: HTMLAnchorElement, state: AppState, render: () => void): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }

  const url = new URL(link.href);

  if (url.origin !== location.origin || !url.pathname.startsWith(basePath)) {
    return;
  }

  const route = readRouteFromPath(url.pathname);

  if (!route) {
    return;
  }

  event.preventDefault();
  state.lang = route.lang;
  state.activeId = route.id || getDocsByLang(route.lang)[0]?.id || docs[0].id;
  history.pushState(null, '', `${url.pathname}${url.hash}`);
  render();
}

export function normalizeBasePath(value: string): string {
  const normalized = value.replace(/^\/+|\/+$/g, '');

  if (!normalized || value === './') {
    return '/';
  }

  return `/${normalized}/`;
}

export function stripBasePath(pathname: string): string {
  if (basePath === '/') {
    return pathname;
  }

  return pathname.startsWith(basePath) ? `/${pathname.slice(basePath.length)}` : pathname;
}

function readPrerenderedRoute(): Route | undefined {
  const docKey = document.querySelector<HTMLElement>('#docArticle[data-prerendered="true"]')?.dataset.docKey;
  const [lang, ...idParts] = docKey?.split(':') || [];

  if ((lang === 'ru' || lang === 'en') && idParts.length) {
    return {
      lang,
      id: idParts.join(':'),
    };
  }

  return undefined;
}
