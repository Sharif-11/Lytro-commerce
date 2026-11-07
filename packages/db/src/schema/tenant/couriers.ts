import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  CONSIGNMENT_ID_MAX_LENGTH,
  COURIER_MESSAGE_MAX_LENGTH,
  COURIER_PAYOUT_ID_MAX_LENGTH,
  COURIER_PAYOUT_METHOD_MAX_LENGTH,
  COURIER_REFUSAL_MAX_LENGTH,
  COURIER_STATUS_MAX_LENGTH,
  CourierConnectionState,
  enumTuple,
  PARCEL_INVOICE_MAX_LENGTH,
  PARCEL_NOTE_MAX_LENGTH,
  ParcelState,
  TRACKING_CODE_MAX_LENGTH,
  type CourierCallAction,
  type CourierKey,
  type CourierNewsSource,
  type ParcelAttention,
  type ParcelReading,
} from '@lytronix/validators';
import { bytea, createdAt, tenant } from '../shared';
import { orders } from './orders';

const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

export const parcelState = tenant.enum('parcel_state', enumTuple(Object.values(ParcelState)));
export const courierConnectionState = tenant.enum(
  'courier_connection_state',
  enumTuple(Object.values(CourierConnectionState)),
);

// CRR-02 to CRR-05, CRR-20 (Phase 6 Slice 6.1): a shop's connection to a courier, on its own account. Credentials are sealed
// (SEC-08) and never returned; there is no limit on how many a shop has (CRR-04). At most one is the shop's default (CRR-05).
export const courierConnections = tenant.table(
  'courier_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    courierKey: text('courier_key').$type<CourierKey>().notNull(),
    credentials: bytea('credentials').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    state: courierConnectionState('state').notNull().default(CourierConnectionState.Active),
    // CRR-02, CRR-03 (Slice 6.2): its message address's token and the token messages are signed with, sealed; shown to whoever
    // holds couriers:manage, since neither is the courier's own credential.
    messageSecrets: bytea('message_secrets'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    // Read agreed 2026-11-05: when a message last came without a good signature, so the owner can be told to paste the token.
    unsignedAt: timestamp('unsigned_at', { withTimezone: true }),
    // CRR-15: when the owner was last told a pasted address may be broken, at most once a day.
    pasteWarnedAt: timestamp('paste_warned_at', { withTimezone: true }),
    // Phase 6 close-out (agreed 2026-11-07): which courier account this is, as a fingerprint of the credential that names it, never
    // the credential. One account serves one shop, since a courier refuses an invoice it has seen and every shop numbers from 0001.
    accountFingerprint: text('account_fingerprint'),
    // CRR-17 (Slice 6.5): Steadfast lists payouts oldest first with no page count, so the night run starts where new ones may be,
    // and learns how many a full page holds once it has seen one followed by another.
    payoutPage: smallint('payout_page').notNull().default(1),
    payoutPageSize: smallint('payout_page_size'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('courier_connections_courier_key').on(t.tenantId, t.courierKey),
    uniqueIndex('courier_connections_default_key')
      .on(t.tenantId)
      .where(sql`${t.isDefault}`),
    // Across every shop: a second shop connecting the same account is refused.
    uniqueIndex('courier_connections_account_key')
      .on(t.courierKey, t.accountFingerprint)
      .where(sql`${t.accountFingerprint} IS NOT NULL`),
  ],
);

/** The rates a held pay-as-you-go fee was worked out on (PYG-14), named on its ledger entry when it is charged. */
export interface ParcelFeeRates {
  minimum: string;
  percent: string;
}

/** INV-14: the serials staff named for one item when booking, kept for the stock taken when the courier accepts. */
export interface ParcelSerials {
  lineId: string;
  variantId?: string;
  serials: string[];
}

// CRR-06, CRR-08, CRR-18, D6-6, D6-7, D6-11 (Phase 6 Slice 6.1): an order's parcels, one live at a time. A booking is claimed,
// called and settled with no transaction open across the call, so this row holds what the settling needs: the serials named,
// the fee set aside and whether this booking took the order's place under the shop's limits. `settledAt` is when the order
// moved: a parcel can be accepted and not yet settled, and is never lost for it. The courier's area goes here, not on the order
// (D6-5). A courier's refusal is its own short message, for staff only (SEC-16 as amended).
export const courierParcels = tenant.table(
  'courier_parcels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    orderId: uuid('order_id').notNull(),
    courierKey: text('courier_key').$type<CourierKey>().notNull(),
    // By value: disconnecting a courier leaves its parcels (CRR-20).
    connectionId: uuid('connection_id'),
    state: parcelState('state').notNull().default(ParcelState.Booking),
    // The order's number, or with a suffix once an earlier booking was cancelled: Steadfast refuses a repeated invoice.
    invoice: varchar('invoice', { length: PARCEL_INVOICE_MAX_LENGTH }).notNull(),
    consignmentId: varchar('consignment_id', { length: CONSIGNMENT_ID_MAX_LENGTH }),
    trackingCode: varchar('tracking_code', { length: TRACKING_CODE_MAX_LENGTH }),
    courierStatus: varchar('courier_status', { length: COURIER_STATUS_MAX_LENGTH }),
    // The cash on delivery sent: what the order said was due (read agreed 2026-11-04).
    cod: money('cod').notNull(),
    note: varchar('note', { length: PARCEL_NOTE_MAX_LENGTH }),
    weightKg: numeric('weight_kg', { precision: 10, scale: 3 }),
    areaCode: text('area_code'),
    deliveryCharge: money('delivery_charge'),
    // The pay-as-you-go fee set aside while the call is out (D5-7's way, read agreed 2026-11-04).
    feeHeld: money('fee_held').notNull().default('0'),
    feeRates: jsonb('fee_rates').$type<ParcelFeeRates>(),
    // This booking took the order's place under the limits (QTA-01), so a refusal gives it back.
    tookPlace: boolean('took_place').notNull().default(false),
    // INV-14: named at booking; their numbers alone too, so two bookings at once can't name the same one.
    serials: jsonb('serials').$type<ParcelSerials[]>().notNull().default([]),
    serialNumbers: text('serial_numbers').array().notNull().default([]),
    refusal: varchar('refusal', { length: COURIER_REFUSAL_MAX_LENGTH }),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    // The message key of a stock problem staff must clear before the parcel can settle.
    settleProblem: text('settle_problem'),
    // D6-11: how many times Lytro has asked, how many said no such parcel, and when to ask next.
    lookUps: smallint('look_ups').notNull().default(0),
    notFound: smallint('not_found').notNull().default(0),
    nextLookUpAt: timestamp('next_look_up_at', { withTimezone: true }),
    bookedBy: uuid('booked_by'),
    // CRR-29 (Slice 6.2): what its courier's status means here, and when the courier said so, so older news changes nothing.
    reading: text('reading').$type<ParcelReading>(),
    lastNewsAt: timestamp('last_news_at', { withTimezone: true }),
    // D6-4: when its status last changed, when a message last told of it, and when Lytro last asked.
    lastChangeAt: timestamp('last_change_at', { withTimezone: true }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastCheckAt: timestamp('last_check_at', { withTimezone: true }),
    // D6-4: 30 days with no change stop the checks and show "no news"; Sync starts them again.
    checksStoppedAt: timestamp('checks_stopped_at', { withTimezone: true }),
    // Phase 6 close-out: when a person last asked (Sync), which starts the 30 days again as a change would.
    checksRestartedAt: timestamp('checks_restarted_at', { withTimezone: true }),
    // Read agreed 2026-11-05: the cash its courier reports, the COD if changed in its panel, and what staff should look at.
    cashCollected: money('cash_collected'),
    codAtCourier: money('cod_at_courier'),
    attention: text('attention').$type<ParcelAttention>(),
    // CRR-17, D6-9 (Slice 6.5): when its courier says it paid the shop for it, and the payout that did where it names one. No
    // courier gives an amount for one parcel, so the amount stays on the payout.
    paidAt: timestamp('paid_at', { withTimezone: true }),
    payoutId: varchar('payout_id', { length: COURIER_PAYOUT_ID_MAX_LENGTH }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'courier_parcels_order_fk',
      columns: [t.tenantId, t.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }).onDelete('cascade'),
    // CRR-08: two bookings at once make one parcel.
    uniqueIndex('courier_parcels_live_key')
      .on(t.tenantId, t.orderId)
      .where(sql`${t.state} IN ('booking', 'booked', 'unknown')`),
    index('courier_parcels_order_idx').on(t.tenantId, t.orderId, t.createdAt),
    // WAL-21: what bookings hold, read on every charge.
    index('courier_parcels_fee_held_idx')
      .on(t.tenantId)
      .where(
        sql`${t.feeHeld} > 0 AND ${t.settledAt} IS NULL AND ${t.state} IN ('booking', 'booked', 'unknown')`,
      ),
    // D6-11: the minute pass's work.
    index('courier_parcels_unsettled_idx')
      .on(t.tenantId, t.createdAt)
      .where(sql`${t.settledAt} IS NULL AND ${t.state} IN ('booking', 'booked', 'unknown')`),
    // D6-4: the night check's pick, oldest first.
    index('courier_parcels_night_idx')
      .on(t.tenantId, t.createdAt)
      .where(
        sql`${t.state} = 'booked' AND ${t.settledAt} IS NOT NULL AND ${t.checksStoppedAt} IS NULL AND (${t.reading} IS NULL OR ${t.reading} NOT IN ('delivered', 'partly_delivered', 'returning'))`,
      ),
    index('courier_parcels_invoice_idx').on(t.tenantId, t.courierKey, t.invoice),
    // Slice 6.2: a courier's news finds its parcel by the courier's number.
    index('courier_parcels_consignment_idx').on(t.tenantId, t.courierKey, t.consignmentId),
    // CRR-17 (Slice 6.5): a payout's parcels.
    index('courier_parcels_payout_idx').on(t.tenantId, t.courierKey, t.payoutId),
  ],
);

/** Slice 6.2: one piece of courier news as an adapter read it, kept until it has been applied. */
export interface StoredCourierNews {
  event: string;
  statusEvent: boolean;
  /** Read agreed 2026-11-05: its words may show on the shopper's tracking; never a refusal or a change made in a panel. */
  forShopper: boolean;
  consignmentId: string | null;
  invoice: string | null;
  cashCollected: string | null;
  deliveryCharge: string | null;
  codAtCourier: string | null;
  /** CRR-12, CRR-17 (Slice 6.5): it says the courier paid the shop for the parcel; news kept before then has neither. */
  paid?: boolean;
  payoutId?: string | null;
}

// CRR-12, CRR-13 (Phase 6 Slice 6.2): a parcel's news, whichever way it came. A message is stored first and applied after the courier
// has its answer, so a slow apply never looks like a failed delivery. The unique key is what makes a repeat add nothing. A message
// for a parcel Lytro didn't book has no parcel and moves nothing.
export const courierEvents = tenant.table(
  'courier_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    parcelId: uuid('parcel_id').references(() => courierParcels.id, { onDelete: 'cascade' }),
    courierKey: text('courier_key').$type<CourierKey>().notNull(),
    source: text('source').$type<CourierNewsSource>().notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    rawStatus: varchar('raw_status', { length: COURIER_STATUS_MAX_LENGTH }),
    reading: text('reading').$type<ParcelReading>(),
    messageEn: varchar('message_en', { length: COURIER_MESSAGE_MAX_LENGTH }),
    messageBn: varchar('message_bn', { length: COURIER_MESSAGE_MAX_LENGTH }),
    // When the courier says it happened; older news than a parcel holds changes nothing (CRR-29).
    happenedAt: timestamp('happened_at', { withTimezone: true }),
    news: jsonb('news').$type<StoredCourierNews>().notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    problem: text('problem'),
  },
  (t) => [
    unique('courier_events_dedupe_key').on(t.tenantId, t.courierKey, t.dedupeKey),
    index('courier_events_parcel_idx').on(t.parcelId, t.receivedAt),
    // The minute pass's work: what a message stored and nothing has applied yet.
    index('courier_events_unapplied_idx')
      .on(t.tenantId, t.receivedAt)
      .where(sql`${t.appliedAt} IS NULL`),
  ],
);

// CRR-17, D6-9 (Phase 6 Slice 6.5, read agreed 2026-11-06): a payout a courier made the shop, its figures kept as the courier gives
// them and never checked against the cash recorded, since its own fees would make false alarms. It gives no amount for one parcel,
// so its parcels carry its ID and it keeps the amount. `parcels` is how many it settled and `ours` how many of those Lytro booked.
// One is read once: the unique key is what keeps a second night from reading it again.
export const courierPayouts = tenant.table(
  'courier_payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    courierKey: text('courier_key').$type<CourierKey>().notNull(),
    payoutId: varchar('payout_id', { length: COURIER_PAYOUT_ID_MAX_LENGTH }).notNull(),
    amount: money('amount').notNull(),
    charges: money('charges'),
    total: money('total'),
    method: varchar('method', { length: COURIER_PAYOUT_METHOD_MAX_LENGTH }),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
    // When the courier made it up, by its own clock.
    madeAt: timestamp('made_at', { withTimezone: true }),
    parcels: integer('parcels').notNull().default(0),
    ours: integer('ours').notNull().default(0),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('courier_payouts_payout_key').on(t.tenantId, t.courierKey, t.payoutId),
    index('courier_payouts_paid_idx').on(t.tenantId, t.paidAt),
  ],
);

// SEC-11 (Slice 6.1, read agreed 2026-11-04: its own table): every outbound call made with a shop's courier credentials -- when, to
// which courier, what for and for which order, and whether it worked -- never a credential. It goes with the shop at day 60.
export const courierCredentialUses = tenant.table(
  'courier_credential_uses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    courierKey: text('courier_key').$type<CourierKey>().notNull(),
    action: text('action').$type<CourierCallAction>().notNull(),
    connectionId: uuid('connection_id'),
    orderId: uuid('order_id'),
    succeeded: boolean('succeeded').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('courier_credential_uses_tenant_idx').on(t.tenantId, t.at)],
);

export type SelectCourierConnection = typeof courierConnections.$inferSelect;
export type SelectCourierParcel = typeof courierParcels.$inferSelect;
export type SelectCourierCredentialUse = typeof courierCredentialUses.$inferSelect;
export type SelectCourierEvent = typeof courierEvents.$inferSelect;
export type SelectCourierPayout = typeof courierPayouts.$inferSelect;
