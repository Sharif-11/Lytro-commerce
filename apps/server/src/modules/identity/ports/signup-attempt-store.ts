/** Sign-up code requests, by client IP (SUP-08). Each record is committed on its own, so it survives the request. */
export interface SignupAttemptStore {
  record(ip: string): Promise<void>;
  countSince(ip: string, since: Date): Promise<number>;
}
