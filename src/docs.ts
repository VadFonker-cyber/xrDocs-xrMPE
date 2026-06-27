import docsManifest from './generated/docs-manifest.json';
import {
  compareDocs as compareDocsShared,
  findNavNodePath as findNavNodePathShared,
} from '../scripts/shared-utils.mjs';

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
const _docIds = new Set<string>();

for (const doc of docs) {
  const langDocs = _docsByLang.get(doc.lang);
  if (langDocs) {
    langDocs.push(doc);
  } else {
    _docsByLang.set(doc.lang, [doc]);
  }
  _docByKey.set(`${doc.lang}:${doc.id}`, doc);
  _docIds.add(doc.id);
}

export function compareDocs(a: Doc, b: Doc): number {
  return compareDocsShared(a, b);
}

export function getDocsByLang(lang: Lang): Doc[] {
  return _docsByLang.get(lang) ?? [];
}

export function getDocByKey(lang: Lang, id: string): Doc | undefined {
  return _docByKey.get(`${lang}:${id}`);
}

export function getDocById(id: string, lang: Lang): Doc | undefined {
  return getDocByKey(lang, id) || docs.find((doc) => doc.id === id);
}

export function hasDocId(id: string): boolean {
  return _docIds.has(id);
}

export function findNavNodePath(lang: Lang, id: string): NavNode[] {
  return findNavNodePathShared(navTree, lang, id);
}
