import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AnnouncementItemKind,
  STARTING_BANNER_COLLECTIONS,
  StorefrontSectionKind,
  storefrontPhotoRefs,
  type PreviewLayout,
  type StorefrontCollection,
  type StorefrontLink,
  type StorefrontDesign,
  type StorefrontSection,
} from '@lytronix/validators';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Sheet } from '@/components/ui/sheet';
import type { ImageView } from '@/types/me';
import type { ProductSummary } from '@/types/catalogue';
import type { StorefrontEditor } from '@/types/storefront-design';
import { NoteLine } from './design-parts';
import { sectionName, wordsText } from './design-words';
import { ItemLeftOut, RowLeftOut } from './left-notes';
import { CollectionStep, LinkStep, ProductsStep, type Known, type Names } from './pickers';
import { ItemForm, LineForm, MainForm, QuoteForm } from './section-forms';
import {
  finishSection,
  itemDraftOf,
  itemOf,
  linkWords,
  newItemDraft,
  quoteDraftOf,
  quoteOf,
  sectionProblems,
  withSource,
  type ItemDraft,
  type ItemKind,
  type QuoteDraft,
} from './section-drafts';

// STOREFRONT-BUILDER-PLAN SB-8, SB-9, SB-15, SB-16 (PR 3b; the sketch's `e-hero`, `e-slide`, `e-products`, `e-cats`,
// `e-row-cat`, `e-pick`, `e-link`, `e-announce`, `e-banners`, `e-banner`, `e-wide`, `e-quotes`, `e-quote`, `e-about`):
// a section's own sheet. A slide, a banner, a quote, a button's place and a row's products open as steps within it.
// Its changes go into the draft with Done, as one save; closing it changed asks first.

/** What the sheet opens: a section of the design, or one being added that needs its own words first. */
export type EditorTarget =
  | { mode: 'edit'; section: StorefrontSection }
  | { mode: 'new'; kind: 'wide' | 'quotes' | 'about'; id: string };

type Step =
  | { kind: 'main' }
  | { kind: 'item'; at: number | null }
  | { kind: 'quote'; at: number | null }
  | { kind: 'link' }
  | { kind: 'products' }
  // BL-3, BL-9: what a hero's tile or an auto banner shows; null for a banner being added.
  | { kind: 'collection'; list: 'tiles' | 'collections'; at: number | null }
  // BL-10: a line of the seller's own for the bar; null for a new one.
  | { kind: 'line'; at: number | null };

/** A section being added starts empty, and joins the draft once it holds what it needs. */
function blank(target: Extract<EditorTarget, { mode: 'new' }>): StorefrontSection | null {
  const base = { id: target.id, visible: true };
  if (target.kind === 'quotes') {
    return { ...base, kind: StorefrontSectionKind.Testimonials, title: null, quotes: [] };
  }
  if (target.kind === 'about') {
    return { ...base, kind: StorefrontSectionKind.About, title: '', text: '', photo: null };
  }
  return null;
}

export function SectionEditor({
  target,
  design,
  editor,
  left,
  images,
  names,
  known,
  onNamed,
  onSeen,
  onUploaded,
  onForget,
  onSave,
  onRemove,
  onClose,
}: {
  target: EditorTarget;
  design: StorefrontDesign;
  editor: Pick<StorefrontEditor, 'categories' | 'broken'>;
  /** SB-32 as amended: what the saved draft's home leaves out now; null until the storefront has said. */
  left: PreviewLayout | null;
  images: Record<string, ImageView>;
  names: Names;
  known: Known;
  onNamed: (kind: 'categories' | 'products', id: string, name: string) => void;
  onSeen: (products: ProductSummary[]) => void;
  onUploaded: (image: ImageView) => void;
  /** Pictures uploaded here and never kept: deleted (MED-09). */
  onForget: (ids: string[]) => void;
  onSave: (section: StorefrontSection) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation('menu');
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const wide =
    target.mode === 'new'
      ? target.kind === 'wide'
      : target.section.kind === StorefrontSectionKind.WideBanner;
  // The sheet is opened afresh for each section (its key), so its first state is read once.
  const [initial] = useState(() => (target.mode === 'edit' ? target.section : blank(target)));
  const [firstItem] = useState(() =>
    wide
      ? target.mode === 'edit' && target.section.kind === StorefrontSectionKind.WideBanner
        ? itemDraftOf(target.section.banner)
        : newItemDraft(t('ssShopNow'))
      : null,
  );
  const [working, setWorking] = useState<StorefrontSection | null>(initial);
  const [item, setItem] = useState<ItemDraft | null>(firstItem);
  const [quote, setQuote] = useState<QuoteDraft | null>(null);
  const [collection, setCollection] = useState<StorefrontCollection | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([{ kind: 'main' }]);
  const [tried, setTried] = useState(false);
  const [asking, setAsking] = useState<'close' | 'back' | null>(null);
  const stepStart = useRef('');
  const start = useRef(JSON.stringify({ working: initial, item: firstItem }));
  // What a row had for each source, so coming back to one finds it.
  const kept = useRef<{ categoryId: string | null; productIds: string[]; offerId: string | null }>(
    initial?.kind === StorefrontSectionKind.Products
      ? {
          categoryId: initial.categoryId,
          productIds: initial.productIds,
          offerId: initial.offerId ?? null,
        }
      : { categoryId: null, productIds: [], offerId: null },
  );
  // Pictures uploaded in this sheet; any the saved section doesn't hold are let go of.
  const mine = useRef(new Set<string>());
  const done = useRef(false);
  const forget = useRef(onForget);
  useEffect(() => {
    forget.current = onForget;
  });
  // Closed without Done (or the page left): what this sheet uploaded is let go of.
  useEffect(
    () => () => {
      if (!done.current && mine.current.size > 0) forget.current([...mine.current]);
    },
    [],
  );

  const step = steps.at(-1) ?? { kind: 'main' };
  const itemKind: ItemKind = working?.kind === StorefrontSectionKind.Hero ? 'slide' : 'banner';
  const stepDirty =
    (step.kind === 'item' || step.kind === 'link') && !wide
      ? JSON.stringify(item) !== stepStart.current
      : step.kind === 'quote'
        ? JSON.stringify(quote) !== stepStart.current
        : step.kind === 'collection'
          ? JSON.stringify(collection) !== stepStart.current
          : step.kind === 'line'
            ? JSON.stringify(line) !== stepStart.current
            : false;
  const dirty =
    JSON.stringify({ working, item: wide ? item : firstItem }) !== start.current || stepDirty;

  const push = (next: Step) => {
    setTried(false);
    setSteps((current) => [...current, next]);
  };
  const pop = () => {
    setTried(false);
    setSteps((current) => (current.length > 1 ? current.slice(0, -1) : current));
  };
  const uploaded = (image: ImageView) => {
    mine.current.add(image.id);
    onUploaded(image);
  };
  const imageOf = (id: string | undefined) => (id ? (images[id] ?? null) : null);

  function save(section: StorefrontSection): void {
    done.current = true;
    const held = new Set(
      storefrontPhotoRefs({ ...design, sections: [section] }).map((photo) => photo.mediaId),
    );
    const unused = [...mine.current].filter((id) => !held.has(id));
    if (unused.length > 0) onForget(unused);
    onSave(section);
  }

  function finishMain(): void {
    if (wide) {
      const banner = item ? itemOf(item) : null;
      if (!banner) {
        setTried(true);
        return;
      }
      const id = target.mode === 'edit' ? target.section.id : target.id;
      const visible = target.mode === 'edit' ? target.section.visible : true;
      save({ id, visible, kind: StorefrontSectionKind.WideBanner, banner });
      return;
    }
    if (!working) return;
    if (sectionProblems(working).length > 0) {
      setTried(true);
      return;
    }
    save(finishSection(working));
  }

  /** An item's Done: into its list, at its place or at the end. */
  function finishItem(): void {
    if (step.kind !== 'item' || !item || !working) return;
    const made = itemOf(item);
    if (!made) {
      setTried(true);
      return;
    }
    const place = <T,>(list: readonly T[], value: T): T[] =>
      step.at === null ? [...list, value] : list.map((each, at) => (at === step.at ? value : each));
    if (working.kind === StorefrontSectionKind.Hero) {
      setWorking({ ...working, slides: place(working.slides, made) });
    } else if (working.kind === StorefrontSectionKind.OfferBanners) {
      setWorking({ ...working, banners: place(working.banners, made) });
    }
    setItem(null);
    pop();
  }

  function removeItem(): void {
    if (step.kind !== 'item' || step.at === null || !working) return;
    const at = step.at;
    if (working.kind === StorefrontSectionKind.Hero) {
      setWorking({ ...working, slides: working.slides.filter((_, index) => index !== at) });
    } else if (working.kind === StorefrontSectionKind.OfferBanners) {
      setWorking({ ...working, banners: working.banners.filter((_, index) => index !== at) });
    }
    setItem(null);
    pop();
  }

  function finishQuote(): void {
    if (step.kind !== 'quote' || !quote || working?.kind !== StorefrontSectionKind.Testimonials)
      return;
    const made = quoteOf(quote);
    if (!made) {
      setTried(true);
      return;
    }
    const quotes =
      step.at === null
        ? [...working.quotes, made]
        : working.quotes.map((each, at) => (at === step.at ? made : each));
    setWorking({ ...working, quotes });
    setQuote(null);
    pop();
  }

  function removeQuote(): void {
    if (step.kind !== 'quote' || step.at === null) return;
    const at = step.at;
    if (working?.kind === StorefrontSectionKind.Testimonials) {
      setWorking({ ...working, quotes: working.quotes.filter((_, index) => index !== at) });
    }
    setQuote(null);
    pop();
  }

  function openItem(at: number | null): void {
    if (!working) return;
    const list =
      working.kind === StorefrontSectionKind.Hero
        ? working.slides
        : working.kind === StorefrontSectionKind.OfferBanners
          ? working.banners
          : [];
    const existing = at === null ? null : list[at];
    const draft = existing
      ? itemDraftOf(existing)
      : newItemDraft(t(itemKind === 'slide' ? 'ssShopNow' : 'ssShop'));
    stepStart.current = JSON.stringify(draft);
    setItem(draft);
    push({ kind: 'item', at });
  }

  /** BL-3, BL-9: a tile's or an auto banner's collection; a banner added shows the first a new section starts with
      that the others don't. */
  function openCollection(list: 'tiles' | 'collections', at: number | null): void {
    if (!working) return;
    const current =
      list === 'tiles' && working.kind === StorefrontSectionKind.Hero
        ? working.tiles
        : list === 'collections' && working.kind === StorefrontSectionKind.OfferBanners
          ? working.collections
          : null;
    if (!current) return;
    const draft =
      (at === null
        ? STARTING_BANNER_COLLECTIONS.find(
            (start) => !current.some((each) => each.kind === start.kind),
          )
        : current[at]) ?? STARTING_BANNER_COLLECTIONS[0];
    if (!draft) return;
    stepStart.current = JSON.stringify(at === null ? null : draft);
    setCollection(draft);
    push({ kind: 'collection', list, at });
  }

  function finishCollection(): void {
    if (step.kind !== 'collection' || !collection || !working) return;
    const place = <T,>(list: readonly T[], value: T): T[] =>
      step.at === null ? [...list, value] : list.map((each, at) => (at === step.at ? value : each));
    if (step.list === 'tiles' && working.kind === StorefrontSectionKind.Hero) {
      setWorking({ ...working, tiles: place(working.tiles, collection) });
    } else if (step.list === 'collections' && working.kind === StorefrontSectionKind.OfferBanners) {
      setWorking({ ...working, collections: place(working.collections, collection) });
    }
    setCollection(null);
    pop();
  }

  function removeCollection(): void {
    if (step.kind !== 'collection' || step.at === null) return;
    const at = step.at;
    if (working?.kind === StorefrontSectionKind.OfferBanners) {
      setWorking({
        ...working,
        collections: working.collections.filter((_, index) => index !== at),
      });
    }
    setCollection(null);
    pop();
  }

  function openLine(at: number | null): void {
    if (working?.kind !== StorefrontSectionKind.Announcement) return;
    const existing = at === null ? null : working.items[at];
    const draft = existing?.kind === AnnouncementItemKind.Own ? existing.text : '';
    stepStart.current = JSON.stringify(draft);
    setLine(draft);
    push({ kind: 'line', at });
  }

  function finishLine(): void {
    if (
      step.kind !== 'line' ||
      line === null ||
      working?.kind !== StorefrontSectionKind.Announcement
    )
      return;
    if (line.trim() === '') {
      setTried(true);
      return;
    }
    const made = { kind: AnnouncementItemKind.Own, text: line.trim() } as const;
    const items =
      step.at === null
        ? [...working.items, made]
        : working.items.map((each, at) => (at === step.at ? made : each));
    setWorking({ ...working, items });
    setLine(null);
    pop();
  }

  function removeLine(): void {
    if (step.kind !== 'line' || step.at === null) return;
    const at = step.at;
    if (working?.kind === StorefrontSectionKind.Announcement) {
      setWorking({ ...working, items: working.items.filter((_, index) => index !== at) });
    }
    setLine(null);
    pop();
  }

  function openQuote(at: number | null): void {
    if (working?.kind !== StorefrontSectionKind.Testimonials) return;
    const draft = quoteDraftOf(at === null ? null : (working.quotes[at] ?? null));
    stepStart.current = JSON.stringify(draft);
    setQuote(draft);
    push({ kind: 'quote', at });
  }

  /** Back from a step: an item or quote changed asks first; a list step keeps what it chose. */
  function back(): void {
    if (
      (step.kind === 'item' && !wide) ||
      step.kind === 'quote' ||
      step.kind === 'collection' ||
      step.kind === 'line'
    ) {
      if (stepDirty) {
        setAsking('back');
        return;
      }
      dropStep();
    }
    pop();
  }

  /** What a step was editing, let go of. */
  function dropStep(): void {
    setItem(null);
    setQuote(null);
    setCollection(null);
    setLine(null);
  }

  function close(): void {
    if (dirty) setAsking('close');
    else onClose();
  }

  // ---- the title and the buttons of each step ----
  const listName = (n: number) =>
    t(itemKind === 'slide' ? 'ssSlideN' : 'ssBannerN', { n: String(n) });
  const title =
    step.kind === 'item'
      ? listName((step.at ?? (working ? countOf(working) : 0)) + 1)
      : step.kind === 'quote'
        ? t('ssQuoteN', {
            n: String(
              (step.at ??
                (working?.kind === StorefrontSectionKind.Testimonials
                  ? working.quotes.length
                  : 0)) + 1,
            ),
          })
        : step.kind === 'collection'
          ? t(step.list === 'tiles' ? 'ssTileShows' : 'ssBannerShows', {
              n: String(
                (step.at ??
                  (working?.kind === StorefrontSectionKind.OfferBanners
                    ? working.collections.length
                    : 0)) + 1,
              ),
            })
          : step.kind === 'line'
            ? t('ssLineTitle')
            : step.kind === 'link'
              ? t('ssLeadsTo')
              : step.kind === 'products'
                ? t('ssChooseProducts')
                : wide
                  ? t('sdKWide')
                  : working?.kind === StorefrontSectionKind.Products
                    ? t('sdKProducts')
                    : working
                      ? wordsText(t, sectionName(working))
                      : '';
  const isNew = target.mode === 'new';
  const footer =
    step.kind === 'main' ? (
      <>
        {isNew ? null : (
          <Button
            tone="outline"
            onClick={() => {
              onRemove(target.section.id);
            }}
          >
            {t('ssRemoveSection')}
          </Button>
        )}
        <Button onClick={finishMain}>{t('sdDone')}</Button>
      </>
    ) : step.kind === 'item' ? (
      <>
        {step.at === null ? null : (
          <Button tone="outline" onClick={removeItem}>
            {t('sdRemove')}
          </Button>
        )}
        <Button onClick={finishItem}>{t('sdDone')}</Button>
      </>
    ) : step.kind === 'quote' ? (
      <>
        {step.at === null ? null : (
          <Button tone="outline" onClick={removeQuote}>
            {t('sdRemove')}
          </Button>
        )}
        <Button onClick={finishQuote}>{t('sdDone')}</Button>
      </>
    ) : step.kind === 'collection' ? (
      <>
        {/* An auto banner can go while another stays; a tile always has its two. */}
        {step.list === 'collections' &&
        step.at !== null &&
        working?.kind === StorefrontSectionKind.OfferBanners &&
        working.collections.length > 1 ? (
          <Button tone="outline" onClick={removeCollection}>
            {t('sdRemove')}
          </Button>
        ) : null}
        <Button onClick={finishCollection}>{t('sdDone')}</Button>
      </>
    ) : step.kind === 'line' ? (
      <>
        {step.at === null ? null : (
          <Button tone="outline" onClick={removeLine}>
            {t('sdRemove')}
          </Button>
        )}
        <Button onClick={finishLine}>{t('sdDone')}</Button>
      </>
    ) : (
      <Button onClick={pop}>{t('sdDone')}</Button>
    );

  const linkNames = names;
  // SB-32 as amended (`de-banner-hidden`, `de-wide-empty`): a saved slide's or banner's link, to say when it leads
  // nowhere now.
  const saved = target.mode === 'edit' ? target.section : null;
  const savedLink = (at: number | null): StorefrontLink | null => {
    if (at === null || !saved) return null;
    if (saved.kind === StorefrontSectionKind.WideBanner) return saved.banner.link;
    if (saved.kind === StorefrontSectionKind.Hero) return saved.slides[at]?.link ?? null;
    if (saved.kind === StorefrontSectionKind.OfferBanners) return saved.banners[at]?.link ?? null;
    return null;
  };
  const itemNote = (draft: ItemDraft, at: number | null) => (
    <ItemLeftOut
      left={left}
      sectionId={saved?.id ?? null}
      index={at}
      saved={savedLink(at)}
      link={draft.link}
    />
  );
  const itemForm = (draft: ItemDraft, kind: ItemKind) => (
    <ItemForm
      draft={draft}
      kind={kind}
      image={imageOf(draft.photo?.mediaId)}
      tried={tried}
      leadsTo={wordsText(t, linkWords(draft.link, linkNames))}
      onChange={setItem}
      onUploaded={uploaded}
      onLink={() => {
        push({ kind: 'link' });
      }}
    />
  );

  let body: ReactNode = null;
  if (step.kind === 'link' && item) {
    body = (
      <LinkStep
        link={item.link}
        names={names}
        onNamed={onNamed}
        onChange={(link) => {
          setItem({ ...item, link });
        }}
      />
    );
  } else if (step.kind === 'products' && working?.kind === StorefrontSectionKind.Products) {
    body = (
      <ProductsStep
        chosen={working.productIds}
        names={names}
        known={known}
        onSeen={onSeen}
        onChange={(productIds) => {
          kept.current = { ...kept.current, productIds };
          setWorking({ ...working, productIds });
        }}
      />
    );
  } else if (step.kind === 'collection' && collection) {
    body = (
      <>
        <CollectionStep
          collection={collection}
          label={title}
          names={names}
          onNamed={onNamed}
          onChange={setCollection}
        />
        <NoteLine>{t('ssCollectionNote')}</NoteLine>
      </>
    );
  } else if (step.kind === 'line' && line !== null) {
    body = <LineForm text={line} tried={tried} onChange={setLine} />;
  } else if (step.kind === 'item' && item) {
    body = (
      <>
        {itemNote(item, step.at)}
        {itemForm(item, itemKind)}
      </>
    );
  } else if (step.kind === 'quote' && quote) {
    body = <QuoteForm draft={quote} tried={tried} onChange={setQuote} />;
  } else if (wide && item) {
    body = (
      <>
        {itemNote(item, 0)}
        {itemForm(item, 'banner')}
      </>
    );
  } else if (working) {
    body = (
      <>
        <RowLeftOut left={left} saved={saved} working={working} />
        <MainForm
          section={working}
          design={design}
          language={language}
          editor={editor}
          images={images}
          names={names}
          tried={tried}
          onChange={setWorking}
          onSource={(source) => {
            if (working.kind !== StorefrontSectionKind.Products) return;
            setWorking(withSource(working, source, kept.current));
          }}
          onCategory={(categoryId) => {
            if (working.kind !== StorefrontSectionKind.Products) return;
            kept.current = { ...kept.current, categoryId };
            setWorking({ ...working, categoryId });
          }}
          onOffer={(offerId) => {
            if (working.kind !== StorefrontSectionKind.Products) return;
            kept.current = { ...kept.current, offerId };
            setWorking({ ...working, offerId });
          }}
          onOpenItem={openItem}
          onOpenQuote={openQuote}
          onOpenCollection={openCollection}
          onOpenLine={openLine}
          onProducts={() => {
            push({ kind: 'products' });
          }}
          onUploaded={uploaded}
        />
      </>
    );
  }

  return (
    <>
      <Sheet
        open
        title={title}
        onClose={close}
        onBack={steps.length > 1 ? back : undefined}
        footer={footer}
      >
        {body}
      </Sheet>
      <Dialog
        open={asking !== null}
        title={t('ssDiscardTitle')}
        onClose={() => {
          setAsking(null);
        }}
        actions={
          <>
            <Button
              tone="outline"
              onClick={() => {
                setAsking(null);
              }}
            >
              {t('ssKeepEditing')}
            </Button>
            <Button
              tone="danger"
              onClick={() => {
                if (asking === 'back') {
                  dropStep();
                  setAsking(null);
                  pop();
                } else {
                  setAsking(null);
                  onClose();
                }
              }}
            >
              {t('sdDiscardGo')}
            </Button>
          </>
        }
      >
        {t(asking === 'back' ? 'ssDiscardItem' : 'ssDiscardSection')}
      </Dialog>
    </>
  );
}

function countOf(section: StorefrontSection): number {
  if (section.kind === StorefrontSectionKind.Hero) return section.slides.length;
  if (section.kind === StorefrontSectionKind.OfferBanners) return section.banners.length;
  return 0;
}
