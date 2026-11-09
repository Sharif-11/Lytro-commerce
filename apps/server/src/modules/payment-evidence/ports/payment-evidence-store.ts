/** A payment screenshot's record; the file itself is in the private bucket (D8-47). */
export interface PaymentEvidenceRecord {
  id: string;
  tenantId: string;
  objectKey: string;
  contentType: string;
  bytes: number;
  createdAt: Date;
  removedAt: Date | null;
}

export interface NewPaymentEvidence {
  tenantId: string;
  objectKey: string;
  contentType: string;
  bytes: number;
}

/** control.payment_evidence (ADM-14, ADM-17, D8-47). */
export interface PaymentEvidenceStore {
  insert(values: NewPaymentEvidence): Promise<PaymentEvidenceRecord>;
  findById(id: string): Promise<PaymentEvidenceRecord | null>;
  dueForRemoval(before: Date, limit: number): Promise<PaymentEvidenceRecord[]>;
  markRemoved(ids: readonly string[], at: Date): Promise<void>;
}
