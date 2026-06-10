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
