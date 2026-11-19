import { Permission, RateKey, TenantState } from '@lytronix/validators';
import { useBalance, useCurrentRates } from '@/api/balance';
import { orderFeeOf, shortOf, type BalanceShort } from '@/lib/balance-gate';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';

/**
 * The balance gates (the owner, 2026-11-19, the sketch's `bg-*`): for each action that spends from the balance, whether
 * the spendable balance (what is held for open checkouts aside) covers it. Known only to whoever may read the balance;
 * for anyone else nothing is greyed out and the server's refusal says it.
 */
export function useBalanceGate() {
  const { viewer, tenant } = useShell();
  const can = allows(viewer, [Permission.BalanceRead]);
  const balance = useBalance({ enabled: can });
  const rates = useCurrentRates({ enabled: can });
  const rate = (key: RateKey): string | null =>
    rates.data?.find((each) => each.key === key)?.value ?? null;
  const spendable =
    balance.data && !balance.data.frozen
      ? Number(balance.data.amount) - Number(balance.data.held)
      : null;
  const flat = (key: RateKey): BalanceShort | null => {
    const value = rate(key);
    return shortOf(value === null ? null : Number(value), spendable);
  };
  const payg = tenant.state === TenantState.PayAsYouGo;
  return {
    /** PYG-16: a new product, or a copy of one, on pay-as-you-go. */
    product: (): BalanceShort | null => (payg ? flat(RateKey.PaygProductFee) : null),
    /** PYG-02 to PYG-05: shipping, booking or handing over an order whose fee hasn't been taken. */
    order: (order: { grandTotal: string; handledAt?: string | null }): BalanceShort | null => {
      const min = rate(RateKey.PaygOrderFeeMin);
      const pct = rate(RateKey.PaygOrderFeePct);
      if (!payg || (order.handledAt ?? null) !== null || min === null || pct === null) return null;
      return shortOf(orderFeeOf(order.grandTotal, min, pct), spendable);
    },
    /** FRD-01: one fraud check. */
    fraudCheck: (): BalanceShort | null => flat(RateKey.FraudCheck),
    /** ORD-34: reading a pasted message, once the add-on's reads are used up (or unknown). */
    read: (allowanceLeft: number | null): BalanceShort | null =>
      allowanceLeft !== null && allowanceLeft > 0 ? null : flat(RateKey.AiExtraction),
  };
}
