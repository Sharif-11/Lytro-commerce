/** GET /exports (LIF-16, LIF-17): one of the owner's export requests; the file itself is the download route's. */
export interface DataExport {
  id: string;
  status: 'pending' | 'ready' | 'failed';
  fileSizeBytes: number | null;
  requestedAt: string;
  readyAt: string | null;
  /** A ready export lasts 24 hours. */
  expiresAt: string | null;
}
