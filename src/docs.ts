import docsManifest from './generated/docs-manifest.json';

export type Lang = 'ru' | 'en';

export type Doc = {
  id: string;
  lang: Lang;
  path: string;
  title: string;
  section: string;
  order: number;
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

// Precomputed indexes — built once at module init for O(1) lookups
const _docsByLang = new Map<Lang, Doc[]>();
const _docByKey = new Map<string, Doc>();

for (const doc of docs) {
  const langDocs = _docsByLang.get(doc.lang);
  if (langDocs) {
    langDocs.push(doc);
  } else {
    _docsByLang.set(doc.lang, [doc]);
  }
  _docByKey.set(`${doc.lang}:${doc.id}`, doc);
}

// Keep in sync with scripts/content-model.mjs for generated manifest ordering.
export function compareDocs(a: Doc, b: Doc): number {
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

export function getDocsByLang(lang: Lang): Doc[] {
  return _docsByLang.get(lang) ?? [];
}

export function getDocByKey(lang: Lang, id: string): Doc | undefined {
  return _docByKey.get(`${lang}:${id}`);
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
