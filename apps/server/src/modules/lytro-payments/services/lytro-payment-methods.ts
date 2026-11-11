import { Inject, Injectable } from '@nestjs/common';
import type { NewPlatformBankAccount, SelectPlatformPaymentMethod } from '@lytronix/db';
import {
  ACCOUNT_METHODS,
  AuditResult,
  isAccountMethod,
  PAYMENT_METHOD_TYPES,
  PaymentMethodKind,
  PaymentWay,
  PlatformActorType,
  PlatformAuditAction,
  RetireState,
  startingWayOf,
  WalletAccountType,
  waysOf,
  type AccountMethod,
  type CreatePlatformBankAccountInput,
  type PlatformGatewayKeysInput,
  type UpdatePlatformBankAccountInput,
  type UpdatePlatformPaymentMethodInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { PlatformWalletsService } from '../../balance/services/platform-wallets.service';
import type { PlatformWallet } from '../../balance/types/platform-wallet';
import {
  GatewayError,
  LYTRO_GATEWAY_OWNER,
  type GatewayAccount,
  type WalletGateway,
} from '../../gateway/ports/wallet-gateway';
import { GatewayRegistry } from '../../gateway/services/gateway-registry';
import {
  PaymentMethodTypes,
  stateOf,
} from '../../payment-method-types/services/payment-method-types';
import type { ShopperPaymentMethod } from '../../payment-methods/types/payment-methods';
import { SecretBox, SecretPurpose, SecretUnreadable } from '../../shared/secrets/secret-box';
import type { LytroPaymentMethodStore } from '../ports/lytro-payment-method-store';
import { LYTRO_PAYMENT_METHOD_STORE } from '../tokens';
import type {
  LytroBankAccount,
  LytroGatewayTest,
  LytroGatewayView,
  LytroPaymentMethodsView,
} from '../types/lytro-payments';

interface Choice {
  enabled: boolean;
  way: PaymentWay;
}

/** What a method is set to; with no row, on and by the way it starts on, so nothing changes until the operator acts. */
function choiceOf(rows: readonly SelectPlatformPaymentMethod[], method: AccountMethod): Choice {
  const row = rows.find((each) => each.method === method);
  return row
    ? { enabled: row.enabled, way: row.way }
    : { enabled: true, way: startingWayOf(method) };
}

function accountIdOf(method: AccountMethod): string {
  return `lytro:${method}`;
}

function walletView(
  method: AccountMethod,
  wallet: PlatformWallet,
  way: PaymentWay,
): ShopperPaymentMethod {
  return {
    accountId: wallet.id,
    method,
    kind: PaymentMethodKind.Wallet,
    way,
    accountName: 'Lytro',
    number: wallet.number,
    accountType: WalletAccountType.Personal,
    note: null,
    bank: null,
  };
}

function bankView(method: AccountMethod, bank: LytroBankAccount): ShopperPaymentMethod {
  return {
    accountId: bank.id,
    method,
    kind: PaymentMethodKind.Bank,
    way: PaymentWay.Manual,
    accountName: bank.accountName,
    number: null,
    accountType: null,
    note: null,
    bank: {
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      branch: bank.branch,
      routingNumber: bank.routingNumber,
      swiftCode: bank.swiftCode,
      instructions: bank.instructions,
    },
  };
}

/**
 * OPERATOR-CONSOLE-DESIGN §10, ADM-10 (2026-11-09): what shops may pay Lytro by, the way each method's payments are confirmed, Lytro's bank
 * accounts and its own checkout keys. A shop sees a method that is on with a number or account shown; with several shown, the first in
 * the operator's order. Each change and its platform audit entry commit together; the keys are sealed as they arrive and never returned.
 */
@Injectable()
export class LytroPaymentMethods {
  constructor(
    @Inject(LYTRO_PAYMENT_METHOD_STORE) private readonly store: LytroPaymentMethodStore,
    @Inject(PlatformWalletsService) private readonly wallets: PlatformWalletsService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
    @Inject(GatewayRegistry) private readonly gateways: GatewayRegistry,
    @Inject(SecretBox) private readonly box: SecretBox,
    @Inject(PaymentMethodTypes) private readonly types: PaymentMethodTypes,
  ) {}

  /** WAL-18 (Slice 8.7): whether Lytro's own page takes this method now, which holds its type back from removal (D8-67). */
  async takes(method: AccountMethod): Promise<boolean> {
    return choiceOf(await this.store.choices(), method).enabled;
  }

  /** WAL-18, D8-67 (Slice 8.7): a removed type is gone from Lytro's page too; retiring one leaves Lytro's own as it is. */
  async view(): Promise<LytroPaymentMethodsView> {
    const [choices, bankAccounts, states] = await Promise.all([
      this.store.choices(),
      this.store.bankAccounts(false),
      this.types.states(),
    ]);
    const kept = ACCOUNT_METHODS.filter(
      (method) => stateOf(states, method) !== RetireState.Removed,
    );
    const methods = await Promise.all(
      kept.map(async (method) => {
        const ways = waysOf(method);
        return {
          method,
          kind: PAYMENT_METHOD_TYPES[method].kind,
          ...choiceOf(choices, method),
          ways,
          gateway: ways.includes(PaymentWay.Automated) ? await this.gatewayView(method) : null,
        };
      }),
    );
    return { methods, bankAccounts };
  }

  /** WAL-06: what a shop paying Lytro may pick now, in the methods' own order. */
  async offered(): Promise<ShopperPaymentMethod[]> {
    const [choices, wallets, banks, states] = await Promise.all([
      this.store.choices(),
      this.wallets.list(true),
      this.store.bankAccounts(true),
      this.types.states(),
    ]);
    return ACCOUNT_METHODS.flatMap((method) => {
      const { enabled, way } = choiceOf(choices, method);
      if (!enabled || stateOf(states, method) === RetireState.Removed) return [];
      if (PAYMENT_METHOD_TYPES[method].kind === PaymentMethodKind.Bank) {
        const bank = banks[0];
        return bank ? [bankView(method, bank)] : [];
      }
      const wallet = wallets.find((each) => {
        const provider = each.provider.toLowerCase();
        return isAccountMethod(provider) && provider === method;
      });
      return wallet ? [walletView(method, wallet, way)] : [];
    });
  }

  /** How a method's payments are confirmed now. */
  async wayOf(method: AccountMethod): Promise<PaymentWay> {
    return choiceOf(await this.store.choices(), method).way;
  }

  async update(
    rawMethod: string,
    input: UpdatePlatformPaymentMethodInput,
    operatorId: string,
  ): Promise<LytroPaymentMethodsView> {
    const method = this.methodOf(rawMethod);
    const current = choiceOf(await this.store.choices(), method);
    const next: Choice = {
      enabled: input.enabled ?? current.enabled,
      way: input.way ?? current.way,
    };
    if (!waysOf(method).includes(next.way)) {
      throw new ApiError('conflict', 'PaymentWayNotAvailable', {});
    }
    if (next.way === PaymentWay.Automated && !(await this.gatewayFor(method, null))) {
      throw new ApiError('conflict', 'GatewayCredentialsNeeded', {});
    }
    await this.store.run(async (tx) => {
      // D8-67: read shared, so a removal in flight finishes first and this change then sees it.
      if ((await this.types.sharedStateWithin(tx, method)) === RetireState.Removed) {
        throw new ApiError('not_found', 'PaymentMethodNotFound', {});
      }
      await this.store.saveChoice(tx, method, next);
      await this.record(tx, operatorId, PlatformAuditAction.PlatformPaymentMethodChanged, null, {
        method,
        ...next,
      });
    });
    return this.view();
  }

  addBankAccount(
    input: CreatePlatformBankAccountInput,
    operatorId: string,
  ): Promise<LytroBankAccount> {
    return this.store.run(async (tx) => {
      const account = await this.store.addBankAccount(tx, this.bankValues(input));
      await this.record(
        tx,
        operatorId,
        PlatformAuditAction.PlatformBankAccountAdded,
        account.id,
        {},
      );
      return account;
    });
  }

  updateBankAccount(
    id: string,
    input: UpdatePlatformBankAccountInput,
    operatorId: string,
  ): Promise<LytroBankAccount> {
    return this.store.run(async (tx) => {
      const account = await this.store.updateBankAccount(tx, id, this.bankValues(input));
      if (!account) throw new ApiError('not_found', 'PaymentAccountNotFound', {});
      await this.record(tx, operatorId, PlatformAuditAction.PlatformBankAccountUpdated, id, {});
      return account;
    });
  }

  removeBankAccount(id: string, operatorId: string): Promise<void> {
    return this.store.run(async (tx) => {
      // D8-75: a payment recorded to it keeps naming it; the operator turns it off instead.
      if (await this.store.bankAccountUsed(tx, id)) {
        throw new ApiError('conflict', 'PlatformBankAccountInUse', {});
      }
      if (!(await this.store.removeBankAccount(tx, id))) {
        throw new ApiError('not_found', 'PaymentAccountNotFound', {});
      }
      await this.record(tx, operatorId, PlatformAuditAction.PlatformBankAccountRemoved, id, {});
    });
  }

  /** WAL-09: all four keys, sealed and never shown again. New keys end what was held in memory for the account. */
  async saveKeys(
    rawMethod: string,
    input: PlatformGatewayKeysInput,
    operatorId: string,
  ): Promise<void> {
    const method = this.methodOf(rawMethod);
    const gateway = this.gatewayOf(method);
    const { sandbox, number, ...credentials } = input;
    await this.store.run(async (tx) => {
      await this.store.saveGatewayAccount(tx, {
        method,
        number,
        sandbox,
        credentials: this.box.seal(
          JSON.stringify(credentials),
          SecretPurpose.GatewayCredentials,
          LYTRO_GATEWAY_OWNER,
        ),
      });
      await this.record(tx, operatorId, PlatformAuditAction.PlatformGatewayKeysSaved, null, {
        method,
        sandbox,
      });
    });
    gateway.forget(accountIdOf(method));
  }

  /** Removing the keys stops automatic checkout: the method goes back to the way it starts on. */
  async removeKeys(rawMethod: string, operatorId: string): Promise<void> {
    const method = this.methodOf(rawMethod);
    const gateway = this.gatewayOf(method);
    const current = choiceOf(await this.store.choices(), method);
    await this.store.run(async (tx) => {
      if (!(await this.store.removeGatewayAccount(tx, method))) {
        throw new ApiError('conflict', 'GatewayCredentialsNeeded', {});
      }
      if (current.way === PaymentWay.Automated) {
        await this.store.saveChoice(tx, method, { ...current, way: startingWayOf(method) });
      }
      await this.record(tx, operatorId, PlatformAuditAction.PlatformGatewayKeysRemoved, null, {
        method,
      });
    });
    gateway.forget(accountIdOf(method));
  }

  /** WAL-13: one test; bKash's limit on token calls is why it isn't to be run freely. */
  async testKeys(rawMethod: string): Promise<LytroGatewayTest> {
    const method = this.methodOf(rawMethod);
    const opened = await this.gatewayFor(method, null);
    if (!opened) throw new ApiError('conflict', 'GatewayCredentialsNeeded', {});
    try {
      await opened.gateway.testConnection(opened.account);
      return { ok: true, code: null };
    } catch (error) {
      if (error instanceof GatewayError) return { ok: false, code: error.code };
      throw error;
    }
  }

  /** WAL-11: Lytro's account for this method's checkout, its keys opened for the call; null with none, or none that open (WAL-12). */
  async gatewayFor(
    method: AccountMethod,
    paymentId: string | null,
  ): Promise<{ gateway: WalletGateway; account: GatewayAccount } | null> {
    const gateway = this.gateways.forMethod(method);
    if (!gateway) return null;
    const row = await this.store.gatewayAccount(method);
    if (!row) return null;
    const credentials = this.opened(row.credentials);
    if (credentials === null || !gateway.isConfigured(credentials)) return null;
    return {
      gateway,
      account: {
        tenantId: LYTRO_GATEWAY_OWNER,
        accountId: accountIdOf(method),
        sandbox: row.sandbox,
        credentials,
        sessionId: paymentId,
      },
    };
  }

  private async gatewayView(method: AccountMethod): Promise<LytroGatewayView> {
    const row = await this.store.gatewayAccount(method);
    if (!row) return { connected: false, unreadable: false, sandbox: false, number: null };
    const readable = this.opened(row.credentials) !== null;
    return {
      connected: readable,
      unreadable: !readable,
      sandbox: row.sandbox,
      number: row.number,
    };
  }

  private opened(sealed: Buffer): Record<string, string> | null {
    try {
      return JSON.parse(
        this.box.open(sealed, SecretPurpose.GatewayCredentials, LYTRO_GATEWAY_OWNER),
      ) as Record<string, string>;
    } catch (error) {
      if (error instanceof SecretUnreadable) return null;
      throw error;
    }
  }

  private methodOf(raw: string): AccountMethod {
    if (!isAccountMethod(raw)) throw new ApiError('not_found', 'PaymentMethodNotFound', {});
    return raw;
  }

  private gatewayOf(method: AccountMethod): WalletGateway {
    const gateway = this.gateways.forMethod(method);
    if (!gateway) throw new ApiError('conflict', 'PaymentWayNotAvailable', {});
    return gateway;
  }

  private bankValues(input: UpdatePlatformBankAccountInput): NewPlatformBankAccount {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).filter(([, value]) => value !== undefined),
    ) as unknown as NewPlatformBankAccount;
  }

  private record(
    tx: Parameters<Parameters<LytroPaymentMethodStore['run']>[0]>[0],
    operatorId: string,
    action: PlatformAuditAction,
    targetId: string | null,
    summary: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.recordWithin(tx, {
      actorType: PlatformActorType.Operator,
      actorId: operatorId,
      action,
      targetType: 'platform_payment_method',
      targetId,
      result: AuditResult.Success,
      ip: null,
      summary,
    });
  }
}
