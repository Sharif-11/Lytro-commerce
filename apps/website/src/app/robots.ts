import type { MetadataRoute } from 'next';
import { SiteEnvironment } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const env = SiteEnvironment.current();
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
