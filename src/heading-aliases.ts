import type { Lang } from './docs';
import headingAliases from './generated/heading-aliases.json';

type HeadingAliasMap = Record<string, Record<string, string>>;

const aliases = headingAliases as HeadingAliasMap;

export function resolveHeadingAlias(lang: Lang, docId: string, headingId: string): string {
  return aliases[`${lang}:${docId}`]?.[headingId] || headingId;
}
