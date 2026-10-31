import { and, count, desc, eq, gte } from 'drizzle-orm';
import { PaymentPageReportStatus, type PaymentPageReportReason } from '@lytronix/validators';
import { paymentPageReports, tenants, type SelectPaymentPageReport } from '../../schema';
import type { Executor } from '../../transactions';

/** ADM-12: a report as the operator's queue lists it, with its shop. */
export interface PaymentPageReportRow extends SelectPaymentPageReport {
  shopName: string;
  slug: string;
  paymentPageSuspendedAt: Date | null;
}

// TVR-02, ADM-12 (Phase 5 Slice 5.2b): shoppers' reports of payment pages, in control, as the operator reads every
// shop's.
export class PaymentPageReportRepository {
  async insert(
    db: Executor,
    values: {
      tenantId: string;
      ref: string;
      reason: PaymentPageReportReason;
      note: string | null;
      ip: string | null;
    },
  ): Promise<void> {
    await db.insert(paymentPageReports).values(values);
  }

  /** TVR-02: the reports one visitor sent since `since`, whatever the shop. */
  async countFromIpSince(db: Executor, ip: string, since: Date): Promise<number> {
    const [row] = await db
      .select({ total: count() })
      .from(paymentPageReports)
      .where(and(eq(paymentPageReports.ip, ip), gte(paymentPageReports.createdAt, since)));
    return row?.total ?? 0;
  }

  /** The newest first, with their shops. */
  async list(
    db: Executor,
    status: PaymentPageReportStatus,
    limit: number,
  ): Promise<PaymentPageReportRow[]> {
    const rows = await db
      .select({
        report: paymentPageReports,
        shopName: tenants.shopName,
        slug: tenants.slug,
        paymentPageSuspendedAt: tenants.paymentPageSuspendedAt,
      })
      .from(paymentPageReports)
      .innerJoin(tenants, eq(tenants.id, paymentPageReports.tenantId))
      .where(eq(paymentPageReports.status, status))
      .orderBy(desc(paymentPageReports.createdAt), desc(paymentPageReports.id))
      .limit(limit);
    return rows.map((row) => ({
      ...row.report,
      shopName: row.shopName,
      slug: row.slug,
      paymentPageSuspendedAt: row.paymentPageSuspendedAt,
    }));
  }

  /** ADM-12: an open report dismissed; null when there is no open report by that id. */
  async dismiss(
    db: Executor,
    id: string,
    operatorId: string,
    at: Date,
  ): Promise<SelectPaymentPageReport | null> {
    const [row] = await db
      .update(paymentPageReports)
      .set({ status: PaymentPageReportStatus.Dismissed, handledBy: operatorId, handledAt: at })
      .where(
        and(
          eq(paymentPageReports.id, id),
          eq(paymentPageReports.status, PaymentPageReportStatus.Open),
        ),
      )
      .returning();
    return row ?? null;
  }

  /** TVR-03: the shop's open reports acted on, its page being suspended. */
  async actionOpen(db: Executor, tenantId: string, operatorId: string, at: Date): Promise<number> {
    const rows = await db
      .update(paymentPageReports)
      .set({ status: PaymentPageReportStatus.Actioned, handledBy: operatorId, handledAt: at })
      .where(
        and(
          eq(paymentPageReports.tenantId, tenantId),
          eq(paymentPageReports.status, PaymentPageReportStatus.Open),
        ),
      )
      .returning({ id: paymentPageReports.id });
    return rows.length;
  }

  /** LIF-19: the shop's reports, with the rest of its data. */
  async deleteForTenant(db: Executor, tenantId: string): Promise<void> {
    await db.delete(paymentPageReports).where(eq(paymentPageReports.tenantId, tenantId));
  }
}
