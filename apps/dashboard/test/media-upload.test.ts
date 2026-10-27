import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@lytronix/api-client';
import { MediaPurpose } from '@lytronix/validators';
import {
  isImageFile,
  isVideoFile,
  MediaUpload,
  UploadRefused,
  type FileSender,
  type UploadStage,
} from '../src/lib/media-upload';

function mediaOf(status: string, failure: string | null = null) {
  return { id: 'm-1', kind: 'image', status, purpose: 'shop_logo', failure, urls: null };
}

/** An API client answering the upload's three calls: start, finish, and each look while it is prepared. */
function clientOf(finishStatus: string, looks: { status: string; failure?: string }[]) {
  const post = vi.fn((path: string) =>
    Promise.resolve(
      path === '/media/uploads'
        ? {
            media: mediaOf('uploading'),
            upload: {
              url: 'https://r2.example/m-1',
              method: 'PUT',
              headers: { 'content-type': 'image/png' },
            },
          }
        : mediaOf(finishStatus),
    ),
  );
  const get = vi.fn(() => {
    const next = looks.shift() ?? { status: 'processing' };
    return Promise.resolve(mediaOf(next.status, next.failure ?? null));
  });
  return { client: { post, get } as unknown as ApiClient, post, get };
}

const FILE = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' });
const CLIP = new File([new Uint8Array([1])], 'clip.mp4', { type: 'video/mp4' });
/** A sender that reports half, then all, of the file gone. */
const sent = (ok: boolean) =>
  vi.fn<FileSender>((_link, _file, onSent) => {
    onSent(0.5);
    onSent(1);
    return Promise.resolve(ok);
  });
const noWait = () => Promise.resolve();

describe('an upload (MED-03)', () => {
  it('asks with the file’s details, sends it with its progress, and waits until it is ready', async () => {
    const { client, post, get } = clientOf('processing', [
      { status: 'processing' },
      { status: 'ready' },
    ]);
    const send = sent(true);
    const stages: UploadStage[] = [];
    const started = vi.fn();
    const media = await new MediaUpload(client, send, noWait).upload(FILE, MediaPurpose.ShopLogo, {
      onStarted: started,
      onStage: (stage) => stages.push(stage),
    });
    expect(post).toHaveBeenCalledWith('/media/uploads', {
      kind: 'image',
      contentType: 'image/png',
      bytes: 3,
      purpose: MediaPurpose.ShopLogo,
    });
    expect(started).toHaveBeenCalledWith(expect.objectContaining({ id: 'm-1' }));
    expect(send).toHaveBeenCalledWith(
      { url: 'https://r2.example/m-1', method: 'PUT', headers: { 'content-type': 'image/png' } },
      FILE,
      expect.any(Function),
    );
    expect(stages).toEqual([
      { stage: 'sending', fraction: 0 },
      { stage: 'sending', fraction: 0.5 },
      { stage: 'sending', fraction: 1 },
      { stage: 'preparing' },
    ]);
    expect(post).toHaveBeenCalledWith('/media/m-1/finish');
    expect(get).toHaveBeenCalledTimes(2);
    expect(media.status).toBe('ready');
  });

  it('sends a video as a video', async () => {
    const { client, post } = clientOf('ready', []);
    await new MediaUpload(client, sent(true), noWait).upload(CLIP, MediaPurpose.ProductVideo);
    expect(post).toHaveBeenCalledWith('/media/uploads', {
      kind: 'video',
      contentType: 'video/mp4',
      bytes: 1,
      purpose: MediaPurpose.ProductVideo,
    });
  });

  it('is refused with the server’s reason when the file cannot be used', async () => {
    const { client } = clientOf('processing', [{ status: 'failed', failure: 'unreadable' }]);
    await expect(
      new MediaUpload(client, sent(true), noWait).upload(FILE, MediaPurpose.ShopLogo),
    ).rejects.toEqual(new UploadRefused('unreadable'));
  });

  it('stops when the file could not be sent', async () => {
    const { client, post } = clientOf('ready', []);
    await expect(
      new MediaUpload(client, sent(false), noWait).upload(FILE, MediaPurpose.ShopLogo),
    ).rejects.toEqual(new UploadRefused('not_uploaded'));
    expect(post).not.toHaveBeenCalledWith('/media/m-1/finish');
  });

  it('takes only the image and video types the server accepts', () => {
    expect(isImageFile(FILE)).toBe(true);
    expect(isImageFile(new File(['x'], 'notes.txt', { type: 'text/plain' }))).toBe(false);
    expect(isImageFile(new File(['x'], 'pic.gif', { type: 'image/gif' }))).toBe(false);
    expect(isVideoFile(CLIP)).toBe(true);
    expect(isVideoFile(new File(['x'], 'clip.mov', { type: 'video/quicktime' }))).toBe(false);
  });
});
