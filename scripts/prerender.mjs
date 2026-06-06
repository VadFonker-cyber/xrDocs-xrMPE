import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readContentModel } from './content-model.mjs';
import { renderDocContent } from './render-doc.mjs';
import { escapeHtml, escapeRegExp } from './markdown-shared.mjs';
import { githubUrl, siteMeta, siteName } from './site-meta.mjs';
import { findNodePath, getNavNodeKey, normalizeBasePath } from './shared-utils.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(rootDir, 'docs');
const distDir = path.join(rootDir, 'dist');
const templatePath = path.join(distDir, 'index.html');
const basePath = normalizeBasePath(process.env.VITE_BASE_PATH || '/xrDocs-xrMPE/');
const siteUrl = normalizeSiteUrl(process.env.SITE_URL || 'https://vadfonker-cyber.github.io/xrDocs-xrMPE/');
const noindex = isTruthyEnv(process.env.NOINDEX);

const template = fs.readFileSync(templatePath, 'utf8');
const { docs, nav } = readContentModel(docsDir);
const gitUpdatedAtByPath = getGitUpdatedAtByPath(docs.map((doc) => doc.path));
const firstByLang = new Map(['ru', 'en'].map((lang) => [lang, docs.find((doc) => doc.lang === lang)]));
const pages = getCanonicalDocs()
  .filter((doc) => doc.id !== 'index')
  .map((doc) => ({
    doc,
    canonicalPath: getDocPath(doc.id),
    outputPath: path.join(distDir, ...doc.id.split('/'), 'index.html'),
  }));

for (const page of pages) {
  writePage(page.doc, page.canonicalPath, page.outputPath);
}

const defaultDoc = firstByLang.get('en') || docs[0];

if (defaultDoc) {
  writePage(defaultDoc, '/', templatePath);
}

if (!noindex) {
  writeSitemap(pages);
}

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

  if (noindex) {
    html = setMeta(html, 'name', 'robots', 'noindex, nofollow');
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html);
}

function renderStaticBody(activeDoc) {
  const copy = readLabels(activeDoc.lang);
  const nav = renderStaticNav(activeDoc);
  const article = renderDocContent(activeDoc.content, activeDoc.lang, { basePath }).html;
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

// SYNC CONTRACT: this function must produce the same HTML structure as
// renderNavNode() in src/nav.ts. Differences allowed:
//   - no data-nav-id click handling (static HTML has no JS at render time)
//   - expanded is derived only from ancestor path, not navExpandedIds
// If you change the HTML here, update src/nav.ts accordingly, and vice versa.
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
      <a class="doc-link" href="${getDocPath(node.id)}"${active}>
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
  if (noindex) {
    fs.writeFileSync(path.join(distDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
    return;
  }

  fs.writeFileSync(
    path.join(distDir, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${toAbsoluteUrl('/sitemap.xml')}\n`,
  );
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
  const gitUpdatedAt = gitUpdatedAtByPath.get(doc.path);

  return gitUpdatedAt || doc.updatedAt || new Date(0);
}

function getGitUpdatedAtByPath(relativePaths) {
  const uniquePaths = [...new Set(relativePaths)].filter(Boolean);

  if (!uniquePaths.length) {
    return new Map();
  }

  try {
    const output = execFileSync('git', ['-C', rootDir, 'log', '--format=__COMMIT__%cI', '--name-only', '--', ...uniquePaths], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const dates = new Map();
    let commitDate;

    for (const line of output.split(/\r?\n/)) {
      if (line.startsWith('__COMMIT__')) {
        commitDate = new Date(line.slice('__COMMIT__'.length));
        continue;
      }

      const filePath = slash(line.trim());

      if (commitDate && filePath && !dates.has(filePath)) {
        dates.set(filePath, commitDate);
      }
    }

    return dates;
  } catch {
    return new Map();
  }
}

function formatSitemapDate(value) {
  return value.toISOString().slice(0, 10);
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

function upsertLink(html, rel, href) {
  const tag = `<link rel="${rel}" href="${escapeHtml(href)}" />`;
  const pattern = new RegExp(`<link\\s+rel="${rel}"\\s+href="[^"]*"\\s*/?>`);

  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }

  return html.replace('</head>', `    ${tag}\n  </head>`);
}

function getCanonicalDocs() {
  const byId = new Map();

  for (const doc of docs) {
    const existing = byId.get(doc.id);

    if (!existing || doc.lang === 'en') {
      byId.set(doc.id, doc);
    }
  }

  return [...byId.values()].sort(compareCanonicalDocs);
}

function compareCanonicalDocs(a, b) {
  if (a.order !== b.order) {
    return a.order - b.order;
  }

  return a.id.localeCompare(b.id);
}

function getDocPath(id) {
  if (id === 'index') {
    return basePath;
  }

  const encodedId = id.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return encodedId ? `${basePath}${encodedId}/` : basePath;
}

function getAssetPath(src) {
  return `${basePath}${src.replace(/^\.?\//, '')}`;
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

function normalizeSiteUrl(value) {
  return `${value.replace(/\/+$/g, '')}/`;
}

function isTruthyEnv(value) {
  return /^(?:1|true|yes|on)$/i.test(String(value || '').trim());
}

function escapeXml(value) {
  return escapeHtml(value).replace(/&#039;/g, '&apos;');
}

function slash(value) {
  return value.replace(/\\/g, '/');
}
