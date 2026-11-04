import { and, asc, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import {
  IdentityKind,
  type PaymentMethod,
  type PaymentWay,
  type WalletAccountType,
} from '@lytronix/validators';
import {
  gatewayCredentialUses,
  paymentMethodsOn,
  paymentMethodWays,
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

  async listOn(tx: Transaction, tenantId: string): Promise<PaymentMethod[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ method: paymentMethodsOn.method })
      .from(paymentMethodsOn)
      .where(eq(paymentMethodsOn.tenantId, tenantId));
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
  async setOn(
    tx: Transaction,
    tenantId: string,
    method: PaymentMethod,
    on: boolean,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (on) {
      await tx.insert(paymentMethodsOn).values({ tenantId, method }).onConflictDoNothing();
    } else {
      await tx
        .delete(paymentMethodsOn)
        .where(and(eq(paymentMethodsOn.tenantId, tenantId), eq(paymentMethodsOn.method, method)));
    }
  }

  /** PAY-06 (Slice 5.7): the ways the owner chose; a method missing here is on its starting way. */
  async listWays(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ method: PaymentMethod; way: PaymentWay }[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select({ method: paymentMethodWays.method, way: paymentMethodWays.way })
      .from(paymentMethodWays)
      .where(eq(paymentMethodWays.tenantId, tenantId));
  }

  async setWay(
    tx: Transaction,
    tenantId: string,
    method: PaymentMethod,
    way: PaymentWay,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .insert(paymentMethodWays)
      .values({ tenantId, method, way })
      .onConflictDoUpdate({
        target: [paymentMethodWays.tenantId, paymentMethodWays.method],
        set: { way },
      });
  }

  /** WAL-09: an account's sealed credentials and environment; null removes them, and it stops being automated. */
  async setGateway(
    tx: Transaction,
    tenantId: string,
    id: string,
    values: { credentials: Buffer; sandbox: boolean } | null,
  ): Promise<SelectWalletAccount | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .update(walletAccounts)
      .set(
        values
          ? {
              gatewayCredentials: values.credentials,
              gatewaySandbox: values.sandbox,
              updatedAt: new Date(),
            }
          : {
              gatewayCredentials: null,
              gatewaySandbox: false,
              automated: false,
              updatedAt: new Date(),
            },
      )
      .where(and(eq(walletAccounts.tenantId, tenantId), eq(walletAccounts.id, id)))
      .returning();
    return row ?? null;
  }

  /** WAL-10: this account takes the method's automated payments; any other stops. */
  async selectAutomated(
    tx: Transaction,
    tenantId: string,
    method: PaymentMethod,
    id: string,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    const ofMethod = and(eq(walletAccounts.tenantId, tenantId), eq(walletAccounts.method, method));
    await tx.update(walletAccounts).set({ automated: false }).where(ofMethod);
    await tx
      .update(walletAccounts)
      .set({ automated: true, updatedAt: new Date() })
      .where(and(ofMethod, eq(walletAccounts.id, id)));
  }

  async findAccount(
    tx: Transaction,
    tenantId: string,
    id: string,
  ): Promise<SelectWalletAccount | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(walletAccounts)
      .where(and(eq(walletAccounts.tenantId, tenantId), eq(walletAccounts.id, id)));
    return row ?? null;
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
    await tx.delete(paymentMethodsOn).where(eq(paymentMethodsOn.tenantId, tenantId));
    await tx.delete(paymentMethodWays).where(eq(paymentMethodWays.tenantId, tenantId));
    // SEC-11 (Slice 5.7): the log of its credentials' uses goes with the shop.
    await tx.delete(gatewayCredentialUses).where(eq(gatewayCredentialUses.tenantId, tenantId));
  }
}
