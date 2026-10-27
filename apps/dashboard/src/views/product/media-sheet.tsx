import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
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
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MediaKind, PRODUCT_IMAGES_MAX } from '@lytronix/validators';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { formatDuration } from '@/lib/dates';
import { fileSize, usageSize } from '@/lib/limits';
import type { StorageUsage } from '@/types/media';
import type { MediaItem, Uploading } from './product-media';
import { StorageFullBanner } from './storage-full-banner';
import { UploadTile } from './upload-tile';

/**
 * Photos and video (TENANT-DASHBOARD-DESIGN §7.23, the prototype's `sh-media` and Part 13): the photos in order, the
 * first the cover, dragged to reorder by touch, mouse or keyboard (`@dnd-kit`, agreed for 11.7a), each with its
 * remove; the uploads under way; Add photo; the video with its length, size and poster, Replace and Remove; the storage
 * line with this product's share; and what deleting does. Storage full shows the banner with its ways out.
 */
export function MediaSheet({
  open,
  photos,
  video,
  uploads,
  storage,
  storageFull,
  readOnly,
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
  const ids = photos.map((photo) => photo.id);
  const product = [...photos, ...(video ? [video] : [])].reduce((sum, item) => sum + item.bytes, 0);
  const room =
    photos.length + uploads.filter((each) => each.kind === MediaKind.Image).length <
    PRODUCT_IMAGES_MAX;

  function moved(event: DragEndEvent): void {
    const from = ids.indexOf(String(event.active.id));
    const to = event.over ? ids.indexOf(String(event.over.id)) : -1;
    if (from >= 0 && to >= 0 && from !== to) onReorder(arrayMove(ids, from, to));
  }

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
        <p className="text-[14px] text-fg-muted">{t('mmDragHint', { max: PRODUCT_IMAGES_MAX })}</p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={moved}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, index) => (
                <PhotoTile
                  key={photo.id}
                  photo={photo}
                  index={index}
                  readOnly={readOnly}
                  onRemove={() => {
                    onRemove(photo.id);
                  }}
                />
              ))}
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
                <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[8px] bg-linear-135 from-neutral-100 to-neutral-200">
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
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[8px] border border-dashed border-line-strong bg-surface text-[12px] text-primary"
                >
                  <Icon name="camera" />
                  {t('addPhoto')}
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
        {video ? (
          <div className="flex items-center gap-3 rounded-card border border-line p-3">
            <span className="size-12 flex-none overflow-hidden rounded-[8px] bg-ink">
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

/** One photo in the grid (the prototype's `.media-grid .m`): Cover on the first, its place on the others, its remove. */
function PhotoTile({
  photo,
  index,
  readOnly,
  onRemove,
}: {
  photo: MediaItem;
  index: number;
  readOnly: boolean;
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
      className={`relative aspect-square touch-manipulation overflow-hidden rounded-[8px] bg-linear-135 from-neutral-100 to-neutral-200 ${sortable.isDragging ? 'z-10 shadow-lg' : ''}`}
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
  );
}
