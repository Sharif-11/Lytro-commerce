import { useTranslation } from 'react-i18next';
import {
  StorefrontLinkKind,
  StorefrontSectionKind,
  type PreviewLayout,
  type StorefrontLink,
  type StorefrontSection,
} from '@lytronix/validators';
import { WarnLine } from './design-parts';

// STOREFRONT-BUILDER-PLAN SB-32 as amended (the owner, 2026-11-26, sketch `de-row-hidden`, `de-banner-hidden`,
// `de-wide-empty`): atop a section's sheet, why the live shop leaves it out now -- as the storefront said of the saved
// draft (/preview/layout). The note shows only for what was saved: changed in the sheet, it may no longer hold, so it
// goes until the change is saved and the storefront asked again.

type ProductsSection = Extract<StorefrontSection, { kind: StorefrontSectionKind.Products }>;

/** Whether a row in the sheet still asks for what the saved one did. */
function sameRow(saved: ProductsSection, working: ProductsSection): boolean {
  return (
    saved.source === working.source &&
    saved.categoryId === working.categoryId &&
    (saved.offerId ?? null) === (working.offerId ?? null) &&
    saved.layout === working.layout &&
    saved.count === working.count
  );
}

/** `de-row-hidden`: an automatic row the home leaves out, short of its fill. */
export function RowLeftOut({
  left,
  saved,
  working,
}: {
  left: PreviewLayout | null;
  saved: StorefrontSection | null;
  working: StorefrontSection | null;
}) {
  const { t } = useTranslation('menu');
  if (
    !left ||
    saved?.kind !== StorefrontSectionKind.Products ||
    working?.kind !== StorefrontSectionKind.Products ||
    !sameRow(saved, working)
  ) {
    return null;
  }
  const row = left.rows.find((each) => each.sectionId === saved.id);
  if (!row) return null;
  return (
    <WarnLine head={t('sdRowHiddenHead')}>{t('sdRowHiddenLine', { count: row.fill })}</WarnLine>
  );
}

/** What a link leading where nothing is now says: the heading and the line under it. */
const LINK_WORDS: Readonly<Record<StorefrontLinkKind, readonly [string, string] | null>> = {
  [StorefrontLinkKind.OnSale]: ['sdLeftOfferHead', 'sdLeftOfferLine'],
  [StorefrontLinkKind.Offer]: ['sdLeftOfferHead', 'sdLeftOfferLine'],
  [StorefrontLinkKind.Category]: ['sdLeftCategoryHead', 'sdLeftBackLine'],
  [StorefrontLinkKind.JustIn]: ['sdLeftShopHead', 'sdLeftBackLine'],
  [StorefrontLinkKind.BestSellers]: ['sdLeftShopHead', 'sdLeftBackLine'],
  // A product's link always shows: one gone leads home (SB-16).
  [StorefrontLinkKind.Product]: null,
};

/** `de-banner-hidden`, `de-wide-empty`: a seller's own slide or banner the home leaves out, its link leading nowhere. */
export function ItemLeftOut({
  left,
  sectionId,
  index,
  saved,
  link,
}: {
  left: PreviewLayout | null;
  sectionId: string | null;
  /** Its place in the section; null for one being added. */
  index: number | null;
  /** Its link as saved, and as the sheet has it now. */
  saved: StorefrontLink | null;
  link: StorefrontLink;
}) {
  const { t } = useTranslation('menu');
  if (!left || sectionId === null || index === null || saved === null) return null;
  if (JSON.stringify(saved) !== JSON.stringify(link)) return null;
  const item = left.items.find((each) => each.sectionId === sectionId && each.index === index);
  const words = item ? LINK_WORDS[item.link] : null;
  if (!words) return null;
  return <WarnLine head={t(words[0])}>{t(words[1])}</WarnLine>;
}
