import { docs, getDocsByLang, type Lang } from './docs';
import { readSavedLang, type AppState } from './state';

export type Route = {
  lang: Lang;
  id: string;
};

export const basePath = normalizeBasePath(import.meta.env.BASE_URL);
const defaultLang: Lang = 'en';

export function readRoute(): Route {
  const savedLang = readSavedLang() || defaultLang;

  if (location.hash.startsWith('#/')) {
    const value = decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\.md$/, '');

    return {
      lang: savedLang,
      id: value,
    };
  }

  const route = readRouteFromPath(location.pathname, savedLang);

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

export function readRouteFromPath(pathname: string, lang: Lang = readSavedLang() || defaultLang): Route | undefined {
  const path = stripBasePath(decodeURIComponent(pathname))
    .replace(/\/index\.html$/, '/')
    .replace(/^\/+|\/+$/g, '');

  return {
    lang,
    id: path.replace(/\.md$/i, ''),
  };
}

export function getDocUrl(id: string, basePathOverride = basePath): string {
  if (id === 'index') {
    return basePathOverride;
  }

  const encodedId = id.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return encodedId ? `${basePathOverride}${encodedId}/` : basePathOverride;
}

export function getAssetUrl(src: string, basePathOverride = basePath): string {
  if (!isLocalAssetSrc(src)) {
    return src;
  }

  return `${basePathOverride}${src.replace(/^\.?\//, '')}`;
}

export function isLocalAssetSrc(src: string): boolean {
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

  const route = readRouteFromPath(url.pathname, state.lang);

  if (!route) {
    return;
  }

  event.preventDefault();
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
