import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlanCatalogue } from '../src/lib/api/plans-api';
import {
  fullTitle,
  pageMetadata,
  PREVIEW_IMAGE,
  SITE_PAGES,
  sitemapEntries,
  type SitePageKey,
} from '../src/lib/seo/site-pages';
import { FACEBOOK_PAGE, jsonLdText, landingStructuredData } from '../src/lib/seo/structured-data';

const SITE = 'https://lytro.app';
const KEYS = Object.keys(SITE_PAGES) as SitePageKey[];

const catalogue: PlanCatalogue = {
  plans: [
    { id: 'starter', name: 'Starter', description: null, rank: 1, forSale: true, limits: {} },
    { id: 'growth', name: 'Growth', description: null, rank: 2, forSale: true, limits: {} },
    { id: 'unpriced', name: 'Unpriced', description: null, rank: 3, forSale: true, limits: {} },
  ],
  terms: [
    {
      id: 'three',
      labelBn: '৩ মাস',
      labelEn: '3 months',
      months: 3,
      visible: true,
      displayOrder: 2,
    },
    {
      id: 'month',
      labelBn: '১ মাস',
      labelEn: '1 month',
      months: 1,
      visible: true,
      displayOrder: 1,
    },
  ],
  prices: [
    { planId: 'starter', billingTermId: 'month', price: '349.00' },
    { planId: 'starter', billingTermId: 'three', price: '999.00' },
    { planId: 'growth', billingTermId: 'month', price: '649.00' },
  ],
};

type Node = Record<string, unknown>;
const graphOf = (data: unknown): Node[] => (data as { '@graph': Node[] })['@graph'];

describe("lytro.app's pages (SEO)", () => {
  it('gives every page its own title and description, none of them the home page words twice', () => {
    const titles = KEYS.map((key) => fullTitle(SITE_PAGES[key]));
    const descriptions = KEYS.map((key) => SITE_PAGES[key].description);
    expect(new Set(titles).size).toBe(KEYS.length);
    expect(new Set(descriptions).size).toBe(KEYS.length);
    expect(fullTitle(SITE_PAGES.home)).toBe('অনলাইন দোকান ও ই-কমার্স ওয়েবসাইট, বাংলায় · Lytro');
    expect(fullTitle(SITE_PAGES.about)).toBe(
      'আমাদের সম্পর্কে: সেলারদের জন্য, সেলারদের হাতে বানানো · Lytro',
    );
    expect(fullTitle(SITE_PAGES.listener)).toBe('বিকাশ পেমেন্ট অটো ভেরিফাই: Lytro Listener অ্যাপ');
    expect(fullTitle(SITE_PAGES.terms)).toBe('ব্যবহারের শর্তাবলি · Lytro');
  });

  it("states each page's own address as canonical and og:url, with the same words in the preview", () => {
    for (const key of KEYS) {
      const page = SITE_PAGES[key];
      const meta = pageMetadata(key);
      expect(meta.alternates?.canonical).toBe(page.path);
      expect(meta.openGraph).toMatchObject({
        url: page.path,
        title: fullTitle(page),
        description: page.description,
        siteName: 'Lytro',
        locale: 'bn_BD',
      });
      expect(meta.title).toEqual({ absolute: fullTitle(page) });
    }
  });

  it('keeps the link-preview picture on every page, described as its alt file says', () => {
    const altFile = readFileSync(
      path.resolve(__dirname, '../src/app/opengraph-image.alt.txt'),
      'utf8',
    ).trim();
    expect(PREVIEW_IMAGE.alt).toBe(altFile);
    for (const key of KEYS) {
      const meta = pageMetadata(key);
      expect(meta.openGraph?.images).toEqual([PREVIEW_IMAGE]);
      expect(meta.twitter?.images).toEqual([PREVIEW_IMAGE]);
    }
  });

  it('gives a published legal version its own address and names the version in its title', () => {
    const meta = pageMetadata('terms', '2026-11-25');
    expect(meta.alternates?.canonical).toBe('/terms/2026-11-25');
    expect(meta.openGraph).toMatchObject({ url: '/terms/2026-11-25' });
    expect(meta.title).toEqual({ absolute: 'ব্যবহারের শর্তাবলি (2026-11-25) · Lytro' });
  });

  it('lists every page in the sitemap with the day it last changed', () => {
    const entries = sitemapEntries(SITE);
    expect(entries.map((entry) => entry.url)).toEqual([
      `${SITE}/`,
      `${SITE}/about`,
      `${SITE}/contact`,
      `${SITE}/listener`,
      `${SITE}/developers`,
      `${SITE}/terms`,
      `${SITE}/privacy`,
    ]);
    for (const entry of entries) expect(entry.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("the landing page's structured data (JSON-LD)", () => {
  it('names Lytro, its Bangla name and its Facebook page, and links the three nodes', () => {
    const [organization, website, app] = graphOf(landingStructuredData(SITE, catalogue, null));
    expect(organization).toMatchObject({
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: 'Lytro',
      alternateName: 'লিট্রো',
      url: `${SITE}/`,
      sameAs: [FACEBOOK_PAGE],
    });
    expect(website).toMatchObject({
      '@type': 'WebSite',
      publisher: { '@id': `${SITE}/#organization` },
    });
    expect(app).toMatchObject({
      '@type': 'SoftwareApplication',
      description: SITE_PAGES.home.description,
      publisher: { '@id': `${SITE}/#organization` },
    });
  });

  it("offers pay-as-you-go free, then each priced plan at its shortest term's price, in taka", () => {
    const app = graphOf(landingStructuredData(SITE, catalogue, null))[2];
    const offers = (app?.['offers'] ?? []) as Node[];
    expect(offers.map((offer) => [offer['name'], offer['price'], offer['priceCurrency']])).toEqual([
      ['Pay-as-you-go', '0', 'BDT'],
      ['Starter', '349', 'BDT'],
      ['Growth', '649', 'BDT'],
    ]);
    expect(offers[1]?.['priceSpecification']).toMatchObject({
      billingDuration: 1,
      unitCode: 'MON',
    });
  });

  it('still describes the company and the free start when the catalogue cannot be read', () => {
    const app = graphOf(landingStructuredData(SITE, null, null))[2];
    expect(app?.['offers']).toEqual([
      expect.objectContaining({ name: 'Pay-as-you-go', price: '0', priceCurrency: 'BDT' }),
    ]);
  });

  it('cannot close its <script> tag early, whatever a plan is named', () => {
    const named: PlanCatalogue = {
      ...catalogue,
      plans: catalogue.plans.map((plan) => ({
        ...plan,
        name: '</script><script>alert(1)</script>',
      })),
    };
    const text = jsonLdText(landingStructuredData(SITE, named, null));
    expect(text).not.toContain('<');
    expect(JSON.parse(text)).toBeTruthy();
  });
});
