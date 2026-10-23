import { Inject, Injectable } from '@nestjs/common';
import {
  BatchState,
  LOW_BALANCE_AMOUNT,
  limitOf,
  Permission,
  PlanPaymentKind,
} from '@lytronix/validators';
import { usageCycleStart } from '../../../common/time';
import { BalanceService } from '../../balance/services/balance.service';
import { toPaisa } from '../../balance/services/money';
import { ShopLinkSharing } from '../../balance/services/shop-link-sharing';
import { ProductService } from '../../catalogue/services/product.service';
import { DeliveryZoneService } from '../../delivery/services/delivery-zone.service';
import { BatchService } from '../../inventory/services/batch.service';
import { MediaService } from '../../media/services/media.service';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import { ApiKeyService } from '../../public-api/services/api-key.service';
import { RequestQuota } from '../../public-api/services/request-quota';
import { EssentialSmsUsageService } from '../../sms-usage/services/essential-sms-usage.service';
import { StaffService } from '../../staff/services/staff.service';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';
import type { HomeView, SetupChecklist } from '../types/home';

// BAL-03: a top-up's payment. BIL-04, PLN-14: a plan's, a renewal's, an upgrade's or an add-on's.
const TOP_UP_KINDS = [PlanPaymentKind.TopUp];
const PLAN_KINDS = [
  PlanPaymentKind.Purchase,
  PlanPaymentKind.Renewal,
  PlanPaymentKind.Upgrade,
  PlanPaymentKind.Addon,
];

// BAL-13: at or below this, in paisa, the balance is low.
const LOW_BALANCE_PAISA = BigInt(LOW_BALANCE_AMOUNT) * 100n;

/**
 * TENANT-DASHBOARD-DESIGN §7.1: what Home shows, in one read -- the queue's counts, the "Right now" figures and the
 * set-up checklist (SUP-01). Every member may read it; each part is read only for a caller who holds its permission
 * (STF-11), so a staff member sees their own jobs and nothing more, and the checklist is the owner's.
 */
@Injectable()
export class HomeService {
  constructor(
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(ProductService) private readonly products: ProductService,
    @Inject(BatchService) private readonly batches: BatchService,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(EssentialSmsUsageService) private readonly sms: EssentialSmsUsageService,
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(RequestQuota) private readonly requests: RequestQuota,
    @Inject(DeliveryZoneService) private readonly zones: DeliveryZoneService,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(ShopLinkSharing) private readonly links: ShopLinkSharing,
    @Inject(ApiKeyService) private readonly keys: ApiKeyService,
  ) {}

  async view(tenant: TenantSummary, userId: string | null, now = new Date()): Promise<HomeView> {
    const held =
      userId === null ? null : new Set((await this.staff.permissionsOf(tenant, userId)) ?? []);
    const may = (permission: Permission): boolean => held === null || held.has(permission);
    const counts = may(Permission.ProductsRead) || may(Permission.InventoryRead);

    // BIL-19: the payment needing the seller, among the kinds they may read.
    const attentionKinds = [
      ...(may(Permission.BalanceRead) ? TOP_UP_KINDS : []),
      ...(may(Permission.PaymentsRead) ? PLAN_KINDS : []),
    ];

    const [states, expiring, balance, freeSms, topUps, plans, needingYou, staff, fastSpend] =
      await Promise.all([
        counts ? this.products.stateCounts(tenant.id) : null,
        may(Permission.InventoryRead)
          ? this.batches.shopBatches(tenant.id, { state: BatchState.Expiring, page: 1, limit: 1 })
          : null,
        may(Permission.BalanceRead) ? this.balance.current(tenant.id) : null,
        may(Permission.BalanceRead) ? this.sms.currentUsage(tenant.id, now) : null,
        may(Permission.BalanceRead) ? this.payments.beingChecked(tenant.id, TOP_UP_KINDS) : null,
        may(Permission.PaymentsRead) ? this.payments.beingChecked(tenant.id, PLAN_KINDS) : null,
        attentionKinds.length > 0
          ? this.payments.needingAttention(tenant.id, attentionKinds, now)
          : null,
        may(Permission.StaffRead) ? this.staff.countWithoutPassword(tenant.id) : null,
        may(Permission.KeysManage)
          ? this.requests.fastSpendAlertedAt(tenant.id, usageCycleStart(tenant, now))
          : null,
      ]);

    return {
      products:
        states && may(Permission.ProductsRead)
          ? { total: states.total, active: states.active }
          : null,
      stock:
        states && expiring
          ? { low: states.low, out: states.out, expiringBatches: expiring.total }
          : null,
      balance:
        balance && freeSms
          ? {
              amount: balance.amount,
              low: toPaisa(balance.amount) <= LOW_BALANCE_PAISA,
              freeSms: {
                used: freeSms.monthly,
                limit: limitOf(tenant.planLimits, 'essential_sms_monthly'),
              },
            }
          : null,
      topUpsBeingChecked: topUps,
      paymentsBeingChecked: plans,
      paymentNeedingYou: needingYou,
      staffWithoutPassword: staff,
      fastSpendAlertedAt: fastSpend,
      checklist:
        userId === null ? await this.checklist(tenant.id, (states?.total ?? 0) > 0, now) : null,
    };
  }

  /** SUP-01: a link of the shop's was copied or shared -- recorded once, for every device. */
  recordLinkShared(tenantId: string, now = new Date()): Promise<void> {
    return this.links.record(tenantId, now);
  }

  /** SUP-01: the set-up items the server can tell, for the owner. */
  private async checklist(
    tenantId: string,
    firstProduct: boolean,
    now: Date,
  ): Promise<SetupChecklist> {
    const [delivery, logo, linkShared, keys] = await Promise.all([
      this.zones.settings(tenantId),
      this.media.logoOf(tenantId),
      this.links.shared(tenantId),
      this.keys.list(tenantId),
    ]);
    const inside = delivery.zones.find((zone) => zone.isHome);
    const outside = delivery.zones.find((zone) => zone.isFallback);
    return {
      deliveryCharges: {
        area: delivery.homeArea.label,
        inside: inside?.charge ?? '0.00',
        outside: outside?.charge ?? '0.00',
      },
      firstProduct,
      logo: logo !== null,
      linkShared,
      apiKey: keys.some(
        (key) =>
          key.revokedAt === null &&
          (key.expiresAt === null || key.expiresAt.getTime() > now.getTime()),
      ),
    };
  }
}
