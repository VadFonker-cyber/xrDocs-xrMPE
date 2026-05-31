import MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import dos from 'highlight.js/lib/languages/dos';
import ini from 'highlight.js/lib/languages/ini';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import xml from 'highlight.js/lib/languages/xml';

export type Lang = 'ru' | 'en';

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

type RenderOptions = {
  basePath: string;
};

const themeAssetExtensions = 'avif|gif|jpe?g|png|svg|webp';
let activeBasePath = '/';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  langPrefix: 'language-',
  highlight: highlightCode,
});

hljs.registerLanguage('ini', ini);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('bat', dos);
hljs.registerLanguage('batch', dos);
hljs.registerLanguage('cmd', dos);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('ps1', powershell);
hljs.registerLanguage('pwsh', powershell);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('text', plaintext);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('xml', xml);

md.core.ruler.after('inline', 'table_column_options', applyTableColumnOptions);

const defaultImageRule = md.renderer.rules.image;
const defaultFenceRule = md.renderer.rules.fence;

(['th_open', 'td_open'] as const).forEach((ruleName) => {
  const defaultRule = md.renderer.rules[ruleName];

  md.renderer.rules[ruleName] = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const style = token.attrGet('style') || '';
    const alignment = style.match(/text-align\s*:\s*(left|center|right)/i)?.[1]?.toLowerCase();

    if (alignment) {
      token.attrSet('data-align', alignment);
    }

    return defaultRule
      ? defaultRule(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };
});

md.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const srcIndex = token.attrIndex('src');

  if (srcIndex >= 0) {
    const src = token.attrs?.[srcIndex]?.[1] || '';

    if (isLocalAssetSrc(src)) {
      token.attrSet('src', getAssetUrl(src));

      if (isThemeAssetSrc(src)) {
        token.attrSet('data-theme-asset-base', getAssetUrl(normalizeThemeAssetSrc(src)));
      }
    }
  }

  return defaultImageRule
    ? defaultImageRule(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options);
};

md.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const callout = parseAdmonishInfo(token.info);

  if (!callout) {
    return renderFenceCode(token);
  }

  const title = callout.title || getDefaultCalloutTitle(callout.kind);
  const body = md.render(token.content, env);

  return [
    `<aside class="doc-callout doc-callout-${escapeHtml(callout.kind)}" role="note">`,
    `<p class="doc-callout-title">${escapeHtml(title)}</p>`,
    `<div class="doc-callout-body">${body}</div>`,
    '</aside>',
  ].join('');
};

function renderFenceCode(token: Token): string {
  const language = token.info.trim().split(/\s+/)[0]?.toLowerCase() || '';
  const className = language ? ` class="${escapeHtml(md.options.langPrefix + language)}"` : '';
  const content = highlightCode(token.content, language);

  return `<pre><code${className}>${content}</code></pre>\n`;
}

export function renderDocContent(content: string, lang: Lang, options: RenderOptions): RenderedDoc {
  activeBasePath = options.basePath;
  const tokens = md.parse(content, {});
  const toc = createToc(tokens, lang);

  return {
    html: rewriteDocLinks(md.renderer.render(tokens, md.options, {}), lang),
    toc,
  };
}

function applyTableColumnOptions(state: StateCore): void {
  const tokens = state.tokens;

  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].type !== 'table_open') {
      continue;
    }

    const tableEnd = findClosingToken(tokens, index, 'table_close');
    if (tableEnd === -1) {
      continue;
    }

    applyTableNowrapColumns(tokens, index, tableEnd);
    index = tableEnd;
  }
}

function applyTableNowrapColumns(tokens: Token[], tableStart: number, tableEnd: number): void {
  const nowrapColumns = new Set<number>();
  let headerColumn = 0;
  let insideHeaderRow = false;

  for (let index = tableStart; index < tableEnd; index += 1) {
    const token = tokens[index];

    if (token.type === 'thead_close') {
      break;
    }

    if (token.type === 'tr_open') {
      insideHeaderRow = true;
      headerColumn = 0;
      continue;
    }

    if (insideHeaderRow && token.type === 'tr_close') {
      insideHeaderRow = false;
      continue;
    }

    if (!insideHeaderRow || token.type !== 'th_open') {
      continue;
    }

    const inline = tokens[index + 1];
    if (inline?.type === 'inline' && stripNowrapMarker(inline)) {
      nowrapColumns.add(headerColumn);
    }

    headerColumn += 1;
  }

  if (!nowrapColumns.size) {
    return;
  }

  let column = 0;

  for (let index = tableStart; index < tableEnd; index += 1) {
    const token = tokens[index];

    if (token.type === 'tr_open') {
      column = 0;
      continue;
    }

    if (token.type !== 'th_open' && token.type !== 'td_open') {
      continue;
    }

    if (nowrapColumns.has(column)) {
      token.attrSet('data-nowrap', 'true');
    }

    column += 1;
  }
}

function stripNowrapMarker(token: Token): boolean {
  const marker = /\s*\{nowrap\}\s*/g;
  const original = token.content;
  token.content = token.content.replace(marker, ' ').replace(/\s{2,}/g, ' ').trim();

  token.children?.forEach((child) => {
    if (child.type === 'text') {
      child.content = child.content.replace(marker, ' ').replace(/\s{2,}/g, ' ').trim();
    }
  });

  return token.content !== original;
}

function findClosingToken(tokens: Token[], start: number, closingType: string): number {
  for (let index = start + 1; index < tokens.length; index += 1) {
    if (tokens[index].type === closingType) {
      return index;
    }
  }

  return -1;
}

function createToc(tokens: Token[], lang: Lang): TocItem[] {
  const roots: TocItem[] = [];
  const stack: TocItem[] = [];
  const slugCounts = new Map<string, number>();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type !== 'heading_open') {
      continue;
    }

    const level = Number(token.tag.slice(1));
    const inline = tokens[index + 1];
    const title = inline?.type === 'inline' ? inline.content.trim() : '';
    const baseSlug = slugifyHeading(title, lang) || `heading-${index}`;
    const count = (slugCounts.get(baseSlug) || 0) + 1;
    const id = count === 1 ? baseSlug : `${baseSlug}-${count}`;
    slugCounts.set(baseSlug, count);
    token.attrSet('id', id);

    const item: TocItem = {
      id,
      title: title || id,
      level,
      children: [],
    };

    while (stack.length && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      item.parentId = parent.id;
      parent.children.push(item);
    } else {
      roots.push(item);
    }

    stack.push(item);
  }

  return roots;
}

function slugifyHeading(value: string, lang: Lang): string {
  return value
    .toLocaleLowerCase(lang)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function highlightCode(source: string, language: string): string {
  const lang = language.trim().toLowerCase();

  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(source, { language: lang, ignoreIllegals: true }).value;
    }
  } catch {
    return escapeHtml(source);
  }

  return escapeHtml(source);
}

function parseAdmonishInfo(info: string): { kind: string; title?: string } | undefined {
  const match = info.trim().match(/^admonish\s+([a-z][a-z0-9_-]*)(?:\s+(.*))?$/i);

  if (!match) {
    return undefined;
  }

  const title = match[2]?.match(/\btitle=(?:"([^"]*)"|'([^']*)'|([^\s]+))/i);

  return {
    kind: match[1].toLowerCase(),
    title: title?.[1] || title?.[2] || title?.[3],
  };
}

function getDefaultCalloutTitle(kind: string): string {
  return kind === 'warning' ? 'Важно' : kind;
}

function rewriteDocLinks(html: string, currentLang: Lang): string {
  return html.replace(/href="([^"]+\.md(?:#[^"]*)?)"/g, (_match, link: string) => {
    const [path, hash = ''] = link.split('#');
    const normalized = path
      .replace(/^\.\//, '')
      .replace(/^docs\//, '')
      .replace(/^(ru|en)\//, '')
      .replace(/\.md$/, '');

    return `href="${getDocUrl(currentLang, normalized)}${hash ? `#${hash}` : ''}"`;
  });
}

function getDocUrl(lang: Lang, id: string): string {
  return `${activeBasePath}${lang}/${id.split('/').map(encodeURIComponent).join('/')}/`;
}

function getAssetUrl(src: string): string {
  if (!isLocalAssetSrc(src)) {
    return src;
  }

  return `${activeBasePath}${src.replace(/^\.?\//, '')}`;
}

function isLocalAssetSrc(src: string): boolean {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(src);
}

function isThemeAssetSrc(src: string): boolean {
  const { path } = splitAssetSrc(src);
  const themedSuffix = new RegExp(`\\.(dark|light)\\.(${themeAssetExtensions})$`, 'i');
  return isLocalAssetSrc(src) && themedSuffix.test(path);
}

function normalizeThemeAssetSrc(src: string): string {
  const { path, suffix } = splitAssetSrc(src);
  const themedSuffix = new RegExp(`\\.(dark|light)(\\.(${themeAssetExtensions}))$`, 'i');

  return `${path.replace(themedSuffix, '$2')}${suffix}`;
}

function splitAssetSrc(src: string): { path: string; suffix: string } {
  const match = src.match(/^([^?#]+)([?#].*)?$/);

  return {
    path: match?.[1] || src,
    suffix: match?.[2] || '',
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
