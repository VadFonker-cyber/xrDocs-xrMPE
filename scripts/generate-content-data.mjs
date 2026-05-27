import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(rootDir, 'docs');
const publicDir = path.join(rootDir, 'public');
const generatedDir = path.join(rootDir, 'src', 'generated');

const navConfig = createNavConfig();
const docs = readDocs().sort(compareDocs);
const searchIndex = docs.map((doc) => ({
  id: doc.id,
  lang: doc.lang,
  path: doc.path,
  title: doc.title,
  section: doc.meta.section,
  summary: doc.meta.summary,
  text: stripMarkdown(doc.content),
}));
const themeAssets = listPublicFiles(publicDir)
  .map((file) => slash(path.relative(publicDir, file)))
  .filter((file) => /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(file))
  .sort((a, b) => a.localeCompare(b));

fs.mkdirSync(generatedDir, { recursive: true });
fs.writeFileSync(
  path.join(generatedDir, 'docs-manifest.json'),
  `${JSON.stringify({ docs: docs.map(({ content, updatedAt, ...doc }) => doc) }, null, 2)}\n`,
);
fs.writeFileSync(path.join(generatedDir, 'theme-assets.json'), `${JSON.stringify(themeAssets, null, 2)}\n`);
fs.writeFileSync(path.join(publicDir, 'search-index.json'), `${JSON.stringify({ docs: searchIndex })}\n`);

console.log(`Generated metadata for ${docs.length} documentation pages.`);

function readDocs() {
  return listMarkdownFiles(docsDir)
    .filter((file) => path.basename(file).toLowerCase() !== 'init.md')
    .map((file) => {
      const raw = fs.readFileSync(file, 'utf8');
      const updatedAt = fs.statSync(file).mtime;
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
        updatedAt,
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

function listPublicFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return listPublicFiles(fullPath);
    }

    return entry.isFile() ? [fullPath] : [];
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

function stripMarkdown(value) {
  return value
    .replace(/^---[\s\S]*?\n---/, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[#>*_~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slash(value) {
  return value.replace(/\\/g, '/');
}
