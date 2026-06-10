import type { Lang } from './docs';
import siteMetaData from './site-meta.json';

type SiteMeta = Record<Lang, { description: string; locale: string }>;

export const siteName = siteMetaData.siteName;
export const githubUrl = siteMetaData.githubUrl;
export const siteMeta = siteMetaData.siteMeta as SiteMeta;
