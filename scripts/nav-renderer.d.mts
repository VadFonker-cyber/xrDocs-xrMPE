type NavNode = {
  title: string;
  order: number;
  depth: number;
  id?: string;
  path?: string;
  children: NavNode[];
};

type NavSection = {
  title: string;
  children: NavNode[];
};

type NavRenderOptions = {
  activeAncestorKeys: Set<string>;
  activeId: string;
  expandedIds?: Set<string>;
  getDocUrl(id: string): string;
  getNavNodeKey(node: NavNode): string;
  sections: NavSection[];
};

export function renderNavSections(options: NavRenderOptions): string;
