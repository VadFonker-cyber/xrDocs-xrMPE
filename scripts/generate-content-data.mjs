import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readContentModel } from './content-model.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function generateContentData(options = {}) {
  const projectRoot = options.rootDir ? path.resolve(options.rootDir) : rootDir;
  const docsDir = path.join(projectRoot, 'docs');
  const publicDir = path.join(projectRoot, 'public');
  const generatedDir = path.join(projectRoot, 'src', 'generated');

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

  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(
    path.join(generatedDir, 'docs-manifest.json'),
    `${JSON.stringify({ docs: docs.map(({ content, updatedAt, ...doc }) => doc), nav }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(generatedDir, 'theme-assets.json'), `${JSON.stringify(themeAssets, null, 2)}\n`);
  fs.writeFileSync(path.join(publicDir, 'search-index.json'), `${JSON.stringify({ docs: searchIndex })}\n`);

  return { docs: docs.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = generateContentData();
  console.log(`Generated metadata for ${result.docs} documentation pages.`);
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
    .replace(/```admonish[^\n]*\n([\s\S]*?)```/gi, '$1')
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
