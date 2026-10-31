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

/**
 * VER-01 (Phase 5 Slice 5.3): tells the shop's staff with payments:verify of a payment waiting for them. Phase 7 delivers
 * it in-app and by push (NTF-01, NTF-03).
 */
export interface PaymentNotifier {
  paymentToVerify(notice: PaymentToVerifyNotice): Promise<void>;
}
