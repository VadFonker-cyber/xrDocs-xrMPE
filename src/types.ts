export type TocItem = {
  id: string;
  title: string;
  level: number;
  children: TocItem[];
  parentId?: string;
};

export type RenderedDoc = {
  html: string;
  toc: TocItem[];
};
