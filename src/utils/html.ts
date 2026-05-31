import { labels, type LabelKey } from '../locales';
import type { Lang } from '../docs';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function getLabel(lang: Lang, key: LabelKey): string {
  return labels[lang][key] || labels.en[key] || key;
}
