import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import { createMarkdownRenderer } from './markdown-renderer-core.mjs';
import { getDefaultCalloutTitle, getLocaleLabel } from './markdown-shared.mjs';
import { buildDocUrl } from './shared-utils.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererPromise = createRenderer();

export async function renderDocContent(content, lang, options) {
  const renderer = await rendererPromise;
  return renderer.renderDocContent(content, lang, options);
}

function getAssetPath(src, basePath) {
  return `${basePath}${src.replace(/^\.?\//, '')}`;
}

async function createRenderer() {
  return createMarkdownRenderer({
    MarkdownIt,
    assetMetadata: await readAssetMetadata(),
    getAssetUrl: getAssetPath,
    getCalloutTitle: getDefaultCalloutTitle,
    getDocUrl: buildDocUrl,
    getLabel: getLocaleLabel,
  });
}

async function readAssetMetadata() {
  try {
    return JSON.parse(
      await fs.readFile(path.join(rootDir, 'src', 'generated', 'asset-metadata.json'), 'utf8'),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    return {};
  }
}
