import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@lytronix/api-client';
import { MediaPurpose } from '@lytronix/validators';
import { ImageUpload, isImageFile, UploadRefused } from '../src/lib/image-upload';

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
const sent = (ok: boolean) => vi.fn(() => Promise.resolve({ ok } as Response));
const noWait = () => Promise.resolve();

describe('an image upload (MED-03)', () => {
  it('asks with the file’s details, sends the file to the link, and waits until it is ready', async () => {
    const { client, post, get } = clientOf('processing', [
      { status: 'processing' },
      { status: 'ready' },
    ]);
    const send = sent(true);
    const media = await new ImageUpload(client, send, noWait).upload(FILE, MediaPurpose.ShopLogo);
    expect(post).toHaveBeenCalledWith('/media/uploads', {
      kind: 'image',
      contentType: 'image/png',
      bytes: 3,
      purpose: MediaPurpose.ShopLogo,
    });
    expect(send).toHaveBeenCalledWith('https://r2.example/m-1', {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: FILE,
    });
    expect(post).toHaveBeenCalledWith('/media/m-1/finish');
    expect(get).toHaveBeenCalledTimes(2);
    expect(media.status).toBe('ready');
  });

  it('is refused with the server’s reason when the image cannot be used', async () => {
    const { client } = clientOf('processing', [{ status: 'failed', failure: 'unreadable' }]);
    await expect(
      new ImageUpload(client, sent(true), noWait).upload(FILE, MediaPurpose.ShopLogo),
    ).rejects.toEqual(new UploadRefused('unreadable'));
  });

  it('stops when the file could not be sent', async () => {
    const { client, post } = clientOf('ready', []);
    await expect(
      new ImageUpload(client, sent(false), noWait).upload(FILE, MediaPurpose.ShopLogo),
    ).rejects.toEqual(new UploadRefused('not_uploaded'));
    expect(post).not.toHaveBeenCalledWith('/media/m-1/finish');
  });

  it('takes only the image types the server accepts', () => {
    expect(isImageFile(FILE)).toBe(true);
    expect(isImageFile(new File(['x'], 'notes.txt', { type: 'text/plain' }))).toBe(false);
    expect(isImageFile(new File(['x'], 'pic.gif', { type: 'image/gif' }))).toBe(false);
  });
});
