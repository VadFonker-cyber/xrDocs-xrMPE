import MarkdownIt from 'markdown-it';
import {
  highlightCode,
  slugifyHeading,
  parseAdmonishInfo,
  getDefaultCalloutTitle,
  isLocalAssetSrc,
  isThemeAssetSrc,
  normalizeThemeAssetSrc,
  escapeHtml,
} from './markdown-shared.mjs';

let activeBasePath = '/';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  langPrefix: 'language-',
  highlight: highlightCode,
});
const defaultImageRule = md.renderer.rules.image;

md.core.ruler.after('inline', 'table_column_options', applyTableColumnOptions);

(['th_open', 'td_open']).forEach((ruleName) => {
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
      token.attrSet('src', getAssetPath(src));

      if (isThemeAssetSrc(src)) {
        token.attrSet('data-theme-asset-base', getAssetPath(normalizeThemeAssetSrc(src)));
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

export function renderDocContent(content, lang, options = {}) {
  activeBasePath = options.basePath || '/';
  const tokens = md.parse(content, {});
  const toc = applyHeadingIds(tokens, lang);

  return {
    html: rewriteDocLinks(md.renderer.render(tokens, md.options, {})),
    toc,
  };
}

function renderFenceCode(token) {
  const language = token.info.trim().split(/\s+/)[0]?.toLowerCase() || '';
  const className = language ? ` class="${escapeHtml(md.options.langPrefix + language)}"` : '';
  const content = highlightCode(token.content, language);

  return `<pre><code${className}>${content}</code></pre>\n`;
}

function applyTableColumnOptions(state) {
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

function applyTableNowrapColumns(tokens, tableStart, tableEnd) {
  const nowrapColumns = new Set();
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

function stripNowrapMarker(token) {
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

function findClosingToken(tokens, start, closingType) {
  for (let index = start + 1; index < tokens.length; index += 1) {
    if (tokens[index].type === closingType) {
      return index;
    }
  }

  return -1;
}

function applyHeadingIds(tokens, lang) {
  const roots = [];
  const stack = [];
  const slugCounts = new Map();

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

    const item = {
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

function rewriteDocLinks(html) {
  return html.replace(/href="([^"]+\.md(?:#[^"]*)?)"/g, (_match, link) => {
    const [linkPath, hash = ''] = link.split('#');
    const normalized = linkPath
      .replace(/^\.\//, '')
      .replace(/^docs\//, '')
      .replace(/^(ru|en)\//, '')
      .replace(/\.md$/i, '');

    return `href="${getDocPath(normalized)}${hash ? `#${hash}` : ''}"`;
  });
}

function getDocPath(id) {
  if (id === 'index') {
    return activeBasePath;
  }

  const encodedId = id.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return encodedId ? `${activeBasePath}${encodedId}/` : activeBasePath;
}

function getAssetPath(src) {
  return `${activeBasePath}${src.replace(/^\.?\//, '')}`;
}
