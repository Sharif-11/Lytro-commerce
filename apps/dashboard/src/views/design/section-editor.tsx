import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  StorefrontSectionKind,
  storefrontPhotoRefs,
  type StorefrontDesign,
  type StorefrontSection,
} from '@lytronix/validators';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Sheet } from '@/components/ui/sheet';
import type { ImageView } from '@/types/me';
import type { ProductSummary } from '@/types/catalogue';
import type { StorefrontEditor } from '@/types/storefront-design';
import { sectionName, wordsText } from './design-words';
import { LinkStep, ProductsStep, type Known, type Names } from './pickers';
import { ItemForm, MainForm, QuoteForm } from './section-forms';
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
  | { kind: 'products' };

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
  const [steps, setSteps] = useState<Step[]>([{ kind: 'main' }]);
  const [tried, setTried] = useState(false);
  const [asking, setAsking] = useState<'close' | 'back' | null>(null);
  const stepStart = useRef('');
  const start = useRef(JSON.stringify({ working: initial, item: firstItem }));
  // What a row had for each source, so coming back to one finds it.
  const kept = useRef(
    initial?.kind === StorefrontSectionKind.Products
      ? { categoryId: initial.categoryId, productIds: initial.productIds }
      : { categoryId: null, productIds: [] as string[] },
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

  function openQuote(at: number | null): void {
    if (working?.kind !== StorefrontSectionKind.Testimonials) return;
    const draft = quoteDraftOf(at === null ? null : (working.quotes[at] ?? null));
    stepStart.current = JSON.stringify(draft);
    setQuote(draft);
    push({ kind: 'quote', at });
  }

  /** Back from a step: an item or quote changed asks first; a list step keeps what it chose. */
  function back(): void {
    if ((step.kind === 'item' && !wide) || step.kind === 'quote') {
      if (stepDirty) {
        setAsking('back');
        return;
      }
      setItem(null);
      setQuote(null);
    }
    pop();
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
    ) : (
      <Button onClick={pop}>{t('sdDone')}</Button>
    );

  const linkNames = names;
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
  } else if (step.kind === 'item' && item) {
    body = itemForm(item, itemKind);
  } else if (step.kind === 'quote' && quote) {
    body = <QuoteForm draft={quote} tried={tried} onChange={setQuote} />;
  } else if (wide && item) {
    body = itemForm(item, 'banner');
  } else if (working) {
    body = (
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
        onOpenItem={openItem}
        onOpenQuote={openQuote}
        onProducts={() => {
          push({ kind: 'products' });
        }}
        onUploaded={uploaded}
      />
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
                  setItem(null);
                  setQuote(null);
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
