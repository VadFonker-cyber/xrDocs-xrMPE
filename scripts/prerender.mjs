import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import dos from 'highlight.js/lib/languages/dos';
import ini from 'highlight.js/lib/languages/ini';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import xml from 'highlight.js/lib/languages/xml';
import { readContentModel } from './content-model.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(rootDir, 'docs');
const distDir = path.join(rootDir, 'dist');
const templatePath = path.join(distDir, 'index.html');
const basePath = normalizeBasePath(process.env.VITE_BASE_PATH || '/xrDocs-xrMPE/');
const siteUrl = normalizeSiteUrl(process.env.SITE_URL || 'https://vadfonker-cyber.github.io/xrDocs-xrMPE/');
const siteName = 'xrDocs';
const githubUrl = 'https://github.com/VadFonker-cyber/xrDocs-xrMPE';
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  langPrefix: 'language-',
  highlight: highlightCode,
});
const defaultImageRule = md.renderer.rules.image;
const defaultFenceRule = md.renderer.rules.fence;

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

const siteMeta = {
  ru: {
    description: 'Документация по моддингу S.T.A.L.K.E.R. для xrMPE.',
    locale: 'ru_RU',
  },
  en: {
    description: 'S.T.A.L.K.E.R. modding documentation for xrMPE.',
    locale: 'en_US',
  },
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

function renderFenceCode(token) {
  const language = token.info.trim().split(/\s+/)[0]?.toLowerCase() || '';
  const className = language ? ` class="${escapeHtml(md.options.langPrefix + language)}"` : '';
  const content = highlightCode(token.content, language);

  return `<pre><code${className}>${content}</code></pre>\n`;
}

const template = fs.readFileSync(templatePath, 'utf8');
const { docs, nav } = readContentModel(docsDir);
const firstByLang = new Map(['ru', 'en'].map((lang) => [lang, docs.find((doc) => doc.lang === lang)]));
const pages = docs.map((doc) => ({
  doc,
  canonicalPath: getDocPath(doc.lang, doc.id),
  outputPath: path.join(distDir, doc.lang, ...doc.id.split('/'), 'index.html'),
}));

for (const page of pages) {
  writePage(page.doc, page.canonicalPath, page.outputPath);
}

const defaultDoc = firstByLang.get('ru') || docs[0];

if (defaultDoc) {
  writePage(defaultDoc, '/', templatePath);
}

writeSitemap(pages);
writeRobots();

console.log(`Prerendered ${pages.length} documentation pages.`);

function writePage(doc, canonicalPath, outputPath) {
  const title = `${doc.title} | ${siteName}`;
  const description = siteMeta[doc.lang].description;
  const canonicalUrl = toAbsoluteUrl(canonicalPath);
  const body = renderStaticBody(doc);
  let html = template
    .replace(/<html lang="[^"]*"/, `<html lang="${doc.lang}"`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<div id="app"><\/div>/, `<div id="app">${body}</div>`);

  html = setMeta(html, 'name', 'description', description);
  html = setMeta(html, 'property', 'og:title', title);
  html = setMeta(html, 'property', 'og:description', description);
  html = setMeta(html, 'property', 'og:url', canonicalUrl);
  html = setMeta(html, 'property', 'og:locale', siteMeta[doc.lang].locale);
  html = setMeta(html, 'name', 'twitter:title', title);
  html = setMeta(html, 'name', 'twitter:description', description);
  html = upsertLink(html, 'canonical', canonicalUrl);

  for (const alternate of getAlternates(doc)) {
    html = upsertLink(html, 'alternate', toAbsoluteUrl(getDocPath(alternate.lang, alternate.id)), alternate.lang);
  }

  html = upsertLink(html, 'alternate', getXDefaultUrl(doc, canonicalPath), 'x-default');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html);
}

function renderStaticBody(activeDoc) {
  const copy = readLabels(activeDoc.lang);
  const nav = renderStaticNav(activeDoc);
  const article = renderDocContent(activeDoc.content, activeDoc.lang);
  const docKey = `${activeDoc.lang}:${activeDoc.id}`;

  return `
    <div class="layout" data-nav-open="false" data-toc-open="false" style="--toc-width: 360px">
      <button class="nav-overlay" type="button" aria-label="${escapeHtml(copy['aria.closeNavigation'] || '')}"></button>
      <button class="toc-overlay" type="button" aria-label="${escapeHtml(copy['aria.closeContents'] || '')}"></button>
      <aside class="sidebar" aria-label="${escapeHtml(copy['aria.nav'] || 'Documentation navigation')}">
        <div class="brand">
          <picture>
            <source srcset="${getAssetPath('./xrdocs-brand.webp')}" type="image/webp" />
            <img class="brand-mark" src="${getAssetPath('./xrdocs-brand.png')}" width="42" height="42" alt="" aria-hidden="true" />
          </picture>
          <div>
            <div class="brand-title">xrDocs</div>
            <div class="brand-subtitle">S.T.A.L.K.E.R. modding</div>
          </div>
        </div>
        <div class="search-panel">
          <label class="search">
            <span class="search-icon" aria-hidden="true"></span>
            <input type="search" placeholder="${escapeHtml(copy['search.placeholder'] || '')}" autocomplete="off" />
          </label>
        </div>
        <nav class="doc-nav">${nav}</nav>
      </aside>
      <main class="workspace">
        <section class="topbar">
          <div class="topbar-controls">
            <button class="control-button nav-toggle" type="button" aria-label="${escapeHtml(copy['menu.label'] || 'Menu')}" aria-expanded="false">
              <span class="menu-icon" aria-hidden="true"></span>
              <span>${escapeHtml(copy['menu.label'] || 'Menu')}</span>
            </button>
            <button class="control-button" type="button" aria-label="${escapeHtml(copy['aria.switchLanguage'] || '')}">${activeDoc.lang.toUpperCase()}</button>
            <button class="icon-button" type="button" aria-label="${escapeHtml(copy['aria.switchTheme'] || '')}"></button>
            <button class="icon-button toc-toggle" type="button" aria-label="${escapeHtml(copy['toc.toggle'] || '')}" aria-expanded="false">
              <span class="toc-icon" aria-hidden="true"></span>
            </button>
            <a class="icon-button" href="${githubUrl}" target="_blank" rel="noreferrer" aria-label="GitHub" title="GitHub"></a>
          </div>
        </section>
        <section class="content-grid">
          <article id="docArticle" class="doc-article" data-doc-key="${escapeHtml(docKey)}" data-prerendered="true">${article}</article>
        </section>
      </main>
      <aside class="toc-panel" aria-label="${escapeHtml(copy['toc.title'] || 'Contents')}">
        <div class="toc-header"><h2>${escapeHtml(copy['toc.title'] || 'Contents')}</h2></div>
      </aside>
    </div>
  `;
}

function renderStaticNav(activeDoc) {
  const activePath = findNavNodePath(activeDoc.lang, activeDoc.id);
  const activeAncestorKeys = new Set(activePath.slice(0, -1).map(getNavNodeKey));

  return (nav[activeDoc.lang] || [])
    .map(
      (section) =>
        `<section class="nav-section"><h2>${escapeHtml(section.title)}</h2>${renderStaticNavNodes(section.children, activeDoc, activeAncestorKeys)}</section>`,
    )
    .join('');
}

function renderStaticNavNodes(nodes, activeDoc, activeAncestorKeys) {
  if (!nodes.length) {
    return '';
  }

  return `<ul class="nav-list">${nodes.map((node) => renderStaticNavNode(node, activeDoc, activeAncestorKeys)).join('')}</ul>`;
}

function renderStaticNavNode(node, activeDoc, activeAncestorKeys) {
  const key = getNavNodeKey(node);
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && activeAncestorKeys.has(key);
  const active = node.id === activeDoc.id ? ' aria-current="page"' : '';
  const toggle = hasChildren
    ? `<button class="nav-item-toggle" type="button" data-nav-id="${escapeHtml(key)}" aria-label="${escapeHtml(node.title)}" aria-expanded="${expanded}"></button>`
    : '<span class="nav-item-spacer" aria-hidden="true"></span>';
  const label = node.id
    ? `
      <a class="doc-link" href="${getDocPath(activeDoc.lang, node.id)}"${active}>
        <span>${escapeHtml(node.title)}</span>
      </a>
    `
    : `<span class="nav-folder-label">${escapeHtml(node.title)}</span>`;
  const children = hasChildren ? renderStaticNavNodes(node.children, activeDoc, activeAncestorKeys) : '';

  return `
    <li class="nav-item" data-depth="${node.depth}" data-expanded="${expanded}">
      <div class="nav-item-row">
        ${toggle}
        ${label}
      </div>
      ${children}
    </li>
  `;
}

function findNavNodePath(lang, id) {
  for (const section of nav[lang] || []) {
    const found = findNodePath(section.children, id);

    if (found.length) {
      return found;
    }
  }

  return [];
}

function findNodePath(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) {
      return [node];
    }

    const childPath = findNodePath(node.children, id);

    if (childPath.length) {
      return [node, ...childPath];
    }
  }

  return [];
}

function getNavNodeKey(node) {
  return node.id || `${node.depth}:${node.order}:${node.title}`;
}

function writeSitemap(pages) {
  const defaultUpdatedAt = getLatestUpdatedAt(docs);
  const urls = [{ canonicalPath: '/', updatedAt: defaultUpdatedAt }, ...pages]
    .map(
      (page) =>
        `  <url><loc>${escapeXml(toAbsoluteUrl(page.canonicalPath))}</loc><lastmod>${formatSitemapDate(getPageUpdatedAt(page))}</lastmod></url>`,
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  fs.writeFileSync(path.join(distDir, 'sitemap.xml'), xml);
}

function writeRobots() {
  fs.writeFileSync(
    path.join(distDir, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${toAbsoluteUrl('/sitemap.xml')}\n`,
  );
}

function getAlternates(doc) {
  return ['ru', 'en']
    .map((lang) => docs.find((candidate) => candidate.lang === lang && candidate.id === doc.id) || firstByLang.get(lang))
    .filter(Boolean);
}

function getXDefaultUrl(doc, canonicalPath) {
  if (canonicalPath === '/') {
    return siteUrl;
  }

  const fallbackDoc =
    docs.find((candidate) => candidate.lang === 'ru' && candidate.id === doc.id) || firstByLang.get('ru') || doc;

  return toAbsoluteUrl(getDocPath(fallbackDoc.lang, fallbackDoc.id));
}

function getLatestUpdatedAt(items) {
  return items.reduce((latest, item) => {
    const updatedAt = getDocUpdatedAt(item);
    return updatedAt > latest ? updatedAt : latest;
  }, new Date(0));
}

function getPageUpdatedAt(page) {
  if (page.doc) {
    return getDocUpdatedAt(page.doc);
  }

  return page.updatedAt || new Date(0);
}

function getDocUpdatedAt(doc) {
  const gitUpdatedAt = getGitUpdatedAt(doc.path);

  return gitUpdatedAt || doc.updatedAt || new Date(0);
}

function getGitUpdatedAt(relativePath) {
  try {
    const output = execFileSync('git', ['-C', rootDir, 'log', '-1', '--format=%cI', '--', relativePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return output ? new Date(output) : undefined;
  } catch {
    return undefined;
  }
}

function formatSitemapDate(value) {
  return value.toISOString().slice(0, 10);
}

function renderDocContent(content, lang) {
  const tokens = md.parse(content, {});
  applyHeadingIds(tokens, lang);

  return rewriteDocLinks(md.renderer.render(tokens, md.options, {}), lang);
}

function applyHeadingIds(tokens, lang) {
  const slugCounts = new Map();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type !== 'heading_open') {
      continue;
    }

    const inline = tokens[index + 1];
    const title = inline?.type === 'inline' ? inline.content.trim() : '';
    const baseSlug = slugifyHeading(title, lang) || `heading-${index}`;
    const count = (slugCounts.get(baseSlug) || 0) + 1;
    const id = count === 1 ? baseSlug : `${baseSlug}-${count}`;
    slugCounts.set(baseSlug, count);
    token.attrSet('id', id);
  }
}

function slugifyHeading(value, lang) {
  return value
    .toLocaleLowerCase(lang)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function highlightCode(source, language) {
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

function rewriteDocLinks(html, currentLang) {
  return html.replace(/href="([^"]+\.md(?:#[^"]*)?)"/g, (_match, link) => {
    const [linkPath, hash = ''] = link.split('#');
    const normalized = linkPath
      .replace(/^\.\//, '')
      .replace(/^docs\//, '')
      .replace(/^(ru|en)\//, '')
      .replace(/\.md$/i, '');

    return `href="${getDocPath(currentLang, normalized)}${hash ? `#${hash}` : ''}"`;
  });
}

function readLabels(lang) {
  const localePath = path.join(rootDir, 'src', 'locales', `${lang}.json`);

  if (!fs.existsSync(localePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(localePath, 'utf8'));
}

function setMeta(html, attribute, name, content) {
  const escaped = escapeHtml(content);
  const pattern = new RegExp(`<meta\\s+${attribute}="${escapeRegExp(name)}"\\s+content="[^"]*"\\s*/?>`);
  const tag = `<meta ${attribute}="${name}" content="${escaped}" />`;

  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }

  return html.replace('</head>', `    ${tag}\n  </head>`);
}

function upsertLink(html, rel, href, hreflang) {
  const hreflangAttribute = hreflang ? ` hreflang="${hreflang}"` : '';
  const tag = `<link rel="${rel}"${hreflangAttribute} href="${escapeHtml(href)}" />`;
  const pattern = hreflang
    ? new RegExp(`<link\\s+rel="${rel}"\\s+hreflang="${escapeRegExp(hreflang)}"\\s+href="[^"]*"\\s*/?>`)
    : new RegExp(`<link\\s+rel="${rel}"\\s+href="[^"]*"\\s*/?>`);

  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }

  return html.replace('</head>', `    ${tag}\n  </head>`);
}

function getDocPath(lang, id) {
  return `${basePath}${lang}/${id.split('/').map(encodeURIComponent).join('/')}/`;
}

function getAssetPath(src) {
  return `${basePath}${src.replace(/^\.?\//, '')}`;
}

function isThemeAssetSrc(src) {
  const { path: assetPath } = splitAssetSrc(src);
  return /\.(dark|light)\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(assetPath);
}

function normalizeThemeAssetSrc(src) {
  const { path: assetPath, suffix } = splitAssetSrc(src);
  return `${assetPath.replace(/\.(dark|light)(\.(?:avif|gif|jpe?g|png|svg|webp))$/i, '$2')}${suffix}`;
}

function splitAssetSrc(src) {
  const match = src.match(/^([^?#]+)([?#].*)?$/);

  return {
    path: match?.[1] || src,
    suffix: match?.[2] || '',
  };
}

function inlineStylesheets(html) {
  return html.replace(/<link\s+rel="stylesheet"\s+[^>]*href="([^"]+)"[^>]*>/g, (tag, href) => {
    const filePath = getDistAssetPath(href);

    if (!filePath || !fs.existsSync(filePath)) {
      return tag;
    }

    return `<style>\n${fs.readFileSync(filePath, 'utf8')}\n</style>`;
  });
}

function getDistAssetPath(href) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(href)) {
    return undefined;
  }

  const withoutQuery = href.split(/[?#]/)[0];
  const relativePath = withoutQuery.startsWith(basePath)
    ? withoutQuery.slice(basePath.length)
    : withoutQuery.replace(/^\//, '');

  if (!relativePath.startsWith('assets/')) {
    return undefined;
  }

  return path.join(distDir, ...relativePath.split('/'));
}

function isLocalAssetSrc(src) {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(src);
}

function toAbsoluteUrl(urlPath) {
  if (urlPath === '/') {
    return siteUrl;
  }

  const relativePath = urlPath.startsWith(basePath)
    ? urlPath.slice(basePath.length)
    : urlPath.replace(/^\//, '');

  return new URL(relativePath, siteUrl).toString();
}

function normalizeBasePath(value) {
  if (!value || value === './') {
    return '/';
  }

  return `/${value.replace(/^\/+|\/+$/g, '')}/`;
}

function normalizeSiteUrl(value) {
  return `${value.replace(/\/+$/g, '')}/`;
}

function parseAdmonishInfo(info) {
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

function getDefaultCalloutTitle(kind) {
  return kind === 'warning' ? 'Важно' : kind;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeXml(value) {
  return escapeHtml(value).replace(/&#039;/g, '&apos;');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
