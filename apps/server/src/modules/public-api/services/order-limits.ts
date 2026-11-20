import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { PlatformSettingKey } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import type { HttpRequest } from '../../../common/http';
import type { WindowVerdict } from '../../../common/sliding-window';
import { StorefrontShopper } from '../../../common/storefront-shopper';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import type { ApiShop } from '../types/public-api';
import { RequestLimits } from './request-limits';
import { RequestQuota } from './request-quota';
import { secondsOf } from './visitor-limit';

// RTE-06, LND-12: a visitor's orders a minute to one shop: a storefront shopper's by their mark, any other's by address.
export const ORDERS_PER_VISITOR_PER_MINUTE = 10;
// RTE-06 as amended (load fix 2, the owner, 2026-11-20): the storefront's shoppers behind one address together, a
// minute, in one shop: the backstop against a shopper who drops their mark.
export const ORDERS_PER_STOREFRONT_ADDRESS_PER_MINUTE = 60;
// RTE-08 (amended 2026-10-30; 180 since D9-32, 2026-11-17): shoppers' orders a minute to one shop, every plan alike,
// when the operator has set no figure of their own.
export const DEFAULT_ORDERS_PER_SHOP_PER_MINUTE = 180;
// RTE-08 (amended 2026-10-31, Slice 5.2b): shoppers' payment sessions a minute to one shop, every plan alike, when the
// operator has set no figure of their own.
export const DEFAULT_SESSIONS_PER_SHOP_PER_MINUTE = 60;
// ORD-17: a visitor's tracking reads a minute in one shop.
export const TRACKING_READS_PER_VISITOR_PER_MINUTE = 60;

/**
 * RTE-06, RTE-08, ORD-17 (D4-13): the per-minute windows on a shopper's orders, payment sessions and tracking reads,
 * on top of the request limit every public call meets. A visitor is held to 10 orders a minute; the shop's shoppers
 * together to the operator's figures for orders and for payment sessions, flood guards that never cap a plan's demand
 * (QTA-07), and their refusals are counted so the operator can see a real shop meet them. Staff orders and payment
 * links are never held. Orders and sessions are counted exactly in PostgreSQL, tracking reads in the shared limit
 * store (Slice 9.4).
 *
 * RTE-06 as amended (load fix 2): a storefront shopper the storefront vouches for (StorefrontShopper) is held to 10 by
 * their own mark, and their address to 60 beside it, so shoppers behind one mobile network's address order apart.
 */
@Injectable()
export class OrderLimits {
  constructor(
    @Inject(RequestLimits) private readonly limits: RequestLimits,
    @Inject(RequestQuota) private readonly quota: RequestQuota,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
    @Inject(StorefrontShopper) private readonly shoppers: StorefrontShopper,
  ) {}

  /** Lets a shopper's order through, or refuses it with 429: the visitor's window first, then the shop's. */
  async admitOrder(shop: ApiShop, request: HttpRequest, now: Date): Promise<void> {
    const address = this.clientIp.resolve(request) ?? 'unknown';
    const shopper = this.shoppers.of(request);
    const own =
      shopper === null
        ? await this.limits.ordersPerVisitor(
            shop.row.id,
            address,
            ORDERS_PER_VISITOR_PER_MINUTE,
            now,
          )
        : await this.storefrontOrder(shop.row.id, shopper, address, now);
    if (!own.allowed) {
      throw new ApiError('rate_limited', 'TooManyOrders', {}, secondsOf(own.resetMs));
    }
    const shared = await this.limits.ordersPerShop(shop.row.id, await this.perShop(), now);
    if (!shared.allowed) {
      this.quota.refusedOrder(shop, now);
      throw new ApiError('rate_limited', 'TooManyOrders', {}, secondsOf(shared.resetMs));
    }
  }

  /**
   * RTE-08 (Slice 5.2b): lets a checkout open its payment session, or refuses the order with 429 -- checked just before
   * the session opens, so a cash-on-delivery order never meets it.
   */
  async admitSession(shop: ApiShop, now: Date, tx?: Transaction): Promise<void> {
    const setting = await this.settings.current(PlatformSettingKey.PaymentSessionsPerShopPerMinute);
    const limit =
      typeof setting?.value === 'number' ? setting.value : DEFAULT_SESSIONS_PER_SHOP_PER_MINUTE;
    const verdict = await this.limits.sessionsPerShop(shop.row.id, limit, now, tx);
    if (!verdict.allowed) {
      this.quota.refusedSession(shop, now);
      throw new ApiError('rate_limited', 'TooManyOrders', {}, secondsOf(verdict.resetMs));
    }
  }

  /** Lets a visitor's tracking read through, or refuses it with 429. */
  async admitTracking(shop: ApiShop, request: HttpRequest, now: Date): Promise<void> {
    const visitor = this.clientIp.resolve(request) ?? 'unknown';
    const verdict = await this.limits.trackingPerVisitor(
      shop.row.id,
      visitor,
      TRACKING_READS_PER_VISITOR_PER_MINUTE,
      now,
    );
    if (!verdict.allowed) {
      throw new ApiError('rate_limited', 'TooManyRequests', {}, secondsOf(verdict.resetMs));
    }
  }

  /** A storefront shopper's order: their own minute first (a refused order isn't counted against the address). */
  private async storefrontOrder(
    tenantId: string,
    shopper: string,
    address: string,
    now: Date,
  ): Promise<WindowVerdict> {
    const own = await this.limits.ordersPerShopper(
      tenantId,
      shopper,
      ORDERS_PER_VISITOR_PER_MINUTE,
      now,
    );
    if (!own.allowed) return own;
    return this.limits.ordersFromStorefrontAddress(
      tenantId,
      address,
      ORDERS_PER_STOREFRONT_ADDRESS_PER_MINUTE,
      now,
    );
  }

  private async perShop(): Promise<number> {
    const setting = await this.settings.current(PlatformSettingKey.PublicOrdersPerShopPerMinute);
    return typeof setting?.value === 'number' ? setting.value : DEFAULT_ORDERS_PER_SHOP_PER_MINUTE;
  }
}
