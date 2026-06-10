import { escapeHtml } from './markdown-common.mjs';

export function renderNavSections({
  activeAncestorKeys,
  activeId,
  expandedIds = new Set(),
  getDocUrl,
  getNavNodeKey,
  sections,
}) {
  return sections
    .map(
      (section) => `
        <section class="nav-section">
          <h2>${escapeHtml(section.title)}</h2>
          ${renderNavNodes({
            activeAncestorKeys,
            activeId,
            expandedIds,
            getDocUrl,
            getNavNodeKey,
            nodes: section.children,
          })}
        </section>
      `,
    )
    .join('');
}

function renderNavNodes({ activeAncestorKeys, activeId, expandedIds, getDocUrl, getNavNodeKey, nodes }) {
  if (!nodes.length) {
    return '';
  }

  return `
    <ul class="nav-list">
      ${nodes
        .map((node) =>
          renderNavNode({
            activeAncestorKeys,
            activeId,
            expandedIds,
            getDocUrl,
            getNavNodeKey,
            node,
          }),
        )
        .join('')}
    </ul>
  `;
}

function renderNavNode({ activeAncestorKeys, activeId, expandedIds, getDocUrl, getNavNodeKey, node }) {
  const key = getNavNodeKey(node);
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && (activeAncestorKeys.has(key) || expandedIds.has(key));
  const active = node.id === activeId ? ' aria-current="page"' : '';
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
  const children = hasChildren
    ? renderNavNodes({
      activeAncestorKeys,
      activeId,
      expandedIds,
      getDocUrl,
      getNavNodeKey,
      nodes: node.children,
    })
    : '';

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
