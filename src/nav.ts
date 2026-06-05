import type { AppContext } from './app-context';
import { findNavNodePath, navTree, type NavNode } from './docs';
import { getDocUrl } from './routing';
import { renderSearchResults } from './search';
import { escapeHtml, getLabel } from './utils/html';

let searchRenderRequest = 0;

export function renderNav(context: AppContext): void {
  const nav = document.querySelector<HTMLElement>('#docNav');

  if (!nav) {
    return;
  }

  const query = context.state.search.trim();

  if (query) {
    const request = ++searchRenderRequest;
    void renderSearchResults(context, nav, query, request, () => searchRenderRequest);
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

  nav.innerHTML = sections
    .map(
      (section) => `
        <section class="nav-section">
          <h2>${escapeHtml(section.title)}</h2>
          ${renderNavNodes(context, section.children, activeAncestorKeys)}
        </section>
      `,
    )
    .join('');
}

export function getNavNodeKey(node: NavNode): string {
  return node.id || `${node.depth}:${node.order}:${node.title}`;
}

function renderNavNodes(context: AppContext, nodes: NavNode[], activeAncestorKeys: Set<string>): string {
  if (!nodes.length) {
    return '';
  }

  return `
    <ul class="nav-list">
      ${nodes.map((node) => renderNavNode(context, node, activeAncestorKeys)).join('')}
    </ul>
  `;
}

function renderNavNode(context: AppContext, node: NavNode, activeAncestorKeys: Set<string>): string {
  const key = getNavNodeKey(node);
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && (activeAncestorKeys.has(key) || context.state.navExpandedIds.has(key));
  const active = node.id === context.state.activeId ? ' aria-current="page"' : '';
  const toggle = hasChildren
    ? `
      <button
        class="nav-item-toggle"
        type="button"
        data-nav-id="${escapeHtml(key)}"
        aria-label="${escapeHtml(node.title)}"
        aria-expanded="${expanded}"
      ></button>
    `
    : '<span class="nav-item-spacer" aria-hidden="true"></span>';
  const label = node.id
    ? `
      <a class="doc-link" href="${getDocUrl(node.id)}"${active}>
        <span>${escapeHtml(node.title)}</span>
      </a>
    `
    : `<span class="nav-folder-label">${escapeHtml(node.title)}</span>`;
  const children = hasChildren ? renderNavNodes(context, node.children, activeAncestorKeys) : '';

  return `
    <li class="nav-item" data-depth="${node.depth}" data-expanded="${expanded}">
      <div class="nav-item-row">
        ${toggle}
        ${label}
      </div>
      ${children}
    </li>
  `;
}
