import MarkdownIt from 'markdown-it';
import {
  highlightCode,
  generateHeadingId,
  getDefaultCalloutTitle,
  getLocaleLabel,
  isLocalAssetSrc,
  isThemeAssetSrc,
  normalizeThemeAssetSrc,
  splitAssetSrc,
  escapeHtml,
  buildTocTree,
} from './markdown-shared.mjs';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  langPrefix: 'language-',
  highlight: highlightCode,
});
const defaultImageRule = md.renderer.rules.image;
const defaultHeadingOpenRule = md.renderer.rules.heading_open;
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

md.renderer.rules.heading_open = (tokens, index, options, env, self) => {
  const rendered = defaultHeadingOpenRule
    ? defaultHeadingOpenRule(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options);
  const id = tokens[index].attrGet('id');

  if (!id) {
    return rendered;
  }

  return `${rendered}<a class="heading-anchor" href="#${encodeURIComponent(id)}" aria-label="${escapeHtml(getLocaleLabel(env.lang, 'aria.headingAnchor'))}"></a>`;
};

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

// Code copy icons. Must match src/markdown-renderer.ts.
const COPY_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">' +
  '<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/>' +
  '<path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>' +
  '</svg>';

const CHECK_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">' +
  '<path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>' +
  '</svg>';

const ERROR_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">' +
  '<path d="M8 1.5a6.5 6.5 0 1 0 0 13A6.5 6.5 0 0 0 8 1.5ZM6.97 5.03a.75.75 0 0 1 1.06 0L8 5l1.03-1.03a.75.75 0 1 1 1.06 1.06L9.06 6.06l1.03 1.03a.75.75 0 1 1-1.06 1.06L8 7.12 6.97 8.15a.75.75 0 0 1-1.06-1.06l1.03-1.03-1.03-1.03a.75.75 0 0 1 1.06-1.06ZM7.25 10.5a.75.75 0 0 1 1.5 0v.25a.75.75 0 0 1-1.5 0v-.25Z"/>' +
  '</svg>';

md.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index];
  return renderFenceCode(token, env.lang || 'en');
};

function renderFenceCode(token, lang) {
  const language = token.info.trim().split(/\s+/)[0]?.toLowerCase() || '';
  const className = language ? ` class="${escapeHtml(md.options.langPrefix + language)}"` : '';
  const content = highlightCode(token.content, language);
  const copyLabel = escapeHtml(getLocaleLabel(lang, 'code.copy'));
  const copiedLabel = escapeHtml(getLocaleLabel(lang, 'code.copied'));
  const failedLabel = escapeHtml(getLocaleLabel(lang, 'code.copyFailed'));

  return (
    `<div class="code-block">` +
    `<pre><code${className}>${content}</code></pre>` +
    `<button class="code-copy-btn" type="button" aria-label="${copyLabel}" title="${copyLabel}" data-label-copy="${copyLabel}" data-label-copied="${copiedLabel}" data-label-failed="${failedLabel}">` +
    `<span class="code-copy-icon code-copy-icon-copy" aria-hidden="true">${COPY_ICON_SVG}</span>` +
    `<span class="code-copy-icon code-copy-icon-check" aria-hidden="true">${CHECK_ICON_SVG}</span>` +
    `<span class="code-copy-icon code-copy-icon-error" aria-hidden="true">${ERROR_ICON_SVG}</span>` +
    `</button>` +
    `</div>\n`
  );
}

export function renderDocContent(content, lang, options = {}) {
  const env = { basePath: options.basePath || '/', lang };
  const tokens = md.parse(content, env);
  const slugCounts = new Map();
  const headings = [];

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
    html: rewriteDocLinks(md.renderer.render(tokens, md.options, env), env.basePath, options.docId || ''),
    toc: buildTocTree(headings),
  };
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

function rewriteDocLinks(html, basePath, docId = '') {
  return html.replace(/href="([^"]+\.md(?:#[^"]*)?)"/g, (match, link) => {
    if (!isLocalAssetSrc(link)) {
      return match;
    }

    const [linkPath, hash = ''] = link.split('#');
    const normalized = normalizeDocLinkPath(linkPath, docId);

    return `href="${getDocPath(normalized, basePath)}${hash ? `#${hash}` : ''}"`;
  });
}

function normalizeDocLinkPath(linkPath, docId) {
  const normalizedPath = linkPath.replace(/\\/g, '/');

  if (docId && /^\.\.?\//.test(normalizedPath)) {
    const docDir = docId.split('/').slice(0, -1).join('/');
    return normalizePathSegments(`${docDir ? `${docDir}/` : ''}${normalizedPath.replace(/\.md$/i, '')}`);
  }

  return normalizePathSegments(
    normalizedPath
      .replace(/^\.\//, '')
      .replace(/^\/?docs\//, '')
      .replace(/^(ru|en)\//, '')
      .replace(/\.md$/i, ''),
  );
}

function normalizePathSegments(value) {
  const segments = [];

  value.split('/').forEach((segment) => {
    if (!segment || segment === '.') {
      return;
    }

    if (segment === '..') {
      segments.pop();
      return;
    }

    segments.push(segment);
  });

  return segments.join('/');
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
