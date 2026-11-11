import type { OperatorSessionRow } from '@lytronix/db';

export interface OperatorSessionSettings {
  now(): Date;
  secureCookies: boolean;
  /** TEN-29: the only origin a state-changing request may come from; null skips the check (development). */
  origin: string | null;
}

export interface OperatorSessionContext {
  userAgent: string | null;
  ip: string | null;
}

export interface OpenedOperatorSession {
  cookie: string;
  csrfToken: string;
}

/** What `signin` tells the caller to show next — enrollment (with the secret to render) or a code prompt. */
export type OperatorSigninResult =
  { next: 'enroll-2fa'; secret: string; uri: string } | { next: 'verify-2fa' };

/** What the console shows of who is signed in: the sidebar's foot and the account page. */
export interface OperatorMe {
  /** Slice 8.8: the console's "only mine" filters. */
  id: string;
  email: string;
  unusedBackupCodes: number;
  signedInAt: Date;
  userAgent: string | null;
}

/** `enroll`'s result additionally carries the ten backup codes, shown once (ADM-01). */
export interface OperatorEnrolled extends OpenedOperatorSession {
  backupCodes: string[];
}

export type OperatorSessionRecord = OperatorSessionRow;
