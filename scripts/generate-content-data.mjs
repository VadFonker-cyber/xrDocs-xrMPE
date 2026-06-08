import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readContentModel } from './content-model.mjs';
import { renderDocContent } from './render-doc.mjs';
import { normalizeBasePath } from './shared-utils.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const basePath = normalizeBasePath(process.env.VITE_BASE_PATH || '/xrDocs-xrMPE/');

export async function generateContentData(options = {}) {
  const projectRoot = options.rootDir ? path.resolve(options.rootDir) : rootDir;
  const docsDir = path.join(projectRoot, 'docs');
  const publicDir = path.join(projectRoot, 'public');
  const generatedDir = path.join(projectRoot, 'src', 'generated');
  const docContentDir = path.join(publicDir, 'doc-content');

  const { docs, nav } = readContentModel(docsDir);
  const searchIndex = docs.map((doc) => ({
    id: doc.id,
    lang: doc.lang,
    path: doc.path,
    title: doc.title,
    section: doc.section,
    text: stripMarkdown(doc.content),
  }));
  const themeAssets = listPublicFiles(publicDir)
    .map((file) => slash(path.relative(publicDir, file)))
    .filter((file) => /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(file))
    .sort((a, b) => a.localeCompare(b));

  await fs.promises.mkdir(generatedDir, { recursive: true });

  await Promise.all([
    fs.promises.writeFile(
      path.join(generatedDir, 'docs-manifest.json'),
      `${JSON.stringify({ docs: docs.map(({ content, updatedAt, ...doc }) => doc), nav }, null, 2)}\n`,
    ),
    fs.promises.writeFile(
      path.join(generatedDir, 'theme-assets.json'),
      `${JSON.stringify(themeAssets, null, 2)}\n`,
    ),
    fs.promises.writeFile(
      path.join(publicDir, 'search-index.json'),
      `${JSON.stringify({ docs: searchIndex })}\n`,
    ),
  ]);

  fs.rmSync(path.join(publicDir, 'doc-content.json'), { force: true });
  fs.rmSync(docContentDir, { recursive: true, force: true });

  await Promise.all(
    docs.map(async (doc) => {
      const outputPath = getRenderedDocOutputPath(docContentDir, doc);
      const renderedDoc = renderDocContent(doc.content, doc.lang, { basePath });
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.promises.writeFile(outputPath, `${JSON.stringify(renderedDoc)}\n`);
    }),
  );

  return { docs: docs.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateContentData().then((result) => {
    console.log(`Generated metadata for ${result.docs} documentation pages.`);
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

function stripMarkdown(value) {
  return value
    .replace(/^>\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)]\s*$/gim, ' ')
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

function getRenderedDocOutputPath(docContentDir, doc) {
  return path.join(docContentDir, doc.lang, ...doc.id.split('/'), 'index.json');
}

