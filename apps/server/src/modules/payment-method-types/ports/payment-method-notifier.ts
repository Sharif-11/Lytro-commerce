import type { AccountMethod } from '@lytronix/validators';

/** WAL-18, D8-66 (Slice 8.7): one shop that set a type up, told it is being retired, or that it is back. */
export interface PaymentMethodTypeNotice {
  tenantId: string;
  method: AccountMethod;
}

/** WAL-18 (Slice 8.7): telling a shop's owner, in the bell and by push, after the change committed. */
export interface PaymentMethodNotifier {
  methodRetiring(notice: PaymentMethodTypeNotice): Promise<void>;
  methodBack(notice: PaymentMethodTypeNotice): Promise<void>;
}
