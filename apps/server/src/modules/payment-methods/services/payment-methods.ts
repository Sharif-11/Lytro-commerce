import { Inject, Injectable } from '@nestjs/common';
import type { NewPaymentAccount, SelectWalletAccount, Transaction } from '@lytronix/db';
import {
  ACCOUNT_METHODS,
  AuditAction,
  PAYMENT_METHOD_TYPES,
  ServerFieldProblemCode,
  type AccountMethod,
  type PaymentAccountInput,
  type PaymentMethodInput,
} from '@lytronix/validators';
import { FieldsError } from '../../../common/api-error';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import type { PaymentMethodStore } from '../ports/payment-method-store';
import { PAYMENT_METHOD_STORE } from '../tokens';
import type {
  PaymentAccountView,
  PaymentMethodsView,
  ShopperPaymentMethod,
} from '../types/payment-methods';

function accountView(row: SelectWalletAccount): PaymentAccountView {
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

function shopperView(method: AccountMethod, row: SelectWalletAccount): ShopperPaymentMethod {
  const { kind } = PAYMENT_METHOD_TYPES[method];
  return {
    accountId: row.id,
    method,
    kind,
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
 * method by method -- bKash, Nagad, Rocket, Upay and bank transfer (D5-6) -- and which methods are on. Only the owner
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
      const firstActive = input.accounts.findIndex((row) => row.active === true);
      const accounts = input.accounts.map((row, index) => accountOf(row, index === firstActive));
      await this.store.replaceMethod(tx, tenantId, method, accounts);
      await this.store.setOff(tx, tenantId, method, !input.enabled);
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
    const off = new Set<string>(await this.store.listOff(tx, tenantId));
    const rows = await this.store.list(tx, tenantId);
    return ACCOUNT_METHODS.flatMap((method) => {
      const active = off.has(method)
        ? undefined
        : rows.find((row) => row.method === method && row.active);
      return active ? [shopperView(method, active)] : [];
    });
  }

  private async viewWithin(tx: Transaction, tenantId: string): Promise<PaymentMethodsView> {
    const off = new Set<string>(await this.store.listOff(tx, tenantId));
    const rows = await this.store.list(tx, tenantId);
    return {
      methods: ACCOUNT_METHODS.map((method) => ({
        method,
        kind: PAYMENT_METHOD_TYPES[method].kind,
        enabled: !off.has(method),
        levels: [...PAYMENT_METHOD_TYPES[method].levels],
        accounts: rows.filter((row) => row.method === method).map(accountView),
      })),
      ownerPhoneVerified: await this.store.ownerPhoneVerified(tx, tenantId),
    };
  }
}
