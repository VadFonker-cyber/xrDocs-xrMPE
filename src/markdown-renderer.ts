import MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import type { Lang } from './docs';
import { hljs } from './hljs-setup';
import { getLabel } from './locales';
import { getAssetUrl, getDocUrl, isLocalAssetSrc } from './routing';
import type { TocItem, RenderedDoc } from './types';
import { escapeHtml, splitAssetSrc } from './utils/html';
import { generateHeadingId } from './utils/markdown';
import { buildTocTree } from './utils/toc-builder';

type RenderOptions = {
  basePath: string;
};

type RenderEnv = {
  basePath: string;
  lang: Lang;
};

const themeAssetExtensions = 'avif|gif|jpe?g|png|svg|webp';
const avifConvertibleAsset = /\.(?:jpe?g|png|webp)$/i;
const alertTypes = ['note', 'tip', 'important', 'warning', 'caution'] as const;

type AlertType = (typeof alertTypes)[number];

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  langPrefix: 'language-',
  highlight: highlightCode,
});

md.core.ruler.after('inline', 'table_column_options', applyTableColumnOptions);
md.core.ruler.after('inline', 'github_alerts', applyGithubAlerts);

const defaultImageRule = md.renderer.rules.image;
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
  const renderEnv = env as RenderEnv;

  if (srcIndex >= 0) {
    const src = token.attrs?.[srcIndex]?.[1] || '';

    if (isLocalAssetSrc(src)) {
      const assetSrc = preferAvifAssetSrc(src);
      token.attrSet('src', getAssetUrl(assetSrc, renderEnv.basePath));

      if (isThemeAssetSrc(assetSrc)) {
        token.attrSet('data-theme-asset-base', getAssetUrl(normalizeThemeAssetSrc(assetSrc), renderEnv.basePath));
      }
    }
  }

  return defaultImageRule
    ? defaultImageRule(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options);
};

md.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index];
  return renderFenceCode(token);
};

function renderFenceCode(token: Token): string {
  const language = token.info.trim().split(/\s+/)[0]?.toLowerCase() || '';
  const className = language ? ` class="${escapeHtml(md.options.langPrefix + language)}"` : '';
  const content = highlightCode(token.content, language);

  return `<pre><code${className}>${content}</code></pre>\n`;
}

function applyGithubAlerts(state: StateCore): void {
  const tokens = state.tokens;
  const env = state.env as RenderEnv;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type !== 'blockquote_open') {
      continue;
    }

    const closeIndex = findClosingToken(tokens, index, 'blockquote_close');
    if (closeIndex === -1) {
      continue;
    }

    const inlineIndex = findFirstInlineToken(tokens, index, closeIndex);
    if (inlineIndex === -1) {
      index = closeIndex;
      continue;
    }

    const alertType = stripGithubAlertMarker(tokens[inlineIndex]);
    if (!alertType) {
      index = closeIndex;
      continue;
    }

    token.type = 'html_block';
    token.tag = '';
    token.nesting = 0;
    token.content = [
      `<aside class="doc-callout doc-callout-${alertType}" role="note">`,
      `<p class="doc-callout-title">${escapeHtml(getDefaultCalloutTitle(alertType, env.lang))}</p>`,
      '<div class="doc-callout-body">',
      '',
    ].join('\n');

    const closeToken = tokens[closeIndex];
    closeToken.type = 'html_block';
    closeToken.tag = '';
    closeToken.nesting = 0;
    closeToken.content = '</div>\n</aside>\n';

    index = closeIndex;
  }
}

function findFirstInlineToken(tokens: Token[], start: number, end: number): number {
  for (let index = start + 1; index < end; index += 1) {
    if (tokens[index].type === 'inline') {
      return index;
    }
  }

  return -1;
}

function stripGithubAlertMarker(token: Token): AlertType | undefined {
  const match = token.content.match(/^\[!(note|tip|important|warning|caution)](?:[ \t]*\n[ \t]*|[ \t]+|$)/i);

  if (!match) {
    return undefined;
  }

  const alertType = match[1].toLowerCase() as AlertType;
  token.content = token.content.slice(match[0].length);

  if (!token.children) {
    return alertType;
  }

  let remaining = match[0].length;
  const children: Token[] = [];

  token.children.forEach((child) => {
    if (remaining <= 0) {
      children.push(child);
      return;
    }

    if (child.type === 'softbreak' || child.type === 'hardbreak') {
      remaining -= 1;
      return;
    }

    if (child.type !== 'text') {
      return;
    }

    if (remaining >= child.content.length) {
      remaining -= child.content.length;
      return;
    }

    child.content = child.content.slice(remaining);
    remaining = 0;

    if (child.content) {
      children.push(child);
    }
  });

  token.children = children;
  return alertType;
}

export function renderDocContent(content: string, lang: Lang, options: RenderOptions): RenderedDoc {
  const env: RenderEnv = { basePath: options.basePath, lang };
  const tokens = md.parse(content, env);
  const slugCounts = new Map<string, number>();
  const headings: Array<{ id: string; level: number; title: string }> = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type !== 'heading_open') {
      continue;
    }

    const level = Number(token.tag.slice(1));
    const inline = tokens[index + 1];
    const title = inline?.type === 'inline' ? inline.content.trim() : '';
    const id = generateHeadingId(title || `heading-${index}`, lang, slugCounts);
    token.attrSet('id', id);
    headings.push({ id, level, title: title || id });
  }

  return {
    html: rewriteDocLinks(md.renderer.render(tokens, md.options, env), options.basePath),
    toc: buildTocTree(headings),
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

function getDefaultCalloutTitle(kind: AlertType, lang: Lang): string {
  return getLabel(lang, `callout.${kind}`);
}

function rewriteDocLinks(html: string, basePath: string): string {
  return html.replace(/href="([^"]+\.md(?:#[^"]*)?)"/g, (match, link: string) => {
    if (!isLocalAssetSrc(link)) {
      return match;
    }

    const [path, hash = ''] = link.split('#');
    const normalized = path
      .replace(/^\.\//, '')
      .replace(/^\/?docs\//, '')
      .replace(/^(ru|en)\//, '')
      .replace(/\.md$/i, '');

    return `href="${getDocUrl(normalized, basePath)}${hash ? `#${hash}` : ''}"`;
  });
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

function preferAvifAssetSrc(src: string): string {
  const { path, suffix } = splitAssetSrc(src);

  if (!avifConvertibleAsset.test(path)) {
    return src;
  }

  return `${path.replace(avifConvertibleAsset, '.avif')}${suffix}`;
}
