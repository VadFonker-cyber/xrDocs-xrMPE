import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readContentModel } from './content-model.mjs';
import { renderDocContent } from './render-doc.mjs';
import { flattenToc, getDocKey, listPublicFiles, normalizeBasePath, slash } from './shared-utils.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const basePath = normalizeBasePath(process.env.VITE_BASE_PATH || '/xrDocs-xrMPE/');

export async function generateContentData(options = {}) {
  const projectRoot = options.rootDir ? path.resolve(options.rootDir) : rootDir;
  const docsDir = path.join(projectRoot, 'docs');
  const publicDir = path.join(projectRoot, 'public');
  const generatedDir = path.join(projectRoot, 'src', 'generated');
  const docContentDir = path.join(publicDir, 'doc-content');

  const { docs, nav } = await readContentModel(docsDir);
  const searchIndex = docs.map((doc) => ({
    id: doc.id,
    lang: doc.lang,
    path: doc.path,
    title: doc.title,
    section: doc.section,
    text: stripMarkdown(doc.content),
  }));
  const searchIndexByLang = groupSearchEntriesByLang(searchIndex);
  const themeAssetsPromise = listPublicFiles(fs, publicDir, { joinPath: path.join })
    .then((files) => files
      .map((file) => slash(path.relative(publicDir, file)))
      .filter((file) => /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(file))
      .sort((a, b) => a.localeCompare(b)));
  const renderedDocEntriesPromise = Promise.all(docs.map(async (doc) => [
      getDocKey(doc),
      await renderDocContent(doc.content, doc.lang, { basePath, docId: doc.id }),
    ]));
  const cleanupPromise = cleanupGeneratedPublicOutputs(publicDir, docContentDir);

  const [themeAssets, renderedDocEntries] = await Promise.all([
    themeAssetsPromise,
    renderedDocEntriesPromise,
    cleanupPromise,
    fs.mkdir(generatedDir, { recursive: true }),
  ]);
  const renderedDocs = new Map(renderedDocEntries);
  const headingAliases = buildHeadingAliases(docs, renderedDocs);

  await Promise.all([
    fs.writeFile(
      path.join(generatedDir, 'docs-manifest.json'),
      `${JSON.stringify({ docs: docs.map(({ content, updatedAt, ...doc }) => doc), nav }, null, 2)}\n`,
    ),
    fs.writeFile(
      path.join(generatedDir, 'theme-assets.json'),
      `${JSON.stringify(themeAssets, null, 2)}\n`,
    ),
    fs.writeFile(
      path.join(generatedDir, 'heading-aliases.json'),
      `${JSON.stringify(headingAliases, null, 2)}\n`,
    ),
    ...Array.from(searchIndexByLang, ([lang, entries]) =>
      fs.writeFile(
        path.join(publicDir, `search-index.${lang}.json`),
        `${JSON.stringify({ docs: entries })}\n`,
      ),
    ),
  ]);

  await Promise.all(
    docs.map(async (doc) => {
      const outputPath = getRenderedDocOutputPath(docContentDir, doc);
      const renderedDoc = renderedDocs.get(getDocKey(doc));

      if (!renderedDoc) {
        throw new Error(`Rendered document was not found for ${doc.lang}:${doc.id}.`);
      }

      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, `${JSON.stringify(renderedDoc)}\n`);
    }),
  );

  return { docs: docs.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateContentData().then((result) => {
    console.log(`Generated metadata for ${result.docs} documentation pages.`);
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

function groupSearchEntriesByLang(entries) {
  const map = new Map();

  for (const entry of entries) {
    const langEntries = map.get(entry.lang);

    if (langEntries) {
      langEntries.push(entry);
    } else {
      map.set(entry.lang, [entry]);
    }
  }

  return map;
}

async function cleanupGeneratedPublicOutputs(publicDir, docContentDir) {
  const entries = await fs.readdir(publicDir, { withFileTypes: true })
    .catch((error) => {
      if (error.code === 'ENOENT') {
        return [];
      }

      throw error;
    });
  const staleSearchIndexFiles = entries
    .filter((entry) => entry.isFile() && /^search-index(?:\.[^.]+)?\.json$/i.test(entry.name))
    .map((entry) => fs.rm(path.join(publicDir, entry.name), { force: true }));

  await Promise.all([
    fs.rm(path.join(publicDir, 'doc-content.json'), { force: true }),
    fs.rm(docContentDir, { recursive: true, force: true }),
    ...staleSearchIndexFiles,
  ]);
}

function buildHeadingAliases(docs, renderedDocs) {
  // Group docs by id — only pairs with the same id but different lang matter.
  // This replaces the previous O(n²) nested loop with a single O(n) pass.
  const byId = new Map();
  for (const doc of docs) {
    if (!byId.has(doc.id)) byId.set(doc.id, []);
    byId.get(doc.id).push(doc);
  }

  const aliases = {};

  for (const group of byId.values()) {
    if (group.length < 2) continue;

    for (const targetDoc of group) {
      const targetHeadings = flattenToc(renderedDocs.get(getDocKey(targetDoc))?.toc || []);
      const targetAliases = {};

      for (const sourceDoc of group) {
        if (sourceDoc.lang === targetDoc.lang) continue;

        const sourceHeadings = flattenToc(renderedDocs.get(getDocKey(sourceDoc))?.toc || []);
        const max = Math.min(sourceHeadings.length, targetHeadings.length);

        for (let index = 0; index < max; index += 1) {
          const source = sourceHeadings[index];
          const target = targetHeadings[index];

          if (source.level === target.level && source.id !== target.id) {
            targetAliases[source.id] = target.id;
          }
        }
      }

      if (Object.keys(targetAliases).length) {
        aliases[getDocKey(targetDoc)] = targetAliases;
      }
    }
  }

  return aliases;
}

function getRenderedDocOutputPath(docContentDir, doc) {
  return path.join(docContentDir, doc.lang, ...doc.id.split('/'), 'index.json');
}
