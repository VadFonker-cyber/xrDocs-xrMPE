import enLabels from './locales/en.json';
import ruLabels from './locales/ru.json';

type Lang = 'ru' | 'en';

export type LabelKey = keyof typeof enLabels;

export const labels: Record<Lang, Record<LabelKey, string>> = {
  ru: ruLabels,
  en: enLabels,
};
