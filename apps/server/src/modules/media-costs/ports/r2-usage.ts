/** MED-12, D8-57: one bucket's R2 figures on one UTC day. */
export interface R2DayFigures {
  day: string;
  /** The bucket's name; empty for operations on the account rather than a bucket (ListBuckets). */
  bucket: string;
  classA: number;
  classB: number;
  freeOps: number;
  /** The day's peak storage, objects and their metadata together, in bytes. */
  peakBytes: number;
  objects: number;
}

/** Cloudflare's R2 analytics for the account: every bucket's operations and storage, a UTC day at a time. */
export interface R2Usage {
  /** False when no Cloudflare token is set, so nothing can be read. */
  readonly connected: boolean;
  /** Every bucket's figures for each of these days; a bucket with nothing that day may be left out. */
  days(days: readonly string[]): Promise<R2DayFigures[]>;
}

/** Cloudflare's analytics couldn't be read, or answered with errors. */
export class R2UsageUnavailable extends Error {
  constructor(detail: string) {
    super(`R2 analytics unavailable: ${detail}`);
    this.name = 'R2UsageUnavailable';
  }
}
