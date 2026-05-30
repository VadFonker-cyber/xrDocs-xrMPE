import docsManifest from './generated/docs-manifest.json';

export type Lang = 'ru' | 'en';

export type DocMeta = {
  section: string;
  order: number;
  summary: string;
};

export type Doc = {
  id: string;
  lang: Lang;
  path: string;
  title: string;
  meta: DocMeta;
};

export type NavNode = {
  title: string;
  order: number;
  depth: number;
  id?: string;
  path?: string;
  children: NavNode[];
};

export type NavSection = {
  title: string;
  children: NavNode[];
};

type DocsManifest = {
  docs: Doc[];
  nav: Record<Lang, NavSection[]>;
};

const manifest = docsManifest as DocsManifest;

export const docs = manifest.docs;
export const navTree = manifest.nav;

export function compareDocs(a: Doc, b: Doc): number {
  if (a.lang !== b.lang) {
    return a.lang.localeCompare(b.lang);
  }

  if (a.meta.order !== b.meta.order) {
    return a.meta.order - b.meta.order;
  }

  if (a.meta.section !== b.meta.section) {
    return a.meta.section.localeCompare(b.meta.section, a.lang);
  }

  return a.title.localeCompare(b.title, a.lang);
}

export function getDocsByLang(lang: Lang): Doc[] {
  return docs.filter((doc) => doc.lang === lang);
}

export function getDocByKey(lang: Lang, id: string): Doc | undefined {
  return docs.find((doc) => doc.lang === lang && doc.id === id);
}

export function findNavNodePath(lang: Lang, id: string): NavNode[] {
  for (const section of navTree[lang] || []) {
    const path = findNodePath(section.children, id);

    if (path.length) {
      return path;
    }
  }

  return [];
}

function findNodePath(nodes: NavNode[], id: string): NavNode[] {
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
