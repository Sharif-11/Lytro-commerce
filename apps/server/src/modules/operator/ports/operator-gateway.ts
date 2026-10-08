import type { Transaction } from '@lytronix/db';

/** One operator account, as the auth service needs it. */
export interface OperatorAccountRecord {
  id: string;
  email: string;
  passwordHash: string;
  twoFactorSecret: string | null;
  twoFactorConfirmedAt: Date | null;
}

export interface OperatorBackupCodeRecord {
  id: string;
  codeHash: string;
}

export interface NewOperatorSessionValues {
  tokenHash: string;
  csrfHash: string;
  operatorId: string;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
}

export interface OperatorSessionRecord {
  id: string;
  operatorId: string;
  csrfHash: string;
}

/**
 * Operator sign-in's own unit of work (ADM-01, D8), mirroring SignupGateway's shape: `run` opens a
 * transaction, and every other method takes the `tx` it ran in. Session lookup is the one pool-level read
 * (no transaction needed), used by the guard on every request.
 */
export interface OperatorGateway {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  findByEmail(tx: Transaction, email: string): Promise<OperatorAccountRecord | null>;
  setTwoFactorSecret(tx: Transaction, operatorId: string, secret: string): Promise<void>;
  confirmTwoFactor(tx: Transaction, operatorId: string, at: Date): Promise<void>;
  insertBackupCodes(
    tx: Transaction,
    operatorId: string,
    codeHashes: readonly string[],
  ): Promise<void>;
  findValidBackupCodes(tx: Transaction, operatorId: string): Promise<OperatorBackupCodeRecord[]>;
  markBackupCodeUsed(tx: Transaction, id: string, at: Date): Promise<void>;
  insertSession(tx: Transaction, values: NewOperatorSessionValues): Promise<void>;
  findActiveSession(tokenHash: string, now: Date): Promise<OperatorSessionRecord | null>;
  revokeSession(sessionId: string, at: Date): Promise<void>;
}
