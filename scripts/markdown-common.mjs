import { hljs } from './hljs-setup.mjs';

export const COPY_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">' +
  '<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/>' +
  '<path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>' +
  '</svg>';

export const CHECK_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">' +
  '<path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>' +
  '</svg>';

export const ERROR_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">' +
  '<path d="M8 1.5a6.5 6.5 0 1 0 0 13A6.5 6.5 0 0 0 8 1.5ZM6.97 5.03a.75.75 0 0 1 1.06 0L8 5l1.03-1.03a.75.75 0 1 1 1.06 1.06L9.06 6.06l1.03 1.03a.75.75 0 1 1-1.06 1.06L8 7.12 6.97 8.15a.75.75 0 0 1-1.06-1.06l1.03-1.03-1.03-1.03a.75.75 0 0 1 1.06-1.06ZM7.25 10.5a.75.75 0 0 1 1.5 0v.25a.75.75 0 0 1-1.5 0v-.25Z"/>' +
  '</svg>';

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

export function highlightCode(source, language) {
  const lang = language.trim().toLowerCase();

  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(source, { language: lang, ignoreIllegals: true }).value;
    }
  } catch {
    return escapeHtml(source);
  }

  return escapeHtml(source);
}

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
