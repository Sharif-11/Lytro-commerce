import type { OperatorSessionRow } from '@lytronix/db';

export interface OperatorSessionSettings {
  now(): Date;
  secureCookies: boolean;
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

/** `enroll`'s result additionally carries the ten backup codes, shown once (ADM-01). */
export interface OperatorEnrolled extends OpenedOperatorSession {
  backupCodes: string[];
}

export type OperatorSessionRecord = OperatorSessionRow;
