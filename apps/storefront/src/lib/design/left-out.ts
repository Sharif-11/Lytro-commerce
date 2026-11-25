import {
  StorefrontFill,
  StorefrontSectionKind,
  storefrontRowFill,
  type PreviewLayout,
  type StorefrontLink,
} from '@lytronix/validators';
import type { ProductCard, PublicStorefrontDesign } from '../api/storefront-api';
import { fillsFromLists } from './home-reads';
import { type LinkFacts, linkShows } from './links';

// STOREFRONT-BUILDER-PLAN SB-32 as amended (the owner, 2026-11-26, sketch `de-*`): what the home drawn from a design
// leaves out, for the design editor's notes -- from the same reads and decisions that drew it, so the editor never
// guesses: a row that fills itself is out when `homeLayout` shows it nothing (short of its fill, its own products or
// once repeats are skipped), a seller's own slide or banner when `linkShows` says its link leads where nothing is now.

/** What the home leaves out, given the rows `homeLayout` shows and the facts its own slides and banners are shown by. */
export function leftOut(
  design: Pick<PublicStorefrontDesign, 'sections' | 'offers'>,
  shown: ReadonlyMap<string, readonly ProductCard[]>,
  facts: LinkFacts,
): PreviewLayout {
  const layout: PreviewLayout = { rows: [], items: [] };
  const own = (sectionId: string, links: readonly StorefrontLink[]): void => {
    links.forEach((link, index) => {
      if (!linkShows(link, design, facts)) layout.items.push({ sectionId, index, link: link.kind });
    });
  };
  for (const section of design.sections) {
    switch (section.kind) {
      case StorefrontSectionKind.Products:
        if (fillsFromLists(section) && !shown.has(section.id)) {
          layout.rows.push({ sectionId: section.id, fill: storefrontRowFill(section) });
        }
        break;
      case StorefrontSectionKind.Hero:
        if (section.fill === StorefrontFill.Own) {
          own(
            section.id,
            section.slides.map((slide) => slide.link),
          );
        }
        break;
      case StorefrontSectionKind.OfferBanners:
        if (section.fill === StorefrontFill.Own) {
          own(
            section.id,
            section.banners.map((banner) => banner.link),
          );
        }
        break;
      case StorefrontSectionKind.WideBanner:
        own(section.id, [section.banner.link]);
        break;
      default:
        break;
    }
  }
  return layout;
}
