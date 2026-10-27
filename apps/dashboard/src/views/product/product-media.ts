import { useMemo, useRef, useState } from 'react';
import { ApiClientError } from '@lytronix/api-client';
import { MediaKind, MediaPurpose } from '@lytronix/validators';
import { useStorageUsage } from '@/api/media';
import { isImageFile, isVideoFile, MediaUpload, UploadRefused } from '@/lib/media-upload';
import { tenantSession } from '@/session/tenant-session';
import type { MediaView } from '@/types/media';
import type { ProductDetail } from '@/types/product';

/** A photo or the video as the editor shows it: its picture, what it stores, and a video's length. */
export interface MediaItem {
  id: string;
  kind: MediaKind;
  thumbnail: string;
  bytes: number;
  durationMs: number | null;
}

/** An upload under way, or one the server refused, as its tile shows it (the prototype's `pf-media-states`). */
export interface Uploading {
  key: string;
  kind: MediaKind;
  size: number;
  stage: 'sending' | 'preparing' | 'refused';
  /** How much has gone, while sending. */
  fraction: number;
  /** Why it was refused: the server's reason (too_large, not_supported, unreadable, ...). */
  reason: string | null;
}

/** The items a product has now, by id. */
export function itemsOf(product: ProductDetail | null): Map<string, MediaItem> {
  const items = new Map<string, MediaItem>();
  for (const image of product?.images ?? []) {
    items.set(image.id, {
      id: image.id,
      kind: MediaKind.Image,
      thumbnail: image.urls.thumbnail,
      bytes: image.bytes,
      durationMs: null,
    });
  }
  const video = product?.video;
  if (video) {
    items.set(video.id, {
      id: video.id,
      kind: MediaKind.Video,
      thumbnail: video.urls.poster,
      bytes: video.bytes,
      durationMs: video.durationMs,
    });
  }
  return items;
}

const itemOf = (media: MediaView): MediaItem => ({
  id: media.id,
  kind: media.kind,
  thumbnail: media.urls?.thumbnail ?? '',
  bytes: media.bytes,
  durationMs: media.durationMs,
});

let next = 0;

/**
 * PRD-11, MED-03 (Slice 11.7a): a product's photos and video while it is edited -- what it shows, what is uploading and
 * how far, what was refused and why, whether storage was full -- and the items uploaded on this visit, so those left
 * unsaved can be deleted (agreed 2026-10-27). `onReady` hands each item over once it is prepared.
 */
export function useProductMedia(product: ProductDetail | null, onReady: (item: MediaItem) => void) {
  const upload = useMemo(() => new MediaUpload(tenantSession.client), []);
  const storage = useStorageUsage();
  const [items, setItems] = useState(() => itemsOf(product));
  const [uploads, setUploads] = useState<Uploading[]>([]);
  const [storageFull, setStorageFull] = useState(false);
  // Every item this visit made, whether or not it was ever saved.
  const madeHere = useRef(new Set<string>());

  const change = (key: string, patch: Partial<Uploading>): void => {
    setUploads((current) =>
      current.map((each) => (each.key === key ? { ...each, ...patch } : each)),
    );
  };

  function start(file: File, kind: MediaKind): void {
    const key = `u-${String((next += 1))}`;
    const entry: Uploading = {
      key,
      kind,
      size: file.size,
      stage: 'sending',
      fraction: 0,
      reason: null,
    };
    setUploads((current) => [...current, entry]);
    const wrong = kind === MediaKind.Video ? !isVideoFile(file) : !isImageFile(file);
    if (wrong) {
      change(key, { stage: 'refused', reason: 'not_supported' });
      return;
    }
    const purpose =
      kind === MediaKind.Video ? MediaPurpose.ProductVideo : MediaPurpose.ProductImage;
    upload
      .upload(file, purpose, {
        onStarted: (media) => {
          madeHere.current.add(media.id);
        },
        onStage: (stage) => {
          change(
            key,
            stage.stage === 'sending' ? { fraction: stage.fraction } : { stage: 'preparing' },
          );
        },
      })
      .then((media) => {
        const item = itemOf(media);
        setItems((current) => new Map(current).set(item.id, item));
        setUploads((current) => current.filter((each) => each.key !== key));
        void storage.refetch();
        onReady(item);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiClientError && error.code === 'plan_limit_reached') {
          // STO-03: storage is full -- the banner says so, with the ways out; the tile goes.
          setStorageFull(true);
          setUploads((current) => current.filter((each) => each.key !== key));
          return;
        }
        const fields = error instanceof ApiClientError ? error.fieldProblems() : {};
        const reason =
          error instanceof UploadRefused
            ? error.reason
            : 'bytes' in fields
              ? 'too_large'
              : 'contentType' in fields
                ? 'not_supported'
                : 'not_uploaded';
        change(key, { stage: 'refused', reason });
      });
  }

  return {
    items,
    uploads,
    storage: storage.data,
    storageFull,
    madeHere: madeHere.current,
    addPhotos: (files: File[]) => {
      for (const file of files) start(file, MediaKind.Image);
    },
    addVideo: (file: File) => {
      start(file, MediaKind.Video);
    },
    dismiss: (key: string) => {
      setUploads((current) => current.filter((each) => each.key !== key));
    },
  };
}
