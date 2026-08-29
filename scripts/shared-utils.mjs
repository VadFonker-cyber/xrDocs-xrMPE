/**
 * Single source of truth for deployment defaults. Override at build time with
 * VITE_BASE_PATH / SITE_URL — these literals are only fallbacks.
 */
export const defaultBasePath = '/xrDocs-xrMPE/';
export const defaultSiteUrl = 'https://vadphonker.github.io/xrDocs-xrMPE/';

export function normalizeBasePath(value) {
  const normalized = (value || '').replace(/^\/+|\/+$/g, '');

  if (!normalized || value === './') {
    return '/';
  }

  return `/${normalized}/`;
}

export function slash(value) {
  return value.replace(/\\/g, '/');
}

export function buildDocUrl(id, basePath) {
  if (id === 'index') {
    return basePath;
  }

  const encodedId = id.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return encodedId ? `${basePath}${encodedId}/` : basePath;
}

export function getDocKey(doc) {
  return `${doc.lang}:${doc.id}`;
}

export function flattenToc(items, result = []) {
  for (const item of items) {
    result.push(item);
    flattenToc(item.children || [], result);
  }

  return result;
}

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

export function getNavNodeKey(node) {
  return node.id || `${node.depth}:${node.order}:${node.title}`;
}

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

export function findNavNodePath(nav, lang, id) {
  for (const section of nav[lang] || []) {
    const found = findNodePath(section.children, id);

    if (found.length) {
      return found;
    }
  }

  return [];
}

export async function listPublicFiles(fs, dirPath, options = {}) {
  const joinPath = options.joinPath || ((dir, name) => `${dir.replace(/[\\/]+$/g, '')}/${name}`);
  const shouldSkipDir = options.shouldSkipDir || (() => false);
  let entries;

  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const files = [];

  await Promise.all(
    entries.map(async (entry) => {
      const filePath = joinPath(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (!shouldSkipDir(filePath)) {
          files.push(...(await listPublicFiles(fs, filePath, options)));
        }

        return;
      }

      if (entry.isFile()) {
        files.push(filePath);
      }
    }),
  );

  return files;
}
