/** MED-03: where a browser sends one file, and the headers it must send with it. */
export interface SignedUpload {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: Date;
}

/** An object as the store lists it (MED-04): its key, its size, and when it was written. */
export interface StoredObject {
  key: string;
  bytes: number;
  lastModified: Date;
}

/**
 * D3-4, MED-01, MED-03, MED-07: the S3-compatible store tenant media lives in -- R2, with dev buckets for development
 * and CI, and an in-memory stand-in in the end-to-end tests. Uploads land in a temporary bucket; processed media is
 * written under the shop's prefix in the media bucket. Each call uses the key of the job it belongs to: signing,
 * processing or deleting. A store that cannot be reached comes back as StorageUnavailable.
 */
export interface MediaStorage {
  /** A link one browser may PUT exactly one file of exactly this size and type to, until it expires. */
  signUpload(
    key: string,
    contentType: string,
    bytes: number,
    expiresInSeconds: number,
  ): Promise<SignedUpload>;
  /** The uploaded file, or null when nothing was uploaded under the key. */
  readUpload(key: string): Promise<Buffer | null>;
  /** STO-09: the uploaded file written to a local path, streamed, for a video; false when nothing was uploaded. */
  saveUpload(key: string, path: string): Promise<boolean>;
  removeUpload(key: string): Promise<void>;
  /** A processed object, under its shop's prefix, cached for as long as its content-hashed name stays the same. */
  putMedia(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteMedia(keys: string[]): Promise<void>;
  /** Every object under a prefix, for the daily reconciliation and the day-60 wipe. */
  listMedia(prefix: string): Promise<StoredObject[]>;
}
