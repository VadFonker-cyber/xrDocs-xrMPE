type ShellTemplateOptions = {
  articleAttributes?: string;
  articleHtml?: string;
  copy: Record<string, string>;
  getAssetUrl(src: string): string;
  githubUrl: string;
  lang: string;
  navHtml?: string;
  notFound?: boolean;
  tocOpen?: boolean;
  tocWidth?: number;
};

export function renderShellHtml(options: ShellTemplateOptions): string;

type NotFoundArticleOptions = {
  title: string;
  message: string;
  homeLink: string;
  homeUrl: string;
};

export function renderNotFoundArticle(options: NotFoundArticleOptions): string;
