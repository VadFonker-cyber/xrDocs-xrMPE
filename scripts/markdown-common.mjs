/**
 * Compatibility barrel for build scripts.
 *
 * Browser-reachable code must import from './string-utils.mjs' directly —
 * importing this barrel pulls highlight.js (via './highlight.mjs') into the
 * client bundle even though production highlighting happens at build time.
 */
export * from './string-utils.mjs';
export { highlightCode } from './highlight.mjs';
