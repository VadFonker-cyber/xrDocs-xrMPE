import type { Lang } from './docs';

export const siteName = 'xrDocs';
export const githubUrl = 'https://github.com/VadFonker-cyber/xrDocs-xrMPE';

export const siteMeta: Record<Lang, { description: string; locale: string }> = {
  ru: {
    description: 'Документация по моддингу S.T.A.L.K.E.R. для xrMPE.',
    locale: 'ru_RU',
  },
  en: {
    description: 'S.T.A.L.K.E.R. modding documentation for xrMPE.',
    locale: 'en_US',
  },
};
