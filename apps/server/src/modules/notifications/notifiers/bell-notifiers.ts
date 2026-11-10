import { Inject, Injectable } from '@nestjs/common';
import { NotificationKind } from '@lytronix/validators';
import type {
  ConnectionTroubleNotice,
  CourierBackNotice,
  CourierNotifier,
  CourierRetiringNotice,
  ParcelAttentionNotice,
  ParcelMovedNotice,
} from '../../couriers/ports/courier-notifier';
import type { BatchExpiryNotifier } from '../../inventory/ports/stock-batch-store';
import type { LowStockNotifier } from '../../inventory/ports/stock-store';
import type {
  BatchExpiryNotice,
  HeldStockExpiredNotice,
  LowStockNotice,
} from '../../inventory/types/inventory';
import type { MediaFailureNotice, MediaNotifier } from '../../media/ports/media-notifier';
import type {
  PaymentMethodNotifier,
  PaymentMethodTypeNotice,
} from '../../payment-method-types/ports/payment-method-notifier';
import type { OrderNotifier, PlacedOrderNotice } from '../../orders/ports/order-notifier';
import type {
  GatewayAttentionNotice,
  MoneyForClosedOrderNotice,
  PaymentNotifier,
  PaymentToVerifyNotice,
  PaymentVerifiedNotice,
} from '../../payment-sessions/ports/payment-notifier';
import {
  batchExpiringText,
  courierBackText,
  courierConnectionText,
  courierRetiringText,
  gatewayAttentionText,
  heldStockExpiredText,
  lowStockText,
  mediaFailedText,
  moneyForClosedOrderText,
  NOTIFICATION_LINKS,
  orderPlacedText,
  parcelAttentionText,
  parcelMovedText,
  paymentMethodBackText,
  paymentMethodRetiringText,
  paymentToVerifyText,
  paymentVerifiedText,
} from '../notification-words';
import { Notifications } from '../services/notifications';

// D7-14 (Phase 7 Slice 7.3): each stand-in that only wrote to the log becomes a notification, in the bell and by push, to
// the people its kind reaches. What decides when each is told -- once per crossing, once per batch, a shopper's order
// and never a staff one -- stays where it was, in its own module, and nothing that calls it changes. Each is written in
// its own transaction, after its change committed, and a failure is logged, never thrown into the caller.

/** ORD-20: a shopper's order. */
@Injectable()
export class BellOrderNotifier implements OrderNotifier {
  constructor(@Inject(Notifications) private readonly notifications: Notifications) {}

  async orderPlaced(notice: PlacedOrderNotice): Promise<void> {
    await this.notifications.notify({
      tenantId: notice.tenantId,
      kind: NotificationKind.OrderPlaced,
      text: orderPlacedText(notice),
      link: NOTIFICATION_LINKS.order(notice.orderId),
    });
  }
}

/** VER-01, PAY-14, WAL-24: payments staff check, verified ones, money for a closed order, a gateway in trouble. */
@Injectable()
export class BellPaymentNotifier implements PaymentNotifier {
  constructor(@Inject(Notifications) private readonly notifications: Notifications) {}

  async paymentToVerify(notice: PaymentToVerifyNotice): Promise<void> {
    await this.notifications.notify({
      tenantId: notice.tenantId,
      kind: NotificationKind.PaymentToVerify,
      text: paymentToVerifyText(notice),
      link: NOTIFICATION_LINKS.payments,
    });
  }

  async paymentVerified(notice: PaymentVerifiedNotice): Promise<void> {
    await this.notifications.notify({
      tenantId: notice.tenantId,
      kind: NotificationKind.PaymentVerified,
      text: paymentVerifiedText(notice),
      link: NOTIFICATION_LINKS.payments,
    });
  }

  async moneyForClosedOrder(notice: MoneyForClosedOrderNotice): Promise<void> {
    await this.notifications.notify({
      tenantId: notice.tenantId,
      kind: NotificationKind.MoneyForClosedOrder,
      text: moneyForClosedOrderText(notice),
      link: NOTIFICATION_LINKS.payments,
    });
  }

  async gatewayNeedsAttention(notice: GatewayAttentionNotice): Promise<void> {
    await this.notifications.notify({
      tenantId: notice.tenantId,
      kind: NotificationKind.GatewayAttention,
      text: gatewayAttentionText(notice.method),
      link: NOTIFICATION_LINKS.paymentMethods,
    });
  }
}

/** CRR-12 to CRR-15, CRR-23, CRR-24: what the couriers' news and the operator's retiring tell the shop. */
@Injectable()
export class BellCourierNotifier implements CourierNotifier {
  constructor(@Inject(Notifications) private readonly notifications: Notifications) {}

  async parcelNeedsAttention(notice: ParcelAttentionNotice): Promise<void> {
    await this.notifications.notify({
      tenantId: notice.tenantId,
      kind: NotificationKind.ParcelAttention,
      text: parcelAttentionText(notice),
      link: NOTIFICATION_LINKS.order(notice.orderId),
    });
  }

  async parcelMoved(notice: ParcelMovedNotice): Promise<void> {
    await this.notifications.notify({
      tenantId: notice.tenantId,
      kind: NotificationKind.ParcelMoved,
      text: parcelMovedText(notice),
      link: NOTIFICATION_LINKS.order(notice.orderId),
    });
  }

  async connectionTrouble(notice: ConnectionTroubleNotice): Promise<void> {
    await this.notifications.notify({
      tenantId: notice.tenantId,
      kind: NotificationKind.CourierConnection,
      text: courierConnectionText(notice.courierKey, notice.trouble),
      link: NOTIFICATION_LINKS.courier(notice.courierKey),
    });
  }

  async courierRetiring(notice: CourierRetiringNotice): Promise<void> {
    await this.notifications.notify({
      tenantId: notice.tenantId,
      kind: NotificationKind.CourierRetiring,
      text: courierRetiringText(notice),
      link: NOTIFICATION_LINKS.couriers,
    });
  }

  async courierBack(notice: CourierBackNotice): Promise<void> {
    await this.notifications.notify({
      tenantId: notice.tenantId,
      kind: NotificationKind.CourierBack,
      text: courierBackText(notice.courierKey),
      link: NOTIFICATION_LINKS.couriers,
    });
  }
}

/** INV-08: a variant's stock at its threshold. */
@Injectable()
export class BellLowStockNotifier implements LowStockNotifier {
  constructor(@Inject(Notifications) private readonly notifications: Notifications) {}

  async lowStock(notice: LowStockNotice): Promise<void> {
    await this.notifications.notify({
      tenantId: notice.tenantId,
      kind: NotificationKind.LowStock,
      text: lowStockText(notice),
      link: NOTIFICATION_LINKS.product(notice.productId),
    });
  }
}

/** INV-13: a batch about to expire, and stock held for orders that has. */
@Injectable()
export class BellBatchExpiryNotifier implements BatchExpiryNotifier {
  constructor(@Inject(Notifications) private readonly notifications: Notifications) {}

  async expiringSoon(notice: BatchExpiryNotice): Promise<void> {
    await this.notifications.notify({
      tenantId: notice.tenantId,
      kind: NotificationKind.BatchExpiring,
      text: batchExpiringText(notice),
      link: NOTIFICATION_LINKS.product(notice.productId),
    });
  }

  async heldStockExpired(notice: HeldStockExpiredNotice): Promise<void> {
    await this.notifications.notify({
      tenantId: notice.tenantId,
      kind: NotificationKind.HeldStockExpired,
      text: heldStockExpiredText(notice),
      link: NOTIFICATION_LINKS.product(notice.productId),
    });
  }
}

/** WAL-18, D8-66 (Slice 8.7): a payment method type Lytro is retiring, or has brought back, told to the shops that set it up. */
@Injectable()
export class BellPaymentMethodNotifier implements PaymentMethodNotifier {
  constructor(@Inject(Notifications) private readonly notifications: Notifications) {}

  async methodRetiring(notice: PaymentMethodTypeNotice): Promise<void> {
    await this.notifications.notify({
      tenantId: notice.tenantId,
      kind: NotificationKind.PaymentMethodRetiring,
      text: paymentMethodRetiringText(notice.method),
      link: NOTIFICATION_LINKS.paymentMethods,
    });
  }

  async methodBack(notice: PaymentMethodTypeNotice): Promise<void> {
    await this.notifications.notify({
      tenantId: notice.tenantId,
      kind: NotificationKind.PaymentMethodBack,
      text: paymentMethodBackText(notice.method),
      link: NOTIFICATION_LINKS.paymentMethods,
    });
  }
}

/** STO-09: an upload that couldn't be used. */
@Injectable()
export class BellMediaNotifier implements MediaNotifier {
  constructor(@Inject(Notifications) private readonly notifications: Notifications) {}

  async mediaFailed(notice: MediaFailureNotice): Promise<void> {
    await this.notifications.notify({
      tenantId: notice.tenantId,
      kind: NotificationKind.MediaFailed,
      text: mediaFailedText(notice.kind),
      link: null,
    });
  }
}
