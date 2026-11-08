import { Inject, Injectable } from '@nestjs/common';
import type { FailedSmsRow, RequestErrorRow, ShopMessages } from '@lytronix/db';
import { PlanPaymentKind, SHOP_PROBLEM_DAYS, type SalesQuery } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { RequestErrors } from '../../../common/request-id/request-errors';
import { DAY_MS } from '../../../common/time';
import { BalanceService } from '../../balance/services/balance.service';
import { PaymentQueueService } from '../../billing/services/payment-queue.service';
import type { QueuedPayment } from '../../billing/types/addon';
import { CourierConnections } from '../../couriers/services/courier-connections';
import { SessionService } from '../../identity/services/session.service';
import { OrderService } from '../../orders/services/order.service';
import { SalesFigures } from '../../orders/services/sales-figures';
import type { SalesView } from '../../orders/types/sales';
import { PaymentsList } from '../../payment-review/services/payments-list';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
import { SmsHistory } from '../../sms-events/services/sms-history';
import { StaffService } from '../../staff/services/staff.service';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';
import { UsageService } from '../../usage/services/usage.service';
import type {
  OperatorShopFigures,
  OperatorShopSignIn,
  OperatorShopSms,
} from '../types/operator-shop';

const PLAN_PAYMENT_KINDS = Object.values(PlanPaymentKind);

/**
 * ADM-03, D8-8 (Phase 8 Slice 8.2, read agreed 2026-11-08): the operator's shop page beyond its header. The figures
 * come first, the lists behind them when a card is opened (D8-24's answers). Each is read through the module that owns
 * it, with the shop's own id, so it runs inside that shop's row-level security as the seller's own reads do; nothing here
 * queries another module's tables. Never cost or profit: the business summary is revenue and counts (D8-29).
 */
@Injectable()
export class OperatorShopReads {
  constructor(
    @Inject(TenantSummaries) private readonly tenants: TenantSummaries,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(RequestErrors) private readonly errors: RequestErrors,
    @Inject(CourierConnections) private readonly couriers: CourierConnections,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(PlanPaymentsService) private readonly planPayments: PlanPaymentsService,
    @Inject(PaymentQueueService) private readonly queue: PaymentQueueService,
    @Inject(PaymentsList) private readonly customerPayments: PaymentsList,
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(SalesFigures) private readonly sales: SalesFigures,
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(SmsHistory) private readonly shopSms: SmsHistory,
    @Inject(MessagingService) private readonly lytroSms: MessagingService,
  ) {}

  /** ADM-03: what the shop page opens with. */
  async figures(tenantId: string, now: Date): Promise<OperatorShopFigures> {
    const shop = await this.shopOf(tenantId);
    const problemsSince = new Date(now.getTime() - SHOP_PROBLEM_DAYS * DAY_MS);
    const messages = await this.messagesOf(shop);
    const [
      balance,
      usage,
      errors,
      shopSms,
      lytroSms,
      failedCourierCalls,
      signIns,
      lytro,
      customers,
      orders,
    ] = await Promise.all([
      this.balance.current(shop.id),
      this.usage.usage(shop, now),
      this.errors.recentCount(shop.id, now),
      this.shopSms.notSentSince(shop.id, problemsSince),
      this.lytroSms.failedForShopSince(messages, problemsSince),
      this.couriers.failedCalls(shop.id, problemsSince),
      this.signInsOf(shop),
      this.planPayments.beingChecked(shop.id, PLAN_PAYMENT_KINDS),
      this.customerPayments.toVerifyCount(shop.id),
      this.orders.countByStatus(shop.id),
    ]);
    return {
      balance,
      usage: {
        cycleStart: usage.cycleStart,
        cycleEnd: usage.cycleEnd,
        metrics: usage.metrics,
        payPerUse: usage.payPerUse,
      },
      errors,
      failedSms: { since: problemsSince, shop: shopSms, lytro: lytroSms },
      failedCourierCalls: { since: problemsSince, count: failedCourierCalls },
      signIns,
      paymentsWaiting: { lytro, customers },
      orders,
    };
  }

  /** ADM-03, D8-23: the server faults kept for the shop, newest first: what, where and its ID, never a message. */
  async errorList(
    tenantId: string,
    beforeId: number | null,
    limit: number,
    now: Date,
  ): Promise<RequestErrorRow[]> {
    const shop = await this.shopOf(tenantId);
    return this.errors.latest(shop.id, beforeId, limit, now);
  }

  /**
   * ADM-03, D8-30: the SMS that didn't go, newest first, each list a page at a time: the shop's own, failed or blocked,
   * and Lytro's own to the shop or its team that failed for good.
   */
  async failedSms(
    tenantId: string,
    page: { shopBefore: number | null; lytroBefore: number | null; limit: number },
  ): Promise<{ shop: OperatorShopSms[]; lytro: FailedSmsRow[] }> {
    const shop = await this.shopOf(tenantId);
    const [own, lytro] = await Promise.all([
      this.shopSms.notSent(shop.id, { limit: page.limit, before: page.shopBefore }),
      this.lytroSms.failedForShop(await this.messagesOf(shop), page.lytroBefore, page.limit),
    ]);
    // D8-30: what went wrong and for which order; the customer's phone and the words stay the seller's.
    return {
      shop: own.map((sms) => ({
        id: sms.id,
        kind: sms.kind,
        status: sms.status,
        blockedReason: sms.blockedReason,
        orderNumber: sms.orderNumber,
        units: sms.units,
        createdAt: sms.createdAt,
      })),
      lytro,
    };
  }

  /** ADM-03, D8-28: the seller's payments to Lytro waiting for the operator, as the queue lists them. */
  async paymentsWaiting(tenantId: string): Promise<QueuedPayment[]> {
    const shop = await this.shopOf(tenantId);
    return this.queue.listPending(undefined, shop.id);
  }

  /** ADM-03, D8-29: the seller's own sales figures (STA-01) for the period asked, without cost or profit. */
  async salesOf(tenantId: string, query: SalesQuery, now: Date): Promise<SalesView> {
    const shop = await this.shopOf(tenantId);
    return this.sales.sales(shop.id, query, false, now);
  }

  /** D8-27: each active member, the owner first, with their last sign-in to this shop. */
  private async signInsOf(shop: TenantSummary): Promise<OperatorShopSignIn[]> {
    const [members, lastAt] = await Promise.all([
      this.staff.activeAccounts(shop.id),
      this.sessions.lastSignInsOf(shop.id),
    ]);
    return members.map((member) => {
      const account = member.isOwner ? shop.ownerSubscriberId : member.subscriberId;
      return {
        userId: member.userId,
        name: member.name,
        phone: member.phone,
        isOwner: member.isOwner,
        lastAt: account === null ? null : (lastAt.get(account) ?? null),
      };
    });
  }

  /** D8-30: Lytro's messages that are the shop's -- those naming it, and the sign-in codes to its team's phones. */
  private async messagesOf(shop: TenantSummary): Promise<ShopMessages> {
    const members = await this.staff.activeAccounts(shop.id);
    return {
      tenantId: shop.id,
      phones: members.flatMap((member) => (member.phone === null ? [] : [member.phone])),
    };
  }

  private async shopOf(tenantId: string): Promise<TenantSummary> {
    const shop = await this.tenants.findById(tenantId);
    if (!shop) throw new ApiError('not_found', 'ShopNotFound', {});
    return shop;
  }
}
