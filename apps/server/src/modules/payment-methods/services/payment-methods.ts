import { Inject, Injectable } from '@nestjs/common';
import type { NewPaymentAccount, SelectWalletAccount, Transaction } from '@lytronix/db';
import {
  ACCOUNT_METHODS,
  ActorType,
  AuditAction,
  isAccountMethod,
  PAYMENT_METHOD_TYPES,
  PaymentWay,
  RetireState,
  ServerFieldProblemCode,
  startingWayOf,
  waysOf,
  type AccountMethod,
  type PaymentAccountInput,
  type PaymentMethod,
  type PaymentMethodInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { SecretBox, SecretPurpose, SecretUnreadable } from '../../shared/secrets/secret-box';
import { CatalogueActivity, type ResolvedActor } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import {
  PaymentMethodTypes,
  stateOf,
} from '../../payment-method-types/services/payment-method-types';
import type { PaymentMethodStore } from '../ports/payment-method-store';
import { PAYMENT_METHOD_STORE } from '../tokens';
import type {
  PaymentAccountView,
  PaymentMethodsView,
  PaymentMethodUse,
  ShopperPaymentMethod,
} from '../types/payment-methods';

// WAL-18 (Slice 8.7): Lytro retiring or removing a type acts in each shop as the server, not as a person there.
const LYTRO: ResolvedActor = { id: null, ip: null, type: ActorType.System };

/** WAL-09: an account's opened gateway credentials, for one outbound call (SEC-09). */
export interface OpenedGatewayAccount {
  accountId: string;
  method: PaymentMethod;
  sandbox: boolean;
  credentials: Readonly<Record<string, string>>;
}

function accountView(row: SelectWalletAccount, unreadable: boolean): PaymentAccountView {
  return {
    id: row.id,
    accountName: row.accountName,
    number: row.number,
    accountType: row.accountType,
    note: row.note,
    bankName: row.bankName,
    accountNumber: row.accountNumber,
    branch: row.branch,
    routingNumber: row.routingNumber,
    swiftCode: row.swiftCode,
    instructions: row.instructions,
    active: row.active,
    // WAL-09: never the credentials themselves.
    hasCredentials: row.gatewayCredentials !== null && !unreadable,
    credentialsUnreadable: unreadable,
    sandbox: row.gatewaySandbox,
    automated: row.automated,
  };
}

/** An account as it is saved: a wallet's fields or a bank's, the other kind's left empty. */
function accountOf(row: PaymentAccountInput, active: boolean): NewPaymentAccount {
  const wallet = 'number' in row;
  return {
    ...(row.id ? { id: row.id } : {}),
    accountName: row.accountName,
    number: wallet ? row.number : null,
    accountType: wallet ? row.accountType : null,
    note: wallet ? (row.note ?? null) : null,
    bankName: wallet ? null : row.bankName,
    accountNumber: wallet ? null : row.accountNumber,
    branch: wallet ? null : (row.branch ?? null),
    routingNumber: wallet ? null : (row.routingNumber ?? null),
    swiftCode: wallet ? null : (row.swiftCode ?? null),
    instructions: wallet ? null : (row.instructions ?? null),
    active,
  };
}

function shopperView(
  method: AccountMethod,
  row: SelectWalletAccount,
  way: PaymentWay,
): ShopperPaymentMethod {
  const { kind } = PAYMENT_METHOD_TYPES[method];
  return {
    accountId: row.id,
    method,
    kind,
    way,
    accountName: row.accountName,
    number: row.number,
    accountType: row.accountType,
    note: row.note,
    bank:
      row.bankName !== null && row.accountNumber !== null
        ? {
            bankName: row.bankName,
            accountNumber: row.accountNumber,
            branch: row.branch,
            routingNumber: row.routingNumber,
            swiftCode: row.swiftCode,
            instructions: row.instructions,
          }
        : null,
  };
}

/**
 * WAL-01 to WAL-07, WAL-14 to WAL-18 (Phase 5 Slice 5.1, read agreed 2026-10-31): the accounts a shop takes money into,
 * method by method -- bKash, Nagad, Rocket, Upay and bank transfer (D5-6) -- and which methods the owner turned on, each
 * starting off (WAL-05, amended 2026-11-04). Only the owner
 * changes them (WAL-07 amended); each save replaces the method's list whole, the first account sent active being the
 * only active one (WAL-03), nothing made active on its own (WAL-04), and is in the activity log with the active
 * account's number. Shoppers see a method's active account only while the method is on (WAL-05, WAL-06), and nothing
 * until the owner's phone is verified, since the payment page refuses a shop without one (TVR-01).
 */
@Injectable()
export class PaymentMethods {
  constructor(
    @Inject(PAYMENT_METHOD_STORE) private readonly store: PaymentMethodStore,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(SecretBox) private readonly box: SecretBox,
    @Inject(PaymentMethodTypes) private readonly types: PaymentMethodTypes,
  ) {}

  list(tenantId: string): Promise<PaymentMethodsView> {
    return this.store.run(tenantId, (tx) => this.viewWithin(tx, tenantId));
  }

  async save(
    tenantId: string,
    method: AccountMethod,
    input: PaymentMethodInput,
    actor: CatalogueActor,
  ): Promise<PaymentMethodsView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      const current = await this.store.lockMethod(tx, tenantId, method);
      await this.checkType(tx, tenantId, method, current.length > 0);
      const known = new Set(current.map((row) => row.id));
      const strangers = input.accounts.flatMap((row, index) =>
        row.id !== undefined && !known.has(row.id)
          ? [
              {
                field: `accounts.${String(index)}.id`,
                problem: ServerFieldProblemCode.NotFound,
                messageKey: 'PaymentAccountNotFound' as const,
              },
            ]
          : [],
      );
      if (strangers.length > 0) throw new FieldsError(strangers);
      // WAL-11: a shopper paying through an account at its wallet keeps it until they are done (found at the Phase 5 close-out).
      const kept = new Set(input.accounts.map((row) => row.id));
      const removed = current.filter((row) => !kept.has(row.id)).map((row) => row.id);
      if (await this.store.checkoutOpenOn(tx, tenantId, removed)) {
        throw new ApiError('conflict', 'PaymentAccountCheckoutOpen', {});
      }
      const firstActive = input.accounts.findIndex((row) => row.active === true);
      const accounts = input.accounts.map((row, index) => accountOf(row, index === firstActive));
      await this.store.replaceMethod(tx, tenantId, method, accounts);
      await this.store.setOn(tx, tenantId, method, input.enabled);
      const active = accounts[firstActive];
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.PaymentMethodSaved,
        { type: 'payment_method', id: null },
        {
          method,
          enabled: input.enabled,
          accounts: accounts.length,
          active: active ? (active.number ?? active.accountNumber) : null,
        },
      );
      return this.viewWithin(tx, tenantId);
    });
  }

  /** WAL-06, TVR-01: each method that is on with its active account, for checkout and the payment page. */
  forShoppers(tenantId: string): Promise<ShopperPaymentMethod[]> {
    return this.store.run(tenantId, (tx) => this.forShoppersWithin(tx, tenantId));
  }

  /** The same, in the caller's transaction (Slice 5.2: an order's payment and the page's). */
  async forShoppersWithin(tx: Transaction, tenantId: string): Promise<ShopperPaymentMethod[]> {
    if (!(await this.store.ownerPhoneVerified(tx, tenantId))) return [];
    return this.offeredWithin(tx, tenantId);
  }

  /** SUP-01: whether a method is on with an account to show, which ticks the checklist's wallet item. */
  hasLiveAccount(tenantId: string): Promise<boolean> {
    return this.store.run(
      tenantId,
      async (tx) => (await this.offeredWithin(tx, tenantId)).length > 0,
    );
  }

  /** Each method that is on with the account it shows, whatever the owner's phone says. */
  private async offeredWithin(tx: Transaction, tenantId: string): Promise<ShopperPaymentMethod[]> {
    const on = new Set<string>(await this.store.listOn(tx, tenantId));
    const rows = await this.store.list(tx, tenantId);
    const chosen = await this.store.listWays(tx, tenantId);
    return ACCOUNT_METHODS.flatMap((method) => {
      if (!on.has(method)) return [];
      const way = chosen.find((row) => row.method === method)?.way ?? startingWayOf(method);
      // WAL-19: an account may take level 1 and level 3 apart; a shop on automated checkout may have none active by hand.
      const shown =
        rows.find((row) => row.method === method && row.active) ??
        (way === PaymentWay.Automated
          ? rows.find((row) => row.method === method && row.automated)
          : undefined);
      return shown ? [shopperView(method, shown, way)] : [];
    });
  }

  /** PAY-06 (amended 2026-11-03): how the shop takes this method's money. */
  async wayOfWithin(tx: Transaction, tenantId: string, method: PaymentMethod): Promise<PaymentWay> {
    if (!isAccountMethod(method)) return PaymentWay.Manual;
    const chosen = await this.store.listWays(tx, tenantId);
    return chosen.find((row) => row.method === method)?.way ?? startingWayOf(method);
  }

  /**
   * PAY-06 (Slice 5.7 read, agreed 2026-11-03): the owner chooses how a method's money is taken, among the ways it supports.
   * Automated needs an account selected with credentials that open (WAL-10, WAL-12).
   */
  async chooseWay(
    tenantId: string,
    method: AccountMethod,
    way: PaymentWay,
    actor: CatalogueActor,
  ): Promise<PaymentMethodsView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      if (!waysOf(method).includes(way)) {
        throw new ApiError('conflict', 'PaymentWayNotAvailable', {});
      }
      const held = await this.store.lockMethod(tx, tenantId, method);
      await this.checkType(tx, tenantId, method, held.length > 0);
      if (
        way === PaymentWay.Automated &&
        !(await this.automatedAccountWithin(tx, tenantId, method))
      ) {
        throw new ApiError('conflict', 'GatewayCredentialsNeeded', {});
      }
      await this.store.setWay(tx, tenantId, method, way);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.PaymentWayChosen,
        { type: 'payment_method', id: null },
        { method, way },
      );
      return this.viewWithin(tx, tenantId);
    });
  }

  /** WAL-10: the account selected for the method's automated payments, its credentials opened; null when there's none usable. */
  async automatedAccountWithin(
    tx: Transaction,
    tenantId: string,
    method: PaymentMethod,
  ): Promise<OpenedGatewayAccount | null> {
    const rows = await this.store.list(tx, tenantId);
    const row = rows.find((account) => account.method === method && account.automated);
    return row ? this.openedOf(row) : null;
  }

  /** VER-12: an account by its id, in the caller's transaction, as a payment records what it was paid into. */
  async accountWithin(
    tx: Transaction,
    tenantId: string,
    accountId: string,
  ): Promise<{ accountId: string; accountName: string; number: string | null } | null> {
    const row = await this.store.findAccount(tx, tenantId, accountId);
    return row ? { accountId: row.id, accountName: row.accountName, number: row.number } : null;
  }

  /** WAL-11: an account's credentials by its id, whatever is selected now; null when they don't open (WAL-12). */
  accountCredentials(tenantId: string, accountId: string): Promise<OpenedGatewayAccount | null> {
    return this.store.run(tenantId, async (tx) => {
      const row = await this.store.findAccount(tx, tenantId, accountId);
      return row ? this.openedOf(row) : null;
    });
  }

  /** WAL-09, SEC-01: credentials sealed to this shop and this purpose, so a copied value opens nowhere else. */
  async sealGatewayCredentials(
    tenantId: string,
    accountId: string,
    credentials: Readonly<Record<string, string>>,
    sandbox: boolean,
    actor: CatalogueActor,
  ): Promise<SelectWalletAccount> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      const row = await this.store.setGateway(tx, tenantId, accountId, {
        credentials: this.box.seal(
          JSON.stringify(credentials),
          SecretPurpose.GatewayCredentials,
          tenantId,
        ),
        sandbox,
      });
      if (!row) throw new ApiError('not_found', 'PaymentAccountNotFound', {});
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.GatewayCredentialsSaved,
        { type: 'payment_method', id: accountId },
        { method: row.method, sandbox },
      );
      return row;
    });
  }

  async removeGatewayCredentials(
    tenantId: string,
    accountId: string,
    actor: CatalogueActor,
  ): Promise<SelectWalletAccount> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      if (await this.store.checkoutOpenOn(tx, tenantId, [accountId])) {
        throw new ApiError('conflict', 'PaymentAccountCheckoutOpen', {});
      }
      const row = await this.store.setGateway(tx, tenantId, accountId, null);
      if (!row) throw new ApiError('not_found', 'PaymentAccountNotFound', {});
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.GatewayCredentialsRemoved,
        { type: 'payment_method', id: accountId },
        { method: row.method },
      );
      return row;
    });
  }

  /** WAL-10: this account takes the method's automated payments; it must hold credentials that open. */
  async selectAutomated(
    tenantId: string,
    accountId: string,
    actor: CatalogueActor,
  ): Promise<PaymentMethodsView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      const row = await this.store.findAccount(tx, tenantId, accountId);
      if (!row) throw new ApiError('not_found', 'PaymentAccountNotFound', {});
      if (!this.openedOf(row)) throw new ApiError('conflict', 'GatewayCredentialsNeeded', {});
      await this.store.selectAutomated(tx, tenantId, row.method, row.id);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.GatewayAccountSelected,
        { type: 'payment_method', id: row.id },
        { method: row.method },
      );
      return this.viewWithin(tx, tenantId);
    });
  }

  /** WAL-18 (Slice 8.7): every shop whose data is still here, for the operator retiring a type. */
  shopIds(): Promise<string[]> {
    return this.store.listShopIds();
  }

  /** WAL-18, D8-67: how the shop uses each type -- switched on, accounts saved, and payments still open on it. */
  typeUse(tenantId: string): Promise<Map<AccountMethod, PaymentMethodUse>> {
    return this.store.run(tenantId, async (tx) => {
      const on = new Set<string>(await this.store.listOn(tx, tenantId));
      const rows = await this.store.list(tx, tenantId);
      const open = await this.store.openByMethod(tx, tenantId);
      return new Map(
        ACCOUNT_METHODS.map((method) => [
          method,
          {
            on: on.has(method),
            accounts: rows.filter((row) => row.method === method).length,
            openPayments: open.find((row) => row.method === method)?.open ?? 0,
          },
        ]),
      );
    });
  }

  /**
   * WAL-18, D8-66: Lytro retiring a type, or undoing it, goes in the activity log of a shop that set it up -- switched it on, or
   * saved an account for it. False for a shop that hadn't, which isn't told.
   */
  noteTypeChange(
    tenantId: string,
    method: AccountMethod,
    action: AuditAction.PaymentMethodRetiring | AuditAction.PaymentMethodRetiringUndone,
  ): Promise<boolean> {
    return this.store.run(tenantId, async (tx) => {
      if (!(await this.setUpWithin(tx, tenantId, method))) return false;
      await this.activity.record(
        tx,
        tenantId,
        LYTRO,
        action,
        { type: 'payment_method', id: null },
        { method },
      );
      return true;
    });
  }

  /**
   * WAL-18, D8-67: a removed type goes from the shop -- its accounts for it, its switch and its way -- held as a save holds the
   * method. Payments already made keep what they were paid into. False for a shop that had nothing of it.
   */
  forgetType(tenantId: string, method: AccountMethod): Promise<boolean> {
    return this.store.run(tenantId, async (tx) => {
      await this.store.lockMethod(tx, tenantId, method);
      if (!(await this.setUpWithin(tx, tenantId, method))) return false;
      const accounts = await this.store.deleteMethod(tx, tenantId, method);
      await this.activity.record(
        tx,
        tenantId,
        LYTRO,
        AuditAction.PaymentMethodRemoved,
        { type: 'payment_method', id: null },
        { method, accounts },
      );
      return true;
    });
  }

  /**
   * WAL-18, D8-65: a removed type is gone for every shop; a retiring one only for a shop that never set it up, while one that
   * did keeps changing its accounts and switching it on and off. Read shared, so a removal waits for this save (D8-67).
   */
  private async checkType(
    tx: Transaction,
    tenantId: string,
    method: AccountMethod,
    hasAccounts: boolean,
  ): Promise<void> {
    const state = await this.types.sharedStateWithin(tx, method);
    if (state === RetireState.Removed) throw new ApiError('not_found', 'PaymentMethodNotFound', {});
    if (
      state === RetireState.Retiring &&
      !hasAccounts &&
      !(await this.store.listOn(tx, tenantId)).includes(method)
    ) {
      throw new ApiError('conflict', 'PaymentMethodRetiring', {});
    }
  }

  private async setUpWithin(
    tx: Transaction,
    tenantId: string,
    method: AccountMethod,
  ): Promise<boolean> {
    if ((await this.store.listOn(tx, tenantId)).includes(method)) return true;
    return (await this.store.list(tx, tenantId)).some((row) => row.method === method);
  }

  /** WAL-12: credentials that don't open (the key changed) count as none, for the owner to enter again. */
  private openedOf(row: SelectWalletAccount): OpenedGatewayAccount | null {
    if (row.gatewayCredentials === null) return null;
    try {
      return {
        accountId: row.id,
        method: row.method,
        sandbox: row.gatewaySandbox,
        credentials: JSON.parse(
          this.box.open(row.gatewayCredentials, SecretPurpose.GatewayCredentials, row.tenantId),
        ) as Record<string, string>,
      };
    } catch (error) {
      if (error instanceof SecretUnreadable) return null;
      throw error;
    }
  }

  /** WAL-18, D8-65: a removed type isn't shown, and a retiring one only to a shop that set it up, marked as retiring. */
  private async viewWithin(tx: Transaction, tenantId: string): Promise<PaymentMethodsView> {
    const on = new Set<string>(await this.store.listOn(tx, tenantId));
    const rows = await this.store.list(tx, tenantId);
    const chosen = await this.store.listWays(tx, tenantId);
    const states = await this.types.states();
    return {
      methods: ACCOUNT_METHODS.flatMap((method) => {
        const state = stateOf(states, method);
        const accounts = rows.filter((row) => row.method === method);
        if (state === RetireState.Removed) return [];
        if (state === RetireState.Retiring && !on.has(method) && accounts.length === 0) return [];
        return [
          {
            method,
            kind: PAYMENT_METHOD_TYPES[method].kind,
            enabled: on.has(method),
            retiring: state === RetireState.Retiring,
            levels: [...PAYMENT_METHOD_TYPES[method].levels],
            way: chosen.find((row) => row.method === method)?.way ?? startingWayOf(method),
            ways: waysOf(method),
            accounts: accounts.map((row) =>
              accountView(row, row.gatewayCredentials !== null && this.openedOf(row) === null),
            ),
          },
        ];
      }),
      ownerPhoneVerified: await this.store.ownerPhoneVerified(tx, tenantId),
    };
  }
}
