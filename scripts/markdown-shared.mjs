/**
 * Shared markdown utilities — used by prerender.mjs (Node.js) and available
 * for any future build scripts. The browser bundle uses the typed equivalents
 * in src/markdown-renderer.ts.
 */

import { hljs } from './hljs-setup.mjs';

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

/**
 * Generates a deduplicated heading ID for a given title.
 * @param {Map<string, number>} slugCounts - mutable counter Map shared across a single document render pass
 */
export function generateHeadingId(title, lang, slugCounts) {
  const baseSlug = slugifyHeading(title, lang) || 'heading';
  const count = (slugCounts.get(baseSlug) || 0) + 1;
  slugCounts.set(baseSlug, count);
  return count === 1 ? baseSlug : `${baseSlug}-${count}`;
}

import { createRequire } from 'node:module';

// Callout titles come from the same locale JSON files used by the browser bundle.
// src/locales/{lang}.json is the single source of truth — do not duplicate here.
const _require = createRequire(import.meta.url);
const _calloutTitles = Object.fromEntries(
  ['en', 'ru'].map((lang) => {
    const labels = _require(`../src/locales/${lang}.json`);
    return [lang, Object.fromEntries(
      ['note', 'tip', 'important', 'warning', 'caution'].map((k) => [k, labels[`callout.${k}`] || k])
    )];
  })
);

export function getDefaultCalloutTitle(kind, lang) {
  return _calloutTitles[lang]?.[kind] || kind;
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
  return /\.(dark|light)\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(assetPath);
}

export function normalizeThemeAssetSrc(src) {
  const { path: assetPath, suffix } = splitAssetSrc(src);
  return `${assetPath.replace(/\.(dark|light)(\.(?:avif|gif|jpe?g|png|svg|webp))$/i, '$2')}${suffix}`;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
