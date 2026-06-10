import type { AppContext } from './app-context';
import { findNavNodePath, navTree, type NavNode } from './docs';
import { getDocUrl } from './routing';
import { getLabel } from './locales';
import { renderNavSections } from '../scripts/nav-renderer.mjs';

let searchRenderRequest = 0;
let searchModulePromise: Promise<typeof import('./search')> | undefined;

export function renderNav(context: AppContext): void {
  const nav = document.querySelector<HTMLElement>('#docNav');

  if (!nav) {
    return;
  }

  const query = context.state.search.trim();

  if (query) {
    const request = ++searchRenderRequest;
    searchModulePromise ??= import('./search');
    void searchModulePromise.then(({ renderSearchResults }) => {
      void renderSearchResults(context, nav, query, request, () => searchRenderRequest);
    });
    return;
  }

  searchRenderRequest += 1;
  const activePath = findNavNodePath(context.state.lang, context.state.activeId);
  const activeAncestorKeys = new Set(activePath.slice(0, -1).map(getNavNodeKey));
  const sections = navTree[context.state.lang] || [];

  if (!sections.length) {
    nav.innerHTML = `<p class="empty">${getLabel(context.state.lang, 'doc.empty')}</p>`;
    return;
  }

  nav.innerHTML = renderNavSections({
    activeAncestorKeys,
    activeId: context.state.activeId,
    expandedIds: context.state.navExpandedIds,
    getDocUrl,
    getNavNodeKey,
    sections,
  });
}

export function getNavNodeKey(node: NavNode): string {
  return node.id || `${node.depth}:${node.order}:${node.title}`;
}
