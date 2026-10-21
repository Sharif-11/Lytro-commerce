import { writeFile } from 'node:fs/promises';
import { StorageUnavailable } from '../../src/common/errors/media-refused';
import type {
  MediaStorage,
  SignedUpload,
  StoredObject,
} from '../../src/modules/media/ports/media-storage';

/**
 * R2 as the server sees it, in memory (D3-4): a signed link takes exactly the file it was signed for, as R2 does
 * (MED-03), and each stored file keeps when it was written, which a test may move back to age it (MED-04).
 */
export class MemoryStorage implements MediaStorage {
  readonly uploads = new Map<string, Buffer>();
  readonly media = new Map<string, Buffer>();
  private readonly writtenAt = new Map<string, Date>();
  private readonly signed = new Map<string, { contentType: string; bytes: number }>();
  /** MED-11: while true, the store cannot be reached. */
  down = false;

  signUpload(
    key: string,
    contentType: string,
    bytes: number,
    expiresInSeconds: number,
  ): Promise<SignedUpload> {
    if (this.down) return Promise.reject(new StorageUnavailable());
    this.signed.set(key, { contentType, bytes });
    return Promise.resolve({
      url: `memory://uploads/${key}`,
      method: 'PUT',
      headers: { 'content-type': contentType },
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    });
  }

  /** The browser's PUT to a signed link: 200, or 403 for any other size or type. */
  send(url: string, body: Buffer, contentType: string): number {
    const key = url.replace('memory://uploads/', '');
    const signed = this.signed.get(key);
    if (!signed || signed.bytes !== body.length || signed.contentType !== contentType) return 403;
    this.uploads.set(key, body);
    return 200;
  }

  readUpload(key: string): Promise<Buffer | null> {
    if (this.down) return Promise.reject(new StorageUnavailable());
    return Promise.resolve(this.uploads.get(key) ?? null);
  }

  async saveUpload(key: string, path: string): Promise<boolean> {
    if (this.down) throw new StorageUnavailable();
    const body = this.uploads.get(key);
    if (!body) return false;
    await writeFile(path, body);
    return true;
  }

  removeUpload(key: string): Promise<void> {
    this.uploads.delete(key);
    return Promise.resolve();
  }

  putMedia(key: string, body: Buffer): Promise<void> {
    if (this.down) return Promise.reject(new StorageUnavailable());
    this.media.set(key, body);
    this.writtenAt.set(key, new Date());
    return Promise.resolve();
  }

  deleteMedia(keys: string[]): Promise<void> {
    if (this.down) return Promise.reject(new StorageUnavailable());
    for (const key of keys) {
      this.media.delete(key);
      this.writtenAt.delete(key);
    }
    return Promise.resolve();
  }

  listMedia(prefix: string): Promise<StoredObject[]> {
    if (this.down) return Promise.reject(new StorageUnavailable());
    return Promise.resolve(
      [...this.media.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, body]) => ({
          key,
          bytes: body.length,
          lastModified: this.writtenAt.get(key) ?? new Date(),
        })),
    );
  }

  /** A file placed straight in the bucket, as if written that long ago -- one no job recorded. */
  place(key: string, body: Buffer, ageMs = 0): void {
    this.media.set(key, body);
    this.writtenAt.set(key, new Date(Date.now() - ageMs));
  }

  /** Moves a stored file's write time back, as if it had been there that long. */
  age(key: string, ms: number): void {
    const at = this.writtenAt.get(key) ?? new Date();
    this.writtenAt.set(key, new Date(at.getTime() - ms));
  }
}
