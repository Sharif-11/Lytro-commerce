/** The media Worker's bindings, settings and secrets (wrangler.jsonc; secrets are set with `wrangler secret put`). */
export interface WorkerEnv {
  /** MED-10, MED-13: the shared store the server writes -- the blocked list and each shop's website addresses. */
  MEDIA_EDGE: KVNamespace;
  /** BND-01: where each response's usage goes, for the server's totals. */
  MEDIA_USAGE: AnalyticsEngineDataset;
  /** MED-07: R2's S3 address and the media bucket, read with a read-only key, so a write fails at R2 itself. */
  R2_ENDPOINT: string;
  R2_BUCKET: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  /** BND-07: the secret signed private links are made with, shared with the server. */
  MEDIA_LINK_SECRET: string;
  /** The dashboard's and the operator console's addresses, comma-separated: they still see an offline shop's media. */
  DASHBOARD_ORIGINS: string;
}
