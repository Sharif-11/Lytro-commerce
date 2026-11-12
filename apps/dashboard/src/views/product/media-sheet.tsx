import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MediaKind, PRODUCT_IMAGES_MAX } from '@lytronix/validators';
import { readPastOrders } from '@/api/media';
import { Icon } from '@/components/icon';
import { RadioMark } from '@/components/ui/kv';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { formatDuration } from '@/lib/dates';
import { fileSize, usageSize } from '@/lib/limits';
import type { PhotoChoice } from '@/lib/photo-designs';
import type { StorageUsage } from '@/types/media';
import type { MediaItem, Uploading } from './product-media';
import { StorageFullBanner } from './storage-full-banner';
import { UploadTile } from './upload-tile';

/** One design as the photos sheet lists it (PD-14): its key, its name as shown and as typed, its cover, its photos. */
export interface SheetDesign {
  key: string;
  label: string;
  /** The name as typed; empty for a new design not named, whose box shows `label` as its hint. */
  name: string;
  cover: MediaItem | undefined;
  photos: number;
  /** Made by this edit, not saved yet: its photos are outlined (`pd-photos-new`). */
  fresh: boolean;
}

/**
 * ATR-19 (TENANT-DASHBOARD-DESIGN §7.42): the photos sheet's designs (PD-2, PD-3, PD-11, PD-14); null where a product
 * offers none (a combo).
 */
export interface SheetDesigns {
  /** The design each photo shows, by key; null for a plain photo. */
  keyOf: (photoId: string) => string | null;
  list: SheetDesign[];
  /** PD-11: a product with orders and no designs: new photos stay plain, a photo can't become a design. */
  locked: boolean;
  /** No designs yet and its variants hold stock: making a design remakes its variants. */
  holdsStock: boolean;
  /** ATR-15: a product with orders keeps its last design, so that design's last photo can't become plain. */
  mayBePlain: (photoId: string) => boolean;
  /** PD-3: the new designs this edit made from added photos, and the variants each starts with at 0. */
  fresh: { count: number; variants: number } | null;
  onChoose: (photoId: string, choice: PhotoChoice) => void;
  onRename: (key: string, name: string) => void;
}

/**
 * Photos and video (TENANT-DASHBOARD-DESIGN §7.23, the prototype's `sh-media` and Part 13): the photos in order, the
 * first the cover, dragged to reorder by touch, mouse or keyboard (`@dnd-kit`, agreed for 11.7a), each with its
 * remove; the uploads under way; Add photo; the video with its length, size and poster, Replace and Remove; the storage
 * line with this product's share; and what deleting does. Storage full shows the banner with its ways out. With
 * designs (§7.42, Part 40): each photo's design under it, a photo's own step, and the designs with their names.
 */
export function MediaSheet({
  open,
  photos,
  video,
  uploads,
  storage,
  storageFull,
  readOnly,
  designs,
  onReorder,
  onRemove,
  onDismiss,
  onAddPhotos,
  onAddVideo,
  onClose,
}: {
  open: boolean;
  photos: MediaItem[];
  video: MediaItem | null;
  uploads: Uploading[];
  storage: StorageUsage | undefined;
  storageFull: boolean;
  readOnly: boolean;
  designs: SheetDesigns | null;
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
  onDismiss: (key: string) => void;
  onAddPhotos: (files: File[]) => void;
  onAddVideo: (file: File) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // PD-8 (Part 40's `pd-photos-kept`): the orders that show each photo taken off in this sitting, which keep it.
  const [kept, setKept] = useState<ReadonlyMap<string, number>>(new Map());
  // `pd-photo`: the photo whose own step is open.
  const [choosing, setChoosing] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setKept(new Map());
      setChoosing(null);
    }
  }, [open]);
  const ids = photos.map((photo) => photo.id);
  const pastOrders = [...kept].reduce(
    (sum, [id, orders]) => (ids.includes(id) ? sum : sum + orders),
    0,
  );
  const product = [...photos, ...(video ? [video] : [])].reduce((sum, item) => sum + item.bytes, 0);
  const room =
    photos.length + uploads.filter((each) => each.kind === MediaKind.Image).length <
    PRODUCT_IMAGES_MAX;

  // Where a photo is, counted from 1, for what a screen reader hears while it moves.
  const placeOf = (id: string | number | undefined): number => ids.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('mmPicked', { n: placeOf(active.id) }),
    // Its own place, as it is picked up, says nothing new.
    onDragOver: ({ active, over }) =>
      over && over.id !== active.id
        ? t('mmOver', { n: placeOf(active.id), place: placeOf(over.id) })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t('mmDropped', { n: placeOf(active.id), place: placeOf(over.id) })
        : t('mmBack', { n: placeOf(active.id) }),
    onDragCancel: ({ active }) => t('mmBack', { n: placeOf(active.id) }),
  };

  function moved(event: DragEndEvent): void {
    const from = ids.indexOf(String(event.active.id));
    const to = event.over ? ids.indexOf(String(event.over.id)) : -1;
    if (from >= 0 && to >= 0 && from !== to) onReorder(arrayMove(ids, from, to));
  }

  const chosenPhoto = choosing === null ? undefined : photos.find((each) => each.id === choosing);
  if (designs && chosenPhoto) {
    const back = () => {
      setChoosing(null);
    };
    return (
      <Sheet
        open={open}
        title={t('mmPhoto', { n: ids.indexOf(chosenPhoto.id) + 1 })}
        onBack={back}
        onClose={onClose}
        footer={
          <Button wide onClick={back}>
            {t('done')}
          </Button>
        }
      >
        <PhotoChoiceStep photo={chosenPhoto} designs={designs} />
      </Sheet>
    );
  }

  const designOf = (photoId: string): SheetDesign | null => {
    const key = designs?.keyOf(photoId) ?? null;
    return key === null ? null : (designs?.list.find((each) => each.key === key) ?? null);
  };
  return (
    <Sheet
      open={open}
      title={t('mmTitle')}
      onClose={onClose}
      footer={
        <Button wide onClick={onClose}>
          {t('done')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {storageFull && storage ? <StorageFullBanner storage={storage} /> : null}
        {pastOrders > 0 ? (
          <Banner tone="info">
            <b>{t('mmKeptT', { count: pastOrders })}</b>
            <br />
            {t('mmKeptP')}
          </Banner>
        ) : null}
        {designs?.locked ? <Banner tone="info">{t('pdLocked')}</Banner> : null}
        {designs?.fresh ? (
          <Banner tone="info">
            {designs.fresh.variants > 1
              ? t('pdAddedEach', { count: designs.fresh.count, variants: designs.fresh.variants })
              : t('pdAdded', { count: designs.fresh.count })}
          </Banner>
        ) : null}
        <p className="text-[14px] text-fg-muted">{t('mmDragHint', { max: PRODUCT_IMAGES_MAX })}</p>
        {designs && !designs.locked ? (
          <p className="-mt-1 text-[14px] text-fg-muted">{t('pdNewIsDesign')}</p>
        ) : null}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={moved}
          accessibility={{
            announcements,
            screenReaderInstructions: { draggable: t('mmDragHelp') },
          }}
        >
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, index) => {
                const design = designOf(photo.id);
                return (
                  <PhotoTile
                    key={photo.id}
                    photo={photo}
                    index={index}
                    readOnly={readOnly}
                    caption={
                      designs
                        ? {
                            text: design ? design.label : t('pdPlain'),
                            plain: design === null,
                            fresh: design?.fresh ?? false,
                            onOpen: () => {
                              setChoosing(photo.id);
                            },
                          }
                        : null
                    }
                    onRemove={() => {
                      onRemove(photo.id);
                      void readPastOrders(photo.id).then((orders) => {
                        if (orders > 0) setKept((was) => new Map(was).set(photo.id, orders));
                      });
                    }}
                  />
                );
              })}
              {uploads.map((upload) => (
                <UploadTile
                  key={upload.key}
                  upload={upload}
                  storage={storage}
                  square
                  onDismiss={() => {
                    onDismiss(upload.key);
                  }}
                />
              ))}
              {video ? (
                <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-button bg-linear-135 from-neutral-100 to-neutral-200">
                  <img src={video.thumbnail} alt="" className="size-full object-cover" />
                  <span className="absolute top-1.5 right-1.5 rounded-full bg-white/90 px-1.5 text-[11px] font-bold">
                    {t('video')}
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 left-1/2 flex size-[30px] -translate-1/2 items-center justify-center rounded-full bg-[rgba(16,32,31,0.75)] text-[12px] text-white"
                  >
                    ▶
                  </span>
                </span>
              ) : null}
              {readOnly || !room ? null : (
                <button
                  type="button"
                  onClick={() => photoInput.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-button border border-dashed border-line-strong bg-surface text-[12px] text-primary"
                >
                  <Icon name="camera" />
                  {t('addPhoto')}
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
        {designs && designs.list.length > 0 ? (
          <DesignList designs={designs} readOnly={readOnly} />
        ) : null}
        {video ? (
          <div className="flex items-center gap-3 rounded-card border border-line p-3">
            <span className="size-12 flex-none overflow-hidden rounded-button bg-ink">
              <img src={video.thumbnail} alt="" className="size-full object-cover" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[14px] font-semibold">
                {t('mmVideoLine', {
                  length: formatDuration(video.durationMs ?? 0),
                  size: fileSize(video.bytes),
                })}
              </span>
              <span className="text-[14px] text-fg-muted">{t('mmPosterFirst')}</span>
            </span>
            {readOnly ? null : (
              <span className="flex flex-none gap-1">
                <Button tone="outline" size="xs" onClick={() => videoInput.current?.click()}>
                  {t('mmReplace')}
                </Button>
                <Button
                  tone="ghost"
                  size="xs"
                  onClick={() => {
                    onRemove(video.id);
                  }}
                >
                  <span className="text-danger-text">{t('mmRemove')}</span>
                </Button>
              </span>
            )}
          </div>
        ) : null}
        {storage ? (
          <p className="text-[14px] text-fg-muted">
            {storage.limitBytes === null
              ? t('mmStorageOpen', {
                  used: usageSize(storage.usedBytes, null),
                  product: fileSize(product),
                })
              : t('mmStorage', {
                  used: usageSize(storage.usedBytes, storage.limitBytes),
                  limit: usageSize(storage.limitBytes, storage.limitBytes),
                  product: fileSize(product),
                })}
          </p>
        ) : null}
        <p className="text-[14px] text-fg-muted">{t('mmDeleteCons')}</p>
        <input
          ref={photoInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(event) => {
            onAddPhotos([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
        <input
          ref={videoInput}
          type="file"
          accept="video/mp4,video/webm"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onAddVideo(file);
            event.target.value = '';
          }}
        />
      </div>
    </Sheet>
  );
}

/**
 * One photo in the grid (the prototype's `.media-grid .m`): Cover on the first, its place on the others, its remove;
 * with designs, its design's name under it, which opens its own step (Part 40's `.pdcap`).
 */
function PhotoTile({
  photo,
  index,
  readOnly,
  caption,
  onRemove,
}: {
  photo: MediaItem;
  index: number;
  readOnly: boolean;
  caption: { text: string; plain: boolean; fresh: boolean; onOpen: () => void } | null;
  onRemove: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const sortable = useSortable({ id: photo.id, disabled: readOnly });
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={`flex min-w-0 flex-col gap-1.5 ${sortable.isDragging ? 'z-10' : ''}`}
    >
      <div
        className={`relative aspect-square touch-manipulation overflow-hidden rounded-button bg-linear-135 from-neutral-100 to-neutral-200 ${sortable.isDragging ? 'shadow-lg' : ''} ${caption?.fresh ? 'outline-2 -outline-offset-2 outline-primary' : ''}`}
      >
        <button
          type="button"
          aria-label={readOnly ? t('mmPhoto', { n: index + 1 }) : t('mmMove', { n: index + 1 })}
          className="size-full cursor-grab active:cursor-grabbing"
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <img src={photo.thumbnail} alt="" className="size-full object-cover" draggable={false} />
        </button>
        {index === 0 ? (
          <span className="pointer-events-none absolute top-1.5 left-1.5 inline-flex h-5 items-center rounded-full bg-ink px-1.5 text-[11px] font-semibold text-white">
            {t('mmCover')}
          </span>
        ) : (
          <span className="pointer-events-none absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-white/90 text-[11px] font-bold">
            {index + 1}
          </span>
        )}
        {readOnly ? null : (
          <button
            type="button"
            aria-label={t('mmRemovePhoto', { n: index + 1 })}
            onClick={onRemove}
            className="absolute right-1.5 bottom-1.5 flex size-[26px] items-center justify-center rounded-full bg-[rgba(16,32,31,0.75)] text-white"
          >
            <Icon name="trash" size={14} />
          </button>
        )}
      </div>
      {caption ? (
        <button
          type="button"
          disabled={readOnly}
          aria-label={t('pdPhotoIs', { n: index + 1, design: caption.text })}
          onClick={caption.onOpen}
          className={`flex h-[34px] min-w-0 items-center justify-between gap-0.5 rounded-button border border-line-strong bg-surface pr-1 pl-2.5 text-[13px] disabled:cursor-default ${caption.plain ? 'border-dashed font-medium text-fg-muted' : 'font-semibold text-fg'}`}
        >
          <span className="truncate">{caption.text}</span>
          {readOnly ? null : <Icon name="down" size={16} className="flex-none text-fg-muted" />}
        </button>
      ) : null}
    </div>
  );
}

/** PD-14 (Part 40's `.pdlist`): the designs, each by its cover, its name to rename it, and how many photos it has. */
function DesignList({
  designs,
  readOnly,
}: {
  designs: SheetDesigns;
  readOnly: boolean;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <div className="flex flex-col">
      <h3 className="mt-1 mb-1 text-[16px] font-semibold">
        {t('pdListT', { count: designs.list.length })}
      </h3>
      <p className="mb-2 text-[14px] text-fg-muted">{t('pdListHint')}</p>
      <div className="flex flex-col rounded-card border border-line bg-surface">
        {designs.list.map((design) => (
          <div
            key={design.key}
            className="flex min-h-16 items-center gap-3 border-line px-4 py-2 [&+&]:border-t"
          >
            <span className="h-[50px] w-10 flex-none overflow-hidden rounded-button bg-neutral-100">
              {design.cover ? (
                <img src={design.cover.thumbnail} alt="" className="size-full object-cover" />
              ) : null}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <input
                type="text"
                value={design.name}
                placeholder={design.label}
                readOnly={readOnly}
                maxLength={100}
                aria-label={t('pdNameOf', { design: design.label })}
                onChange={(event) => {
                  designs.onRename(design.key, event.target.value);
                }}
                className="h-9 w-full max-w-[220px] rounded-button border border-line-strong bg-surface px-2.5 text-[15px] font-medium text-fg placeholder:text-fg-muted"
              />
              <span className="text-[14px] text-fg-muted">
                {t('pdPhotos', { count: design.photos })}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * PD-2, PD-3, PD-11 (Part 40's `pd-photo`): what one photo is -- its own design, another angle of a design picked by its
 * cover, or not a design. A product with orders and no designs greys the first two (`pd-photo-locked`).
 */
function PhotoChoiceStep({
  photo,
  designs,
}: {
  photo: MediaItem;
  designs: SheetDesigns;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const current = designs.keyOf(photo.id);
  const alone = current !== null && designs.list.find((each) => each.key === current)?.photos === 1;
  const others = designs.list.filter((each) => !(alone && each.key === current));
  const chosen: PhotoChoice['kind'] = current === null ? 'not' : alone ? 'own' : 'same';
  const mayBePlain = designs.mayBePlain(photo.id);
  const choose = (choice: PhotoChoice): void => {
    designs.onChoose(photo.id, choice);
  };
  const row = (
    kind: PhotoChoice['kind'],
    title: string,
    sub: string,
    off: boolean,
    onPick: () => void,
  ) => (
    <button
      type="button"
      role="radio"
      aria-checked={chosen === kind}
      aria-disabled={off}
      onClick={() => {
        if (!off) onPick();
      }}
      className={`flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left ${off ? 'cursor-default opacity-50' : ''}`}
    >
      <span className="mt-0.5 flex flex-none">
        <RadioMark on={chosen === kind} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium">{title}</span>
        <span className="text-[14px] text-fg-muted">{sub}</span>
      </span>
    </button>
  );
  return (
    <div className="flex flex-col gap-3">
      <span className="aspect-[4/5] w-24 overflow-hidden rounded-[10px] bg-neutral-100">
        <img src={photo.thumbnail} alt="" className="size-full object-cover" />
      </span>
      {designs.locked ? <Banner tone="info">{t('pdLockedWhy')}</Banner> : null}
      {designs.holdsStock && designs.list.length === 0 && !designs.locked ? (
        <Banner tone="warn">{t('pdStockWarn')}</Banner>
      ) : null}
      <h3 className="mt-1 text-[16px] font-semibold">{t('pdWhatIs')}</h3>
      <div
        role="radiogroup"
        aria-label={t('pdWhatIs')}
        className="flex flex-col rounded-card border border-line bg-surface [&>*+*]:border-t [&>*+*]:border-line"
      >
        {row('own', t('pdOwn'), t('pdOwnSub'), designs.locked, () => {
          choose({ kind: 'own' });
        })}
        <div>
          {row('same', t('pdSame'), t('pdSameSub'), designs.locked || others.length === 0, () => {
            const first = others.find((each) => each.key !== current) ?? others[0];
            if (first && chosen !== 'same') choose({ kind: 'same', key: first.key });
          })}
          {chosen === 'same' ? (
            <div className="flex flex-wrap gap-2 px-4 pb-3 pl-[50px]">
              {others.map((design) => {
                const on = design.key === current;
                return (
                  <button
                    key={design.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      choose({ kind: 'same', key: design.key });
                    }}
                    className={`flex h-11 items-center gap-2 rounded-full border pr-3 pl-1.5 text-[14px] font-medium ${on ? 'border-primary bg-info-soft text-fg shadow-[0_0_0_1px_var(--color-primary)]' : 'border-line bg-surface text-fg-muted'}`}
                  >
                    <span className="h-[30px] w-6 flex-none overflow-hidden rounded-[5px] bg-neutral-100">
                      {design.cover ? (
                        <img
                          src={design.cover.thumbnail}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : null}
                    </span>
                    {design.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        {row('not', t('pdNot'), mayBePlain ? t('pdNotSub') : t('pdLastDesign'), !mayBePlain, () => {
          choose({ kind: 'not' });
        })}
      </div>
    </div>
  );
}
