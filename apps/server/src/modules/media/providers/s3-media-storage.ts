import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CircuitBreaker } from '../../../common/circuit-breaker';
import { StorageUnavailable } from '../../../common/errors/media-refused';
import type { MediaStorage, SignedUpload, StoredObject } from '../ports/media-storage';

/** One job's access to the store (MED-07). */
export interface StorageKey {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface S3MediaStorageSettings {
  endpoint: string;
  region: string;
  pathStyle: boolean;
  uploadsBucket: string;
  mediaBucket: string;
  evidenceBucket: string;
  signer: StorageKey;
  processor: StorageKey;
  deleter: StorageKey;
}

// MED-08: a public object's name changes whenever its content does, so a browser or the Worker may keep it for a year.
const IMMUTABLE = 'public, max-age=31536000, immutable';
// S3 deletes at most this many objects in one request.
const DELETE_BATCH = 1000;

/** PRF-05: the store answered with a refusal it meant (no such file, no such bucket, a bad key), not by being away. */
interface Answered {
  answered: unknown;
}

/**
 * D3-4: the media store over the S3 API, which R2 and other S3-compatible stores speak. Three clients, one per
 * key (MED-07): the signer only signs browser uploads into the temporary bucket, the processor reads and clears uploads
 * and writes media, and only the deleter removes media. PRF-05 (Slice 9.5): every call to the store goes through a
 * circuit per bucket, so a bucket not made yet never stops the others; signing a link calls nothing, so it has none.
 */
export class S3MediaStorage implements MediaStorage {
  private readonly signer: S3Client;
  private readonly processor: S3Client;
  private readonly deleter: S3Client;

  constructor(
    private readonly settings: S3MediaStorageSettings,
    private readonly breaker: CircuitBreaker = new CircuitBreaker({ service: 'r2' }),
  ) {
    this.signer = this.clientFor(settings.signer);
    this.processor = this.clientFor(settings.processor);
    this.deleter = this.clientFor(settings.deleter);
  }

  async signUpload(
    key: string,
    contentType: string,
    bytes: number,
    expiresInSeconds: number,
  ): Promise<SignedUpload> {
    // MED-03: the size and type are part of the signature, so the store refuses any other file sent with the link.
    const url = await getSignedUrl(
      this.signer,
      new PutObjectCommand({
        Bucket: this.settings.uploadsBucket,
        Key: key,
        ContentLength: bytes,
        ContentType: contentType,
      }),
      { expiresIn: expiresInSeconds, signableHeaders: new Set(['content-length', 'content-type']) },
    );
    return {
      url,
      method: 'PUT',
      headers: { 'content-type': contentType },
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  async readUpload(key: string): Promise<Buffer | null> {
    try {
      return await this.stored(this.settings.uploadsBucket, async () => {
        const object = await this.processor.send(
          new GetObjectCommand({ Bucket: this.settings.uploadsBucket, Key: key }),
        );
        return object.Body ? Buffer.from(await object.Body.transformToByteArray()) : null;
      });
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw this.unavailable(error);
    }
  }

  async saveUpload(key: string, path: string): Promise<boolean> {
    try {
      return await this.stored(this.settings.uploadsBucket, async () => {
        const object = await this.processor.send(
          new GetObjectCommand({ Bucket: this.settings.uploadsBucket, Key: key }),
        );
        if (!object.Body) return false;
        await pipeline(Readable.from(object.Body.transformToWebStream()), createWriteStream(path));
        return true;
      });
    } catch (error) {
      if (error instanceof NoSuchKey) return false;
      throw this.unavailable(error);
    }
  }

  async removeUpload(key: string): Promise<void> {
    try {
      await this.stored(this.settings.uploadsBucket, () =>
        this.processor.send(
          new DeleteObjectCommand({ Bucket: this.settings.uploadsBucket, Key: key }),
        ),
      );
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async readMedia(key: string): Promise<Buffer | null> {
    try {
      return await this.stored(this.settings.mediaBucket, async () => {
        const object = await this.processor.send(
          new GetObjectCommand({ Bucket: this.settings.mediaBucket, Key: key }),
        );
        return object.Body ? Buffer.from(await object.Body.transformToByteArray()) : null;
      });
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw this.unavailable(error);
    }
  }

  async putMedia(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.stored(this.settings.mediaBucket, () =>
        this.processor.send(
          new PutObjectCommand({
            Bucket: this.settings.mediaBucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            CacheControl: IMMUTABLE,
          }),
        ),
      );
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async deleteMedia(keys: string[]): Promise<void> {
    for (let from = 0; from < keys.length; from += DELETE_BATCH) {
      const batch = keys.slice(from, from + DELETE_BATCH);
      try {
        await this.stored(this.settings.mediaBucket, () =>
          this.deleter.send(
            new DeleteObjectsCommand({
              Bucket: this.settings.mediaBucket,
              Delete: { Objects: batch.map((key) => ({ Key: key })), Quiet: true },
            }),
          ),
        );
      } catch (error) {
        throw this.unavailable(error);
      }
    }
  }

  async putEvidence(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.stored(this.settings.evidenceBucket, () =>
        this.processor.send(
          new PutObjectCommand({
            Bucket: this.settings.evidenceBucket,
            Key: key,
            Body: body,
            ContentType: contentType,
          }),
        ),
      );
    } catch (error) {
      // D8-47: every failure is the store being away, a private bucket not made yet included, so nothing answers 500.
      throw new StorageUnavailable(error);
    }
  }

  async evidenceLink(key: string, expiresInSeconds: number): Promise<string> {
    try {
      return await getSignedUrl(
        this.processor,
        new GetObjectCommand({ Bucket: this.settings.evidenceBucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async deleteEvidence(keys: string[]): Promise<void> {
    for (let from = 0; from < keys.length; from += DELETE_BATCH) {
      const batch = keys.slice(from, from + DELETE_BATCH);
      let failed: number;
      try {
        const answer = await this.stored(this.settings.evidenceBucket, () =>
          this.deleter.send(
            new DeleteObjectsCommand({
              Bucket: this.settings.evidenceBucket,
              Delete: { Objects: batch.map((key) => ({ Key: key })), Quiet: true },
            }),
          ),
        );
        failed = answer.Errors?.length ?? 0;
      } catch (error) {
        throw this.unavailable(error);
      }
      // D8-47: a quiet delete still names each file it couldn't remove. None of the batch is called removed then: the
      // night's sweep stops, and the next one tries again (removing a file already gone does no harm).
      if (failed > 0) {
        throw this.unavailable(new Error(`${String(failed)} screenshots could not be removed`));
      }
    }
  }

  async listMedia(prefix: string): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    let token: string | undefined;
    do {
      try {
        const page = await this.stored(this.settings.mediaBucket, () =>
          this.processor.send(
            new ListObjectsV2Command({
              Bucket: this.settings.mediaBucket,
              Prefix: prefix,
              ContinuationToken: token,
            }),
          ),
        );
        for (const item of page.Contents ?? []) {
          if (item.Key !== undefined) {
            objects.push({
              key: item.Key,
              bytes: item.Size ?? 0,
              lastModified: item.LastModified ?? new Date(0),
            });
          }
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } catch (error) {
        throw this.unavailable(error);
      }
    } while (token !== undefined);
    return objects;
  }

  /**
   * PRF-05 (Slice 9.5): one call to the store, through its bucket's circuit. A refusal the store meant (no such file, no
   * such bucket, a bad key) is an answer, not the store failing, so it never counts toward opening the circuit; it is
   * thrown on to the caller as it came, which reads it as before.
   */
  private async stored<T>(bucket: string, work: () => Promise<T>): Promise<T> {
    const result = await this.breaker.call(
      `r2:${bucket}`,
      async (): Promise<{ value: T } | Answered> => {
        try {
          return { value: await work() };
        } catch (error) {
          if (
            error instanceof S3ServiceException &&
            (error.$metadata.httpStatusCode ?? 500) < 500
          ) {
            return { answered: error };
          }
          throw error;
        }
      },
    );
    if ('answered' in result) throw result.answered;
    return result.value;
  }

  private clientFor(key: StorageKey): S3Client {
    return new S3Client({
      endpoint: this.settings.endpoint,
      region: this.settings.region,
      forcePathStyle: this.settings.pathStyle,
      credentials: key,
    });
  }

  /** A refusal the store meant (a missing bucket, a bad key) stays itself; anything else is the store being away. */
  private unavailable(error: unknown): Error {
    if (error instanceof S3ServiceException && (error.$metadata.httpStatusCode ?? 500) < 500) {
      return error;
    }
    return new StorageUnavailable(error);
  }
}
