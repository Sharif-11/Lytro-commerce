import { Inject, Injectable } from '@nestjs/common';
import { isAccountMethod, type GatewayCredentialsInput } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import { PaymentMethods } from '../../payment-methods/services/payment-methods';
import { GatewayError } from '../ports/wallet-gateway';
import { GatewayRegistry } from './gateway-registry';

/** WAL-13: what a test of the connection found: the gateway's refusal as a code, never its raw words or a credential. */
export interface GatewayTestResult {
  ok: boolean;
  code: string | null;
}

/**
 * WAL-09, WAL-10, WAL-12, WAL-13 (Phase 5 Slice 5.7, read agreed 2026-11-03): a wallet account's gateway credentials, for the owner
 * only: sealed as they arrive and never returned. New credentials end what was held in memory for the account. Testing them
 * asks the gateway for a token and makes no payment. Each change is in the activity log, without the credentials.
 */
@Injectable()
export class GatewayAccounts {
  constructor(
    @Inject(PaymentMethods) private readonly methods: PaymentMethods,
    @Inject(GatewayRegistry) private readonly gateways: GatewayRegistry,
  ) {}

  async save(
    tenantId: string,
    accountId: string,
    input: GatewayCredentialsInput,
    actor: CatalogueActor,
  ): Promise<void> {
    const { sandbox, ...credentials } = input;
    const account = await this.methods.sealGatewayCredentials(
      tenantId,
      accountId,
      credentials,
      sandbox,
      actor,
    );
    this.gatewayOf(account.method).forget(accountId);
  }

  async remove(tenantId: string, accountId: string, actor: CatalogueActor): Promise<void> {
    const account = await this.methods.removeGatewayCredentials(tenantId, accountId, actor);
    this.gatewayOf(account.method).forget(accountId);
  }

  /** WAL-13: one test; bKash's limit on token calls is why it isn't to be run freely. */
  async test(tenantId: string, accountId: string): Promise<GatewayTestResult> {
    const account = await this.methods.accountCredentials(tenantId, accountId);
    if (!account) throw new ApiError('conflict', 'GatewayCredentialsNeeded', {});
    const gateway = this.gatewayOf(account.method);
    try {
      await gateway.testConnection({
        tenantId,
        accountId,
        sandbox: account.sandbox,
        credentials: account.credentials,
        sessionId: null,
      });
      return { ok: true, code: null };
    } catch (error) {
      if (error instanceof GatewayError) return { ok: false, code: error.code };
      throw error;
    }
  }

  private gatewayOf(method: string) {
    const gateway = isAccountMethod(method) ? this.gateways.forMethod(method) : undefined;
    if (!gateway) throw new ApiError('conflict', 'PaymentWayNotAvailable', {});
    return gateway;
  }
}
