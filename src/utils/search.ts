import type { Lang } from '../docs';

export function normalizeSearch(value: string, lang: Lang): string {
  return value.toLocaleLowerCase(lang).replace(/\s+/g, ' ').trim();
}
