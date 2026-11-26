import { useMemo, useRef, useState } from 'react';
import { unusedMedia } from '@/api/media';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  StorefrontSectionKind,
  type StorefrontDesign,
  type StorefrontSection,
} from '@lytronix/validators';
import {
  useBackDesign,
  useDiscardDraft,
  usePublishDesign,
  useStorefrontEditor,
} from '@/api/storefront-design';
import { useOffers } from '@/api/offers';
import { useShopSettings } from '@/api/shop-settings';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { ActionBar } from '@/components/ui/action-bar';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { ProductSummary } from '@/types/catalogue';
import type { ImageView } from '@/types/me';
import type { StorefrontEditor } from '@/types/storefront-design';
import { DesignCardsCard } from './design-cards-card';
import { BrandCard, LeaveWhileSaving, SectionsCard, ThemeCard } from './design-parts';
import { AddSheet, AllProductsSheet, PublishSheet } from './design-sheets';
import {
  addSection,
  canAddSection,
  changesOf,
  fillsItself,
  moveSection,
  moveSectionTo,
  newSection,
  removeSection,
  sectionName,
  toggleSection,
  type AddableKind,
  wordsText,
} from './design-words';
import type { Known, Names } from './pickers';
import { SectionEditor, type EditorTarget } from './section-editor';
import { EditorIcon } from './editor-icon';
import { FullPreview, PreviewPane } from './preview-pane';
import { useDraftPreviewAndLayout } from './use-draft-preview';
import { useDraftDesign } from './use-draft';
import { useDragOrder } from './use-drag-order';

/** The preview sits beside the editor from this width; under it, Preview opens it over the whole screen. */
const DESKTOP = '(min-width: 1024px)';

/**
 * Settings > Storefront > Design (STOREFRONT-BUILDER-PLAN SB-7 to SB-13, the sketch's `e-home`, `e-add` and
 * `e-publish`): the theme with its colour sets, the logo and icon, and the home page's sections -- shown or hidden,
 * up or down, added, opened, removed. Each change saves to the server's draft and the live preview beside it draws the
 * draft again; shoppers see none of it until Publish, which says first what changes. Back returns the design before
 * the live one; Discard drops the draft.
 */
export function DesignView(): React.JSX.Element {
  const editor = useStorefrontEditor();
  if (!editor.data) {
    return (
      <ShellPage>
        {editor.isError ? (
          <ErrorBanner error={editor.error} />
        ) : (
          <Card flush>
            <SkeletonRows count={5} />
          </Card>
        )}
      </ShellPage>
    );
  }
  return <DesignPage editor={editor.data} />;
}

type Asking = { kind: 'back' } | { kind: 'discard' } | { kind: 'remove'; id: string } | null;

function DesignPage({ editor }: { editor: StorefrontEditor }): React.JSX.Element {
  const { t, i18n } = useTranslation('menu');
  const navigate = useNavigate();
  const { slug, tenant } = useShell();
  const settings = useShopSettings();
  const draft = useDraftDesign(editor);
  const { design, change } = draft;
  // SB-32 as amended: the preview, and what the saved draft's home leaves out (asked again after each save).
  const { src: preview, left } = useDraftPreviewAndLayout(draft.saved);
  const publish = usePublishDesign();
  const back = useBackDesign();
  const discard = useDiscardDraft();
  const toast = useToast();
  const [sheet, setSheet] = useState<'add' | 'publish' | 'all' | null>(null);
  const [target, setTarget] = useState<EditorTarget | null>(null);
  // What the sheets learn while open: pictures uploaded, and the names of what the pickers read.
  const [uploads, setUploads] = useState<Record<string, ImageView>>({});
  const [learned, setLearned] = useState<{
    categories: Record<string, string>;
    products: Record<string, string>;
  }>({ categories: {}, products: {} });
  const [seen, setSeen] = useState<Record<string, ProductSummary>>({});
  const [asking, setAsking] = useState<Asking>(null);
  const [full, setFull] = useState(false);

  const language = i18n.language === 'en' ? 'en' : 'bn';
  const changes = useMemo(
    () => changesOf(editor.live, design, language),
    [editor.live, design, language],
  );
  const busy = publish.isPending || back.isPending || discard.isPending;
  const hasDraft = editor.hasDraft || draft.saving;
  const images = useMemo(() => ({ ...editor.images, ...uploads }), [editor.images, uploads]);
  // OFFERS-PLAN: the shop's offers, to name the rows and buttons that point at one.
  const offers = useOffers();
  const names: Names = useMemo(
    () => ({
      categories: new Map([
        ...editor.categories.map((each) => [each.id, each.name] as const),
        ...Object.entries(learned.categories),
      ]),
      products: new Map([
        ...editor.products.map((each) => [each.id, each.name] as const),
        ...Object.entries(learned.products),
      ]),
      // OFFERS-PLAN: every offer the shop has, so a row or button naming one says which.
      offers: new Map((offers.data?.offers ?? []).map((each) => [each.id, each.name] as const)),
    }),
    [editor.categories, editor.products, learned, offers.data],
  );
  const known: Known = useMemo(() => new Map(Object.entries(seen)), [seen]);

  // BL-1: while a section is dragged, the list shows where it would go; letting go saves it, once.
  const [held, setHeld] = useState<StorefrontDesign | null>(null);
  const holding = useRef<StorefrontDesign | null>(null);
  const drag = useDragOrder({
    disabled: busy,
    onOver: (id, to) => {
      holding.current = moveSectionTo(holding.current ?? design, id, to);
      setHeld(holding.current);
    },
    onStep: (at, to) => {
      const id = design.sections[at]?.id;
      if (id) change(moveSection(design, id, to > at ? 1 : -1));
    },
    onDrop: () => {
      const moved = holding.current;
      holding.current = null;
      setHeld(null);
      if (moved && moved !== design) change(moved);
    },
  });
  const failure = draft.error ?? publish.error ?? back.error ?? discard.error;

  function add(kind: AddableKind): void {
    if (!fillsItself(kind)) {
      // A wide banner, testimonials or About opens its sheet first, and joins the draft with Done.
      setSheet(null);
      setTarget({ mode: 'new', kind, id: crypto.randomUUID() });
      return;
    }
    const added = newSection(kind, crypto.randomUUID());
    change(addSection(design, added));
    setSheet(null);
    toast.show(
      t(added.kind === StorefrontSectionKind.Announcement ? 'sdAddedTop' : 'sdAddedEnd', {
        name: wordsText(t, sectionName(added)),
      }),
    );
  }

  function remove(id: string): void {
    const gone = design.sections.find((each) => each.id === id);
    change(removeSection(design, id));
    setAsking(null);
    setTarget(null);
    if (gone) toast.show(t('sdRemoved', { name: wordsText(t, sectionName(gone)) }));
  }

  /** A sheet's Done: the section in the draft, in its place, or added as a new one goes. */
  function save(section: StorefrontSection): void {
    const there = design.sections.some((each) => each.id === section.id);
    change(
      there
        ? {
            ...design,
            sections: design.sections.map((each) => (each.id === section.id ? section : each)),
          }
        : addSection(design, section),
    );
    setTarget(null);
    const name = wordsText(t, sectionName(section));
    toast.show(there ? t('ssSaved', { name }) : t('sdAddedEnd', { name }));
  }

  function showPreview(): void {
    if (window.matchMedia(DESKTOP).matches && preview) {
      window.open(preview, '_blank', 'noopener');
      return;
    }
    setFull(true);
  }

  const chip =
    hasDraft && changes.length > 0 ? (
      <StatusTag tone="warn">{t('sdDraftChip', { count: changes.length })}</StatusTag>
    ) : null;
  const removing =
    asking?.kind === 'remove' ? design.sections.find((each) => each.id === asking.id) : undefined;
  const storeOff = settings.data?.storefrontEnabled === false;

  return (
    // The chip beside the title on a phone; from 1024 px, where the header carries the title, beside the preview's.
    <ShellPage actions={chip ? <span className="lg:hidden">{chip}</span> : undefined}>
      {storeOff ? <Banner tone="warn">{t('sdStoreOff')}</Banner> : null}
      {failure ? <ErrorBanner error={failure} /> : null}
      <div className="flex flex-col gap-section lg:grid lg:grid-cols-[430px_1fr] lg:items-start lg:gap-columns">
        <div className="flex flex-col gap-3">
          <ThemeCard
            design={design}
            slug={slug}
            onPalette={(palette) => {
              if (palette !== design.palette) change({ ...design, palette });
            }}
          />
          <BrandCard
            slug={slug}
            shopName={tenant.shopName}
            logo={tenant.logo}
            icon={tenant.icon ?? null}
          />
          <DesignCardsCard
            slug={slug}
            onSwitched={(on) => {
              toast.show(t(on ? 'plSwitchedOn' : 'plSwitchedOff'));
            }}
          />
          <SectionsCard
            editor={editor}
            left={left}
            onAll={() => {
              setSheet('all');
            }}
            design={held ?? design}
            disabled={busy}
            drag={drag}
            onMove={(id, by) => {
              change(moveSection(design, id, by));
            }}
            onToggle={(id) => {
              change(toggleSection(design, id));
            }}
            onOpen={(id) => {
              const opened = design.sections.find((each) => each.id === id);
              if (opened) setTarget({ mode: 'edit', section: opened });
            }}
            onFixed={(key) => {
              void navigate(
                key === 'header'
                  ? { to: '/$shop/settings/storefront/design/brand', params: { shop: slug } }
                  : { to: '/$shop/settings/shop', params: { shop: slug } },
              );
            }}
            addButton={
              <Button
                tone="ghost"
                wide
                disabled={busy}
                className="mt-2.5 bg-neutral-100"
                onClick={() => {
                  setSheet('add');
                }}
              >
                <Icon name="plus" />
                {t('sdAdd')}
              </Button>
            }
          />
          {editor.hasDraft || editor.canGoBack ? (
            <div className="flex flex-wrap gap-x-5 gap-y-1 px-1 text-[14px] font-medium">
              {editor.hasDraft ? (
                <button
                  type="button"
                  className="py-1.5 text-primary"
                  disabled={busy}
                  onClick={() => {
                    setAsking({ kind: 'discard' });
                  }}
                >
                  {t('sdDiscard')}
                </button>
              ) : null}
              {editor.canGoBack ? (
                <button
                  type="button"
                  className="py-1.5 text-primary"
                  disabled={busy}
                  onClick={() => {
                    setAsking({ kind: 'back' });
                  }}
                >
                  {t('sdBack')}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="hidden lg:sticky lg:top-4 lg:block">
          <PreviewPane src={preview} badge={chip} />
        </div>
      </div>
      <ActionBar>
        <Button tone="outline" onClick={showPreview}>
          <EditorIcon name="eye" size={18} />
          {t('sdPreview')}
        </Button>
        <Button
          disabled={!editor.hasDraft || draft.saving || busy}
          onClick={() => {
            setSheet('publish');
          }}
        >
          {t('sdPublish')}
        </Button>
      </ActionBar>
      <AllProductsSheet
        open={sheet === 'all'}
        onClose={() => {
          setSheet(null);
        }}
      />
      <AddSheet
        open={sheet === 'add'}
        full={!canAddSection(design)}
        onAdd={add}
        onClose={() => {
          setSheet(null);
        }}
      />
      <PublishSheet
        open={sheet === 'publish'}
        changes={changes}
        busy={publish.isPending}
        onPublish={() => {
          publish.mutate(undefined, {
            onSuccess: () => {
              setSheet(null);
              toast.show(t('sdPublished'));
            },
            onError: () => {
              setSheet(null);
            },
          });
        }}
        onClose={() => {
          setSheet(null);
        }}
      />
      {target ? (
        <SectionEditor
          left={left}
          key={target.mode === 'edit' ? target.section.id : target.id}
          target={target}
          design={design}
          editor={editor}
          images={images}
          names={names}
          known={known}
          onNamed={(kind, id, name) => {
            setLearned((current) => ({ ...current, [kind]: { ...current[kind], [id]: name } }));
          }}
          onSeen={(products) => {
            setSeen((current) => ({
              ...current,
              ...Object.fromEntries(products.map((product) => [product.id, product])),
            }));
            setLearned((current) => ({
              ...current,
              products: {
                ...current.products,
                ...Object.fromEntries(products.map((product) => [product.id, product.name])),
              },
            }));
          }}
          onUploaded={(image) => {
            setUploads((current) => ({ ...current, [image.id]: image }));
          }}
          onForget={(ids) => {
            void unusedMedia.forget(ids);
          }}
          onSave={save}
          onRemove={(id) => {
            setAsking({ kind: 'remove', id });
          }}
          onClose={() => {
            setTarget(null);
          }}
        />
      ) : null}
      <FullPreview
        open={full}
        src={preview}
        onClose={() => {
          setFull(false);
        }}
      />
      <Dialog
        open={asking?.kind === 'back'}
        title={t('sdBackTitle')}
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
              {t('cancel')}
            </Button>
            <Button
              busy={back.isPending}
              onClick={() => {
                back.mutate(undefined, {
                  onSettled: () => {
                    setAsking(null);
                  },
                  onSuccess: () => {
                    toast.show(t('sdWentBack'));
                  },
                });
              }}
            >
              {t('sdBackGo')}
            </Button>
          </>
        }
      >
        {t(editor.hasDraft ? 'sdBackBodyDraft' : 'sdBackBody')}
      </Dialog>
      <Dialog
        open={asking?.kind === 'discard'}
        title={t('sdDiscardTitle')}
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
              {t('cancel')}
            </Button>
            <Button
              tone="danger"
              busy={discard.isPending}
              onClick={() => {
                discard.mutate(undefined, {
                  onSettled: () => {
                    setAsking(null);
                  },
                  onSuccess: () => {
                    toast.show(t('sdDiscarded'));
                  },
                });
              }}
            >
              {t('sdDiscardGo')}
            </Button>
          </>
        }
      >
        {t('sdDiscardBody')}
      </Dialog>
      <Dialog
        open={removing !== undefined}
        title={removing ? t('sdRemoveTitle', { name: wordsText(t, sectionName(removing)) }) : ''}
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
              {t('cancel')}
            </Button>
            <Button
              tone="danger"
              onClick={() => {
                if (removing) remove(removing.id);
              }}
            >
              {t('sdRemove')}
            </Button>
          </>
        }
      >
        {t('sdRemoveBody')}
      </Dialog>
      <LeaveWhileSaving leaving={draft.leaving} />
      <Toast message={toast.message} />
    </ShellPage>
  );
}
