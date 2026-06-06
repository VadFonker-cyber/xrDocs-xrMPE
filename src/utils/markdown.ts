/**
 * Markdown heading utilities shared across the browser bundle.
 * The Node.js build equivalent lives in scripts/markdown-shared.mjs — keep both in sync.
 */
import type { Lang } from '../docs';

export function slugifyHeading(value: string, lang: Lang): string {
  return value
    .toLocaleLowerCase(lang)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Generates a deduplicated heading ID for a given title.
 * @param slugCounts - mutable counter Map shared across a single document render pass
 */
export function generateHeadingId(title: string, lang: Lang, slugCounts: Map<string, number>): string {
  const baseSlug = slugifyHeading(title, lang) || `heading`;
  const count = (slugCounts.get(baseSlug) || 0) + 1;
  slugCounts.set(baseSlug, count);
  return count === 1 ? baseSlug : `${baseSlug}-${count}`;
}
