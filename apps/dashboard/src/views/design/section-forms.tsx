import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AnnouncementItemKind,
  announcementPairs,
  BANNER_LAYOUTS,
  BannerLayout,
  bannerLayoutFor,
  CategoryTileStyle,
  HeroDesign,
  ProductRowLayout,
  ProductRowSource,
  STOREFRONT_ABOUT_MAX,
  STOREFRONT_ANNOUNCEMENT_ITEMS_MAX,
  STOREFRONT_ANNOUNCEMENT_LINE_MAX,
  STOREFRONT_BUTTON_MAX,
  STOREFRONT_DESCRIPTION_MAX,
  STOREFRONT_HERO_SLIDES_MAX,
  STOREFRONT_KICKER_MAX,
  STOREFRONT_OFFER_BANNERS_MAX,
  STOREFRONT_PERSON_MAX,
  STOREFRONT_PICKED_PRODUCTS_MAX,
  STOREFRONT_PLACE_MAX,
  STOREFRONT_QUOTE_MAX,
  STOREFRONT_ROW_COUNTS,
  STOREFRONT_TESTIMONIALS_MAX,
  STOREFRONT_THEMES,
  STOREFRONT_TITLE_MAX,
  StorefrontFill,
  StorefrontLinkKind,
  StorefrontSectionKind,
  monogramLetter,
  storefrontTokens,
  type HeroSource,
  type StorefrontCollection,
  type StorefrontDesign,
  type StorefrontSection,
  OfferState,
} from '@lytronix/validators';
import { useCategories } from '@/api/catalogue';
import { useOffers } from '@/api/offers';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { AreaField, Field, PickField, SelectField } from '@/components/ui/field';
import { RadioMark } from '@/components/ui/kv';
import { Switch } from '@/components/ui/switch';
import type { ImageView } from '@/types/me';
import type { StorefrontEditor } from '@/types/storefront-design';
import { NoteLine } from './design-parts';
import {
  BANNER_LAYOUT_WORDS,
  HERO_SOURCE_WORDS,
  HERO_WORDS,
  isShown,
  sectionName,
  sectionSummary,
  wordsText,
} from './design-words';
import { EditorIcon, type EditorIconName } from './editor-icon';
import { PhotoField } from './photo-field';
import type { Names } from './pickers';
import {
  collectionLine,
  HEADLINE_MAX,
  itemLine,
  linkWords,
  itemProblems,
  moveItem,
  quoteProblems,
  sectionProblems,
  type ItemDraft,
  type ItemKind,
  type QuoteDraft,
} from './section-drafts';

// STOREFRONT-BUILDER-PLAN SB-8, SB-9, SB-15, SB-16 (PR 3b): the fields of a section's sheet, by its kind, and of a slide,
// a banner and a quote -- as the sketch draws them, in the dashboard's own fields.

type Products = Extract<StorefrontSection, { kind: StorefrontSectionKind.Products }>;

/** The sketch's `.seg`: two to four choices in a pale track, the chosen one on white. */
function Seg<T extends string | number>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: T;
  choices: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[14px] font-medium text-fg-muted">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex gap-[3px] rounded-[12px] bg-[#eaf0f0] p-[3px]"
      >
        {choices.map((choice) => (
          <button
            key={String(choice.value)}
            type="button"
            role="radio"
            aria-checked={choice.value === value}
            onClick={() => {
              onChange(choice.value);
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[9px] px-1 py-[9px] text-center text-[13.5px] font-semibold ${choice.value === value ? 'bg-surface text-primary shadow-[0_1px_3px_rgba(0,0,0,0.14)]' : 'text-fg-muted'}`}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The sketch's `.opts`: a choice of looks, each a small drawing over its name; the theme's own when none is chosen. */
function Looks<T extends string>({
  label,
  value,
  own,
  choices,
  hint,
  onChange,
}: {
  label: string;
  value: T | null;
  own: T;
  choices: readonly { value: T; label: string; drawing: ReactNode; disabled?: boolean }[];
  hint: string;
  onChange: (value: T) => void;
}) {
  const chosen = value ?? own;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[14px] font-medium text-fg-muted">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${String(choices.length)}, minmax(0, 1fr))` }}
      >
        {choices.map((choice) => {
          const on = choice.value === chosen;
          return (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={choice.disabled}
              onClick={() => {
                onChange(choice.value);
              }}
              className={`rounded-[12px] border-[1.5px] p-2 text-center text-[12px] font-semibold disabled:opacity-40 ${on ? 'border-primary bg-primary-soft text-primary shadow-[inset_0_0_0_1px_var(--color-primary)]' : 'border-line-strong text-fg-muted'}`}
            >
              <span className="relative mb-1.5 block h-[54px] overflow-hidden rounded-[7px] bg-[#eef3f3]">
                {choice.drawing}
              </span>
              {choice.label}
            </button>
          );
        })}
      </div>
      <p className="text-[13px] text-fg-muted">{hint}</p>
    </div>
  );
}

const block = (style: React.CSSProperties, photo = true) => (
  <i
    className={`absolute block rounded-[3px] ${photo ? 'bg-[#e2b8cb]' : 'bg-[#b9cac9]'}`}
    style={style}
  />
);

/** The sketch's drawings of a hero's three designs. */
const HERO_DRAWINGS: Readonly<Record<HeroDesign, ReactNode>> = {
  [HeroDesign.Split]: (
    <>
      {block({ left: '50%', top: 0, right: 0, bottom: 0, borderRadius: 0 })}
      {block({ left: 8, top: 14, width: '38%', height: 7 }, false)}
      {block({ left: 8, top: 26, width: '28%', height: 5 }, false)}
      {block({ left: 8, top: 38, width: '22%', height: 8, background: '#7aa6a2' }, false)}
    </>
  ),
  [HeroDesign.Overlay]: (
    <>
      {block({ inset: 0, borderRadius: 0 })}
      {block({ left: 8, bottom: 22, width: '50%', height: 7, background: '#fff' }, false)}
      {block({ left: 8, bottom: 9, width: '24%', height: 8, background: '#7aa6a2' }, false)}
    </>
  ),
  [HeroDesign.SlideTiles]: (
    <>
      {block({ left: 4, top: 4, width: '62%', bottom: 4 })}
      {block({ right: 4, top: 4, width: '28%', height: 21 })}
      {block({ right: 4, bottom: 4, width: '28%', height: 21 })}
    </>
  ),
};

/** The sketch's drawings of the four category looks: three tiles each, sized to a quarter of the sheet. */
function tiles(style: React.CSSProperties): ReactNode {
  return [4, 24, 44].map((left) => <span key={left}>{block({ left, ...style })}</span>);
}

const TILE_DRAWINGS: Readonly<Record<CategoryTileStyle, ReactNode>> = {
  [CategoryTileStyle.Circle]: tiles({ top: 18, width: 18, height: 18, borderRadius: '50%' }),
  [CategoryTileStyle.Square]: tiles({ top: 18, width: 18, height: 18 }),
  [CategoryTileStyle.Tall]: tiles({ top: 7, width: 16, height: 40 }),
  [CategoryTileStyle.Pill]: (
    <>
      {block({ left: 4, top: 21, width: 20, height: 11, borderRadius: 9 })}
      {block({ left: 27, top: 21, width: 16, height: 11, borderRadius: 9 }, false)}
      {block({ left: 46, top: 21, width: 18, height: 11, borderRadius: 9 }, false)}
    </>
  ),
};

const TILE_WORDS: Readonly<Record<CategoryTileStyle, string>> = {
  [CategoryTileStyle.Circle]: 'ssTileCircle',
  [CategoryTileStyle.Square]: 'ssTileSquare',
  [CategoryTileStyle.Tall]: 'ssTileTall',
  [CategoryTileStyle.Pill]: 'ssTilePill',
};

const SOURCES: readonly { value: ProductRowSource; name: string; line: string }[] = [
  { value: ProductRowSource.Newest, name: 'ssSrcNewest', line: 'ssSrcNewestLine' },
  { value: ProductRowSource.OnSale, name: 'ssSrcOnSale', line: 'ssSrcOnSaleLine' },
  { value: ProductRowSource.BestSellers, name: 'ssSrcBest', line: 'ssSrcBestLine' },
  { value: ProductRowSource.Category, name: 'ssSrcCategory', line: 'ssSrcCategoryLine' },
  // OFFERS-PLAN OF-8, OF-22 (the sketch's `o-row`): one running offer's cards; the row hides once it ends.
  { value: ProductRowSource.Offer, name: 'ssSrcOffer', line: 'ssSrcOfferLine' },
  { value: ProductRowSource.Picked, name: 'ssSrcPicked', line: 'ssSrcPickedLine' },
];

/** A row of a list in a sheet (the sketch's `.slide-row`): its arrows, its picture, its words, the way in. */
function ListRow({
  name,
  line,
  lead,
  first,
  last,
  onUp,
  onDown,
  onOpen,
}: {
  name: string;
  line: string;
  lead: ReactNode;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation('menu');
  return (
    <li className="flex items-center gap-2.5 border-t border-neutral-100 py-2 first:border-t-0">
      <Arrows name={name} first={first} last={last} onUp={onUp} onDown={onDown} />
      <button
        type="button"
        aria-label={t('sdOpen', { name })}
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        {lead}
        <span className="min-w-0 flex-1 text-[13.5px]">
          <b className="block truncate font-bold">{name}</b>
          <span className="block truncate text-[12px] text-fg-muted">{line}</span>
        </span>
        <Icon name="right" className="size-[22px] flex-none text-neutral-500" />
      </button>
    </li>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button tone="ghost" wide className="mt-1 bg-neutral-100" onClick={onClick}>
      <Icon name="plus" />
      {children}
    </Button>
  );
}

/** How many characters a field holds of its limit. */
function useCount(): (text: string, max: number) => string {
  const { t } = useTranslation('menu');
  return (text, max) => t('ssCount', { count: text.length, max });
}

/** A slide's or a banner's fields (the sketch's `e-slide`, `e-banner`, `e-wide`). */
export function ItemForm({
  draft,
  kind,
  image,
  tried,
  leadsTo,
  onChange,
  onUploaded,
  onLink,
}: {
  draft: ItemDraft;
  kind: ItemKind;
  image: ImageView | null;
  tried: boolean;
  leadsTo: string;
  onChange: (draft: ItemDraft) => void;
  onUploaded: (image: ImageView) => void;
  onLink: () => void;
}) {
  const { t } = useTranslation('menu');
  const count = useCount();
  const problems = tried ? itemProblems(draft) : [];
  const max = HEADLINE_MAX[kind];
  return (
    <>
      <PhotoField
        label={t('ssPhoto')}
        photo={draft.photo}
        image={image}
        wide
        hint={t('ssFocusHint')}
        error={problems.includes('photo') ? t('ssNeedPhoto') : null}
        onChange={(photo) => {
          onChange({ ...draft, photo });
        }}
        onUploaded={onUploaded}
      />
      <Field
        label={t('ssKicker')}
        value={draft.kicker}
        maxLength={STOREFRONT_KICKER_MAX}
        onChange={(event) => {
          onChange({ ...draft, kicker: event.target.value });
        }}
      />
      <Field
        label={t('ssHeadline')}
        value={draft.headline}
        maxLength={max}
        error={problems.includes('headline') ? t('ssNeedHeadline') : undefined}
        help={count(draft.headline, max)}
        onChange={(event) => {
          onChange({ ...draft, headline: event.target.value });
        }}
      />
      <Field
        label={t('ssDescription')}
        value={draft.description}
        maxLength={STOREFRONT_DESCRIPTION_MAX}
        onChange={(event) => {
          onChange({ ...draft, description: event.target.value });
        }}
      />
      <div className="grid grid-cols-2 gap-2.5">
        <Field
          label={t('ssButton')}
          value={draft.button}
          maxLength={STOREFRONT_BUTTON_MAX}
          error={problems.includes('button') ? t('ssNeedButton') : undefined}
          onChange={(event) => {
            onChange({ ...draft, button: event.target.value });
          }}
        />
        <PickField label={t('ssLeadsTo')} value={leadsTo} onPick={onLink} />
      </div>
      <p className="-mt-2 text-[13px] text-fg-muted">{t('ssLeadsToHint')}</p>
    </>
  );
}

/** A quote's fields (the sketch's `e-quote`). */
export function QuoteForm({
  draft,
  tried,
  onChange,
}: {
  draft: QuoteDraft;
  tried: boolean;
  onChange: (draft: QuoteDraft) => void;
}) {
  const { t } = useTranslation('menu');
  const count = useCount();
  const problems = tried ? quoteProblems(draft) : [];
  return (
    <>
      <Field
        label={t('ssName')}
        value={draft.name}
        maxLength={STOREFRONT_PERSON_MAX}
        error={problems.includes('name') ? t('ssNeedName') : undefined}
        onChange={(event) => {
          onChange({ ...draft, name: event.target.value });
        }}
      />
      <Field
        label={t('ssPlace')}
        value={draft.place}
        maxLength={STOREFRONT_PLACE_MAX}
        help={t('ssPlaceHint')}
        onChange={(event) => {
          onChange({ ...draft, place: event.target.value });
        }}
      />
      <AreaField
        label={t('ssSaid')}
        value={draft.text}
        maxLength={STOREFRONT_QUOTE_MAX}
        error={problems.includes('text') ? t('ssNeedSaid') : undefined}
        help={count(draft.text, STOREFRONT_QUOTE_MAX)}
        onChange={(event) => {
          onChange({ ...draft, text: event.target.value });
        }}
      />
    </>
  );
}

/** BL-3, BL-5: what an auto hero's slides can show, and a line on each. */
const HERO_SOURCES = [
  ProductRowSource.OnSale,
  ProductRowSource.Newest,
  ProductRowSource.BestSellers,
] as const;
const HERO_SOURCE_HINTS: Readonly<Record<HeroSource, string>> = {
  [ProductRowSource.OnSale]: 'ssSlidesOffersHint',
  [ProductRowSource.Newest]: 'ssSlidesNewestHint',
  [ProductRowSource.BestSellers]: 'ssSlidesBestHint',
};

/** BL-10: the bar's automatic items, in words. */
const BAR_ITEM_WORDS: Readonly<
  Record<Exclude<AnnouncementItemKind, AnnouncementItemKind.Own>, string>
> = {
  [AnnouncementItemKind.CashOnDelivery]: 'ssBarCod',
  [AnnouncementItemKind.Delivery]: 'ssBarDelivery',
  [AnnouncementItemKind.Offers]: 'ssBarOffers',
};

/** BL-6: the sketch's drawings of the banners' three layouts (`BAN_DG`). */
const LAYOUT_DRAWINGS: Readonly<Record<BannerLayout, ReactNode>> = {
  [BannerLayout.Full]: (
    <>
      {block({ left: 6, right: 6, top: 6, height: 19 })}
      {block({ left: 6, right: 6, bottom: 6, height: 19 })}
    </>
  ),
  [BannerLayout.Side]: (
    <>
      {block({ left: 6, width: 'calc(50% - 9px)', top: 8, bottom: 8 })}
      {block({ right: 6, width: 'calc(50% - 9px)', top: 8, bottom: 8 })}
    </>
  ),
  [BannerLayout.BigTwo]: (
    <>
      {block({ left: 6, width: '58%', top: 6, bottom: 6 })}
      {block({ right: 6, width: '28%', top: 6, height: 19 })}
      {block({ right: 6, width: '28%', bottom: 6, height: 19 })}
    </>
  ),
};

const COLLECTION_ICONS: Readonly<Record<StorefrontCollection['kind'], EditorIconName>> = {
  [StorefrontLinkKind.OnSale]: 'tag',
  [StorefrontLinkKind.JustIn]: 'spark',
  [StorefrontLinkKind.BestSellers]: 'star',
  [StorefrontLinkKind.Category]: 'grid',
};

/** A collection's mark in a list, where a slide has its photo: what fills it changes with the shop's own data. */
function CollectionMark({ collection }: { collection: StorefrontCollection }) {
  return (
    <span className="grid size-[50px] flex-none place-items-center rounded-[8px] bg-primary-soft text-primary">
      <EditorIcon name={COLLECTION_ICONS[collection.kind]} size={22} />
    </span>
  );
}

/** BL-3: a tile's row in the hero's sheet: what it shows, and the way to change it. */
function CollectionRow({
  collection,
  name,
  names,
  onOpen,
}: {
  collection: StorefrontCollection;
  name: string;
  names: Names;
  onOpen: () => void;
}) {
  const { t } = useTranslation('menu');
  const label = `${name} · ${wordsText(t, linkWords(collection, names))}`;
  return (
    <li className="border-t border-neutral-100 py-2 first:border-t-0">
      <button
        type="button"
        aria-label={t('sdOpen', { name: label })}
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 text-left"
      >
        <CollectionMark collection={collection} />
        <span className="min-w-0 flex-1 text-[13.5px]">
          <b className="block truncate font-bold">{label}</b>
          <span className="block truncate text-[12px] text-fg-muted">
            {wordsText(t, collectionLine(collection))}
          </span>
        </span>
        <Icon name="right" className="size-[22px] flex-none text-neutral-500" />
      </button>
    </li>
  );
}

/** A list row's arrows, up and down, each named for what it moves. */
function Arrows({
  name,
  first,
  last,
  onUp,
  onDown,
}: {
  name: string;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  const { t } = useTranslation('menu');
  return (
    <span className="flex w-6 flex-none flex-col items-center text-neutral-500">
      <button
        type="button"
        aria-label={t('sdMoveUp', { name })}
        disabled={first}
        onClick={onUp}
        className="grid h-[22px] w-6 place-items-center disabled:opacity-35"
      >
        <EditorIcon name="up" size={16} />
      </button>
      <button
        type="button"
        aria-label={t('sdMoveDown', { name })}
        disabled={last}
        onClick={onDown}
        className="grid h-[22px] w-6 place-items-center disabled:opacity-35"
      >
        <EditorIcon name="down" size={16} />
      </button>
    </span>
  );
}

/** BL-10: an automatic item of the bar (the sketch's `e-announce`): its arrows, its name, its switch. */
function BarRow({
  name,
  on,
  first,
  last,
  onUp,
  onDown,
  onToggle,
}: {
  name: string;
  on: boolean;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onToggle: () => void;
}) {
  const { t } = useTranslation('menu');
  return (
    <li className="flex min-h-[60px] items-center gap-2.5 border-t border-neutral-100 py-2 first:border-t-0">
      <Arrows name={name} first={first} last={last} onUp={onUp} onDown={onDown} />
      <span className="min-w-0 flex-1 text-[13.5px]">
        <b className="block truncate text-[14.5px] font-bold">{name}</b>
        <span className="block truncate text-[12.5px] text-fg-muted">{t('ssBarAutoLine')}</span>
      </span>
      <Switch checked={on} label={t('sdShow', { name })} onChange={onToggle} />
    </li>
  );
}

/** BL-10, BL-18: a line of the seller's own for the bar. */
export function LineForm({
  text,
  tried,
  onChange,
}: {
  text: string;
  tried: boolean;
  onChange: (text: string) => void;
}) {
  const { t } = useTranslation('menu');
  const count = useCount();
  return (
    <>
      <Field
        label={t('ssYourLine')}
        value={text}
        maxLength={STOREFRONT_ANNOUNCEMENT_LINE_MAX}
        error={tried && text.trim() === '' ? t('ssNeedLine') : undefined}
        help={count(text, STOREFRONT_ANNOUNCEMENT_LINE_MAX)}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <NoteLine>{t('ssLineNote')}</NoteLine>
    </>
  );
}

/** A section's own fields, by its kind. */
export function MainForm({
  section,
  design,
  language,
  editor,
  images,
  names,
  tried,
  onChange,
  onSource,
  onCategory,
  onOffer,
  onOpenItem,
  onOpenQuote,
  onOpenCollection,
  onOpenLine,
  onProducts,
  onUploaded,
}: {
  section: StorefrontSection;
  design: StorefrontDesign;
  language: 'bn' | 'en';
  editor: Pick<StorefrontEditor, 'categories' | 'broken'>;
  images: Record<string, ImageView>;
  names: Names;
  tried: boolean;
  onChange: (section: StorefrontSection) => void;
  onSource: (source: ProductRowSource) => void;
  onCategory: (categoryId: string | null) => void;
  /** OFFERS-PLAN: a product row's offer chosen. */
  onOffer: (offerId: string | null) => void;
  onOpenItem: (at: number | null) => void;
  onOpenQuote: (at: number | null) => void;
  /** BL-3, BL-9: a hero's tile or an auto banner's collection, to choose what it shows. */
  onOpenCollection: (list: 'tiles' | 'collections', at: number | null) => void;
  /** BL-10: a line of the seller's own for the bar; null for a new one. */
  onOpenLine: (at: number | null) => void;
  onProducts: () => void;
  onUploaded: (image: ImageView) => void;
}) {
  const { t } = useTranslation('menu');
  const count = useCount();
  const theme = STOREFRONT_THEMES[design.theme];
  const problems = tried ? sectionProblems(section) : [];
  const problem = (field: string) => {
    const found = problems.find((each) => each.field === field);
    return found ? wordsText(t, found.words) : null;
  };
  const shown = (field: string) => {
    const words = problem(field);
    return words ? <p className="text-[13px] font-medium text-danger">{words}</p> : null;
  };

  switch (section.kind) {
    case StorefrontSectionKind.Announcement: {
      // BL-10: one list, the automatic items with their switches, the seller's own lines opened to edit.
      const tokens = storefrontTokens(design.theme, design.palette);
      const pairs = announcementPairs(section.items.filter(isShown));
      const last = section.items.length - 1;
      const move = (at: number, by: -1 | 1) => {
        onChange({ ...section, items: moveItem(section.items, at, by) });
      };
      return (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-[14px] font-medium text-fg-muted">
              {t('ssBarLines', {
                count: section.items.length,
                max: STOREFRONT_ANNOUNCEMENT_ITEMS_MAX,
              })}
            </span>
            <ul>
              {section.items.map((item, at) =>
                item.kind === AnnouncementItemKind.Own ? (
                  <ListRow
                    key={at}
                    name={item.text}
                    line={t('ssBarOwnLine')}
                    lead={null}
                    first={at === 0}
                    last={at === last}
                    onUp={() => {
                      move(at, -1);
                    }}
                    onDown={() => {
                      move(at, 1);
                    }}
                    onOpen={() => {
                      onOpenLine(at);
                    }}
                  />
                ) : (
                  <BarRow
                    key={item.kind}
                    name={t(BAR_ITEM_WORDS[item.kind])}
                    on={item.visible}
                    first={at === 0}
                    last={at === last}
                    onUp={() => {
                      move(at, -1);
                    }}
                    onDown={() => {
                      move(at, 1);
                    }}
                    onToggle={() => {
                      onChange({
                        ...section,
                        items: section.items.map((each, index) =>
                          index === at && each.kind !== AnnouncementItemKind.Own
                            ? { ...each, visible: !each.visible }
                            : each,
                        ),
                      });
                    }}
                  />
                ),
              )}
            </ul>
            {section.items.length < STOREFRONT_ANNOUNCEMENT_ITEMS_MAX ? (
              <AddButton
                onClick={() => {
                  onOpenLine(null);
                }}
              >
                {t('ssAddLine')}
              </AddButton>
            ) : null}
          </div>
          {pairs.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-[14px] font-medium text-fg-muted">{t('ssBarSeen')}</span>
              {pairs.map((pair, at) => (
                <div key={at} className="flex flex-col gap-1">
                  {at > 0 ? (
                    <span className="text-center text-[11.5px] text-fg-muted">
                      {t('ssBarAfter')} ↓
                    </span>
                  ) : null}
                  <p
                    className="rounded-[10px] px-3 py-[9px] text-center text-[12.5px] font-semibold"
                    style={{ background: tokens['ann-bg'], color: tokens['ann-fg'] }}
                  >
                    {pair
                      .map((item) =>
                        item.kind === AnnouncementItemKind.Own
                          ? item.text
                          : t(BAR_ITEM_WORDS[item.kind]),
                      )
                      .join(' · ')}
                  </p>
                </div>
              ))}
              {pairs.length > 1 ? (
                <span className="text-center text-[11.5px] text-fg-muted">{t('ssBarAgain')}</span>
              ) : null}
            </div>
          ) : null}
          <NoteLine>{t('ssBarNote')}</NoteLine>
        </>
      );
    }
    case StorefrontSectionKind.Hero: {
      const tiled = (section.design ?? theme.hero) === HeroDesign.SlideTiles;
      return (
        <>
          <Seg
            label={t('ssShows')}
            value={section.fill}
            choices={[
              {
                value: StorefrontFill.Auto,
                label: (
                  <>
                    <EditorIcon name="spark" size={18} />
                    {t('ssHeroAuto')}
                  </>
                ),
              },
              { value: StorefrontFill.Own, label: t('ssHeroOwn') },
            ]}
            onChange={(fill) => {
              onChange({ ...section, fill });
            }}
          />
          {section.fill === StorefrontFill.Auto ? (
            <div className="flex flex-col gap-1.5">
              {/* BL-3, BL-5: what the slides filling themselves show. */}
              <Seg
                label={t('ssSlidesShow')}
                value={section.source}
                choices={HERO_SOURCES.map((source) => ({
                  value: source,
                  label: t(HERO_SOURCE_WORDS[source]),
                }))}
                onChange={(source) => {
                  onChange({ ...section, source });
                }}
              />
              <p className="text-[13px] text-fg-muted">{t(HERO_SOURCE_HINTS[section.source])}</p>
            </div>
          ) : null}
          <Looks
            label={t('ssDesign')}
            value={section.design}
            own={theme.hero}
            choices={Object.values(HeroDesign).map((value) => ({
              value,
              label: t(HERO_WORDS[value]),
              drawing: HERO_DRAWINGS[value],
            }))}
            hint={t('ssThemeOwn', {
              theme: theme.name[language],
              look: t(HERO_WORDS[theme.hero]),
            })}
            onChange={(value) => {
              onChange({ ...section, design: value });
            }}
          />
          {tiled ? (
            <div className="flex flex-col gap-1">
              {/* BL-2, BL-3: each tile beside the slide shows a collection the seller picks. */}
              <span className="text-[14px] font-medium text-fg-muted">{t('ssTilesShow')}</span>
              <ul>
                {section.tiles.map((tile, at) => (
                  <CollectionRow
                    key={at}
                    collection={tile}
                    name={t('ssTileN', { n: String(at + 1) })}
                    names={names}
                    onOpen={() => {
                      onOpenCollection('tiles', at);
                    }}
                  />
                ))}
              </ul>
              <p className="text-[13px] text-fg-muted">{t('ssTilesHint')}</p>
            </div>
          ) : null}
          {section.fill === StorefrontFill.Own ? (
            <div className="flex flex-col gap-1">
              <span className="text-[14px] font-medium text-fg-muted">
                {t('ssSlides', { count: section.slides.length, max: STOREFRONT_HERO_SLIDES_MAX })}
              </span>
              <ul>
                {section.slides.map((slide, at) => (
                  <ListRow
                    key={at}
                    name={slide.headline}
                    line={wordsText(t, itemLine(slide, names))}
                    lead={<ItemThumb image={images[slide.photo.mediaId] ?? null} />}
                    first={at === 0}
                    last={at === section.slides.length - 1}
                    onUp={() => {
                      onChange({ ...section, slides: moveItem(section.slides, at, -1) });
                    }}
                    onDown={() => {
                      onChange({ ...section, slides: moveItem(section.slides, at, 1) });
                    }}
                    onOpen={() => {
                      onOpenItem(at);
                    }}
                  />
                ))}
              </ul>
              {section.slides.length < STOREFRONT_HERO_SLIDES_MAX ? (
                <AddButton
                  onClick={() => {
                    onOpenItem(null);
                  }}
                >
                  {t('ssAddSlide')}
                </AddButton>
              ) : null}
              {shown('slides')}
            </div>
          ) : null}
          <NoteLine>{t(tiled ? 'ssHeroTilesNote' : 'ssHeroNote')}</NoteLine>
        </>
      );
    }
    case StorefrontSectionKind.Categories:
      return (
        <>
          <Field
            label={t('ssTitleOptional')}
            value={section.title ?? ''}
            placeholder={t('ssCatsDefault')}
            maxLength={STOREFRONT_TITLE_MAX}
            help={t('ssTitleEmpty')}
            onChange={(event) => {
              onChange({ ...section, title: event.target.value });
            }}
          />
          <Looks
            label={t('ssLook')}
            value={section.style}
            own={theme.categories}
            choices={Object.values(CategoryTileStyle).map((value) => ({
              value,
              label: t(TILE_WORDS[value]),
              drawing: TILE_DRAWINGS[value],
            }))}
            hint={t('ssThemeOwn', {
              theme: theme.name[language],
              look: t(TILE_WORDS[theme.categories]),
            })}
            onChange={(style) => {
              onChange({ ...section, style });
            }}
          />
          <NoteLine>{t('ssCatsNote')}</NoteLine>
        </>
      );
    case StorefrontSectionKind.Products:
      return (
        <ProductsForm
          section={section}
          names={names}
          categories={editor.categories}
          problem={problem}
          onChange={onChange}
          onSource={onSource}
          onCategory={onCategory}
          onOffer={onOffer}
          onProducts={onProducts}
        />
      );
    case StorefrontSectionKind.OfferBanners: {
      const auto = section.fill === StorefrontFill.Auto;
      const count = auto ? section.collections.length : section.banners.length;
      const layout = bannerLayoutFor(Math.max(count, 1), section.layout);
      const fits = BANNER_LAYOUTS[Math.max(count, 1)] ?? [];
      return (
        <>
          <Seg
            label={t('ssShows')}
            value={section.fill}
            choices={[
              {
                value: StorefrontFill.Auto,
                label: (
                  <>
                    <EditorIcon name="spark" size={18} />
                    {t('ssBannersAuto')}
                  </>
                ),
              },
              { value: StorefrontFill.Own, label: t('ssBannersOwn') },
            ]}
            onChange={(fill) => {
              onChange({ ...section, fill });
            }}
          />
          {auto ? (
            <div className="flex flex-col gap-1">
              {/* BL-9: each banner filling itself shows a collection the seller picks. */}
              <span className="text-[14px] font-medium text-fg-muted">
                {t('ssBanners', { count, max: STOREFRONT_OFFER_BANNERS_MAX })}
              </span>
              <ul>
                {section.collections.map((collection, at) => (
                  <ListRow
                    key={at}
                    name={`${t('ssBannerN', { n: String(at + 1) })} · ${wordsText(t, linkWords(collection, names))}`}
                    line={wordsText(t, collectionLine(collection))}
                    lead={<CollectionMark collection={collection} />}
                    first={at === 0}
                    last={at === count - 1}
                    onUp={() => {
                      onChange({ ...section, collections: moveItem(section.collections, at, -1) });
                    }}
                    onDown={() => {
                      onChange({ ...section, collections: moveItem(section.collections, at, 1) });
                    }}
                    onOpen={() => {
                      onOpenCollection('collections', at);
                    }}
                  />
                ))}
              </ul>
              {count < STOREFRONT_OFFER_BANNERS_MAX ? (
                <AddButton
                  onClick={() => {
                    onOpenCollection('collections', null);
                  }}
                >
                  {t('ssAddBanner')}
                </AddButton>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-[14px] font-medium text-fg-muted">
                {t('ssBanners', { count, max: STOREFRONT_OFFER_BANNERS_MAX })}
              </span>
              <ul>
                {section.banners.map((banner, at) => (
                  <ListRow
                    key={at}
                    name={banner.headline}
                    line={wordsText(t, itemLine(banner, names))}
                    lead={<ItemThumb image={images[banner.photo.mediaId] ?? null} />}
                    first={at === 0}
                    last={at === section.banners.length - 1}
                    onUp={() => {
                      onChange({ ...section, banners: moveItem(section.banners, at, -1) });
                    }}
                    onDown={() => {
                      onChange({ ...section, banners: moveItem(section.banners, at, 1) });
                    }}
                    onOpen={() => {
                      onOpenItem(at);
                    }}
                  />
                ))}
              </ul>
              {section.banners.length < STOREFRONT_OFFER_BANNERS_MAX ? (
                <AddButton
                  onClick={() => {
                    onOpenItem(null);
                  }}
                >
                  {t('ssAddBanner')}
                </AddButton>
              ) : null}
              {shown('banners')}
            </div>
          )}
          {/* BL-6, BL-15: the layouts this many banners can take; left alone, the number's own. */}
          <Looks
            label={t('ssLayout')}
            value={layout}
            own={layout}
            choices={Object.values(BannerLayout).map((value) => ({
              value,
              label: t(BANNER_LAYOUT_WORDS[value]),
              drawing: LAYOUT_DRAWINGS[value],
              disabled: !fits.includes(value),
            }))}
            hint={t('ssLayoutHint')}
            onChange={(value) => {
              onChange({ ...section, layout: value });
            }}
          />
          <NoteLine>{t(auto ? 'ssBannersAutoNote' : 'ssBannersCompactNote')}</NoteLine>
        </>
      );
    }
    case StorefrontSectionKind.Testimonials:
      return (
        <>
          <Field
            label={t('ssTitleOptional')}
            value={section.title ?? ''}
            placeholder={t('ssQuotesDefault')}
            maxLength={STOREFRONT_TITLE_MAX}
            onChange={(event) => {
              onChange({ ...section, title: event.target.value });
            }}
          />
          <div className="flex flex-col gap-1">
            <span className="text-[14px] font-medium text-fg-muted">
              {t('ssQuotes', { count: section.quotes.length, max: STOREFRONT_TESTIMONIALS_MAX })}
            </span>
            <ul>
              {section.quotes.map((quote, at) => (
                <ListRow
                  key={at}
                  name={
                    quote.place ? t('ssWho', { name: quote.name, place: quote.place }) : quote.name
                  }
                  line={t('sdQuoted', { text: quote.text })}
                  lead={
                    <span className="grid size-10 flex-none place-items-center rounded-full bg-primary-soft font-bold text-primary">
                      {monogramLetter(quote.name, '?')}
                    </span>
                  }
                  first={at === 0}
                  last={at === section.quotes.length - 1}
                  onUp={() => {
                    onChange({ ...section, quotes: moveItem(section.quotes, at, -1) });
                  }}
                  onDown={() => {
                    onChange({ ...section, quotes: moveItem(section.quotes, at, 1) });
                  }}
                  onOpen={() => {
                    onOpenQuote(at);
                  }}
                />
              ))}
            </ul>
            {section.quotes.length < STOREFRONT_TESTIMONIALS_MAX ? (
              <AddButton
                onClick={() => {
                  onOpenQuote(null);
                }}
              >
                {t('ssAddQuote')}
              </AddButton>
            ) : null}
            {shown('quotes')}
          </div>
          <NoteLine>{t('ssQuotesNote')}</NoteLine>
        </>
      );
    case StorefrontSectionKind.About:
      return (
        <>
          <Field
            label={t('ssTitle')}
            value={section.title}
            maxLength={STOREFRONT_TITLE_MAX}
            error={problem('title') ?? undefined}
            onChange={(event) => {
              onChange({ ...section, title: event.target.value });
            }}
          />
          <AreaField
            label={t('ssText')}
            value={section.text}
            maxLength={STOREFRONT_ABOUT_MAX}
            className="[&_textarea]:min-h-32"
            error={problem('text') ?? undefined}
            help={count(section.text, STOREFRONT_ABOUT_MAX)}
            onChange={(event) => {
              onChange({ ...section, text: event.target.value });
            }}
          />
          <PhotoField
            label={t('ssPhotoOptional')}
            photo={section.photo}
            image={section.photo ? (images[section.photo.mediaId] ?? null) : null}
            wide={false}
            hint={t('ssAboutPhotoHint')}
            onChange={(photo) => {
              onChange({ ...section, photo });
            }}
            onUploaded={onUploaded}
            onRemove={() => {
              onChange({ ...section, photo: null });
            }}
          />
        </>
      );
    case StorefrontSectionKind.Trust:
    case StorefrontSectionKind.WideBanner:
      return (
        <>
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <b className="block text-[14.5px] font-bold">
                {t(section.visible ? 'sdShown' : 'sdHidden')}
              </b>
              <span className="text-[12.5px] text-fg-muted">
                {wordsText(
                  t,
                  sectionSummary(
                    { ...section, visible: true },
                    { design, categories: editor.categories, offers: names.offers },
                  ),
                )}
              </span>
            </span>
            <Switch
              checked={section.visible}
              label={t('sdShow', { name: wordsText(t, sectionName(section)) })}
              onChange={() => {
                onChange({ ...section, visible: !section.visible });
              }}
            />
          </div>
          <NoteLine>{t('ssTrustNote')}</NoteLine>
        </>
      );
  }
}

function ItemThumb({ image }: { image: ImageView | null }) {
  return image ? (
    <img
      src={image.urls.thumbnail}
      alt=""
      className="h-[50px] w-[74px] flex-none rounded-[8px] object-cover"
    />
  ) : (
    <span className="h-[50px] w-[74px] flex-none rounded-[8px] bg-neutral-100" />
  );
}

/** A row of products' fields (the sketch's `e-products`, `e-row-cat`). */
function ProductsForm({
  section,
  names,
  categories,
  problem,
  onChange,
  onSource,
  onCategory,
  onOffer,
  onProducts,
}: {
  section: Products;
  names: Names;
  categories: StorefrontEditor['categories'];
  problem: (field: string) => string | null;
  onChange: (section: StorefrontSection) => void;
  onSource: (source: ProductRowSource) => void;
  onCategory: (categoryId: string | null) => void;
  onOffer: (offerId: string | null) => void;
  onProducts: () => void;
}) {
  const { t } = useTranslation('menu');
  const all = useCategories({ enabled: section.source === ProductRowSource.Category });
  // OF-22: only a running offer can be picked; the one the row names stays listed whatever it is now.
  const offers = useOffers();
  const offerOptions = (offers.data?.offers ?? [])
    .filter((offer) => offer.state === OfferState.Running || offer.id === (section.offerId ?? null))
    .map((offer) => ({
      value: offer.id,
      label:
        offer.state === OfferState.Running
          ? t('ssOfferOption', { name: offer.name, count: offer.products })
          : t('ssOfferEnded', { name: offer.name }),
    }));
  // The shop's categories once read; until then, the one the row names.
  const options = all.data
    ? all.data.map((category) => ({
        value: category.id,
        label: t('ssCategoryOption', { name: category.name, count: category.productCount }),
      }))
    : categories.map((category) => ({ value: category.id, label: category.name }));
  const defaultTitle =
    section.source === ProductRowSource.Offer
      ? section.offerId
        ? (names.offers.get(section.offerId) ?? '')
        : ''
      : section.source === ProductRowSource.Category
        ? section.categoryId
          ? (names.categories.get(section.categoryId) ??
            all.data?.find((category) => category.id === section.categoryId)?.name ??
            '')
          : ''
        : t(
            section.source === ProductRowSource.Newest
              ? 'ssSrcNewest'
              : section.source === ProductRowSource.OnSale
                ? 'ssSrcOnSale'
                : section.source === ProductRowSource.BestSellers
                  ? 'ssSrcBest'
                  : 'ssPickedDefault',
          );
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-[14px] font-medium text-fg-muted">{t('ssWhichProducts')}</span>
        <div role="radiogroup" aria-label={t('ssWhichProducts')}>
          {SOURCES.map((source) => (
            <button
              key={source.value}
              type="button"
              role="radio"
              aria-checked={section.source === source.value}
              className="flex w-full items-start gap-2.5 border-t border-neutral-100 px-0.5 py-[11px] text-left first:border-t-0"
              onClick={() => {
                onSource(source.value);
              }}
            >
              <span className="mt-px">
                <RadioMark on={section.source === source.value} />
              </span>
              <span>
                <b className="block text-[14.5px] font-bold">{t(source.name)}</b>
                <span className="text-[12.5px] text-fg-muted">{t(source.line)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      {section.source === ProductRowSource.Category ? (
        <SelectField
          label={t('ssCategory')}
          value={section.categoryId ?? ''}
          options={[{ value: '', label: t('ssChooseCategory') }, ...options]}
          error={problem('category') ?? undefined}
          onChange={(event) => {
            onCategory(event.target.value === '' ? null : event.target.value);
          }}
        />
      ) : null}
      {section.source === ProductRowSource.Offer ? (
        <SelectField
          label={t('ssOffer')}
          value={section.offerId ?? ''}
          options={[{ value: '', label: t('ssChooseOffer') }, ...offerOptions]}
          help={t('ssOfferOnly')}
          error={problem('offer') ?? undefined}
          onChange={(event) => {
            onOffer(event.target.value === '' ? null : event.target.value);
          }}
        />
      ) : null}
      {section.source === ProductRowSource.Picked ? (
        <div className="flex flex-col gap-1.5">
          <PickField
            label={t('ssChosenProducts')}
            value={t('ssChosen', {
              count: section.productIds.length,
              max: STOREFRONT_PICKED_PRODUCTS_MAX,
            })}
            chevron="right"
            error={problem('products') ?? undefined}
            onPick={onProducts}
          />
        </div>
      ) : null}
      <Field
        label={t('ssTitle')}
        value={section.title ?? ''}
        placeholder={defaultTitle}
        maxLength={STOREFRONT_TITLE_MAX}
        onChange={(event) => {
          onChange({ ...section, title: event.target.value });
        }}
      />
      <Seg
        label={t('ssLayout')}
        value={section.layout}
        choices={[
          { value: ProductRowLayout.Grid, label: t('ssGrid') },
          { value: ProductRowLayout.Carousel, label: t('ssCarousel') },
        ]}
        onChange={(layout) => {
          onChange({ ...section, layout });
        }}
      />
      {section.source === ProductRowSource.Picked ? null : (
        <Seg
          label={t('ssHowMany')}
          value={section.count}
          choices={STOREFRONT_ROW_COUNTS.map((value) => ({ value, label: String(value) }))}
          onChange={(value) => {
            onChange({ ...section, count: value });
          }}
        />
      )}
      {section.source === ProductRowSource.Offer ? <NoteLine>{t('ssOfferSeeAll')}</NoteLine> : null}
      <NoteLine>{t('ssBadgesNote')}</NoteLine>
    </>
  );
}
