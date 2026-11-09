export interface EnqueueOptions {
  /** One job at a time for this key, on a queue whose policy enforces it; a standard queue ignores it (SCL-08, D25). */
  singletonKey?: string;
  /** Bounds this job's own validity window (e.g. an OTP's remaining TTL), overriding the queue's default (D27). */
  expireInSeconds?: number;
  retryLimit?: number;
  retryDelay?: number;
}
