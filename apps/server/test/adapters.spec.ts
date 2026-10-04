import { describe, expect, it } from 'vitest';
import { TenantRepository, TransactionRunner, type Transaction } from '@lytronix/db';
import { UniqueViolation } from '../src/common/errors/unique-violation';
import { DrizzleTenantStore } from '../src/database/adapters/tenancy.adapter';

// Adapters take their repositories through the constructor, so their own logic runs here with fake repositories and
// no database. The fake repository ignores the transaction, so an empty value stands in for it.
const TX = {} as Transaction;

const SHOP = {
  ownerIdentityId: 'identity-1',
  subscriberId: 'subscriber-1',
  shopName: 'Fashion House',
  slug: 'fashion-house',
  planId: 'plan-trial',
  planSnapshot: { essential_sms_total: 8 },
  periodStart: new Date('2026-10-04T00:00:00Z'),
  periodEnd: new Date('2026-11-03T00:00:00Z'),
};

function uniqueViolation(constraint: string): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
    constraint,
  });
}

describe('DrizzleTenantStore (AUTH-11, TEN-19)', () => {
  it('turns a duplicate address into UniqueViolation("address")', async () => {
    const tenants = new TenantRepository();
    tenants.insert = () => Promise.reject(uniqueViolation('tenants_slug_unique'));
    const store = new DrizzleTenantStore(tenants, new TransactionRunner());

    const failure = await store.insertTenant(TX, SHOP).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(UniqueViolation);
    expect(failure).toMatchObject({ target: 'address' });
  });

  it('lets any other database error through unchanged', async () => {
    const tenants = new TenantRepository();
    tenants.insert = () => Promise.reject(new Error('connection lost'));
    const store = new DrizzleTenantStore(tenants, new TransactionRunner());

    await expect(store.insertTenant(TX, SHOP)).rejects.toThrow('connection lost');
  });

  it('looks up the Trial plan by name, off sale (D3)', async () => {
    const tenants = new TenantRepository();
    const seen: { name: string; forSale: boolean }[] = [];
    tenants.findPlanByName = (_db, name, forSale) => {
      seen.push({ name, forSale });
      return Promise.resolve(null);
    };
    const store = new DrizzleTenantStore(tenants, new TransactionRunner());

    await store.findTrialPlan(TX);
    expect(seen).toEqual([{ name: 'Trial', forSale: false }]);
  });
});
