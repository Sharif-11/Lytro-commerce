import type { ApiClient } from '@lytronix/api-client';
import {
  IMAGE_CONTENT_TYPES,
  MediaKind,
  MediaStatus,
  type MediaPurpose,
} from '@lytronix/validators';
import type { MediaView, UploadStarted } from '@/types/media';

// How often, and how long, an upload is looked at while the server prepares it (MED-03): an image is ready in seconds.
const POLL_MS = 1500;
const POLL_LIMIT = 40;

/** An upload the server refused once it looked at the file, with its reason (not_supported, too_large, ...). */
export class UploadRefused extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

/** Whether the browser may send this file as an image at all (STO-04); the server checks what it really is. */
export function isImageFile(file: File): boolean {
  return IMAGE_CONTENT_TYPES.includes(file.type);
}

/**
 * MED-03: one image from the browser to the shop's media -- the upload asked for with the file's details, the file
 * sent to the link given, the server told it was sent, then waited on until it is prepared. The shop's logo is its
 * first use (Slice 11.6); the media manager (Slice 11.7) uses the same.
 */
export class ImageUpload {
  constructor(
    private readonly client: ApiClient,
    private readonly send: typeof fetch = (...args) => fetch(...args),
    private readonly wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async upload(file: File, purpose: MediaPurpose): Promise<MediaView> {
    const started = await this.client.post<UploadStarted>('/media/uploads', {
      kind: MediaKind.Image,
      contentType: file.type,
      bytes: file.size,
      purpose,
    });
    const sent = await this.send(started.upload.url, {
      method: started.upload.method,
      headers: started.upload.headers,
      body: file,
    });
    if (!sent.ok) throw new UploadRefused('not_uploaded');
    let media = await this.client.post<MediaView>(`/media/${started.media.id}/finish`);
    for (let look = 0; media.status === MediaStatus.Processing && look < POLL_LIMIT; look += 1) {
      await this.wait(POLL_MS);
      media = await this.client.get<MediaView>(`/media/${started.media.id}`);
    }
    if (media.status !== MediaStatus.Ready)
      throw new UploadRefused(media.failure ?? 'processing_failed');
    return media;
  }
}
