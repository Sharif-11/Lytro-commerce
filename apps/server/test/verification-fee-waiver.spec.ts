import { describe, expect, it } from 'vitest';
import type { AddonPurchaseRepository, TenantRepository, Transaction } from '@lytronix/db';
import { VERIFICATION_FEES_WAIVED_FEATURE } from '@lytronix/validators';
import { DrizzleFeeWaiverStore } from '../src/database/adapters/fee-waiver.adapter';
import type { LowBalanceNotifier } from '../src/modules/balance/ports/low-balance-notifier';
import type { BalanceService } from '../src/modules/balance/services/balance.service';
import type { RateService } from '../src/modules/balance/services/rate.service';
import { VerificationFees } from '../src/modules/balance/services/verification-fees';

// WAL-20, WAL-21 (amended 2026-11-23, the owner): a shop whose plan waives the payment-check fees (the Pilot plan) is
// never held nor charged; every other shop pays as before. Fakes stand in for the ledger, the rates and the plan, so
// no database is needed; the transaction is never looked inside.
const TX = {} as Transaction;
const NOW = new Date('2026-11-23T12:00:00Z');
const PAYMENT = { sessionId: 'session-1', orderId: 'order-1', amount: '1000.00' };

function feesFor(waived: boolean) {
  const charges: unknown[] = [];
  let balanceReads = 0;
  const balance = {
    heldWithin: () => {
      balanceReads += 1;
      return Promise.resolve({ frozen: false, amount: '500.00' });
    },
    charge: (_tx: Transaction, entry: unknown) => {
      charges.push(entry);
      return Promise.resolve();
    },
  } as unknown as BalanceService;
  const rates = {
    current: (key: string) =>
      Promise.resolve({ key, value: key === 'gateway_verification_pct' ? '1.0000' : '0.1000' }),
  } as unknown as RateService;
  const notifier = { notifyFeeShort: () => Promise.resolve() } as unknown as LowBalanceNotifier;
  const leases = { once: () => Promise.resolve(false) };
  const waivers = { waived: () => Promise.resolve(waived) };
  const fees = new VerificationFees(balance, rates, notifier, leases, waivers);
  return { fees, charges, balanceReads: () => balanceReads };
}

describe('the payment-check fee waiver', () => {
  it('charges the listener fee to a shop whose plan does not waive it', async () => {
    const { fees, charges } = feesFor(false);
    await expect(fees.chargeListener(TX, 'shop-1', PAYMENT, NOW)).resolves.toBe('charged');
    expect(charges).toHaveLength(1);
  });

  it('charges nothing, and reads no balance, for a shop whose plan waives it', async () => {
    const { fees, charges, balanceReads } = feesFor(true);
    await expect(fees.chargeListener(TX, 'shop-1', PAYMENT, NOW)).resolves.toBe('nothing');
    expect(charges).toHaveLength(0);
    expect(balanceReads()).toBe(0);
  });

  it("holds a wallet checkout's fee, or nothing when the plan waives it", async () => {
    await expect(feesFor(false).fees.holdGateway(TX, 'shop-1', '1000.00', NOW)).resolves.toBe(
      '10.00',
    );
    await expect(feesFor(true).fees.holdGateway(TX, 'shop-1', '1000.00', NOW)).resolves.toBe(
      '0.00',
    );
  });
});

describe('DrizzleFeeWaiverStore', () => {
  function storeWith(featureSnapshot: Record<string, boolean> | null, addons: string[] = []) {
    const tenants = {
      findBillingInfo: () => Promise.resolve({ featureSnapshot }),
    } as unknown as TenantRepository;
    const addonPurchases = {
      listActive: () => Promise.resolve(addons.map((key) => ({ key }))),
    } as unknown as AddonPurchaseRepository;
    return new DrizzleFeeWaiverStore(tenants, addonPurchases);
  }

  it("is waived when the plan's features carry the waiver", async () => {
    await expect(
      storeWith({ [VERIFICATION_FEES_WAIVED_FEATURE]: true }).waived(TX, 'shop-1'),
    ).resolves.toBe(true);
  });

  it('is waived by an add-on of that key too, as every plan feature is', async () => {
    await expect(
      storeWith(null, [VERIFICATION_FEES_WAIVED_FEATURE]).waived(TX, 'shop-1'),
    ).resolves.toBe(true);
  });

  it('is not waived otherwise', async () => {
    await expect(storeWith({ custom_domain: true }).waived(TX, 'shop-1')).resolves.toBe(false);
    await expect(storeWith(null).waived(TX, 'shop-1')).resolves.toBe(false);
  });
});
