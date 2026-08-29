type TocTreeItem = {
  id: string;
  title: string;
  level: number;
  children: TocTreeItem[];
  parentId?: string;
};

export function slugifyHeading(value: string, lang: string): string;
export function generateHeadingId(title: string, lang: string, slugCounts: Map<string, number>): string;
export function isLocalAssetSrc(src: string): boolean;
export function splitAssetSrc(src: string): { path: string; suffix: string };
export function isThemeAssetSrc(src: string): boolean;
export function normalizeThemeAssetSrc(src: string): string;
export function escapeHtml(value: string): string;
export function escapeRegExp(value: string): string;
export function buildTocTree(items: Array<{ id: string; level: number; title: string }>): TocTreeItem[];
