/**
 * Shared markdown utilities — used by prerender.mjs (Node.js) and available
 * for any future build scripts. The browser bundle uses the typed equivalents
 * in src/markdown-renderer.ts.
 */

import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import dos from 'highlight.js/lib/languages/dos';
import ini from 'highlight.js/lib/languages/ini';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('ini', ini);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('bat', dos);
hljs.registerLanguage('batch', dos);
hljs.registerLanguage('cmd', dos);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('ps1', powershell);
hljs.registerLanguage('pwsh', powershell);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('text', plaintext);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('xml', xml);

export { hljs };

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

export function parseAdmonishInfo(info) {
  const match = info.trim().match(/^admonish\s+([a-z][a-z0-9_-]*)(?:\s+(.*))?$/i);

  if (!match) {
    return undefined;
  }

  const title = match[2]?.match(/\btitle=(?:"([^"]*)"|'([^']*)'|([^\s]+))/i);

  return {
    kind: match[1].toLowerCase(),
    title: title?.[1] || title?.[2] || title?.[3],
  };
}

export function getDefaultCalloutTitle(kind) {
  return kind === 'warning' ? 'Важно' : kind;
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
