/**
 * Code highlighting. Lives separately from string-utils so that build-only
 * dependencies (highlight.js) never reach the browser bundle: browser-reachable
 * modules import string-utils directly, while highlightCode is only pulled by
 * the markdown renderer (build scripts + dev-only client markdown path).
 */
import { hljs } from './hljs-setup.mjs';
import { escapeHtml } from './string-utils.mjs';

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
