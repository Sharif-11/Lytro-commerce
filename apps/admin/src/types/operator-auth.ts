/**
 * Mirrors response shapes defined server-side in
 * apps/server/src/modules/operator/{types/session.ts,controllers/operator-auth.controller.ts} — see
 * types/auth.ts's own note on why these are deliberate structural duplicates, not imports.
 */
export type OperatorSigninResult =
  { next: 'enroll-2fa'; secret: string; uri: string } | { next: 'verify-2fa' };

export interface OperatorEnrolled {
  csrfToken: string;
  backupCodes: string[];
}

export interface OperatorVerified {
  csrfToken: string;
}
