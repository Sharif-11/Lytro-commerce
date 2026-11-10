import { CourierKey, NotificationKind, PaymentMethod, Permission } from '../db/enums';

/**
 * Who hears a kind of notification (NTF-01, D7-42): the people holding a permission -- the owner always among them, as
 * the owner holds every permission -- or the owner alone.
 */
export type NotificationAudience = Permission | 'owner';

/** How the switches page groups the kinds (NTF-04). */
export type NotificationGroup = 'orders' | 'payments' | 'couriers' | 'stock' | 'media' | 'account';

export interface NotificationKindDefinition {
  audience: NotificationAudience;
  /** NTF-04, D7-40: whether a person may switch it off. Money and account kinds may not. */
  switchable: boolean;
  group: NotificationGroup;
}

/**
 * NTF-01, NTF-03, NTF-04 (Phase 7 Slice 7.3, read agreed 2026-11-07): every kind of notification, who hears it and
 * whether it can be switched off. One switch per kind covers the bell and push together (D7-40).
 */
export const NOTIFICATION_KINDS: Readonly<Record<NotificationKind, NotificationKindDefinition>> = {
  [NotificationKind.OrderPlaced]: {
    audience: Permission.OrdersRead,
    switchable: true,
    group: 'orders',
  },
  [NotificationKind.PaymentToVerify]: {
    audience: Permission.PaymentsVerify,
    switchable: false,
    group: 'payments',
  },
  [NotificationKind.PaymentVerified]: {
    audience: Permission.PaymentsRead,
    switchable: true,
    group: 'payments',
  },
  [NotificationKind.MoneyForClosedOrder]: {
    audience: Permission.PaymentsRead,
    switchable: false,
    group: 'payments',
  },
  // WAL-18: payment accounts are the owner's own.
  [NotificationKind.GatewayAttention]: { audience: 'owner', switchable: false, group: 'payments' },
  // WAL-18, D8-66 (Slice 8.7): a payment method type Lytro is retiring, which takes the shop's accounts for it when it goes.
  [NotificationKind.PaymentMethodRetiring]: {
    audience: 'owner',
    switchable: false,
    group: 'payments',
  },
  [NotificationKind.PaymentMethodBack]: { audience: 'owner', switchable: false, group: 'payments' },
  [NotificationKind.ListenerPhone]: {
    audience: Permission.ListenerManage,
    switchable: false,
    group: 'payments',
  },
  [NotificationKind.ParcelAttention]: {
    audience: Permission.OrdersManage,
    switchable: true,
    group: 'couriers',
  },
  [NotificationKind.ParcelMoved]: {
    audience: Permission.OrdersRead,
    switchable: true,
    group: 'couriers',
  },
  [NotificationKind.CourierConnection]: {
    audience: Permission.CouriersManage,
    switchable: true,
    group: 'couriers',
  },
  [NotificationKind.CourierRetiring]: {
    audience: Permission.CouriersManage,
    switchable: true,
    group: 'couriers',
  },
  [NotificationKind.CourierBack]: {
    audience: Permission.CouriersManage,
    switchable: true,
    group: 'couriers',
  },
  [NotificationKind.LowStock]: {
    audience: Permission.InventoryRead,
    switchable: true,
    group: 'stock',
  },
  [NotificationKind.BatchExpiring]: {
    audience: Permission.InventoryRead,
    switchable: true,
    group: 'stock',
  },
  [NotificationKind.HeldStockExpired]: {
    audience: Permission.InventoryRead,
    switchable: true,
    group: 'stock',
  },
  [NotificationKind.MediaFailed]: {
    audience: Permission.ProductsManage,
    switchable: true,
    group: 'media',
  },
  // D7-42: low balance also reaches the staff who can top up.
  [NotificationKind.LowBalance]: {
    audience: Permission.BalanceManage,
    switchable: false,
    group: 'account',
  },
  [NotificationKind.UsageWarning]: { audience: 'owner', switchable: false, group: 'account' },
  [NotificationKind.RenewalReminder]: { audience: 'owner', switchable: false, group: 'account' },
  [NotificationKind.AccountNotice]: { audience: 'owner', switchable: false, group: 'account' },
  [NotificationKind.EmailBounced]: { audience: 'owner', switchable: false, group: 'account' },
  // NTC-06, D7-56: Lytro's notices reach the owner and staff with notices:read, and can't be switched off.
  [NotificationKind.LytroNotice]: {
    audience: Permission.NoticesRead,
    switchable: false,
    group: 'account',
  },
};

/** NTF-04: the kinds a person may switch off. */
export const SWITCHABLE_NOTIFICATION_KINDS: readonly NotificationKind[] = Object.values(
  NotificationKind,
).filter((kind) => NOTIFICATION_KINDS[kind].switchable);

/** A courier as a notification names it. */
export const COURIER_NAMES: Readonly<Record<CourierKey, string>> = {
  [CourierKey.Steadfast]: 'Steadfast',
  [CourierKey.Pathao]: 'Pathao',
  [CourierKey.RedX]: 'RedX',
};

/** A way to pay as a notification names it, in each language. */
export const PAYMENT_METHOD_NAMES: Readonly<Record<PaymentMethod, { bn: string; en: string }>> = {
  [PaymentMethod.CashOnDelivery]: { bn: 'ক্যাশ অন ডেলিভারি', en: 'cash on delivery' },
  [PaymentMethod.Cash]: { bn: 'ক্যাশ', en: 'cash' },
  [PaymentMethod.Bkash]: { bn: 'bKash', en: 'bKash' },
  [PaymentMethod.Nagad]: { bn: 'Nagad', en: 'Nagad' },
  [PaymentMethod.Rocket]: { bn: 'Rocket', en: 'Rocket' },
  [PaymentMethod.Upay]: { bn: 'Upay', en: 'Upay' },
  [PaymentMethod.Bank]: { bn: 'ব্যাংক', en: 'bank transfer' },
};

/**
 * NTF-02 (Slice 7.3): the push services a browser's subscription may point at. The server sends to the address a browser
 * gives, so only these hosts are taken -- never an address of anyone's choosing.
 */
export const PUSH_SERVICE_HOSTS: readonly string[] = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
  'notify.windows.com',
];

/** Whether an address is one of the push services, or a part of one (`*.notify.windows.com`). */
export function isPushServiceUrl(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}
