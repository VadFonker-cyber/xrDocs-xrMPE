/**
 * Node-specific Markdown helpers. Browser-safe utilities live in
 * markdown-common.mjs and are re-exported here for build scripts.
 */

import { createRequire } from 'node:module';

export {
  CHECK_ICON_SVG,
  COPY_ICON_SVG,
  ERROR_ICON_SVG,
  buildTocTree,
  escapeHtml,
  escapeRegExp,
  generateHeadingId,
  highlightCode,
  isLocalAssetSrc,
  isThemeAssetSrc,
  normalizeThemeAssetSrc,
  slugifyHeading,
  splitAssetSrc,
} from './markdown-common.mjs';

const require = createRequire(import.meta.url);
const localeLabels = Object.fromEntries(
  ['en', 'ru'].map((lang) => [lang, require(`../src/locales/${lang}.json`)]),
);
const calloutTitles = Object.fromEntries(
  ['en', 'ru'].map((lang) => {
    const labels = localeLabels[lang];

    return [
      lang,
      Object.fromEntries(
        ['note', 'tip', 'important', 'warning', 'caution'].map((key) => [
          key,
          labels[`callout.${key}`] || key,
        ]),
      ),
    ];
  }),
);

export function getLocaleLabel(lang, key) {
  return localeLabels[lang]?.[key] || localeLabels.en?.[key] || key;
}

export function getDefaultCalloutTitle(kind, lang) {
  return calloutTitles[lang]?.[kind] || kind;
}
