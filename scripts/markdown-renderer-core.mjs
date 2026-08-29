import {
  buildTocTree,
  escapeHtml,
  generateHeadingId,
  highlightCode,
  isLocalAssetSrc,
  isThemeAssetSrc,
  normalizeThemeAssetSrc,
  splitAssetSrc,
} from './markdown-common.mjs';

const alertTypes = new Set(['note', 'tip', 'important', 'warning', 'caution']);

export function createMarkdownRenderer({
  MarkdownIt,
  assetMetadata = {},
  getAssetUrl,
  getCalloutTitle,
  getDocUrl,
  getLabel,
}) {
  const assetMetadataByPath = new Map(Object.entries(assetMetadata.assets || {}));
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    langPrefix: 'language-',
    highlight: highlightCode,
  });
  const defaultImageRule = md.renderer.rules.image;
  const defaultHeadingOpenRule = md.renderer.rules.heading_open;

  md.core.ruler.after('inline', 'table_column_options', applyTableColumnOptions);
  md.core.ruler.after('inline', 'github_alerts', applyGithubAlerts);

  for (const ruleName of ['th_open', 'td_open']) {
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
  }

  md.renderer.rules.heading_open = (tokens, index, options, env, self) => {
    const rendered = defaultHeadingOpenRule
      ? defaultHeadingOpenRule(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
    const id = tokens[index].attrGet('id');

    if (!id) {
      return rendered;
    }

    return `${rendered}<a class="heading-anchor" href="#${encodeURIComponent(id)}" aria-label="${escapeHtml(getLabel(env.lang, 'aria.headingAnchor'))}"></a>`;
  };

  md.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const srcIndex = token.attrIndex('src');

    if (srcIndex >= 0) {
      const src = token.attrs?.[srcIndex]?.[1] || '';

      if (isLocalAssetSrc(src)) {
        const asset = getAssetMetadata(src);
        const assetSrc = getPreferredAssetSrc(src);
        token.attrSet('src', getAssetUrl(assetSrc, env.basePath));
        setImagePerformanceAttributes(token, asset);

        if (isThemeAssetSrc(src)) {
          token.attrSet('data-theme-asset-base', getAssetUrl(getPreferredAssetSrc(normalizeThemeAssetSrc(src)), env.basePath));
        }
      }
    }

    token.attrSet('loading', 'lazy');
    token.attrSet('decoding', 'async');

    return defaultImageRule
      ? defaultImageRule(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };

  md.renderer.rules.fence = (tokens, index, _options, env) => {
    const token = tokens[index];
    return renderFenceCode(token, env.lang || 'en');
  };

  function renderDocContent(content, lang, options = {}) {
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

  function renderFenceCode(token, lang) {
    const language = token.info.trim().split(/\s+/)[0]?.toLowerCase() || '';
    const className = language ? ` class="${escapeHtml(md.options.langPrefix + language)}"` : '';
    const content = highlightCode(token.content, language);
    const copyLabel = escapeHtml(getLabel(lang, 'code.copy'));
    const copiedLabel = escapeHtml(getLabel(lang, 'code.copied'));
    const failedLabel = escapeHtml(getLabel(lang, 'code.copyFailed'));

    return (
      `<div class="code-block">` +
      `<pre><code${className}>${content}</code></pre>` +
      `<button class="code-copy-btn" type="button" aria-label="${copyLabel}" title="${copyLabel}" data-label-copy="${copyLabel}" data-label-copied="${copiedLabel}" data-label-failed="${failedLabel}">` +
      // Icons are drawn by CSS (mask-image) from styles.css — keeping SVG
      // markup out of every code block saves ~1.7 KB per rendered fence.
      `<span class="code-copy-icon code-copy-icon-copy" aria-hidden="true"></span>` +
      `<span class="code-copy-icon code-copy-icon-check" aria-hidden="true"></span>` +
      `<span class="code-copy-icon code-copy-icon-error" aria-hidden="true"></span>` +
      `</button>` +
      `</div>\n`
    );
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
        `<p class="doc-callout-title">${escapeHtml(getCalloutTitle(alertType, state.env.lang))}</p>`,
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

  function rewriteDocLinks(html, basePath, docId = '') {
    return html.replace(/href="([^"]+\.md(?:#[^"]*)?)"/g, (match, link) => {
      if (!isLocalAssetSrc(link)) {
        return match;
      }

      const [linkPath, hash = ''] = link.split('#');
      const normalized = normalizeDocLinkPath(linkPath, docId);

      return `href="${getDocUrl(normalized, basePath)}${hash ? `#${hash}` : ''}"`;
    });
  }

  function getAssetMetadata(src) {
    const { path } = splitAssetSrc(src);

    return assetMetadataByPath.get(normalizeAssetManifestPath(path));
  }

  function getPreferredAssetSrc(src) {
    const { path, suffix } = splitAssetSrc(src);
    const asset = assetMetadataByPath.get(normalizeAssetManifestPath(path));

    return asset?.preferredPath ? `${asset.preferredPath}${suffix}` : src;
  }

  return { renderDocContent };
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

function setImagePerformanceAttributes(token, asset) {
  if (!asset) {
    return;
  }

  if (Number.isInteger(asset.width) && !token.attrGet('width')) {
    token.attrSet('width', String(asset.width));
  }

  if (Number.isInteger(asset.height) && !token.attrGet('height')) {
    token.attrSet('height', String(asset.height));
  }
}

function normalizeAssetManifestPath(src) {
  return src.replace(/\\/g, '/').replace(/^\/+|^(?:\.\/)+/g, '');
}
