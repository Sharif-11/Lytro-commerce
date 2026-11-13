import { useMemo, useState } from 'react';
import { MediaKind, type MediaPurpose } from '@lytronix/validators';
import { isImageFile, MediaUpload, refusalOf } from '@/lib/media-upload';
import { tenantSession } from '@/session/tenant-session';
import type { MediaView } from '@/types/media';
import type { Uploading } from './product-media';

/**
 * MED-03, §7.43: one picture at a time -- a category's, a size chart's, a swatch's -- uploaded with the states a product's
 * photos show on their tile (`UploadTile`): how much has gone, then being prepared, or refused with why. `busy` while it
 * is on its way, so what saves it waits.
 */
export function usePictureUpload(purpose: MediaPurpose) {
  const media = useMemo(() => new MediaUpload(tenantSession.client), []);
  const [upload, setUpload] = useState<Uploading | null>(null);

  /** The picture once it is ready, or null when it was refused (its tile then says why). */
  async function start(file: File): Promise<MediaView | null> {
    const entry: Uploading = {
      key: 'picture',
      kind: MediaKind.Image,
      size: file.size,
      stage: 'sending',
      fraction: 0,
      reason: null,
    };
    if (!isImageFile(file)) {
      setUpload({ ...entry, stage: 'refused', reason: 'not_supported' });
      return null;
    }
    setUpload(entry);
    try {
      const ready = await media.upload(file, purpose, {
        onStage: (stage) => {
          setUpload((current) =>
            current === null
              ? null
              : stage.stage === 'sending'
                ? { ...current, fraction: stage.fraction }
                : { ...current, stage: 'preparing' },
          );
        },
      });
      setUpload(null);
      return ready;
    } catch (error) {
      setUpload({ ...entry, stage: 'refused', reason: refusalOf(error) });
      return null;
    }
  }

  return {
    upload,
    busy: upload !== null && upload.stage !== 'refused',
    start,
    dismiss: () => {
      setUpload(null);
    },
  };
}
