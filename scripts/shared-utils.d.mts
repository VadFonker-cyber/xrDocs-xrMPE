type DocLike = {
  lang: string;
  order: number;
  section: string;
  title: string;
};

type TocLike<T> = {
  children?: T[];
};

type NavNodeLike = {
  title: string;
  order: number;
  depth: number;
  id?: string;
  children: NavNodeLike[];
};

type NavSectionLike<T extends NavNodeLike> = {
  children: T[];
};

type FileSystemLike = {
  readdir(path: string, options: { withFileTypes: true }): Promise<Array<{
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }>>;
};

type ListPublicFilesOptions = {
  joinPath?(dirPath: string, name: string): string;
  shouldSkipDir?(dirPath: string): boolean;
};

export declare const defaultBasePath: string;
export declare const defaultSiteUrl: string;
export function normalizeBasePath(value: string): string;
export function slash(value: string): string;
export function buildDocUrl(id: string, basePath: string): string;
export function getDocKey(doc: { lang: string; id: string }): string;
export function flattenToc<T extends TocLike<T>>(items: T[], result?: T[]): T[];
export function compareDocs<T extends DocLike>(a: T, b: T): number;
export function getNavNodeKey(node: { id?: string; depth: number; order: number; title: string }): string;
export function findNodePath<T extends NavNodeLike>(nodes: T[], id: string): T[];
export function findNavNodePath<T extends NavNodeLike>(
  nav: Record<string, Array<NavSectionLike<T>>>,
  lang: string,
  id: string,
): T[];
export function listPublicFiles(
  fs: FileSystemLike,
  dirPath: string,
  options?: ListPublicFilesOptions,
): Promise<string[]>;
