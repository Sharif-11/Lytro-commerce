import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EVIDENCE_KEPT_MONTHS,
  EVIDENCE_MAX_BYTES,
  type EvidenceContentType,
  type EvidenceUploadInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { StorageUnavailable } from '../../../common/errors/media-refused';
import { addMonths, SECOND_MS } from '../../../common/time';
import type { MediaStorage, SignedUpload } from '../../media/ports/media-storage';
import { MEDIA_STORAGE } from '../../media/tokens';
import type { PaymentEvidenceRecord, PaymentEvidenceStore } from '../ports/payment-evidence-store';
import { PAYMENT_EVIDENCE_CLOCK, PAYMENT_EVIDENCE_STORE } from '../tokens';

const UPLOAD_LINK_SECONDS = 15 * 60;
// D8-47: long enough to open a screenshot, too short to pass around.
const READ_LINK_SECONDS = 5 * 60;
const RETRY_AFTER_SECONDS = 60;
const SWEEP_BATCH = 500;

/** Who is sending a file, and for which shop: an upload names one or the other, and is only theirs to use. */
export interface EvidenceOwner {
  tenantId: string;
  uploader: 'operator' | 'seller';
}

export interface EvidenceUpload {
  key: string;
  upload: SignedUpload;
}

export interface EvidenceLink {
  url: string;
  expiresAt: Date;
}

/** ADM-14, ADM-17: what the file's own first bytes say it is, whatever its upload claimed; null for anything else. */
export function evidenceTypeOf(body: Buffer): EvidenceContentType | null {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return 'image/jpeg';
  }
  if (body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (
    body.subarray(0, 4).toString('latin1') === 'RIFF' &&
    body.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (body.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

/**
 * ADM-14, ADM-17, D8-14, D8-15, D8-47 (Phase 8 Slice 8.5, read agreed 2026-11-09): payment screenshots. A browser sends one
 * to the temporary bucket by a signed link. When the payment it proves is recorded, the server checks the file and copies
 * it into a private bucket no public route reads; the operator alone opens it, by a link lasting five minutes, and a
 * nightly job removes it after two years.
 */
@Injectable()
export class PaymentEvidence {
  private readonly logger = new Logger('PaymentEvidence');

  constructor(
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(PAYMENT_EVIDENCE_STORE) private readonly store: PaymentEvidenceStore,
    @Inject(PAYMENT_EVIDENCE_CLOCK) private readonly clock: () => Date,
  ) {}

  startOperatorUpload(input: EvidenceUploadInput): Promise<EvidenceUpload> {
    return this.start(`evidence/operator/${randomUUID()}`, input);
  }

  startShopUpload(tenantId: string, input: EvidenceUploadInput): Promise<EvidenceUpload> {
    return this.start(`evidence/${tenantId}/${randomUUID()}`, input);
  }

  /**
   * Keeps the upload, then does `work` with what was kept; no upload means no evidence. A refused `work` leaves nothing
   * kept and the upload still there, so the same file can be sent with a corrected request.
   */
  async withKept<T>(
    owner: EvidenceOwner,
    key: string | undefined,
    work: (evidenceId: string | null) => Promise<T>,
  ): Promise<T> {
    if (key === undefined) return work(null);
    const kept = await this.keep(owner, key);
    let result: T;
    try {
      result = await work(kept.id);
    } catch (error) {
      await this.discard(kept);
      throw error;
    }
    await this.storage.removeUpload(key).catch((error: unknown) => {
      this.logger.warn(`an evidence upload was not cleared: ${String(error)}`);
    });
    return result;
  }

  /** D8-47: a link to the file, for the operator alone; refused once it has been removed. */
  async link(evidenceId: string): Promise<EvidenceLink> {
    const evidence = await this.store.findById(evidenceId);
    if (!evidence) throw new ApiError('not_found', 'EvidenceNotFound', {});
    if (evidence.removedAt !== null) throw new ApiError('conflict', 'EvidenceRemoved', {});
    const url = await this.reaching(() =>
      this.storage.evidenceLink(evidence.objectKey, READ_LINK_SECONDS),
    );
    return { url, expiresAt: new Date(this.clock().getTime() + READ_LINK_SECONDS * SECOND_MS) };
  }

  /** D8-47: the night's removal of files past their two years. How many. */
  async sweep(): Promise<number> {
    const before = addMonths(this.clock(), -EVIDENCE_KEPT_MONTHS);
    let removed = 0;
    let batch: PaymentEvidenceRecord[];
    do {
      batch = await this.store.dueForRemoval(before, SWEEP_BATCH);
      if (batch.length === 0) break;
      await this.storage.deleteEvidence(batch.map((row) => row.objectKey));
      await this.store.markRemoved(
        batch.map((row) => row.id),
        this.clock(),
      );
      removed += batch.length;
    } while (batch.length === SWEEP_BATCH);
    return removed;
  }

  private async start(key: string, input: EvidenceUploadInput): Promise<EvidenceUpload> {
    const upload = await this.reaching(() =>
      this.storage.signUpload(key, input.contentType, input.bytes, UPLOAD_LINK_SECONDS),
    );
    return { key, upload };
  }

  private async keep(owner: EvidenceOwner, key: string): Promise<PaymentEvidenceRecord> {
    const own =
      owner.uploader === 'operator' ? 'evidence/operator/' : `evidence/${owner.tenantId}/`;
    if (!key.startsWith(own)) throw new ApiError('validation_error', 'EvidenceNotUploaded', {});
    const body = await this.reaching(() => this.storage.readUpload(key));
    if (body === null) throw new ApiError('validation_error', 'EvidenceNotUploaded', {});
    const contentType = evidenceTypeOf(body);
    if (contentType === null || body.length > EVIDENCE_MAX_BYTES) {
      throw new ApiError('validation_error', 'EvidenceNotAllowed', {});
    }
    // Named afresh each time, so a request refused and sent again never meets its own earlier copy.
    const objectKey = `${owner.tenantId}/${randomUUID()}`;
    await this.reaching(() => this.storage.putEvidence(objectKey, body, contentType));
    return this.store.insert({
      tenantId: owner.tenantId,
      objectKey,
      contentType,
      bytes: body.length,
    });
  }

  private async discard(kept: PaymentEvidenceRecord): Promise<void> {
    try {
      await this.storage.deleteEvidence([kept.objectKey]);
      await this.store.markRemoved([kept.id], this.clock());
    } catch (error) {
      this.logger.warn(`evidence from a refused request was not cleared: ${String(error)}`);
    }
  }

  /** MED-11: the store being away answers 503 with when to try again. */
  private async reaching<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof StorageUnavailable) {
        this.logger.error(`the evidence store cannot be reached: ${String(error.cause)}`);
        throw new ApiError('service_unavailable', 'StorageUnavailable', {}, RETRY_AFTER_SECONDS);
      }
      throw error;
    }
  }
}
