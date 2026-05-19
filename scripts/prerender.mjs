import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(rootDir, 'docs');
const distDir = path.join(rootDir, 'dist');
const templatePath = path.join(distDir, 'index.html');
const basePath = normalizeBasePath(process.env.VITE_BASE_PATH || '/xrDocs-xrMPE/');
const siteUrl = normalizeSiteUrl(process.env.SITE_URL || 'https://vadfonker-cyber.github.io/xrDocs-xrMPE/');
const siteName = 'xrDocs';
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  langPrefix: 'language-',
});
const defaultImageRule = md.renderer.rules.image;

md.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const srcIndex = token.attrIndex('src');

  if (srcIndex >= 0) {
    const src = token.attrs?.[srcIndex]?.[1] || '';

    if (isLocalAssetSrc(src)) {
      token.attrSet('src', getAssetPath(src));
    }
  }

  return defaultImageRule
    ? defaultImageRule(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options);
};

const siteMeta = {
  ru: {
    description: 'Dokumentatsiya po moddingu S.T.A.L.K.E.R. dlya xrMPE.',
    locale: 'ru_RU',
  },
  en: {
    description: 'S.T.A.L.K.E.R. modding documentation for xrMPE.',
    locale: 'en_US',
  },
};

const template = fs.readFileSync(templatePath, 'utf8');
const navConfig = createNavConfig();
const docs = readDocs().sort(compareDocs);
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

function readDocs() {
  return listMarkdownFiles(docsDir)
    .filter((file) => path.basename(file).toLowerCase() !== 'init.md')
    .map((file) => {
      const raw = fs.readFileSync(file, 'utf8');
      const relative = slash(path.relative(docsDir, file));
      const [lang, ...parts] = relative.split('/');
      const id = parts.join('/').replace(/\.md$/i, '');
      const { meta, content } = parseFrontmatter(raw);
      const navEntry = navConfig[lang]?.get(id);

      return {
        id,
        lang,
        path: `docs/${relative}`,
        title: extractTitle(content) || 'Untitled',
        content,
        meta: {
          section: navEntry?.section || meta.section || 'Documents',
          order: navEntry?.order ?? Number(meta.order || 999),
          summary: meta.summary || '',
        },
      };
    })
    .filter((doc) => doc.lang === 'ru' || doc.lang === 'en');
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return listMarkdownFiles(fullPath);
    }

    return entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : [];
  });
}

function createNavConfig() {
  return {
    ru: parseInit('ru'),
    en: parseInit('en'),
  };
}

function parseInit(lang) {
  const entries = new Map();
  const initPath = path.join(docsDir, lang, 'init.md');

  if (!fs.existsSync(initPath)) {
    return entries;
  }

  let order = 0;
  let section;

  for (const rawLine of fs.readFileSync(initPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    const link = line.match(/^\s*[-*]\s+\[([^\]]+)\]\(([^)]+\.md)\)/);

    if (heading) {
      section = heading[1].trim();
      continue;
    }

    if (!link) {
      continue;
    }

    const id = normalizeDocId(link[2], lang);

    if (id && id !== 'init') {
      entries.set(id, { order, section });
      order += 1;
    }
  }

  return entries;
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) {
    return { meta: {}, content: raw };
  }

  const end = raw.indexOf('\n---', 3);

  if (end === -1) {
    return { meta: {}, content: raw };
  }

  const meta = {};
  const block = raw.slice(3, end).trim();

  for (const line of block.split('\n')) {
    const separator = line.indexOf(':');

    if (separator === -1) {
      continue;
    }

    meta[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }

  return {
    meta,
    content: raw.slice(end + 4).replace(/^\s+/, ''),
  };
}

function compareDocs(a, b) {
  if (a.lang !== b.lang) {
    return a.lang.localeCompare(b.lang);
  }

  const aNav = navConfig[a.lang].get(a.id);
  const bNav = navConfig[b.lang].get(b.id);

  if (aNav || bNav) {
    return (aNav?.order ?? 9999) - (bNav?.order ?? 9999);
  }

  if (a.meta.section !== b.meta.section) {
    return a.meta.section.localeCompare(b.meta.section, a.lang);
  }

  if (a.meta.order !== b.meta.order) {
    return a.meta.order - b.meta.order;
  }

  return a.title.localeCompare(b.title, a.lang);
}

function writePage(doc, canonicalPath, outputPath) {
  const title = `${doc.title} | ${siteName}`;
  const description = [doc.meta.summary, siteMeta[doc.lang].description].filter(Boolean).join(' ');
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

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html);
}

function renderStaticBody(activeDoc) {
  const nav = ['ru', 'en']
    .map((lang) => {
      const links = docs
        .filter((doc) => doc.lang === lang)
        .map((doc) => `<li><a href="${getDocPath(doc.lang, doc.id)}">${escapeHtml(doc.title)}</a></li>`)
        .join('');

      return `<section><h2>${lang.toUpperCase()}</h2><ul>${links}</ul></section>`;
    })
    .join('');
  const article = rewriteDocLinks(md.render(activeDoc.content), activeDoc.lang);

  return `<nav aria-label="Documentation">${nav}</nav><main><article>${article}</article></main>`;
}

function writeSitemap(pages) {
  const urls = ['/', ...pages.map((page) => page.canonicalPath)]
    .map((urlPath) => `  <url><loc>${escapeXml(toAbsoluteUrl(urlPath))}</loc></url>`)
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

function normalizeDocId(filePath, lang) {
  return filePath
    .split('#')[0]
    .replace(/^\.\//, '')
    .replace(/^docs\//, '')
    .replace(new RegExp(`^${lang}/`), '')
    .replace(/^(ru|en)\//, '')
    .replace(/\.md$/i, '');
}

function extractTitle(content) {
  const heading = content.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : '';
}

function slash(value) {
  return value.replace(/\\/g, '/');
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
