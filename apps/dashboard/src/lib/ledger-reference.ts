/** What a ledger entry's free-form `reference` can point at (apps/server BalanceService writes these). */
export interface LedgerReference {
  orderId?: string;
  productId?: string;
  planPaymentId?: string;
  reason?: string;
  fromTenantId?: string;
  toTenantId?: string;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

/** Reads the known string fields off an entry's reference; anything else is ignored, never thrown on. */
export function readLedgerReference(reference: unknown): LedgerReference {
  if (typeof reference !== 'object' || reference === null) return {};
  const record = reference as Record<string, unknown>;
  return {
    orderId: stringField(record, 'orderId'),
    productId: stringField(record, 'productId'),
    planPaymentId: stringField(record, 'planPaymentId'),
    reason: stringField(record, 'reason'),
    fromTenantId: stringField(record, 'fromTenantId'),
    toTenantId: stringField(record, 'toTenantId'),
  };
}
