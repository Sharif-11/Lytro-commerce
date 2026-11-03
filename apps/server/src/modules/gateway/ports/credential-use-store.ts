import type { SelectGatewayCredentialUse } from '@lytronix/db';
import type { CredentialUseLog } from './wallet-gateway';

/** SEC-11 (Slice 5.7): each shop's log of the uses of its stored gateway credentials. */
export interface CredentialUseStore extends CredentialUseLog {
  list(
    tenantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: SelectGatewayCredentialUse[]; total: number }>;
}
