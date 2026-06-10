import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readContentModel } from './content-model.mjs';
import { escapeHtml, escapeRegExp } from './markdown-shared.mjs';
import { githubUrl, siteMeta, siteName } from './site-meta.mjs';
import { findNavNodePath, getDocKey, getNavNodeKey, normalizeBasePath, slash } from './shared-utils.mjs';
import { renderShellHtml } from './shell-template.mjs';
import { renderNavSections } from './nav-renderer.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(rootDir, 'docs');
const distDir = path.join(rootDir, 'dist');
const templatePath = path.join(distDir, 'index.html');
const basePath = normalizeBasePath(process.env.VITE_BASE_PATH || '/xrDocs-xrMPE/');
const siteUrl = normalizeSiteUrl(process.env.SITE_URL || 'https://vadfonker-cyber.github.io/xrDocs-xrMPE/');
const noindex = isTruthyEnv(process.env.NOINDEX);
const skipGitUpdatedAt = isTruthyEnv(process.env.SKIP_GIT_UPDATED_AT);
const labelsCache = new Map();

const template = fs.readFileSync(templatePath, 'utf8');
const { docs, nav } = readContentModel(docsDir);
const gitUpdatedAtByPath = getGitUpdatedAtByPath(docs.map((doc) => doc.path));
const firstByLang = new Map(['ru', 'en'].map((lang) => [lang, docs.find((doc) => doc.lang === lang)]));

/**
 * Pre-rendered HTML loaded from dist/doc-content — written by generate-content-data.mjs
 * earlier in the build pipeline. Avoids re-running MarkdownIt for every page.
 */
const renderedHtmlByKey = new Map(
  docs.map((doc) => {
    const jsonPath = path.join(distDir, 'doc-content', doc.lang, ...doc.id.split('/'), 'index.json');
    const html = JSON.parse(fs.readFileSync(jsonPath, 'utf8')).html ?? '';
    return [getDocKey(doc), html];
  }),
);

const pages = getCanonicalDocs()
  .filter((doc) => doc.id !== 'index')
  .map((doc) => ({
    doc,
    canonicalPath: getDocPath(doc.id),
    outputPath: path.join(distDir, ...doc.id.split('/'), 'index.html'),
  }));

await Promise.all(pages.map((page) => writePage(page.doc, page.canonicalPath, page.outputPath)));

const defaultDoc = firstByLang.get('en') || docs[0];
if (defaultDoc) {
  await writePage(defaultDoc, '/', templatePath);
  await writeNotFoundPage(defaultDoc, path.join(distDir, '404.html'));
}

if (!noindex) {
  writeSitemap(pages);
}

writeRobots();

console.log(`Prerendered ${pages.length} documentation pages.`);

async function writePage(doc, canonicalPath, outputPath) {
  const title = `${doc.title} | ${siteName}`;
  const description = siteMeta[doc.lang].description;
  const canonicalUrl = toAbsoluteUrl(canonicalPath);
  const body = renderStaticBody(doc);

  const patches = [
    { attribute: 'name', name: 'description', content: description },
    { attribute: 'property', name: 'og:title', content: title },
    { attribute: 'property', name: 'og:description', content: description },
    { attribute: 'property', name: 'og:url', content: canonicalUrl },
    { attribute: 'property', name: 'og:locale', content: siteMeta[doc.lang].locale },
    { attribute: 'name', name: 'twitter:title', content: title },
    { attribute: 'name', name: 'twitter:description', content: description },
    ...(noindex ? [{ attribute: 'name', name: 'robots', content: 'noindex, nofollow' }] : []),
  ];
  const linkPatches = [{ rel: 'canonical', href: canonicalUrl }];

  let html = template
    .replace(/<html lang="[^"]*"/, `<html lang="${doc.lang}"`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<div id="app"><\/div>/, `<div id="app">${body}</div>`);

  html = applyMetaPatches(html, patches, linkPatches);

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, html);
}

async function writeNotFoundPage(defaultDoc, outputPath) {
  const copy = readLabels(defaultDoc.lang);
  const title = `${copy['notFound.title'] || 'Page not found'} | ${siteName}`;
  const description = copy['notFound.message'] || siteMeta[defaultDoc.lang].description;
  const body = renderStaticBody(
    {
      ...defaultDoc,
      id: '__404__',
      title: copy['notFound.title'] || 'Page not found',
    },
    { notFound: true },
  );
  const patches = [
    { attribute: 'name', name: 'description', content: description },
    { attribute: 'property', name: 'og:title', content: title },
    { attribute: 'property', name: 'og:description', content: description },
    { attribute: 'property', name: 'og:url', content: siteUrl },
    { attribute: 'property', name: 'og:locale', content: siteMeta[defaultDoc.lang].locale },
    { attribute: 'name', name: 'twitter:title', content: title },
    { attribute: 'name', name: 'twitter:description', content: description },
    { attribute: 'name', name: 'robots', content: 'noindex, nofollow' },
  ];

  let html = template
    .replace(/<html lang="[^"]*"/, `<html lang="${defaultDoc.lang}"`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<div id="app"><\/div>/, `<div id="app">${body}</div>`);

  html = applyMetaPatches(html, patches, []);

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, html);
}

function renderStaticBody(activeDoc, options = {}) {
  const copy = readLabels(activeDoc.lang);
  const nav = renderStaticNav(activeDoc);
  const article = options.notFound ? renderStaticNotFoundArticle(activeDoc.lang) : renderedHtmlByKey.get(getDocKey(activeDoc)) ?? '';
  const docKey = options.notFound ? `404:${activeDoc.lang}` : getDocKey(activeDoc);
  const articleAttributes = options.notFound
    ? ` data-doc-key="${escapeHtml(docKey)}"`
    : ` data-doc-key="${escapeHtml(docKey)}" data-prerendered="true"`;

  return renderShellHtml({
    articleAttributes,
    articleHtml: article,
    copy,
    getAssetUrl: getAssetPath,
    githubUrl,
    lang: activeDoc.lang,
    navHtml: nav,
    notFound: Boolean(options.notFound),
  });
}

function renderStaticNotFoundArticle(lang) {
  const copy = readLabels(lang);

  return `
    <div class="not-found">
      <p class="not-found-code">404</p>
      <h1>${escapeHtml(copy['notFound.title'] || 'Page not found')}</h1>
      <p>${escapeHtml(copy['notFound.message'] || '')}</p>
      <a class="not-found-link" href="${getDocPath('index')}">${escapeHtml(copy['notFound.homeLink'] || 'Go to documentation home')}</a>
    </div>
  `;
}

function renderStaticNav(activeDoc) {
  const activePath = findNavNodePath(nav, activeDoc.lang, activeDoc.id);
  const activeAncestorKeys = new Set(activePath.slice(0, -1).map(getNavNodeKey));

  return renderNavSections({
    activeAncestorKeys,
    activeId: activeDoc.id,
    getDocUrl: getDocPath,
    getNavNodeKey,
    sections: nav[activeDoc.lang] || [],
  });
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
  if (skipGitUpdatedAt) {
    return new Map();
  }

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
  if (labelsCache.has(lang)) return labelsCache.get(lang);

  const localePath = path.join(rootDir, 'src', 'locales', `${lang}.json`);
  const result = fs.existsSync(localePath)
    ? JSON.parse(fs.readFileSync(localePath, 'utf8'))
    : {};

  labelsCache.set(lang, result);
  return result;
}

/**
 * Applies all meta tag and link replacements in a SINGLE pass over the HTML string,
 * replacing the previous 8+ sequential regex calls in writePage.
 * Uses capturing groups so each match is identified by index without re-scanning.
 */
function applyMetaPatches(html, metaPatches, linkPatches = []) {
  const entries = [
    ...metaPatches.map(({ attribute, name, content }) => ({
      pattern: `<meta\\s+${attribute}="${escapeRegExp(name)}"\\s+content="[^"]*"\\s*/?>`,
      tag: `<meta ${attribute}="${name}" content="${escapeHtml(content)}" />`,
    })),
    ...linkPatches.map(({ rel, href }) => ({
      pattern: `<link\\s+rel="${escapeRegExp(rel)}"\\s+href="[^"]*"\\s*/?>`,
      tag: `<link rel="${rel}" href="${escapeHtml(href)}" />`,
    })),
  ];

  const found = new Array(entries.length).fill(false);
  const combined = new RegExp(entries.map((e) => `(${e.pattern})`).join('|'), 'g');

  html = html.replace(combined, (...args) => {
    // args[1..n] are capturing groups; find the first non-undefined one
    for (let i = 0; i < entries.length; i++) {
      if (args[i + 1] !== undefined) {
        found[i] = true;
        return entries[i].tag;
      }
    }
    return args[0];
  });

  // Inject tags that weren't already present in the template
  const injections = entries
    .filter((_, i) => !found[i])
    .map((e) => `    ${e.tag}`)
    .join('\n');

  if (injections) {
    html = html.replace('</head>', `${injections}\n  </head>`);
  }

  return html;
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
