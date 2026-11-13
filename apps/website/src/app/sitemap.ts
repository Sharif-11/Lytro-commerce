import type { MetadataRoute } from 'next';
import { SiteEnvironment } from '@/lib/env';

export default function sitemap(): MetadataRoute.Sitemap {
  const env = SiteEnvironment.current();
  return [
    { url: `${env.siteUrl}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${env.siteUrl}/about`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${env.siteUrl}/contact`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${env.siteUrl}/listener`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${env.siteUrl}/terms`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${env.siteUrl}/privacy`, changeFrequency: 'monthly', priority: 0.3 },
  ];
}
