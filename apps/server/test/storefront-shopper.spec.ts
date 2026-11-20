import { describe, expect, it } from 'vitest';
import type { HttpRequest, HttpResponse } from '../src/common/http';
import type { WindowVerdict } from '../src/common/sliding-window';
import { StorefrontShopper } from '../src/common/storefront-shopper';
import type { ClientIp } from '../src/common/client-ip';
import type { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import {
  ORDERS_PER_STOREFRONT_ADDRESS_PER_MINUTE,
  ORDERS_PER_VISITOR_PER_MINUTE,
  OrderLimits,
} from '../src/modules/public-api/services/order-limits';
import type { RequestLimits } from '../src/modules/public-api/services/request-limits';
import type { RequestQuota } from '../src/modules/public-api/services/request-quota';
import {
  STOREFRONT_SHOPPERS_PER_ADDRESS,
  VisitorLimit,
} from '../src/modules/public-api/services/visitor-limit';
import type { ApiShop } from '../src/modules/public-api/types/public-api';

const SECRET = 'storefront-shopper-spec-secret-0123456789abcd';
const MARK = 'Vb3sQ0mX5n_kP7rT2yW9aA';
const shoppers = new StorefrontShopper({ STOREFRONT_SECRET: SECRET });

function request(headers: Record<string, string>): HttpRequest {
  return { headers, ip: '198.51.100.7' };
}

describe('the shopper the storefront vouches for (RTE-06 as amended, load fix 2)', () => {
  it("is named only with the storefront's secret and a well-formed mark", () => {
    expect(shoppers.of(request({ 'x-lytro-storefront': SECRET, 'x-lytro-visitor': MARK }))).toBe(
      MARK,
    );
    expect(shoppers.of(request({ 'x-lytro-visitor': MARK }))).toBeNull();
    expect(
      shoppers.of(request({ 'x-lytro-storefront': 'not-it', 'x-lytro-visitor': MARK })),
    ).toBeNull();
    expect(
      shoppers.of(request({ 'x-lytro-storefront': `${SECRET}x`, 'x-lytro-visitor': MARK })),
    ).toBeNull();
    expect(shoppers.of(request({ 'x-lytro-storefront': SECRET }))).toBeNull();
    expect(
      shoppers.of(request({ 'x-lytro-storefront': SECRET, 'x-lytro-visitor': 'short' })),
    ).toBeNull();
    expect(
      shoppers.of(request({ 'x-lytro-storefront': SECRET, 'x-lytro-visitor': `${MARK}:other` })),
    ).toBeNull();
  });

  it('names no one where no secret is configured (development), so every request is counted by address', () => {
    const open = new StorefrontShopper({ STOREFRONT_SECRET: undefined });
    expect(
      open.of(request({ 'x-lytro-storefront': 'anything', 'x-lytro-visitor': MARK })),
    ).toBeNull();
  });
});

/** A limit store's answer: allowed or not, with what's left. */
function verdict(allowed: boolean, remaining = 1): WindowVerdict {
  return { allowed, remaining, resetMs: 30_000 };
}

/** RequestLimits as a list of the windows asked, answering each from the map given (allowed when unnamed). */
function limits(refuse: Set<string> = new Set()) {
  const asked: string[] = [];
  const answer = (name: string, limit: number) => {
    asked.push(`${name}:${String(limit)}`);
    return Promise.resolve(verdict(!refuse.has(name)));
  };
  const fake = {
    perVisitor: (_t: string, _ip: string, limit: number) => answer('ip', limit),
    perShopper: (_t: string, _s: string, limit: number) => answer('shopper', limit),
    perStorefrontAddress: (_t: string, _ip: string, limit: number) => answer('sf-ip', limit),
    ordersPerVisitor: (_t: string, _ip: string, limit: number) => answer('order-ip', limit),
    ordersPerShopper: (_t: string, _s: string, limit: number) => answer('order-shopper', limit),
    ordersFromStorefrontAddress: (_t: string, _ip: string, limit: number) =>
      answer('order-sf-ip', limit),
    ordersPerShop: (_t: string, limit: number) => answer('order-shop', limit),
  };
  return { asked, fake: fake as unknown as RequestLimits };
}

const shop = { row: { id: 'shop-1' } } as unknown as ApiShop;
const clientIp = { resolve: () => '198.51.100.7' } as unknown as ClientIp;
const settings = {
  current: () => Promise.resolve({ value: 120 }),
} as unknown as PlatformSettingsService;

function quota() {
  const refused: string[] = [];
  return {
    refused,
    fake: {
      refused: (_s: ApiShop, visitor: string) => refused.push(visitor),
      refusedOrder: () => undefined,
    } as unknown as RequestQuota,
  };
}

const response: HttpResponse = { setHeader: () => undefined };
const fromStorefront = request({ 'x-lytro-storefront': SECRET, 'x-lytro-visitor': MARK });
const fromWebsite = request({});

describe("a request's minute, by shopper or by address", () => {
  it("holds a storefront shopper to the figure, and their address to ten shoppers' worth", async () => {
    const { asked, fake } = limits();
    const visitors = new VisitorLimit(fake, quota().fake, settings, clientIp, shoppers);
    await visitors.admit(shop, fromStorefront, response, new Date());
    expect(STOREFRONT_SHOPPERS_PER_ADDRESS).toBe(10);
    expect(asked).toEqual(['shopper:120', 'sf-ip:1200']);
  });

  it("counts a refusal by the shopper's own minute against the shopper, without touching the address", async () => {
    const { asked, fake } = limits(new Set(['shopper']));
    const counted = quota();
    const visitors = new VisitorLimit(fake, counted.fake, settings, clientIp, shoppers);
    await expect(visitors.admit(shop, fromStorefront, response, new Date())).rejects.toThrow();
    expect(asked).toEqual(['shopper:120']);
    expect(counted.refused).toEqual([`shopper:${MARK}`]);
  });

  it('counts a refusal by the backstop against the address', async () => {
    const { fake } = limits(new Set(['sf-ip']));
    const counted = quota();
    const visitors = new VisitorLimit(fake, counted.fake, settings, clientIp, shoppers);
    await expect(visitors.admit(shop, fromStorefront, response, new Date())).rejects.toThrow();
    expect(counted.refused).toEqual(['198.51.100.7']);
  });

  it("holds any other request (a shop's own website's) by its address, as before", async () => {
    const { asked, fake } = limits();
    const visitors = new VisitorLimit(fake, quota().fake, settings, clientIp, shoppers);
    await visitors.admit(shop, fromWebsite, response, new Date());
    expect(asked).toEqual(['ip:120']);
  });
});

describe("an order's minute, by shopper or by address", () => {
  it('holds a storefront shopper to 10 and their address to 60, then the shop to its figure', async () => {
    const { asked, fake } = limits();
    const orders = new OrderLimits(fake, quota().fake, settings, clientIp, shoppers);
    await orders.admitOrder(shop, fromStorefront, new Date());
    expect(ORDERS_PER_VISITOR_PER_MINUTE).toBe(10);
    expect(ORDERS_PER_STOREFRONT_ADDRESS_PER_MINUTE).toBe(60);
    expect(asked).toEqual(['order-shopper:10', 'order-sf-ip:60', 'order-shop:120']);
  });

  it("refuses the shopper's eleventh without counting it against the address", async () => {
    const { asked, fake } = limits(new Set(['order-shopper']));
    const orders = new OrderLimits(fake, quota().fake, settings, clientIp, shoppers);
    await expect(orders.admitOrder(shop, fromStorefront, new Date())).rejects.toThrow();
    expect(asked).toEqual(['order-shopper:10']);
  });

  it('refuses at the backstop when shoppers behind one address pass 60 together', async () => {
    const { fake } = limits(new Set(['order-sf-ip']));
    const orders = new OrderLimits(fake, quota().fake, settings, clientIp, shoppers);
    await expect(orders.admitOrder(shop, fromStorefront, new Date())).rejects.toThrow();
  });

  it("holds any other order (a shop's own website's) to 10 by its address, as before", async () => {
    const { asked, fake } = limits();
    const orders = new OrderLimits(fake, quota().fake, settings, clientIp, shoppers);
    await orders.admitOrder(shop, fromWebsite, new Date());
    expect(asked).toEqual(['order-ip:10', 'order-shop:120']);
  });
});
