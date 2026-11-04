import { Inject, Injectable } from '@nestjs/common';
import { limitPartsOf, PlatformAuditAction } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { AddonPurchaseService } from '../../billing/services/addon-purchase.service';
import { OperatorDirectory } from '../../operator/services/operator-directory';
import { newShopCapHolds } from '../../payment-sessions/services/new-shop-cap';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import type { OperatorShop, OperatorShopAddons } from '../types/operator-shop';

/**
 * The shop page in the operator console (OPERATOR-CONSOLE-DESIGN §5): the facts a screen needs that the search's rows
 * do not carry. ADM-03's fuller detail (balance, usage, errors, last sign-in) is still Phase 8's.
 */
@Injectable()
export class OperatorShops {
  constructor(
    @Inject(TenantSummaries) private readonly tenants: TenantSummaries,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
    @Inject(OperatorDirectory) private readonly operators: OperatorDirectory,
    @Inject(AddonPurchaseService) private readonly addons: AddonPurchaseService,
  ) {}

  async find(tenantId: string): Promise<OperatorShop> {
    const [shop, facts] = await Promise.all([
      this.tenants.findById(tenantId),
      this.tenants.operatorFacts(tenantId),
    ]);
    if (!shop || !facts) throw new ApiError('not_found', 'ShopNotFound', {});
    return {
      id: shop.id,
      slug: shop.slug,
      shopName: shop.shopName,
      state: shop.state,
      createdAt: shop.createdAt,
      planId: shop.planId,
      planName: shop.planName,
      planVersion: facts.planVersion,
      periodStart: shop.periodStart,
      periodEnd: shop.periodEnd,
      overrideCount: Object.keys(facts.overrides ?? {}).length,
      suspension:
        shop.suspendedAt === null
          ? null
          : {
              at: shop.suspendedAt,
              reason: facts.suspendedReason,
              by: await this.lastSuspendedBy(tenantId),
            },
      paymentPageSuspension:
        facts.paymentPageSuspendedAt === null
          ? null
          : { at: facts.paymentPageSuspendedAt, reason: facts.paymentPageSuspendedReason },
      newShopCap: {
        set: facts.newShopCap,
        holds: newShopCapHolds(facts.newShopCap, shop.state),
      },
    };
  }

  /** PLN-13: what the shop has running, and each limit as its plan, override and add-ons make it. */
  async addonsOf(tenantId: string): Promise<OperatorShopAddons> {
    const facts = await this.tenants.operatorFacts(tenantId);
    if (!facts) throw new ApiError('not_found', 'ShopNotFound', {});
    const shop = await this.addons.mine(tenantId);
    return {
      addons: shop.addons,
      packs: shop.packs,
      limits: limitPartsOf(facts.planSnapshot, facts.overrides, facts.addons),
    };
  }

  private async lastSuspendedBy(tenantId: string): Promise<string | null> {
    const entry = await this.audit.latest(PlatformAuditAction.TenantSuspended, tenantId);
    if (!entry?.actorId) return null;
    const emails = await this.operators.emailsOf([entry.actorId]);
    return emails.get(entry.actorId) ?? null;
  }
}
