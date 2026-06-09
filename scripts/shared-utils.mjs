export function normalizeBasePath(value) {
  if (!value || value === './') {
    return '/';
  }

  return `/${value.replace(/^\/+|\/+$/g, '')}/`;
}

// Keep in sync with src/docs.ts — same ordering logic used client-side.
export function compareDocs(a, b) {
  if (a.lang !== b.lang) {
    return a.lang.localeCompare(b.lang);
  }

  if (a.order !== b.order) {
    return a.order - b.order;
  }

  if (a.section !== b.section) {
    return a.section.localeCompare(b.section, a.lang);
  }

  return a.title.localeCompare(b.title, a.lang);
}

// Keep in sync with src/nav.ts — same key format used client-side.
export function getNavNodeKey(node) {
  return node.id || `${node.depth}:${node.order}:${node.title}`;
}

// Keep in sync with src/docs.ts — same traversal used client-side.
export function findNodePath(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) {
      return [node];
    }

    const childPath = findNodePath(node.children, id);

    if (childPath.length) {
      return [node, ...childPath];
    }
  }

  return [];
}
