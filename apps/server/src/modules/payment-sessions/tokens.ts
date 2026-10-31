// PAY-01 to PAY-08: the shop's payment sessions and the references that find them.
export const PAYMENT_SESSION_STORE = Symbol('PAYMENT_SESSION_STORE');
// PAY-01: the payment page's own address, `pay.<PLATFORM_DOMAIN>`.
export const PAYMENT_PAGE_ORIGIN = Symbol('PAYMENT_PAGE_ORIGIN');
// VER-01 (Slice 5.3): who tells the shop's staff of a payment to verify.
export const PAYMENT_NOTIFIER = Symbol('PAYMENT_NOTIFIER');
