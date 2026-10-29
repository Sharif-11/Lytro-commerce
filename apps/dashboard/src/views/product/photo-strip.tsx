import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { usageSize } from '@/lib/limits';
import type { StorageUsage } from '@/types/media';
import type { MediaItem, Uploading } from './product-media';
import { UploadTile } from './upload-tile';

/** A 72 px tile (the prototype's `.thumb.lg`). */
const TILE =
  'relative flex size-[72px] flex-none items-center justify-center overflow-hidden rounded-button bg-linear-135 from-neutral-100 to-neutral-200 text-neutral-400';
const ADD =
  'flex size-[72px] flex-none flex-col items-center justify-center gap-1 rounded-button border border-dashed border-line-strong bg-surface text-[12px] text-primary';

/**
 * The photos and the video in Basics (the prototype's `pfPhotos` and `pf-media-states`): the photos in order, then the
 * video with its play mark, the uploads under way, Add photo and, while there is none, Add video, in a row that scrolls
 * sideways; with an upload under way, the storage line and the limits under it. A photo or the video opens the media
 * sheet.
 */
export function PhotoStrip({
  photos,
  video,
  uploads,
  storage,
  readOnly,
  onOpen,
  onAddPhotos,
  onAddVideo,
  onDismiss,
}: {
  photos: MediaItem[];
  video: MediaItem | null;
  uploads: Uploading[];
  storage: StorageUsage | undefined;
  readOnly: boolean;
  /** Opens the media sheet; a page that only shows them leaves it out. */
  onOpen?: () => void;
  onAddPhotos: (files: File[]) => void;
  onAddVideo: (file: File) => void;
  onDismiss: (key: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const empty = photos.length === 0 && !video && uploads.length === 0;
  return (
    <div>
      <span className="text-[14px] font-medium text-fg-muted">{t('photosVideo')}</span>
      <div className="-mx-4 mt-1.5 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {photos.map((photo, index) =>
          onOpen ? (
            <button
              key={photo.id}
              type="button"
              aria-label={t('mmPhoto', { n: index + 1 })}
              onClick={onOpen}
              className={TILE}
            >
              <img src={photo.thumbnail} alt="" className="size-full object-cover" />
            </button>
          ) : (
            <span key={photo.id} className={TILE}>
              <img src={photo.thumbnail} alt="" className="size-full object-cover" />
            </span>
          ),
        )}
        {video ? (
          <button
            type="button"
            aria-label={t('video')}
            disabled={!onOpen}
            onClick={onOpen}
            className={TILE}
          >
            <img src={video.thumbnail} alt="" className="size-full object-cover" />
            <span
              aria-hidden="true"
              className="absolute right-1.5 bottom-1.5 flex size-5 items-center justify-center rounded-full bg-[rgba(16,32,31,0.75)] text-[10px] text-white"
            >
              ▶
            </span>
          </button>
        ) : null}
        {uploads.map((upload) => (
          <UploadTile
            key={upload.key}
            upload={upload}
            storage={storage}
            onDismiss={() => {
              onDismiss(upload.key);
            }}
          />
        ))}
        {readOnly ? (
          empty ? (
            <span className={TILE}>
              <Icon name="image" />
            </span>
          ) : null
        ) : (
          <>
            <button type="button" className={ADD} onClick={() => photoInput.current?.click()}>
              <Icon name="camera" />
              {t('addPhoto')}
            </button>
            {video ? null : (
              <button type="button" className={ADD} onClick={() => videoInput.current?.click()}>
                <Icon name="image" />
                {t('addVideo')}
              </button>
            )}
          </>
        )}
      </div>
      {uploads.length > 0 && storage ? (
        <p className="mt-1.5 text-[14px] text-fg-muted">
          {t('stripStorage', {
            used: usageSize(storage.usedBytes, storage.limitBytes),
            limit:
              storage.limitBytes === null ? '∞' : usageSize(storage.limitBytes, storage.limitBytes),
            image: storage.imageMaxMb,
            video: storage.videoMaxMb,
          })}
        </p>
      ) : null}
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
  );
}
