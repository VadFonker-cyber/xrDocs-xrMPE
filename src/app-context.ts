import type { Doc, Lang } from './docs';
import type { AppState, ThemePreference } from './state';

export type AppContext = {
  appRoot: HTMLDivElement;
  state: AppState;
  colorSchemeQuery: MediaQueryList;
  getActiveDoc: () => Doc | undefined;
  render: () => void;
  renderNav: () => void;
  renderToc: () => void;
  setNavOpen: (open: boolean) => void;
  setTocOpen: (open: boolean, persist?: boolean) => void;
  switchLanguage: (nextLang: Lang) => void;
  switchTheme: (nextTheme: ThemePreference) => void;
};
