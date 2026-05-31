import themeAssetManifest from './generated/theme-assets.json';
import type { AppContext } from './app-context';
import { stripBasePath } from './routing';
import type { Theme, ThemePreference } from './state';
import { unique } from './utils/html';

const themeAssetExtensions = 'avif|gif|jpe?g|png|svg|webp';
const themeAssetPaths = new Set((themeAssetManifest as string[]).map(normalizeAssetManifestPath));

export function getResolvedTheme(context: Pick<AppContext, 'state' | 'colorSchemeQuery'>): Theme {
  if (context.state.theme !== 'auto') {
    return context.state.theme;
  }

  return context.colorSchemeQuery.matches ? 'light' : 'dark';
}

export function getNextThemePreference(theme: ThemePreference): ThemePreference {
  if (theme === 'auto') {
    return 'light';
  }

  return theme === 'light' ? 'dark' : 'auto';
}

export function updateThemeAssets(context: Pick<AppContext, 'state' | 'colorSchemeQuery'>, root: ParentNode): void {
  const theme = getResolvedTheme(context);

  root.querySelectorAll<HTMLImageElement>('img[data-theme-asset-base]').forEach((image) => {
    const baseSrc = image.dataset.themeAssetBase;

    if (!baseSrc) {
      return;
    }

    const requestKey = `${theme}:${baseSrc}`;
    image.dataset.themeAssetRequest = requestKey;
    const nextSrc = resolveThemeAssetSrc(baseSrc, theme);

    if (image.dataset.themeAssetRequest !== requestKey) {
      return;
    }

    if (image.getAttribute('src') !== nextSrc) {
      image.setAttribute('src', nextSrc);
    }
  });
}

function resolveThemeAssetSrc(baseSrc: string, theme: Theme): string {
  const candidates = createThemeAssetCandidates(baseSrc, theme);

  for (const candidate of candidates) {
    if (assetExists(candidate)) {
      return candidate;
    }
  }

  return baseSrc;
}

function createThemeAssetCandidates(baseSrc: string, theme: Theme): string[] {
  const fallbackTheme = theme === 'dark' ? 'light' : 'dark';

  return unique([
    createThemeAssetSrc(baseSrc, theme),
    createThemeAssetSrc(baseSrc, fallbackTheme),
    baseSrc,
  ]);
}

function createThemeAssetSrc(baseSrc: string, theme: Theme): string {
  const { path, suffix } = splitAssetSrc(baseSrc);
  const extension = new RegExp(`\\.(${themeAssetExtensions})$`, 'i');

  if (!extension.test(path)) {
    return baseSrc;
  }

  return `${path.replace(extension, `.${theme}.$1`)}${suffix}`;
}

function splitAssetSrc(src: string): { path: string; suffix: string } {
  const match = src.match(/^([^?#]+)([?#].*)?$/);

  return {
    path: match?.[1] || src,
    suffix: match?.[2] || '',
  };
}

function assetExists(src: string): boolean {
  return themeAssetPaths.has(normalizeAssetManifestPath(stripBasePath(new URL(src, document.baseURI).pathname)));
}

function normalizeAssetManifestPath(src: string): string {
  return decodeURIComponent(src).replace(/^\/+|^\.\//g, '');
}
