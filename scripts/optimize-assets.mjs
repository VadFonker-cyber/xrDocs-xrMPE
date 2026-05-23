import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');
const sourceIcon = path.join(publicDir, 'xrdocs-icon.png');

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

await fs.access(sourceIcon);

for (const output of outputs) {
  await fs.mkdir(path.dirname(output.path), { recursive: true });

  const image = sharp(sourceIcon)
    .resize(output.width, output.width, {
      fit: 'cover',
      withoutEnlargement: true,
    })
    .toFormat(output.format, output.options || {});

  await image.toFile(output.path);
}

console.log(`Optimized ${outputs.length} image assets.`);
