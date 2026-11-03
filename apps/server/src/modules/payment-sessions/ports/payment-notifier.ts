import type { PaymentMethod } from '@lytronix/validators';

/** VER-01: a transaction ID a shopper typed, as the shop's staff are told of it. */
export interface PaymentToVerifyNotice {
  tenantId: string;
  sessionId: string;
  orderNumber: string;
  method: PaymentMethod;
  amount: string;
  transactionId: string;
}

/** PAY-15 (Slice 5.4b): a payment the listener verified by itself, as staff are told of it. */
export interface PaymentVerifiedNotice {
  tenantId: string;
  sessionId: string;
  orderNumber: string;
  amount: string;
  transactionId: string;
}

/** D5-4 (Slice 5.4b): money that turned up for an order already closed, for staff to sort out. */
export interface MoneyForClosedOrderNotice {
  tenantId: string;
  orderNumber: string;
  amount: string;
  transactionId: string;
}

/** VER-10 (Slice 5.7): a shop's gateway failed; its owner needs to look at it. */
export interface GatewayAttentionNotice {
  tenantId: string;
  method: PaymentMethod;
}

/**
 * VER-01 (Phase 5 Slice 5.3): tells the shop's staff with payments:verify of a payment waiting for them. Phase 7 delivers
 * it in-app and by push (NTF-01, NTF-03).
 */
export interface PaymentNotifier {
  paymentToVerify(notice: PaymentToVerifyNotice): Promise<void>;
  paymentVerified(notice: PaymentVerifiedNotice): Promise<void>;
  moneyForClosedOrder(notice: MoneyForClosedOrderNotice): Promise<void>;
  gatewayNeedsAttention(notice: GatewayAttentionNotice): Promise<void>;
}
