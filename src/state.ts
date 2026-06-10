import { docs, getDocsByLang, type Lang } from './docs';
import { clamp } from './utils/html';

export type Theme = 'dark' | 'light';
export type ThemePreference = Theme | 'auto';

export type AppState = {
  search: string;
  lang: Lang;
  activeId: string;
  notFound: boolean;
  requestedPath?: string;
  navOpen: boolean;
  tocOpen: boolean;
  tocSearchOpen: boolean;
  tocWidth: number;
  tocQuery: string;
  tocCollapsedIds: Set<string>;
  navExpandedIds: Set<string>;
  activeHeadingId: string;
  theme: ThemePreference;
};

export const minTocWidth = 280;
export const maxTocWidth = 560;

export function createAppState(initialRoute: { lang: Lang; id: string; notFound?: boolean; requestedPath?: string }): AppState {
  return {
    search: '',
    lang: initialRoute.lang,
    activeId: initialRoute.id || getDocsByLang(initialRoute.lang)[0]?.id || docs[0].id,
    notFound: Boolean(initialRoute.notFound),
    requestedPath: initialRoute.requestedPath,
    navOpen: false,
    tocOpen: readTocOpen(),
    tocSearchOpen: false,
    tocWidth: readTocWidth(),
    tocQuery: '',
    tocCollapsedIds: new Set<string>(),
    navExpandedIds: new Set<string>(),
    activeHeadingId: '',
    theme: readTheme(),
  };
}

export function readTheme(): ThemePreference {
  const savedTheme = localStorage.getItem('xrDocsTheme');

  if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'auto') {
    return savedTheme;
  }

  return 'auto';
}

export function readTocOpen(): boolean {
  const savedTocOpen = localStorage.getItem('xrDocsTocOpen');

  if (savedTocOpen === 'true' || savedTocOpen === 'false') {
    return savedTocOpen === 'true';
  }

  return false;
}

export function readTocWidth(): number {
  return clamp(Number(localStorage.getItem('xrDocsTocWidth')) || 360, minTocWidth, maxTocWidth);
}

export function readSavedLang(): Lang | undefined {
  const savedLang = localStorage.getItem('xrDocsLang');
  return savedLang === 'ru' || savedLang === 'en' ? savedLang : undefined;
}

export function detectBrowserLang(): Lang {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((lang) => lang.toLocaleLowerCase().startsWith('ru')) ? 'ru' : 'en';
}
