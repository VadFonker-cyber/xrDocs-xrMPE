import {
  escapeHtml as escapeHtmlShared,
  escapeRegExp as escapeRegExpShared,
  splitAssetSrc as splitAssetSrcShared,
} from '../../scripts/string-utils.mjs';

export function escapeHtml(value: string): string {
  return escapeHtmlShared(value);
}

export function splitAssetSrc(src: string): { path: string; suffix: string } {
  return splitAssetSrcShared(src);
}

export function escapeRegExp(value: string): string {
  return escapeRegExpShared(value);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
