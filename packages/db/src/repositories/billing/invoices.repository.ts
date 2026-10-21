import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { InvoiceLineKind } from '@lytronix/validators';
import { invoiceCounters, invoiceLines, invoices, type SelectInvoice } from '../../schema';
import type { Executor } from '../../transactions';

// DAT-07/BIL-12: the single locked counter row invoice numbers come from. Never a native sequence.
export class InvoiceCountersRepository {
  /** Locks the one counter row, returns the number to use, and advances it -- all inside the caller's `tx`. */
  async takeNext(tx: Executor): Promise<number> {
    const rows = await tx
      .select({ nextNumber: invoiceCounters.nextNumber })
      .from(invoiceCounters)
      .where(eq(invoiceCounters.id, 1))
      .for('update');
    const row = rows[0];
    if (!row) throw new Error('invoice counter row is not seeded');
    await tx
      .update(invoiceCounters)
      .set({ nextNumber: sql`${invoiceCounters.nextNumber} + 1` })
      .where(eq(invoiceCounters.id, 1));
    return row.nextNumber;
  }
}

export interface NewInvoice {
  tenantId: string;
  number: number;
  kind: SelectInvoice['kind'];
  planSnapshot: SelectInvoice['planSnapshot'];
  amount: string;
  creditAmount: string;
  billingTermLabel: string | null;
  shopName: string;
  ownerName: string | null;
  planName: string | null;
  planVersion: number | null;
  periodStart: Date;
  periodEnd: Date;
  discountAmount: string;
  paymentMethod: SelectInvoice['paymentMethod'];
  paymentReference: string | null;
}

/** BIL-12, PLN-14: one line of an invoice, in its order. */
export interface InvoiceLine {
  kind: InvoiceLineKind;
  description: string;
  quantity: number;
  amount: string;
}

// BIL-12/13: one invoice per confirmed payment, listable/downloadable by the owner in every tenant state.
export class InvoicesRepository {
  /** BIL-12: the invoice's lines, numbered in the order given, in the invoice's own transaction. */
  async insertLines(tx: Executor, invoiceId: string, lines: readonly InvoiceLine[]): Promise<void> {
    if (lines.length === 0) return;
    await tx
      .insert(invoiceLines)
      .values(lines.map((line, position) => ({ invoiceId, position, ...line })));
  }

  /** The lines of these invoices, by invoice, each in its order; an invoice issued before lines has none. */
  async linesOf(tx: Executor, invoiceIds: string[]): Promise<Map<string, InvoiceLine[]>> {
    const byInvoice = new Map<string, InvoiceLine[]>();
    if (invoiceIds.length === 0) return byInvoice;
    const rows = await tx
      .select({
        invoiceId: invoiceLines.invoiceId,
        kind: invoiceLines.kind,
        description: invoiceLines.description,
        quantity: invoiceLines.quantity,
        amount: invoiceLines.amount,
      })
      .from(invoiceLines)
      .where(inArray(invoiceLines.invoiceId, invoiceIds))
      .orderBy(asc(invoiceLines.invoiceId), asc(invoiceLines.position));
    for (const { invoiceId, ...line } of rows) {
      byInvoice.set(invoiceId, [...(byInvoice.get(invoiceId) ?? []), line]);
    }
    return byInvoice;
  }

  async insert(tx: Executor, values: NewInvoice): Promise<SelectInvoice> {
    const [row] = await tx.insert(invoices).values(values).returning();
    if (!row) throw new Error('insert returned no invoice');
    return row;
  }

  async findById(tx: Executor, id: string): Promise<SelectInvoice | null> {
    const rows = await tx.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async listForTenant(tx: Executor, tenantId: string): Promise<SelectInvoice[]> {
    return tx
      .select()
      .from(invoices)
      .where(eq(invoices.tenantId, tenantId))
      .orderBy(desc(invoices.number));
  }

  /** BIL-13, LIF-21: one owner's invoices across a shop and its predecessors, newest first. */
  async listForTenants(tx: Executor, tenantIds: string[]): Promise<SelectInvoice[]> {
    if (tenantIds.length === 0) return [];
    return tx
      .select()
      .from(invoices)
      .where(inArray(invoices.tenantId, tenantIds))
      .orderBy(desc(invoices.number));
  }
}
