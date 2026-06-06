import MarkdownIt from 'markdown-it';
import {
  highlightCode,
  generateHeadingId,
  getDefaultCalloutTitle,
  isLocalAssetSrc,
  isThemeAssetSrc,
  normalizeThemeAssetSrc,
  splitAssetSrc,
  escapeHtml,
} from './markdown-shared.mjs';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  langPrefix: 'language-',
  highlight: highlightCode,
});
const defaultImageRule = md.renderer.rules.image;
const alertTypes = new Set(['note', 'tip', 'important', 'warning', 'caution']);
const avifConvertibleAsset = /\.(?:jpe?g|png|webp)$/i;

md.core.ruler.after('inline', 'table_column_options', applyTableColumnOptions);
md.core.ruler.after('inline', 'github_alerts', applyGithubAlerts);

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
      const assetSrc = preferAvifAssetSrc(src);
      token.attrSet('src', getAssetPath(assetSrc, env.basePath));

      if (isThemeAssetSrc(assetSrc)) {
        token.attrSet('data-theme-asset-base', getAssetPath(normalizeThemeAssetSrc(assetSrc), env.basePath));
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

export function renderDocContent(content, lang, options = {}) {
  const env = { basePath: options.basePath || '/', lang };
  const tokens = md.parse(content, env);
  const toc = applyHeadingIds(tokens, lang);

  return {
    html: rewriteDocLinks(md.renderer.render(tokens, md.options, env), env.basePath),
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
    const id = generateHeadingId(title || `heading-${index}`, lang, slugCounts);
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

function rewriteDocLinks(html, basePath) {
  return html.replace(/href="([^"]+\.md(?:#[^"]*)?)"/g, (match, link) => {
    if (!isLocalAssetSrc(link)) {
      return match;
    }

    const [linkPath, hash = ''] = link.split('#');
    const normalized = linkPath
      .replace(/^\.\//, '')
      .replace(/^\/?docs\//, '')
      .replace(/^(ru|en)\//, '')
      .replace(/\.md$/i, '');

    return `href="${getDocPath(normalized, basePath)}${hash ? `#${hash}` : ''}"`;
  });
}

function applyGithubAlerts(state) {
  const tokens = state.tokens;

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
      `<p class="doc-callout-title">${escapeHtml(getDefaultCalloutTitle(alertType, state.env.lang))}</p>`,
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

function findFirstInlineToken(tokens, start, end) {
  for (let index = start + 1; index < end; index += 1) {
    if (tokens[index].type === 'inline') {
      return index;
    }
  }

  return -1;
}

function stripGithubAlertMarker(token) {
  const match = token.content.match(/^\[!(note|tip|important|warning|caution)](?:[ \t]*\n[ \t]*|[ \t]+|$)/i);

  if (!match) {
    return undefined;
  }

  const alertType = match[1].toLowerCase();
  if (!alertTypes.has(alertType)) {
    return undefined;
  }

  token.content = token.content.slice(match[0].length);

  if (!token.children) {
    return alertType;
  }

  let remaining = match[0].length;
  const children = [];

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

function getDocPath(id, basePath) {
  if (id === 'index') {
    return basePath;
  }

  const encodedId = id.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return encodedId ? `${basePath}${encodedId}/` : basePath;
}

function getAssetPath(src, basePath) {
  return `${basePath}${src.replace(/^\.?\//, '')}`;
}

function preferAvifAssetSrc(src) {
  const { path, suffix } = splitAssetSrc(src);

  if (!avifConvertibleAsset.test(path)) {
    return src;
  }

  return `${path.replace(avifConvertibleAsset, '.avif')}${suffix}`;
}
