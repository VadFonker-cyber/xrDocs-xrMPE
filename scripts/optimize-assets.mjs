import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');
const sourceIcon = path.join(rootDir, 'scripts', 'assets', 'xrdocs-icon.png');
const cacheFile = path.join(publicDir, '.asset-cache.json');
const cacheSchemaVersion = 1;

const outputs = [
  {
    path: path.join(publicDir, 'xrdocs-brand.png'),
    width: 64,
    format: 'png',
  },
  {
    path: path.join(publicDir, 'xrdocs-brand.webp'),
    width: 64,
    format: 'webp',
    options: { quality: 82 },
  },
  {
    path: path.join(publicDir, 'favicon-32.png'),
    width: 32,
    format: 'png',
  },
  {
    path: path.join(publicDir, 'apple-touch-icon.png'),
    width: 180,
    format: 'png',
  },
  {
    path: path.join(publicDir, 'xrdocs-og.png'),
    width: 512,
    format: 'png',
    options: { compressionLevel: 9, palette: true },
  },
  {
    path: path.join(publicDir, 'assets', 'examples', 'xrdocs-icon.png'),
    width: 256,
    format: 'png',
    options: { compressionLevel: 9, palette: true },
  },
];

const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

const hashValue = (value) =>
  crypto.createHash('sha256').update(value).digest('hex');

const readCache = async () => {
  try {
    const cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));

    if (cache.version === cacheSchemaVersion && cache.assets) {
      return cache;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Ignoring unreadable asset cache: ${error.message}`);
    }
  }

  return { version: cacheSchemaVersion, assets: {} };
};

const outputExists = async (outputPath) => {
  try {
    await fs.access(outputPath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
};

const sourceBuffer = await fs.readFile(sourceIcon);
const sourceHash = hashValue(sourceBuffer);
const cache = await readCache();

const results = await Promise.all(
  outputs.map(async (output) => {
    const relativeOutputPath = path.relative(publicDir, output.path).replaceAll(path.sep, '/');
    const cacheKey = hashValue(
      stableStringify({
        version: cacheSchemaVersion,
        sourceHash,
        width: output.width,
        format: output.format,
        options: output.options || {},
      }),
    );

    await fs.mkdir(path.dirname(output.path), { recursive: true });

    if (
      cache.assets[relativeOutputPath]?.cacheKey === cacheKey &&
      (await outputExists(output.path))
    ) {
      return { status: 'cached', relativeOutputPath };
    }

    await sharp(sourceIcon)
      .resize(output.width, output.width, {
        fit: 'cover',
        withoutEnlargement: true,
      })
      .toFormat(output.format, output.options || {})
      .toFile(output.path);

    cache.assets[relativeOutputPath] = {
      cacheKey,
      width: output.width,
      format: output.format,
      options: output.options || {},
    };

    return { status: 'generated', relativeOutputPath };
  }),
);

await fs.writeFile(`${cacheFile}.tmp`, `${JSON.stringify(cache, null, 2)}\n`);
await fs.rename(`${cacheFile}.tmp`, cacheFile);

const generatedCount = results.filter((result) => result.status === 'generated').length;
const cachedCount = results.filter((result) => result.status === 'cached').length;

console.log(
  `Optimized ${outputs.length} image assets: ${generatedCount} generated, ${cachedCount} cached.`,
);
