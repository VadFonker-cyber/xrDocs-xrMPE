import type { Lang } from './docs';
import enLabels from './locales/en.json';
import ruLabels from './locales/ru.json';

export type LabelKey = keyof typeof enLabels;

export const labels: Record<Lang, Record<LabelKey, string>> = {
  ru: ruLabels,
  en: enLabels,
};

export function getLabel(lang: Lang, key: LabelKey): string {
  return labels[lang][key] || labels.en[key] || key;
}
