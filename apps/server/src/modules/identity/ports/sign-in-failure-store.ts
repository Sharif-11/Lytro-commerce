import type { FailureScope } from '@lytronix/db';

/** Failed sign-ins (AUTH-14). Each record is committed on its own, so it survives the failed request. */
export interface SignInFailureStore {
  record(values: { subscriberId: string | null; ip: string | null }): Promise<void>;
  countSince(scope: FailureScope, since: Date): Promise<number>;
}
