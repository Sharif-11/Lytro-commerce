// LIF-16/17: a tenant's own export request/result.
export interface DataExportRecord {
  id: string;
  tenantId: string;
  status: 'pending' | 'ready' | 'failed';
  fileSizeBytes: number | null;
  contentType: string | null;
  failureReason: string | null;
  requestedAt: Date;
  readyAt: Date | null;
  expiresAt: Date | null;
}

/** `findById`'s own shape -- adds the file bytes `DataExportRecord` deliberately omits from the list view. */
export interface DataExportDetail extends DataExportRecord {
  fileContent: Buffer | null;
}
