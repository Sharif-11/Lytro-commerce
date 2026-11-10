// MED-12, D8-62 (Phase 8 Slice 8.6): R2's price class for each operation, as Cloudflare's R2 pricing page lists them
// (checked 2026-11-10). One it doesn't list is counted as Class A, the dearer, so the estimate never runs low for it.

export type R2PriceClass = 'classA' | 'classB' | 'free';

const CLASS_B: ReadonlySet<string> = new Set([
  'HeadBucket',
  'HeadObject',
  'GetObject',
  'UsageSummary',
  'GetBucketEncryption',
  'GetBucketLocation',
  'GetBucketCors',
  'GetBucketLifecycleConfiguration',
]);

const FREE: ReadonlySet<string> = new Set(['DeleteObject', 'DeleteBucket', 'AbortMultipartUpload']);

// Class A, for the record: ListBuckets, PutBucket, ListObjects, PutObject, CopyObject, CompleteMultipartUpload,
// CreateMultipartUpload, LifecycleStorageTierTransition, ListMultipartUploads, UploadPart, UploadPartCopy, ListParts,
// PutBucketEncryption, PutBucketCors and PutBucketLifecycleConfiguration -- and anything not above.

/** The price class an operation Cloudflare's analytics name is billed in. */
export function priceClassOf(actionType: string): R2PriceClass {
  if (CLASS_B.has(actionType)) return 'classB';
  if (FREE.has(actionType)) return 'free';
  return 'classA';
}
