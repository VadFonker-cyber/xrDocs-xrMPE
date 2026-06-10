import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import { createMarkdownRenderer } from './markdown-renderer-core.mjs';
import { getDefaultCalloutTitle, getLocaleLabel } from './markdown-shared.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetMetadata = readAssetMetadata();

const renderer = createMarkdownRenderer({
  MarkdownIt,
  assetMetadata,
  getAssetUrl: getAssetPath,
  getCalloutTitle: getDefaultCalloutTitle,
  getDocUrl: getDocPath,
  getLabel: getLocaleLabel,
});

export const { renderDocContent } = renderer;

function getDocPath(id, basePath) {
  if (id === 'index') {
    return basePath;
  }

  const encodedId = id.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return encodedId ? `${basePath}${encodedId}/` : basePath;
}

function getAssetPath(src, basePath) {
  return `${basePath}${src.replace(/^\.?\//, '')}`;
}

function readAssetMetadata() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(rootDir, 'src', 'generated', 'asset-metadata.json'), 'utf8'),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    return {};
  }
}
