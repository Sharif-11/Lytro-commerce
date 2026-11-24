import type { Plan, PlanCatalogue } from '../api/plans-api';
import { PricingModel } from '../pricing/pricing-model';
import { SITE_NAME, SITE_PAGES } from './site-pages';

// The landing page's JSON-LD (schema.org), so search engines know who Lytro is and what it sells: the company (with
// its Bangla name and its Facebook page), the website, and Lytro as an app with its live prices in taka. The prices
// come from the same catalogue the pricing cards show, so the two never disagree. No FAQPage: Google shows FAQ
// results only for government and health sites now.

/** Lytro's own Facebook page (the owner, 2026-11-24). */
export const FACEBOOK_PAGE = 'https://www.facebook.com/profile.php?id=61596608640202';

/** লিট্রো: the brand name in Bangla (BRAND-IDENTITY.md, #432). */
const BANGLA_NAME = 'লিট্রো';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** What the app sells: pay-as-you-go at no monthly fee, then each plan at its price for the shortest term. */
function offersOf(siteUrl: string, catalogue: PlanCatalogue | null, paygPlan: Plan | null): Json[] {
  const pricing = `${siteUrl}/#pricing`;
  const offers: Json[] = [
    {
      '@type': 'Offer',
      name: paygPlan?.name ?? 'Pay-as-you-go',
      price: '0',
      priceCurrency: 'BDT',
      url: pricing,
    },
  ];
  if (!catalogue) return offers;
  const model = new PricingModel(catalogue);
  const termId = model.defaultTermId();
  for (const { plan, terms } of model.plans) {
    const shortest = terms.find((priced) => priced.term.id === termId) ?? terms[0];
    if (!shortest) continue;
    offers.push({
      '@type': 'Offer',
      name: plan.name,
      price: String(shortest.price),
      priceCurrency: 'BDT',
      url: pricing,
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: String(shortest.price),
        priceCurrency: 'BDT',
        billingDuration: shortest.term.months,
        unitCode: 'MON',
      },
    });
  }
  return offers;
}

/** The landing page's graph: the organisation, the website and the app, linked by their @ids. */
export function landingStructuredData(
  siteUrl: string,
  catalogue: PlanCatalogue | null,
  paygPlan: Plan | null,
): Json {
  const organization = `${siteUrl}/#organization`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organization,
        name: SITE_NAME,
        alternateName: BANGLA_NAME,
        url: `${siteUrl}/`,
        logo: `${siteUrl}/brand/icon-512.svg`,
        sameAs: [FACEBOOK_PAGE],
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        name: SITE_NAME,
        alternateName: BANGLA_NAME,
        url: `${siteUrl}/`,
        inLanguage: 'bn-BD',
        publisher: { '@id': organization },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${siteUrl}/#app`,
        name: SITE_NAME,
        alternateName: BANGLA_NAME,
        url: `${siteUrl}/`,
        description: SITE_PAGES.home.description,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, Android',
        inLanguage: ['bn-BD', 'en'],
        publisher: { '@id': organization },
        offers: offersOf(siteUrl, catalogue, paygPlan),
      },
    ],
  };
}

/** JSON-LD for a <script> tag: `<` is written as <, so no text in it can close the tag early. */
export function jsonLdText(data: Json): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
