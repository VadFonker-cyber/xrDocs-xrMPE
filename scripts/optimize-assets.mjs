import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');
const sourceIcon = path.join(rootDir, 'scripts', 'assets', 'xrdocs-icon.png');
const cacheFile = path.join(publicDir, '.asset-cache.json');
const cacheSchemaVersion = 2;
const avifOptions = { lossless: true, effort: 9 };
const avifSourceExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const avifSourcePriority = new Map([
  ['.png', 0],
  ['.jpg', 1],
  ['.jpeg', 1],
  ['.webp', 2],
]);

const iconOutputs = [
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

const slash = (value) => value.replaceAll(path.sep, '/');

const getPublicRelativePath = (filePath) => slash(path.relative(publicDir, filePath));

const shouldSkipPublicDir = (dirPath) => {
  const relativePath = getPublicRelativePath(dirPath);
  return relativePath === 'doc-content' || relativePath.startsWith('doc-content/');
};

const listPublicFiles = async (dirPath) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (!shouldSkipPublicDir(filePath)) {
          files.push(...(await listPublicFiles(filePath)));
        }

        return;
      }

      if (entry.isFile()) {
        files.push(filePath);
      }
    }),
  );

  return files;
};

const isConvertibleRasterSource = (filePath) =>
  avifSourceExtensions.has(path.extname(filePath).toLowerCase());

const getAvifOutputPath = (sourcePath) =>
  path.join(path.dirname(sourcePath), `${path.basename(sourcePath, path.extname(sourcePath))}.avif`);

const getSourcePriority = (sourcePath) =>
  avifSourcePriority.get(path.extname(sourcePath).toLowerCase()) ?? Number.MAX_SAFE_INTEGER;

const collectAvifOutputs = async () => {
  const outputMap = new Map();
  const files = (await listPublicFiles(publicDir)).filter(isConvertibleRasterSource);

  files.forEach((sourcePath) => {
    const outputPath = getAvifOutputPath(sourcePath);
    const relativeOutputPath = getPublicRelativePath(outputPath);
    const existing = outputMap.get(relativeOutputPath);

    if (!existing || getSourcePriority(sourcePath) < getSourcePriority(existing.sourcePath)) {
      outputMap.set(relativeOutputPath, { sourcePath, outputPath, relativeOutputPath });
    }
  });

  return Array.from(outputMap.values()).sort((a, b) =>
    a.relativeOutputPath.localeCompare(b.relativeOutputPath),
  );
};

const optimizeIconOutput = async (output, sourceHash, cache) => {
  const relativeOutputPath = getPublicRelativePath(output.path);
  const cacheKey = hashValue(
    stableStringify({
      type: 'icon',
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
    return { status: 'cached', relativeOutputPath, type: 'icon' };
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
    type: 'icon',
    width: output.width,
    format: output.format,
    options: output.options || {},
  };

  return { status: 'generated', relativeOutputPath, type: 'icon' };
};

const optimizeAvifOutput = async (output, cache) => {
  const sourceBuffer = await fs.readFile(output.sourcePath);
  const sourceHash = hashValue(sourceBuffer);
  const cacheKey = hashValue(
    stableStringify({
      type: 'avif',
      version: cacheSchemaVersion,
      sourceHash,
      format: 'avif',
      options: avifOptions,
    }),
  );

  if (
    cache.assets[output.relativeOutputPath]?.cacheKey === cacheKey &&
    (await outputExists(output.outputPath))
  ) {
    return { status: 'cached', relativeOutputPath: output.relativeOutputPath, type: 'avif' };
  }

  const metadata = await sharp(sourceBuffer).metadata();

  if (metadata.pages && metadata.pages > 1) {
    return { status: 'skipped', relativeOutputPath: output.relativeOutputPath, type: 'avif' };
  }

  await sharp(sourceBuffer)
    .avif(avifOptions)
    .toFile(output.outputPath);

  cache.assets[output.relativeOutputPath] = {
    cacheKey,
    type: 'avif',
    source: getPublicRelativePath(output.sourcePath),
    format: 'avif',
    options: avifOptions,
  };

  return { status: 'generated', relativeOutputPath: output.relativeOutputPath, type: 'avif' };
};

const sourceBuffer = await fs.readFile(sourceIcon);
const iconSourceHash = hashValue(sourceBuffer);
const cache = await readCache();

const iconResults = await Promise.all(
  iconOutputs.map((output) => optimizeIconOutput(output, iconSourceHash, cache)),
);
const avifOutputs = await collectAvifOutputs();
const avifResults = await Promise.all(
  avifOutputs.map((output) => optimizeAvifOutput(output, cache)),
);
const results = [...iconResults, ...avifResults];

await fs.writeFile(`${cacheFile}.tmp`, `${JSON.stringify(cache, null, 2)}\n`);
await fs.rename(`${cacheFile}.tmp`, cacheFile);

const generatedCount = results.filter((result) => result.status === 'generated').length;
const cachedCount = results.filter((result) => result.status === 'cached').length;
const skippedCount = results.filter((result) => result.status === 'skipped').length;
const iconCount = results.filter((result) => result.type === 'icon').length;
const avifCount = results.filter((result) => result.type === 'avif').length;

console.log(
  `Optimized ${results.length} image assets (${iconCount} icons, ${avifCount} AVIF): ${generatedCount} generated, ${cachedCount} cached, ${skippedCount} skipped.`,
);
