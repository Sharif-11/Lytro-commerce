import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  designLabels,
  designSplit,
  mayHaveDesigns,
  photosOf,
  withChoice,
  withDesignSplit,
  withName,
  withoutPhoto,
  withPhotos,
  type DesignState,
  type PhotoChoice,
} from '@/lib/photo-designs';
import type { ProductForm } from '@/lib/product-form';
import type { VariantRow } from '@/lib/variant-matrix';
import type { ProductStock } from '@/types/attribute';
import type { ProductDetail } from '@/types/product';
import type { SheetDesigns } from './media-sheet';
import type { MediaItem } from './product-media';

/** What the editor needs to place photos into designs (PD-3, PD-11): read afresh by callbacks that run later. */
interface Context {
  designAttributeId: string | null;
  combo: boolean;
  hasOrders: boolean;
  holdsStock: boolean;
  nextNumber: number;
  word: string;
  savedRows: readonly VariantRow[];
}

/** Whether the product's variants hold any stock, its shared stock included. */
function holds(stock: ProductStock | undefined): boolean {
  if (!stock) return false;
  if (stock.shared && Number(stock.shared.onHand) > 0) return true;
  return stock.variants.some((row) => !row.retired && Number(row.onHand ?? 0) > 0);
}

/** The form with these photos and designs, its design split and its rows following them (PD-1). */
function designed(current: ProductForm, next: DesignState, c: Context): ProductForm {
  const merged = { ...current, ...next };
  if (c.designAttributeId === null) return merged;
  const had = current.splits.some((split) => split.attributeId === c.designAttributeId);
  if (next.designs.length === 0 && !had) return merged;
  const labels = designLabels(next.designs, c.nextNumber, c.word);
  const split =
    next.designs.length > 0 ? designSplit(next, labels, c.designAttributeId, c.word) : null;
  return {
    ...merged,
    ...withDesignSplit(current.splits, current.variants, c.savedRows, c.designAttributeId, split),
  };
}

/** A design's last photo going, while its variants hold stock: asked first (`dlg-pd-retire`); or refused (ATR-15). */
type Asking =
  | { kind: 'retire'; photoId: string; design: string; variants: number; stock: number }
  | { kind: 'last' };

/**
 * ATR-19 (TENANT-DASHBOARD-DESIGN §7.42, Part 40): a product's photos as its designs in the editor. A new photo is a
 * design of its own (PD-3), except on a combo, on a product with orders and no designs (PD-11, ATR-15), or on one whose
 * variants hold stock and that has no designs yet; the design split follows the designs; a design's last photo going
 * asks first when its variants hold stock; a product with orders keeps its last design.
 */
export function usePhotoDesigns(o: {
  form: ProductForm;
  setForm: Dispatch<SetStateAction<ProductForm>>;
  saved: ProductForm;
  product: ProductDetail | null;
  designAttributeId: string | null;
  combo: boolean;
  stock: ProductStock | undefined;
  items: ReadonlyMap<string, MediaItem>;
  onChange: () => void;
}) {
  const { t } = useTranslation('shop');
  const context: Context = {
    designAttributeId: o.designAttributeId,
    combo: o.combo,
    hasOrders: o.product?.hasOrders ?? false,
    holdsStock: holds(o.stock),
    nextNumber: o.product?.nextDesignNumber ?? 1,
    word: t('pdDesign'),
    savedRows: o.saved.variants,
  };
  // Photos finish preparing after this render; they read the editor as it then is.
  const latest = useRef(context);
  latest.current = context;
  const [asking, setAsking] = useState<Asking | null>(null);
  const labels = designLabels(o.form.designs, context.nextNumber, context.word);

  const change = (next: (current: ProductForm) => DesignState): void => {
    o.setForm((current) => designed(current, next(current), latest.current));
    o.onChange();
  };

  /** PD-3: a photo just prepared joins the product, as a design of its own when it may be one. */
  function addPhoto(id: string): void {
    o.setForm((current) => {
      const c = latest.current;
      const may = mayHaveDesigns({
        combo: c.combo,
        hasOrders: c.hasOrders,
        designs: current.designs.length,
        splits: current.splits,
        designAttributeId: c.designAttributeId,
      });
      // PD-11: no designs yet and stock on the shelf: new photos stay plain until one is made a design.
      const asDesign = may && !(current.designs.length === 0 && c.holdsStock);
      return designed(current, withPhotos(current, [id], asDesign), c);
    });
  }

  const hasDesigns = o.form.designs.length > 0;
  /** ATR-15: a product with orders keeps its last design, so that design's last photo stays one. */
  const mayBePlain = (photoId: string): boolean => {
    if (!context.hasOrders || o.form.designs.length !== 1) return true;
    const key = o.form.photoDesigns[photoId] ?? null;
    return key === null || photosOf(o.form, key).length > 1;
  };

  function removePhoto(photoId: string): void {
    const key = o.form.photoDesigns[photoId] ?? null;
    const design = key === null ? undefined : o.form.designs.find((each) => each.key === key);
    const last = key !== null && photosOf(o.form, key).length === 1;
    if (last && !mayBePlain(photoId)) {
      setAsking({ kind: 'last' });
      return;
    }
    // A saved design's last photo, while its variants hold stock: they stop selling, so ask first.
    if (last && design?.id && o.stock) {
      const rows = o.stock.variants.filter(
        (row) => !row.retired && row.optionIds.includes(String(design.id)),
      );
      const stock = rows.reduce((sum, row) => sum + Number(row.onHand ?? 0), 0);
      if (stock > 0) {
        setAsking({
          kind: 'retire',
          photoId,
          design: labels.get(design.key) ?? design.name,
          variants: rows.length,
          stock,
        });
        return;
      }
    }
    change((current) => withoutPhoto(current, photoId));
  }

  const others = o.form.splits.filter((split) => split.attributeId !== o.designAttributeId);
  const variantsEach = others.reduce(
    (count, split) => count * Math.max(split.options.length, 1),
    1,
  );
  const fresh = o.form.designs.filter((design) => design.id === null).length;
  const added = o.form.imageIds.some((id) => !o.saved.imageIds.includes(id));
  const locked = !o.combo && o.designAttributeId !== null && context.hasOrders && !hasDesigns;

  const sheet: SheetDesigns | null =
    o.combo || o.designAttributeId === null
      ? null
      : {
          keyOf: (photoId) => o.form.photoDesigns[photoId] ?? null,
          list: o.form.designs.map((design) => {
            const photos = photosOf(o.form, design.key);
            return {
              key: design.key,
              label: labels.get(design.key) ?? design.name,
              name: design.name,
              cover: o.items.get(photos[0] ?? ''),
              photos: photos.length,
              fresh: design.id === null,
            };
          }),
          locked: locked && added,
          holdsStock: context.holdsStock,
          mayBePlain,
          fresh: fresh > 0 ? { count: fresh, variants: variantsEach } : null,
          onChoose: (photoId: string, choice: PhotoChoice) => {
            if (locked) return;
            change((current) => withChoice(current, photoId, choice));
          },
          onRename: (key: string, name: string) => {
            change((current) => withName(current, key, name));
          },
        };
  // `locked` greys the choices whenever the product has orders and no designs, new photos or not.
  if (sheet && locked) sheet.locked = true;

  const dialog = (
    <Dialog
      open={asking !== null}
      title={
        asking?.kind === 'retire' ? t('pdRetireT', { design: asking.design }) : t('pdLastDesignT')
      }
      onClose={() => {
        setAsking(null);
      }}
      actions={
        asking?.kind === 'retire' ? (
          <>
            <Button
              tone="outline"
              onClick={() => {
                setAsking(null);
              }}
            >
              {t('keep')}
            </Button>
            <Button
              tone="danger"
              onClick={() => {
                const photoId = asking.photoId;
                setAsking(null);
                change((current) => withoutPhoto(current, photoId));
              }}
            >
              {t('remove')}
            </Button>
          </>
        ) : (
          <Button
            onClick={() => {
              setAsking(null);
            }}
          >
            {t('pdOk')}
          </Button>
        )
      }
    >
      {asking?.kind === 'retire'
        ? t('pdRetireP', { design: asking.design, variants: asking.variants, stock: asking.stock })
        : t('pdLastDesign')}
    </Dialog>
  );

  return {
    labels,
    sheet,
    dialog,
    addPhoto,
    removePhoto,
    reorder: (imageIds: string[]) => {
      o.setForm((current) => ({ ...current, imageIds }));
      o.onChange();
    },
  };
}
