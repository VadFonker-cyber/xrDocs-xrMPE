/**
 * Pure string/markup utilities shared by Node build scripts and the browser
 * bundle. This module must stay dependency-free: everything imported from it
 * lands in the eager client chunk, so any new import here must be browser-safe.
 */

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

export function slugifyHeading(value, lang) {
  return value
    .toLocaleLowerCase(lang)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function generateHeadingId(title, lang, slugCounts) {
  const baseSlug = slugifyHeading(title, lang) || 'heading';
  const count = (slugCounts.get(baseSlug) || 0) + 1;
  slugCounts.set(baseSlug, count);
  return count === 1 ? baseSlug : `${baseSlug}-${count}`;
}

export function isLocalAssetSrc(src) {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(src);
}

export function splitAssetSrc(src) {
  const match = src.match(/^([^?#]+)([?#].*)?$/);

  return {
    path: match?.[1] || src,
    suffix: match?.[2] || '',
  };
}

export function isThemeAssetSrc(src) {
  const { path: assetPath } = splitAssetSrc(src);
  return isLocalAssetSrc(src) && /\.(dark|light)\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(assetPath);
}

export function normalizeThemeAssetSrc(src) {
  const { path: assetPath, suffix } = splitAssetSrc(src);
  return `${assetPath.replace(/\.(dark|light)(\.(?:avif|gif|jpe?g|png|svg|webp))$/i, '$2')}${suffix}`;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildTocTree(items) {
  const roots = [];
  const stack = [];

  for (const { id, level, title } of items) {
    const item = { id, title, level, children: [] };

    while (stack.length && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      item.parentId = parent.id;
      parent.children.push(item);
    } else {
      roots.push(item);
    }

    stack.push(item);
  }

  return roots;
}
