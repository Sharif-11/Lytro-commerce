import { StorageUnavailable } from '../../../common/errors/media-refused';
import type { MediaStorage, SignedUpload, StoredObject } from '../ports/media-storage';

/**
 * D3-4, MED-11: the store while none is set up (MEDIA_STORAGE_ENDPOINT unset). Every upload answers that storage is
 * unavailable, and nothing else in the app is touched. Nothing can have been stored without a store, so there is
 * nothing to list, clear or delete.
 */
export class UnconfiguredMediaStorage implements MediaStorage {
  signUpload(): Promise<SignedUpload> {
    return Promise.reject(new StorageUnavailable());
  }

  readUpload(): Promise<Buffer | null> {
    return Promise.reject(new StorageUnavailable());
  }

  readMedia(): Promise<Buffer | null> {
    return Promise.reject(new StorageUnavailable());
  }

  saveUpload(): Promise<boolean> {
    return Promise.reject(new StorageUnavailable());
  }

  removeUpload(): Promise<void> {
    return Promise.resolve();
  }

  putMedia(): Promise<void> {
    return Promise.reject(new StorageUnavailable());
  }

  deleteMedia(): Promise<void> {
    return Promise.resolve();
  }

  listMedia(): Promise<StoredObject[]> {
    return Promise.resolve([]);
  }
}
