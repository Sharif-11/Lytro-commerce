/**
 * MKT-02 (the owner, 2026-11-24): Lytro's own events for its Meta pixel, by the names Meta's events go by.
 * `ShopActivated` is Lytro's own custom event: a new shop's first order, the one to optimise ads on.
 */
export enum PlatformAdEvent {
  Lead = 'Lead',
  CompleteRegistration = 'CompleteRegistration',
  ShopActivated = 'ShopActivated',
  Subscribe = 'Subscribe',
}

/**
 * MKT-03: the request an event happened in, which is how Meta matches it to an ad click: the client's address and
 * browser, Meta's own `_fbp`/`_fbc` cookies (lytro.app's pixel or the dashboard's fbclid sets them on the platform
 * domain) and the page it came from, without its query.
 */
export interface AdVisit {
  ip: string | null;
  userAgent: string | null;
  fbp: string | null;
  fbc: string | null;
  pageUrl: string | null;
}

/**
 * MKT-02, MKT-03: one event queued for Meta. Identifiers are hashed before they are queued, so no phone number waits
 * in the queue's tables. A shop's later events (activation, first plan) carry only the shop; the sender reads the
 * owner's phone as it sends.
 */
export interface PlatformAdJob {
  event: PlatformAdEvent;
  eventId: string;
  /** Unix seconds, as Meta takes it. */
  eventTime: number;
  tenantId: string | null;
  hashedPhone: string | null;
  hashedExternalId: string | null;
  visit: AdVisit | null;
  /** Subscribe's amount, in taka. */
  value: string | null;
}
