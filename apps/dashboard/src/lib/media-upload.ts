import type { ApiClient } from '@lytronix/api-client';
import {
  IMAGE_CONTENT_TYPES,
  MediaKind,
  MediaStatus,
  VIDEO_CONTENT_TYPES,
  type MediaPurpose,
} from '@lytronix/validators';
import type { MediaView, UploadStarted } from '@/types/media';

// How often, and how long, an upload is looked at while the server prepares it (MED-03): an image is ready in about
// 30 s, a video in about 5 min (STO-09), so a video is looked at less often and for longer.
const POLL: Readonly<Record<MediaKind, { everyMs: number; looks: number }>> = {
  [MediaKind.Image]: { everyMs: 1500, looks: 40 },
  [MediaKind.Video]: { everyMs: 5000, looks: 120 },
};

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

/** Whether the browser may send this file as a video (STO-05). */
export function isVideoFile(file: File): boolean {
  return VIDEO_CONTENT_TYPES.includes(file.type);
}

/** Where an upload has got to: the file being sent, and how much of it; then the server preparing it. */
export type UploadStage = { stage: 'sending'; fraction: number } | { stage: 'preparing' };

/** Sends the file to the signed link, telling how much has gone; true once the store took it. */
export type FileSender = (
  link: UploadStarted['upload'],
  file: File,
  onSent: (fraction: number) => void,
) => Promise<boolean>;

/** The browser's sender: XMLHttpRequest, since fetch cannot say how much of an upload has gone (agreed for 11.7a). */
export const sendWithProgress: FileSender = (link, file, onSent) =>
  new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open(link.method, link.url);
    for (const [name, value] of Object.entries(link.headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onSent(event.loaded / event.total);
    };
    request.onload = () => {
      resolve(request.status >= 200 && request.status < 300);
    };
    request.onerror = () => {
      resolve(false);
    };
    request.send(file);
  });

/** What an upload tells its caller as it goes. */
export interface UploadWatch {
  /** The item the server made for it, before the file is sent: what to delete if the upload is left behind. */
  onStarted?: (media: MediaView) => void;
  onStage?: (stage: UploadStage) => void;
}

/**
 * MED-03: one file from the browser to the shop's media -- the upload asked for with the file's details, the file sent
 * to the link given with its progress, the server told it was sent, then waited on until it is prepared. An image or a
 * video, by the file's type. The shop's logo was its first use (Slice 11.6); a product's photos and video use the same
 * (Slice 11.7a).
 */
export class MediaUpload {
  constructor(
    private readonly client: ApiClient,
    private readonly send: FileSender = sendWithProgress,
    private readonly wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async upload(file: File, purpose: MediaPurpose, watch: UploadWatch = {}): Promise<MediaView> {
    const kind = isVideoFile(file) ? MediaKind.Video : MediaKind.Image;
    const started = await this.client.post<UploadStarted>('/media/uploads', {
      kind,
      contentType: file.type,
      bytes: file.size,
      purpose,
    });
    watch.onStarted?.(started.media);
    watch.onStage?.({ stage: 'sending', fraction: 0 });
    const sent = await this.send(started.upload, file, (fraction) => {
      watch.onStage?.({ stage: 'sending', fraction });
    });
    if (!sent) throw new UploadRefused('not_uploaded');
    watch.onStage?.({ stage: 'preparing' });
    let media = await this.client.post<MediaView>(`/media/${started.media.id}/finish`);
    const poll = POLL[kind];
    for (let look = 0; media.status === MediaStatus.Processing && look < poll.looks; look += 1) {
      await this.wait(poll.everyMs);
      media = await this.client.get<MediaView>(`/media/${started.media.id}`);
    }
    if (media.status !== MediaStatus.Ready)
      throw new UploadRefused(media.failure ?? 'processing_failed');
    return media;
  }
}
