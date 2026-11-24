import type { MetadataRoute } from 'next';
import { SiteEnvironment } from '@/lib/env';
import { sitemapEntries } from '@/lib/seo/site-pages';

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(SiteEnvironment.current().siteUrl);
}
