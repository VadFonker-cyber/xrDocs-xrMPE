import type { TocItem } from '../types';

/**
 * Builds a nested TOC tree from a flat sequence of heading descriptors.
 * Shared by markdown-renderer.ts and article.ts.
 * The Node.js build equivalent lives in scripts/markdown-shared.mjs — keep in sync.
 */
export function buildTocTree(
  items: Array<{ id: string; level: number; title: string }>,
): TocItem[] {
  const roots: TocItem[] = [];
  const stack: TocItem[] = [];

  for (const { id, level, title } of items) {
    const item: TocItem = { id, title, level, children: [] };

    while (stack.length && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      item.parentId = parent.id;
      parent.children.push(item);
    } else {
      roots.push(item);
    }

    stack.push(item);
  }

  return roots;
}
