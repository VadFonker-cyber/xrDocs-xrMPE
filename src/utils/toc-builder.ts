import type { TocItem } from '../types';
import { buildTocTree as buildTocTreeShared } from '../../scripts/markdown-common.mjs';

/**
 * Builds a nested TOC tree from a flat sequence of heading descriptors.
 * Typed browser wrapper for the shared Markdown TOC builder.
 */
export function buildTocTree(
  items: Array<{ id: string; level: number; title: string }>,
): TocItem[] {
  return buildTocTreeShared(items) as TocItem[];
}
