import { and, asc, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import { IdentityKind, type PaymentMethod, type WalletAccountType } from '@lytronix/validators';
import {
  paymentMethodsOff,
  subscriberIdentities,
  tenants,
  walletAccounts,
  type SelectWalletAccount,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

/** WAL-01, WAL-14: one account as the owner saves it; an `id` keeps an account already saved. */
export interface NewPaymentAccount {
  id?: string;
  accountName: string;
  number: string | null;
  accountType: WalletAccountType | null;
  note: string | null;
  bankName: string | null;
  accountNumber: string | null;
  branch: string | null;
  routingNumber: string | null;
  swiftCode: string | null;
  instructions: string | null;
  active: boolean;
}

// WAL-01 to WAL-17 (Phase 5 Slice 5.1): a shop's payment accounts and the methods it switched off. Every method sets the
// shop's tenant context.
export class PaymentMethodRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /** Every account, method by method, each in the order the shop listed them. */
  async list(tx: Transaction, tenantId: string): Promise<SelectWalletAccount[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(walletAccounts)
      .where(eq(walletAccounts.tenantId, tenantId))
      .orderBy(asc(walletAccounts.method), asc(walletAccounts.position));
  }

  async listOff(tx: Transaction, tenantId: string): Promise<PaymentMethod[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ method: paymentMethodsOff.method })
      .from(paymentMethodsOff)
      .where(eq(paymentMethodsOff.tenantId, tenantId));
    return rows.map((row) => row.method);
  }

  /**
   * One method's accounts, held until the transaction ends, so two saves of the method never interleave -- by an
   * advisory lock, which holds even while the method has no accounts to lock.
   */
  async lockMethod(
    tx: Transaction,
    tenantId: string,
    method: PaymentMethod,
  ): Promise<SelectWalletAccount[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`wallet_accounts:${tenantId}:${method}`}, 0))`,
    );
    return tx
      .select()
      .from(walletAccounts)
      .where(and(eq(walletAccounts.tenantId, tenantId), eq(walletAccounts.method, method)))
      .orderBy(asc(walletAccounts.position))
      .for('update');
  }

  /**
   * WAL-03, WAL-04: the method's accounts become exactly `accounts`, in order. Accounts left out are deleted; those named
   * by id are changed in place, so a payment that names one still finds it. Kept accounts first take a stand-in number,
   * inactive, so two of them can swap numbers, or the active mark, without tripping the unique indexes on the way.
   */
  async replaceMethod(
    tx: Transaction,
    tenantId: string,
    method: PaymentMethod,
    accounts: readonly NewPaymentAccount[],
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    const ofMethod = and(eq(walletAccounts.tenantId, tenantId), eq(walletAccounts.method, method));
    const keptIds = accounts.flatMap((row) => (row.id ? [row.id] : []));
    await tx
      .delete(walletAccounts)
      .where(keptIds.length > 0 ? and(ofMethod, notInArray(walletAccounts.id, keptIds)) : ofMethod);
    if (keptIds.length > 0) {
      // A digit-only wallet number or a bank account number never starts with '~', and positions differ.
      await tx
        .update(walletAccounts)
        .set({
          active: false,
          number: sql`CASE WHEN ${walletAccounts.number} IS NULL THEN NULL ELSE '~' || ${walletAccounts.position} END`,
          accountNumber: sql`CASE WHEN ${walletAccounts.accountNumber} IS NULL THEN NULL ELSE '~' || ${walletAccounts.position} END`,
        })
        .where(and(ofMethod, inArray(walletAccounts.id, keptIds)));
    }
    for (const [position, row] of accounts.entries()) {
      const { id, ...values } = row;
      if (id) {
        await tx
          .update(walletAccounts)
          .set({ ...values, position, updatedAt: new Date() })
          .where(and(ofMethod, eq(walletAccounts.id, id)));
      } else {
        await tx.insert(walletAccounts).values({ tenantId, method, ...values, position });
      }
    }
  }

  /** WAL-05: a method switched off, or on again. */
  async setOff(
    tx: Transaction,
    tenantId: string,
    method: PaymentMethod,
    off: boolean,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (off) {
      await tx.insert(paymentMethodsOff).values({ tenantId, method }).onConflictDoNothing();
    } else {
      await tx
        .delete(paymentMethodsOff)
        .where(and(eq(paymentMethodsOff.tenantId, tenantId), eq(paymentMethodsOff.method, method)));
    }
  }

  /** TVR-01: whether the shop's owner has a verified phone, which the payment page needs. */
  async ownerPhoneVerified(tx: Transaction, tenantId: string): Promise<boolean> {
    const rows = await tx
      .select({ id: subscriberIdentities.id })
      .from(tenants)
      .innerJoin(subscriberIdentities, eq(subscriberIdentities.subscriberId, tenants.subscriberId))
      .where(
        and(
          eq(tenants.id, tenantId),
          eq(subscriberIdentities.kind, IdentityKind.Phone),
          isNotNull(subscriberIdentities.verifiedAt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /** LIF-19: the day-60 deletion's payment-methods step. */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(walletAccounts).where(eq(walletAccounts.tenantId, tenantId));
    await tx.delete(paymentMethodsOff).where(eq(paymentMethodsOff.tenantId, tenantId));
  }
}
