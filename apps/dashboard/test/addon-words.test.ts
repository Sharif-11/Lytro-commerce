import { describe, expect, it } from 'vitest';
import { AddonKind, AddonRenewal, UsageMetric } from '@lytronix/validators';
import type { Addon, AddonOffer, ShopAddon } from '../src/types/addons';
import type { UsageFigure } from '../src/types/usage';
import {
  boughtToast,
  endingBanner,
  groupsOf,
  headLine,
  limitChange,
  limitMove,
  limitWithout,
  renewalLine,
  switchable,
} from '../src/views/addons/addon-words';

// The key and its values, so the wording is checked without the dictionary.
const t = (key: string, options?: Record<string, unknown>): string =>
  options ? `${key} ${JSON.stringify(options)}` : key;

const MB = 1024 * 1024;
const GB = 1024 * MB;
const DAY_MS = 24 * 60 * 60 * 1000;

function addon(
  key: string,
  kind: AddonKind,
  limitKey: string | null,
  unitSize: number | null,
): Addon {
  return {
    id: `id-${key}`,
    key,
    kind,
    limitKey,
    unitSize,
    price: '149.00',
    labelEn: `${key} en`,
    labelBn: `${key} bn`,
    retiredAt: null,
  };
}

const PRODUCTS = addon('extra_products', AddonKind.Limit, 'products', 500);
const STORAGE = addon('extra_storage', AddonKind.Limit, 'storage_mb', 1024);
const PACK = addon('bandwidth_pack', AddonKind.Pack, 'bandwidth_gb', 10);
const BRAND = addon('brand_identity', AddonKind.Feature, null, null);

function offer(item: Addon): AddonOffer {
  return {
    addon: item,
    price: 99,
    expiresAt: null,
    blockedBy: null,
    amounts: [99],
    daysLeft: 20,
    renewalPrice: 149,
  };
}

function owned(item: Addon, given: Partial<ShopAddon> = {}): ShopAddon {
  return {
    id: `p-${item.key}`,
    addonId: item.id,
    key: item.key,
    kind: item.kind,
    labelEn: item.labelEn,
    labelBn: item.labelBn,
    limitKey: item.limitKey,
    unitSize: item.unitSize,
    quantity: 1,
    startsAt: null,
    expiresAt: '2026-11-09T06:00:00.000Z',
    renews: true,
    renewal: AddonRenewal.WithPlan,
    endsSoon: false,
    ...given,
  };
}

function figure(metric: UsageMetric, limit: number | null): UsageFigure {
  return {
    metric,
    used: 0,
    limit,
    packLeft: null,
    stopAt: null,
    unit: 'count',
    perCycle: false,
    level: null,
    runsOutAt: null,
  };
}

const FIGURES = [
  figure(UsageMetric.Products, 600),
  figure(UsageMetric.Seats, 2),
  figure(UsageMetric.Storage, 2 * GB),
];

describe('the add-ons list (TENANT-DASHBOARD-DESIGN §7.25)', () => {
  it('groups the catalogue by kind, with what the shop has, and keeps an add-on no longer sold', () => {
    const retired = addon('old_seat', AddonKind.Limit, 'staff', 1);
    const groups = groupsOf(
      [offer(PRODUCTS), offer(PACK), offer(BRAND)],
      [owned(PRODUCTS), owned(retired)],
    );
    expect(groups.map((group) => group.title)).toEqual(['aoLimitGrp', 'aoPackGrp', 'aoFeatGrp']);
    expect(
      groups[0]?.lines.map((line) => [line.addon.key, line.owned !== null, line.offer !== null]),
    ).toEqual([
      ['extra_products', true, true],
      ['old_seat', true, false],
    ]);
  });

  it('says how each renews, and switches only those that can', () => {
    expect(renewalLine(owned(PRODUCTS), t, 'Starter')).toEqual({ text: 'aoRenews', warn: false });
    expect(renewalLine(owned(PRODUCTS, { renewal: AddonRenewal.Off }), t, 'Starter')).toEqual({
      text: 'aoNoRenew {"date":"9 Nov"}',
      warn: true,
    });
    expect(renewalLine(owned(STORAGE, { renewal: AddonRenewal.Unlimited }), t, 'Pro').text).toBe(
      'aoNotNeeded {"plan":"Pro"}',
    );
    expect(switchable(owned(PRODUCTS))).toBe(true);
    expect(switchable(owned(PRODUCTS, { renewal: AddonRenewal.Retired }))).toBe(false);
    expect(switchable(owned(PACK))).toBe(false);
  });

  it("heads the page with what renews with the plan and for how much, or pay-as-you-go's own periods", () => {
    const renewing = [
      { addonId: 'a', key: 'extra_products', labelEn: 'x', quantity: 1, amount: '149.00' },
      { addonId: 'b', key: 'extra_seat', labelEn: 'y', quantity: 2, amount: '98.00' },
    ];
    expect(
      headLine({ payg: false, owned: [], renewing, periodEnd: '2026-11-09T06:00:00.000Z' }, t),
    ).toBe('aoHead {"count":2,"date":"9 Nov","amount":"৳247"}');
    expect(headLine({ payg: false, owned: [], renewing: [], periodEnd: null }, t)).toBe('aoLead');
    expect(
      headLine(
        { payg: true, owned: [owned(PRODUCTS), owned(PACK)], renewing: [], periodEnd: null },
        t,
      ),
    ).toBe('aoHeadBal {"count":1}');
  });

  it('warns of an add-on ending within days with its renewal off, by its kind', () => {
    const soon = new Date(Date.now() + 7 * DAY_MS - 60_000).toISOString();
    const storage = owned(STORAGE, { renewal: AddonRenewal.Off, endsSoon: true, expiresAt: soon });
    expect(endingBanner([owned(PRODUCTS), storage], FIGURES, t, 'en')?.text).toBe(
      'alBannerStorage {"name":"extra_storage en","count":7,"limit":"1 GB"}',
    );
    expect(endingBanner([owned(PRODUCTS)], FIGURES, t, 'en')).toBeNull();
    // The limit it returns to is not known until the usage page is read.
    expect(endingBanner([storage], [], t, 'en')).toBeNull();
  });
});

describe('the Buy sheet and what it leaves (PLN-14, LIM-03)', () => {
  it('moves the limit by what each one adds, storage in its own unit', () => {
    expect(limitMove(PRODUCTS, 2, FIGURES)).toEqual({ limitKey: 'products', from: 600, to: 1600 });
    const storage = limitMove(STORAGE, 1, FIGURES);
    expect(storage && limitChange(storage, t)).toBe('2 GB → 3 GB');
    expect(limitChange({ limitKey: 'products', from: 100, to: 600 }, t)).toBe(
      '100 → 600 lim.products',
    );
    expect(limitMove(BRAND, 1, FIGURES)).toBeNull();
  });

  it('returns to the limit without the add-on when it ends', () => {
    expect(limitWithout(owned(PRODUCTS, { quantity: 1 }), FIGURES)).toEqual({
      limitKey: 'products',
      to: 100,
    });
    expect(limitWithout({ ...owned(STORAGE), unitSize: 1024 }, FIGURES)?.to).toBe(1 * GB);
  });

  it('says the new limit and the invoice once bought, or the feature on', () => {
    expect(
      boughtToast(
        {
          addon: PRODUCTS,
          move: { limitKey: 'products', to: 1100 },
          invoice: { number: 215, amount: '199.00' },
        },
        t,
        'en',
      ),
    ).toBe(
      'abBought {"name":"extra_products en","limit":"lim.products","value":"1,100"} · abInvoice {"number":"invoiceNo {\\"number\\":\\"000215\\"}","amount":"৳199"}',
    );
    expect(boughtToast({ addon: BRAND, move: null, invoice: null }, t, 'bn')).toBe(
      'abBoughtFeature {"name":"brand_identity bn"}',
    );
  });
});
