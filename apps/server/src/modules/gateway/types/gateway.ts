import type { CredentialUseAction, PaymentMethod } from '@lytronix/validators';

/** SEC-11: one use of a stored credential, as the operator reads it. */
export interface CredentialUseItem {
  method: PaymentMethod;
  action: CredentialUseAction;
  accountId: string;
  sessionId: string | null;
  succeeded: boolean;
  at: Date;
}

export interface CredentialUsePage {
  uses: CredentialUseItem[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}
