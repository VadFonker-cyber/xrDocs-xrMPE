type AssetInfo = {
  path: string;
  originalPath: string;
  preferredPath: string;
  byteSize: number;
  width: number;
  height: number;
};

type TocItem = {
  id: string;
  title: string;
  level: number;
  children: TocItem[];
  parentId?: string;
};

type RenderedDoc = {
  html: string;
  toc: TocItem[];
};

type RendererFactoryOptions = {
  MarkdownIt: unknown;
  assetMetadata?: {
    assets?: Record<string, AssetInfo>;
  };
  getAssetUrl(src: string, basePath: string): string;
  getCalloutTitle(kind: string, lang: string): string;
  getDocUrl(id: string, basePath: string): string;
  getLabel(lang: string, key: string): string;
};

type RenderOptions = {
  basePath?: string;
  docId?: string;
};

export function createMarkdownRenderer(options: RendererFactoryOptions): {
  renderDocContent(content: string, lang: string, options?: RenderOptions): RenderedDoc;
};
