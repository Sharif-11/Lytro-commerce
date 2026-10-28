import { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import {
  MediaKind,
  Permission,
  SerialFormat,
  StockTracking,
  type ProductFormField,
} from '@lytronix/validators';
import { useAttributes, useProductDefaults, useProductStock } from '@/api/attributes';
import { useCategories, useProductRoom } from '@/api/catalogue';
import { usePresets } from '@/api/shop-setup';
import { unusedMedia } from '@/api/media';
import {
  useCreateProduct,
  useDuplicateProduct,
  useProduct,
  useRemoveProduct,
  useSaveProduct,
} from '@/api/products';
import { ActionBar } from '@/components/ui/action-bar';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useErrorText } from '@/hooks/use-error-text';
import {
  changedParts,
  createBody,
  formOf,
  isDirty,
  NEW_PRODUCT,
  problemsOf,
  withIds,
  withSaved,
  type ProductForm,
} from '@/lib/product-form';
import {
  applyDefaults,
  TYPE_SETTINGS,
  type ProductSettings,
  type TypeSetting,
} from '@/lib/product-settings';
import { overLimit } from '@/lib/variant-matrix';
import type { ProductDefaults } from '@/types/attribute';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { ProductDetail } from '@/types/product';
import { ProductLimitBanner } from '@/views/products/product-limit-banner';
import { StockTag } from '@/views/products/product-row';
import { ArchivedProduct } from './archived-product';
import { BasicsCard } from './basics-card';
import { LinkCard } from './link-card';
import { MediaSheet } from './media-sheet';
import { PhotoStrip } from './photo-strip';
import { useProductMedia } from './product-media';
import { StorageFullBanner } from './storage-full-banner';
import { MoreSettings } from './more-settings';
import { useTrackingChoice } from './made-to-order';
import { RemoveDialog } from './remove-dialog';
import { SizeChartSheet } from './size-chart-sheet';
import { StockDeliveryCard } from './stock-delivery-card';
import { isMeasured, useFieldNames } from './stock-words';
import { DefaultsLine, TypeBanner, UpfrontCard, WhyCard } from './type-cards';
import { VariantsCard, type StockKind } from './variants-card';

/**
 * The product editor (TENANT-DASHBOARD-DESIGN §7.4, the prototype's `product` and Parts 13 and 14's states): Basics,
 * More settings with Duplicate, Archive and Delete, the product link, one Save, and the question before leaving with
 * something unsaved (Slice 11.7a); options and variants (Slice 11.7b). An archived product opens its own page with
 * Restore.
 */
export function ProductEditor({ productId }: { productId: string | null }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const product = useProduct(productId);
  if (productId !== null && product.isPending) {
    return (
      <ShellPage>
        <Card flush>
          <SkeletonRows count={4} />
        </Card>
      </ShellPage>
    );
  }
  if (productId !== null && product.isError) {
    const missing = product.error instanceof ApiClientError && product.error.code === 'not_found';
    return (
      <ShellPage>
        {missing ? (
          <Card>
            <EmptyState icon="tag">{t('notFound')}</EmptyState>
          </Card>
        ) : (
          <Banner tone="bad">{errorText(product.error)}</Banner>
        )}
      </ShellPage>
    );
  }
  if (product.data?.archived) return <ArchivedProduct product={product.data} />;
  return <ProductPage key={product.data?.id ?? 'new'} product={product.data ?? null} />;
}

/** The ways an edit can stop short: the shop at its limit, or a part the server refused (Part 13). */
type Stop =
  | { kind: 'limit'; refused: boolean }
  | { kind: 'parts'; parts: { part: string; message: string }[] };

function ProductPage({ product }: { product: ProductDetail | null }): React.JSX.Element {
  const { t, i18n } = useTranslation('shop');
  const fieldNames = useFieldNames();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug, viewer, showToast } = useShell();
  const mayManage = allows(viewer, [Permission.ProductsManage]);
  const [saved, setSaved] = useState<ProductForm>(product ? formOf(product) : NEW_PRODUCT);
  const [form, setForm] = useState<ProductForm>(saved);
  const [tried, setTried] = useState(false);
  const [serverProblems, setServerProblems] = useState<Record<string, string>>({});
  // The server's problems with the options, variants and descriptions, by field ("variants.2.sku").
  const [matrixProblems, setMatrixProblems] = useState<Record<string, string>>({});
  const [stop, setStop] = useState<Stop | null>(null);
  const [removing, setRemoving] = useState<'archive' | 'hard' | null>(null);
  const [picking, setPicking] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  // PST-06: the type settings changed by hand, which another type's defaults never overwrite, and the last defaults
  // applied, so a category bringing other ones is told apart.
  const touched = useRef(new Set<TypeSetting>());
  const applied = useRef<ProductDefaults | null>(null);
  const [typeChange, setTypeChange] = useState<{ text: string; before: ProductSettings } | null>(
    null,
  );
  const room = useProductRoom();
  const presets = usePresets();
  const categories = useCategories();
  const attributes = useAttributes();
  // PST-02, PST-06: a new product is what its primary category's type, or the shop's, makes it; either way, its
  // suggested attributes come from there.
  const defaults = useProductDefaults(form.primaryCategoryId);
  const stock = useProductStock(product?.id ?? null, {
    enabled: allows(viewer, [Permission.InventoryRead]),
  });
  const kind: StockKind = {
    tracked: form.settings.stockTracking === StockTracking.Tracked,
    batch: form.settings.batchTracked,
    serial: form.settings.serialTracked,
    format: form.settings.serialFormat,
    unit: form.settings.stockUnit,
  };
  const create = useCreateProduct();
  const save = useSaveProduct(product?.id ?? '');
  const duplicate = useDuplicateProduct(product?.id ?? '');
  const remove = useRemoveProduct(product?.id ?? '');
  // Set once the page itself leaves (after a save, a copy or a removal), so nothing asks first.
  const leaving = useRef(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  // MED-03: each item joins the photos, or becomes the video, once prepared.
  const media = useProductMedia(product, (item) => {
    setForm((current) =>
      item.kind === MediaKind.Video
        ? { ...current, videoId: item.id }
        : { ...current, imageIds: [...current.imageIds, item.id] },
    );
  });
  const photos = form.imageIds.flatMap((id) => {
    const item = media.items.get(id);
    return item ? [item] : [];
  });
  const video = (form.videoId ? media.items.get(form.videoId) : undefined) ?? null;
  const uploading = media.uploads.some((each) => each.stage !== 'refused');

  /**
   * PRD-11, agreed 2026-10-27: what the product let go of, and what this visit uploaded and left unsaved, deleted when
   * nothing else shows it; `keep` is what the product still has or the form still holds.
   */
  function forget(keep: readonly (string | null)[], from: readonly (string | null)[]): void {
    const kept = new Set(keep);
    void unusedMedia.forget(
      [...from, ...media.madeHere].filter((id): id is string => id !== null && !kept.has(id)),
    );
  }

  const dirty = isDirty(saved, form) || uploading;
  const blocker = useBlocker({
    shouldBlockFn: () => !leaving.current && dirty,
    enableBeforeUnload: () => !leaving.current && dirty,
    withResolver: true,
  });

  // PRD-04 (agreed 2026-10-27): a new product at the limit is said on the list, before anything is typed.
  useEffect(() => {
    if (product === null && room.data?.full) {
      leaving.current = true;
      void navigate({
        to: '/$shop/products',
        params: { shop: slug },
        search: { limit: true },
        replace: true,
      });
    }
  }, [product, room.data?.full, navigate, slug]);

  const presetOf = (key: string | null | undefined) => {
    const preset = presets.data?.find((each) => each.key === (key ?? 'other'));
    return preset ? (i18n.language === 'bn' ? preset.labelBn : preset.labelEn) : '';
  };

  /** PST-06: what another type's defaults moved, in the shop's words, the last joined by "and". */
  function changeText(
    moved: readonly TypeSetting[],
    upFront: readonly ProductFormField[],
    settings: ProductSettings,
  ): string {
    const kind = settings.serialFormat === SerialFormat.Imei ? t('imei') : t('anyCode');
    const items = moved.flatMap((key): string[] => {
      switch (key) {
        case 'stockTracking':
          return [settings.stockTracking === StockTracking.Tracked ? t('chTracked') : t('chMto')];
        case 'stockUnit':
          return [t('chUnit', { unit: t(`unitName_${settings.stockUnit}`) })];
        case 'lowStockThreshold':
          return [t('chLow', { n: settings.lowStockThreshold })];
        case 'batchTracked':
          return [settings.batchTracked ? t('chBatchOn') : t('chBatchOff')];
        case 'serialTracked':
          return [settings.serialTracked ? t('chSerialOn', { format: kind }) : t('chSerialOff')];
        case 'serialFormat':
          return moved.includes('serialTracked') || !settings.serialTracked
            ? []
            : [t('chSerialOn', { format: kind })];
      }
    });
    // A field whose setting moved is said once, by what it now is ("serials turned on (IMEI)"); its name mid-sentence.
    const said = new Set<string>(moved);
    items.push(
      ...upFront
        .filter((field) => !said.has(field))
        .map((field) => {
          const name = fieldNames[field];
          return t('chUpfront', { field: name.charAt(0).toLowerCase() + name.slice(1) });
        }),
    );
    return items.length > 1
      ? `${items.slice(0, -1).join(', ')}${t('chAnd')}${items[items.length - 1] ?? ''}`
      : (items[0] ?? '');
  }

  // PST-02, PST-06: a new product starts with its type's defaults, and takes another type's when its category brings
  // them -- except what was changed by hand -- saying what moved, with Undo. A saved product never follows them.
  useEffect(() => {
    const next = defaults.data;
    if (product !== null || !next) return;
    const before = applied.current;
    if (before?.presetKey === next.presetKey && before.fromCategoryId === next.fromCategoryId)
      return;
    applied.current = next;
    const { settings, moved } = applyDefaults(form.settings, next, touched.current);
    const upFront = before
      ? next.upFrontFields.filter((field) => !before.upFrontFields.includes(field))
      : [];
    const category = categories.data?.find((each) => each.id === next.fromCategoryId);
    if (before && category && (moved.length > 0 || upFront.length > 0)) {
      setTypeChange({
        text: t('typeApplied', {
          category: category.name,
          type: presetOf(next.presetKey),
          changes: changeText(moved, upFront, settings),
        }),
        before: form.settings,
      });
    } else setTypeChange(null);
    setForm((current) => ({ ...current, settings }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults.data, product]);

  /** A setting typed: one the type sets is the seller's from now on (PST-06). */
  function updateSettings(patch: Partial<ProductSettings>): void {
    for (const key of TYPE_SETTINGS) if (key in patch) touched.current.add(key);
    setForm((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
    setServerProblems({});
    setMatrixProblems({});
  }

  // INV-02: made to order holds no batches or serials; one holding stock asks first.
  const tracking = useTrackingChoice({
    name: form.name.trim() || (product?.name ?? ''),
    product,
    stock: stock.data,
    onTracking: (stockTracking) => {
      updateSettings(
        stockTracking === StockTracking.NotTracked
          ? { stockTracking, batchTracked: false, serialTracked: false }
          : { stockTracking },
      );
    },
  });

  /** PRD-17: the nearest category, the primary one or one above it, with a chart of its own. */
  const categoryChart = ((): { name: string } | null => {
    const list = categories.data ?? [];
    let id = form.primaryCategoryId;
    while (id) {
      const found = list.find((each) => each.id === id);
      if (!found) return null;
      if (found.sizeChart || found.sizeChartImage) return { name: found.name };
      id = found.parentId;
    }
    return null;
  })();
  const chartText = form.chart.own
    ? t('chartOwnShort')
    : categoryChart
      ? `${t('chartUses')} · ${categoryChart.name}`
      : t('chartNone');
  const suggestedNames = (defaults.data?.suggestedAttributeIds ?? []).flatMap((id) => {
    const found = attributes.data?.find((each) => each.id === id);
    return found ? [found.name] : [];
  });

  // UOM-03, INV-14: a serial is one per unit, so a measured unit cannot carry them.
  const measuredSerials =
    form.settings.serialTracked &&
    form.settings.stockTracking === StockTracking.Tracked &&
    isMeasured(form.settings.stockUnit);
  const own = problemsOf(form);
  const problems: Record<string, string | undefined> = {
    name: tried && own.name ? t('errName') : serverProblems.name,
    price:
      tried && own.price
        ? t(own.price === 'required' ? 'errPrice' : 'errNotAPrice')
        : serverProblems.basePrice,
    description: serverProblems.description,
    category: serverProblems.categoryIds ?? serverProblems.primaryCategoryId,
    unit: measuredSerials
      ? t('errSerialMeasured')
      : (serverProblems.stockUnit ?? serverProblems.serialTracked),
    low: serverProblems.lowStockThreshold,
    // The one variant's stock on the shelf, with its batch, cost or serials (INV-03, INV-12, INV-14).
    opening: Object.entries(serverProblems).find(([key]) =>
      key.startsWith('variants.0.opening'),
    )?.[1],
    weight: serverProblems.weightKg,
    charge: serverProblems.deliveryCharge,
    zones: serverProblems.deliveryZoneIds ?? serverProblems.zoneIds,
    policy: serverProblems.advanceAmount ?? serverProblems.paymentPolicy,
    // ATR-14: past 100 variants at once; a splitting attribute with no option yet once Save is tried.
    variants:
      overLimit(form.splits) || (tried && form.splits.some((each) => each.options.length === 0))
        ? 'variants'
        : undefined,
    rows: Object.keys(matrixProblems).length > 0 ? 'rows' : undefined,
  };
  const count = Object.values(problems).filter(Boolean).length;

  function update(patch: Partial<ProductForm>): void {
    setForm((current) => ({ ...current, ...patch }));
    setServerProblems({});
    setMatrixProblems({});
  }

  function leaveTo(to: '/$shop/products' | '/$shop/products/$productId', productId?: string): void {
    leaving.current = true;
    if (to === '/$shop/products') void navigate({ to, params: { shop: slug } });
    else void navigate({ to, params: { shop: slug, productId: productId ?? '' } });
  }

  const savedWords = (done: ProductDetail): string =>
    done.active ? t('savedLive', { name: done.name }) : t('saved');

  function submit(): void {
    setTried(true);
    setStop(null);
    if (own.name || own.price || overLimit(form.splits) || measuredSerials) return;
    if (form.splits.some((each) => each.options.length === 0)) return;
    if (product === null) {
      create.mutate(createBody(form), {
        onSuccess: (made) => {
          forget([...made.images.map((image) => image.id), made.video?.id ?? null], []);
          showToast(savedWords(made));
          leaveTo('/$shop/products');
        },
        onError: (error) => {
          if (error instanceof ApiClientError && error.code === 'plan_limit_reached') {
            setStop({ kind: 'limit', refused: true });
          } else if (error instanceof ApiClientError) {
            const fields = error.fieldProblems();
            setServerProblems(fields);
            setMatrixProblems(matrixOf(fields));
          }
        },
      });
      return;
    }
    const parts = changedParts(saved, form);
    if (parts.length === 0) return;
    save.mutate(parts, {
      onSuccess: (outcome) => {
        const refused = new Set(outcome.refused.map((each) => each.part));
        const next = withSaved(
          saved,
          form,
          parts.map((each) => each.part).filter((part) => !refused.has(part)),
          outcome.product,
        );
        setSaved(next);
        // The variants this save made are saved ones now.
        setForm((current) => ({
          ...current,
          variants: withIds(current.variants, outcome.product),
        }));
        forget(
          [...next.imageIds, next.videoId, ...form.imageIds, form.videoId],
          [...saved.imageIds, saved.videoId],
        );
        const fields = outcome.refused.find((each) => each.part === 'fields');
        if (fields?.error instanceof ApiClientError)
          setServerProblems(fields.error.fieldProblems());
        setMatrixProblems(
          Object.assign(
            {},
            ...outcome.refused
              .filter((each) => each.part === 'variants' || each.part === 'attributes')
              .map((each) =>
                each.error instanceof ApiClientError ? matrixOf(each.error.fieldProblems()) : {},
              ),
          ) as Record<string, string>,
        );
        const named = outcome.refused.filter(
          (each) =>
            !(
              (each.part === 'fields' || each.part === 'variants' || each.part === 'attributes') &&
              each.error instanceof ApiClientError &&
              Object.keys(each.error.fieldProblems()).length > 0
            ),
        );
        if (named.length > 0) {
          setStop({
            kind: 'parts',
            parts: named.map((each) => ({ part: each.part, message: errorText(each.error) })),
          });
        } else if (outcome.refused.length === 0 && outcome.product) {
          showToast(savedWords(outcome.product));
        }
      },
    });
  }

  function copy(): void {
    if (room.data?.full) {
      setStop({ kind: 'limit', refused: false });
      return;
    }
    duplicate.mutate(undefined, {
      onSuccess: (made) => {
        showToast(t('peCopied'));
        leaveTo('/$shop/products/$productId', made.id);
      },
      onError: (error) => {
        if (error instanceof ApiClientError && error.code === 'plan_limit_reached') {
          setStop({ kind: 'limit', refused: false });
        }
      },
    });
  }

  const busy = create.isPending || save.isPending;
  const title = product ? product.name : t('newProduct');
  return (
    <ShellPage
      title={title}
      actions={product ? <StockTag state={product.stockState} /> : undefined}
    >
      {defaults.data ? (
        <DefaultsLine
          type={presetOf(defaults.data.presetKey)}
          onChange={
            product
              ? null
              : () => {
                  setPicking(true);
                }
          }
        />
      ) : null}
      {typeChange ? (
        <TypeBanner
          text={typeChange.text}
          onUndo={() => {
            const before = typeChange.before;
            setForm((current) => ({ ...current, settings: before }));
            setTypeChange(null);
          }}
        />
      ) : null}
      {stop?.kind === 'limit' && room.data ? (
        <ProductLimitBanner room={room.data} lead={stop.refused ? 'refused' : 'now'} />
      ) : null}
      {stop?.kind === 'parts'
        ? stop.parts.map((each) => (
            <Banner key={each.part} tone="bad">
              <b>{t(PART_WORDS[each.part] ?? 'partFields')}</b> {each.message} {t('partRest')}
            </Banner>
          ))
        : null}
      {count > 0 ? (
        <Banner tone="bad">{count === 1 ? t('fixOne') : t('fixMany', { n: count })}</Banner>
      ) : null}
      {media.storageFull && media.storage ? <StorageFullBanner storage={media.storage} /> : null}
      {create.isError && !(create.error instanceof ApiClientError) ? (
        <Banner tone="bad">{errorText(create.error)}</Banner>
      ) : null}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <BasicsCard
            form={form}
            problems={problems}
            readOnly={!mayManage}
            picking={picking}
            onPicking={setPicking}
            onChange={update}
            strip={
              <PhotoStrip
                photos={photos}
                video={video}
                uploads={media.uploads}
                storage={media.storage}
                readOnly={!mayManage}
                onOpen={() => {
                  setMediaOpen(true);
                }}
                onAddPhotos={media.addPhotos}
                onAddVideo={media.addVideo}
                onDismiss={media.dismiss}
              />
            }
          />
          {defaults.data ? (
            <UpfrontCard
              title={presetOf(defaults.data.presetKey)}
              fields={defaults.data.upFrontFields}
              settings={form.settings}
              chartText={chartText}
              readOnly={!mayManage}
              onSettings={updateSettings}
              onTracking={tracking.choose}
              onChart={() => {
                setChartOpen(true);
              }}
            />
          ) : null}
          <VariantsCard
            form={form}
            saved={saved}
            product={product}
            kind={kind}
            suggestedIds={defaults.data?.suggestedAttributeIds ?? []}
            stock={stock.data}
            readOnly={!mayManage}
            problems={matrixProblems}
            onChange={update}
          />
          <StockDeliveryCard
            form={form}
            product={product}
            shopDefault={defaults.data?.shopPaymentPolicy ?? null}
            readOnly={!mayManage}
            errors={problems}
            onTracking={tracking.choose}
            onSettings={updateSettings}
            onChange={update}
          />
          <MoreSettings
            active={form.active}
            upFront={defaults.data?.upFrontFields ?? []}
            settings={form.settings}
            single={form.splits.length === 0 ? form.single : null}
            chartText={chartText}
            readOnly={!mayManage}
            busy={duplicate.isPending}
            onActive={(active) => {
              update({ active });
            }}
            onSettings={updateSettings}
            onSingle={(patch) => {
              update({ single: { ...form.single, ...patch } });
            }}
            onChart={() => {
              setChartOpen(true);
            }}
            onDuplicate={product ? copy : null}
            onRemove={product ? setRemoving : null}
          />
        </div>
        <div className="flex flex-col gap-4">
          {product ? <LinkCard product={product} readOnly={!mayManage} /> : null}
          {defaults.data ? <WhyCard defaults={defaults.data} suggested={suggestedNames} /> : null}
        </div>
      </div>
      {mayManage ? (
        <ActionBar>
          <Button busy={busy} onClick={submit}>
            {count > 0 ? (count === 1 ? t('fixOne') : t('fixMany', { n: count })) : t('save')}
          </Button>
        </ActionBar>
      ) : null}
      {product ? (
        <RemoveDialog
          open={removing}
          busy={remove.isPending}
          onClose={() => {
            setRemoving(null);
          }}
          onRemove={(hard) => {
            remove.mutate(hard, {
              onSuccess: () => {
                if (hard) forget([], [...saved.imageIds, saved.videoId]);
                setRemoving(null);
                showToast(t(hard ? 'peDeletedToast' : 'peArchivedToast', { name: product.name }));
                leaveTo('/$shop/products');
              },
            });
          }}
          error={remove.isError ? errorText(remove.error) : null}
        />
      ) : null}
      <SizeChartSheet
        open={chartOpen}
        chart={form.chart}
        category={categoryChart}
        readOnly={!mayManage}
        onDone={(chart) => {
          setChartOpen(false);
          update({ chart });
        }}
        onClose={() => {
          setChartOpen(false);
        }}
      />
      {tracking.question}
      <MediaSheet
        open={mediaOpen}
        photos={photos}
        video={video}
        uploads={media.uploads}
        storage={media.storage}
        storageFull={media.storageFull}
        readOnly={!mayManage}
        onReorder={(imageIds) => {
          update({ imageIds });
        }}
        onRemove={(id) => {
          if (id === form.videoId) update({ videoId: null });
          else update({ imageIds: form.imageIds.filter((each) => each !== id) });
        }}
        onDismiss={media.dismiss}
        onAddPhotos={media.addPhotos}
        onAddVideo={media.addVideo}
        onClose={() => {
          setMediaOpen(false);
        }}
      />
      <Dialog
        open={blocker.status === 'blocked'}
        title={t('lvTitle')}
        onClose={() => {
          if (blocker.status === 'blocked') blocker.reset();
        }}
        actions={
          <>
            <Button
              tone="outline"
              onClick={() => {
                if (blocker.status === 'blocked') blocker.reset();
              }}
            >
              {t('lvStay')}
            </Button>
            <Button
              tone="danger"
              onClick={() => {
                leaving.current = true;
                forget([...saved.imageIds, saved.videoId], []);
                if (blocker.status === 'blocked') blocker.proceed();
              }}
            >
              {t('lvLeave')}
            </Button>
          </>
        }
      >
        {product ? t('lvEdit', { name: product.name }) : t('lvNew')}
      </Dialog>
    </ShellPage>
  );
}

/** A part the server refused, by name (Part 13's `product-partial`). */
const PART_WORDS: Record<string, string> = {
  fields: 'partFields',
  variants: 'partVariants',
  attributes: 'partAttributes',
  zones: 'partZones',
  chart: 'partChart',
  images: 'partImages',
  video: 'partVideo',
};

/** The server's problems with the options, variants and descriptions, out of all it found. */
function matrixOf(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([field]) =>
        field.startsWith('variants') ||
        field.startsWith('variantAttributes') ||
        field.startsWith('attributes') ||
        field.startsWith('sharedOpeningStock'),
    ),
  );
}
