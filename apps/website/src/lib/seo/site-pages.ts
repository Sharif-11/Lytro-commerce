import type { Metadata, MetadataRoute } from 'next';

// lytro.app's own pages, one definition each: their address, the title and description search engines and link
// previews show (in Bangla, the site's default language), and when each last changed, for the sitemap. The titles
// carry the words sellers search for (অনলাইন দোকান, ই-কমার্স ওয়েবসাইট, বিকাশ, the couriers); the owner approved
// this wording 2026-11-24. English sits behind the language cookie at the same address until lytro.app/en/ is built.

export type SitePageKey = 'home' | 'about' | 'contact' | 'listener' | 'terms' | 'privacy';

export const SITE_NAME = 'Lytro';

interface SitePage {
  path: string;
  /** Shown as "{title} · Lytro" unless `absolute`, which is shown as it is. */
  title: string;
  absolute?: true;
  description: string;
  /** The day the page's words last changed (YYYY-MM-DD), the sitemap's lastmod. Move it when the page changes. */
  updated: string;
  changeFrequency: 'weekly' | 'monthly';
  priority: number;
}

export const SITE_PAGES: Readonly<Record<SitePageKey, SitePage>> = {
  home: {
    path: '/',
    title: 'অনলাইন দোকান ও ই-কমার্স ওয়েবসাইট, বাংলায় · Lytro',
    absolute: true,
    description:
      'ফেসবুক সেলারের নিজের ই-কমার্স ওয়েবসাইট: অর্ডার, বিকাশ-নগদ পেমেন্ট, Steadfast-Pathao-RedX কুরিয়ার বুকিং আর ফেক অর্ডার চেক এক জায়গায়। ৩০ দিন ফ্রি, কার্ড লাগে না।',
    updated: '2026-11-24',
    changeFrequency: 'weekly',
    priority: 1,
  },
  about: {
    path: '/about',
    title: 'আমাদের সম্পর্কে: সেলারদের জন্য, সেলারদের হাতে বানানো',
    description:
      'আমরা নিজেরাও অনলাইন ব্যবসা করি। Lytro বানানো হয়েছে বাংলাদেশের ফেসবুক আর অনলাইন সেলারদের জন্য: বাংলায়, বিকাশ-নগদ আর দেশি কুরিয়ার নিয়ে।',
    updated: '2026-11-24',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  contact: {
    path: '/contact',
    title: 'যোগাযোগ: WhatsApp, ফোন ও ইমেইল সাপোর্ট',
    description:
      'Lytro অনলাইন দোকান নিয়ে প্রশ্ন? WhatsApp, ফোন বা ইমেইলে একজন মানুষের সাথে কথা বলুন, বটের সাথে নয়। বাংলা বা ইংরেজিতে।',
    updated: '2026-11-24',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  listener: {
    path: '/listener',
    title: 'বিকাশ পেমেন্ট অটো ভেরিফাই: Lytro Listener অ্যাপ',
    absolute: true,
    description:
      'Lytro Listener অ্যান্ড্রয়েড অ্যাপ বিকাশের SMS মিলিয়ে কাস্টমারের পেমেন্ট নিজে থেকেই ভেরিফাই করে। ডাউনলোড ও সেটআপ গাইড।',
    updated: '2026-11-24',
    changeFrequency: 'monthly',
    priority: 0.4,
  },
  terms: {
    path: '/terms',
    title: 'ব্যবহারের শর্তাবলি',
    description: 'Lytro ব্যবহারের শর্তাবলি: আপনার আর Lytro-র দায়িত্ব, প্ল্যান ও পেমেন্টের নিয়ম।',
    updated: '2026-11-24',
    changeFrequency: 'monthly',
    priority: 0.3,
  },
  privacy: {
    path: '/privacy',
    title: 'প্রাইভেসি পলিসি',
    description: 'Lytro কোন তথ্য রাখে, কেন রাখে, কতদিন রাখে আর কীভাবে সুরক্ষিত রাখে।',
    updated: '2026-11-24',
    changeFrequency: 'monthly',
    priority: 0.3,
  },
};

/** The title as a browser tab, a search result and a link preview show it. */
export function fullTitle(page: Pick<SitePage, 'title' | 'absolute'>): string {
  return page.absolute ? page.title : `${page.title} · ${SITE_NAME}`;
}

/**
 * The link-preview picture, app/opengraph-image.jpg (1200 x 630, under WhatsApp's ~300 KB), with the words of its
 * opengraph-image.alt.txt. Next adds that file by itself only to pages that set no Open Graph of their own, and every
 * page here sets og:url, so each names it; on the home page the file's own tags (with a cache-busting hash) win.
 */
export const PREVIEW_IMAGE = {
  url: '/opengraph-image.jpg',
  width: 1200,
  height: 630,
  type: 'image/jpeg',
  alt: 'Lytro — আপনার দোকান, আপনার হাতে',
};

/** The site-wide link-preview fields every page repeats: a page that sets its own Open Graph replaces the layout's. */
const OPEN_GRAPH: {
  type: 'website';
  siteName: string;
  locale: string;
  alternateLocale: string[];
  images: (typeof PREVIEW_IMAGE)[];
} = {
  type: 'website',
  siteName: SITE_NAME,
  locale: 'bn_BD',
  alternateLocale: ['en_US'],
  images: [PREVIEW_IMAGE],
};

/**
 * A page's metadata: its title and description, its canonical address, and the same in its link preview with og:url.
 * `version` names a published earlier version of a legal page, which is its own address.
 */
export function pageMetadata(key: SitePageKey, version?: string): Metadata {
  const page = SITE_PAGES[key];
  const titled = version === undefined ? page : { ...page, title: `${page.title} (${version})` };
  const path = version === undefined ? page.path : `${page.path}/${version}`;
  const title = fullTitle(titled);
  return {
    title: { absolute: title },
    description: page.description,
    alternates: { canonical: path },
    openGraph: { ...OPEN_GRAPH, url: path, title, description: page.description },
    twitter: {
      card: 'summary_large_image',
      title,
      description: page.description,
      images: [PREVIEW_IMAGE],
    },
  };
}

/** sitemap.xml: every page with when it last changed. */
export function sitemapEntries(siteUrl: string): MetadataRoute.Sitemap {
  return Object.values(SITE_PAGES).map((page) => ({
    url: page.path === '/' ? `${siteUrl}/` : `${siteUrl}${page.path}`,
    lastModified: page.updated,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
