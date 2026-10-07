// De-dupes against pg-boss's own singletonKey once the relay sends the job (SCL-08, D25).
export interface EnqueueOptions {
  singletonKey?: string;
  /** Bounds this job's own validity window (e.g. an OTP's remaining TTL), overriding the queue's default (D27). */
  expireInSeconds?: number;
  retryLimit?: number;
  retryDelay?: number;
}
