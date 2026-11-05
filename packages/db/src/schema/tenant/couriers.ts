import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
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
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('courier_connections_courier_key').on(t.tenantId, t.courierKey),
    uniqueIndex('courier_connections_default_key')
      .on(t.tenantId)
      .where(sql`${t.isDefault}`),
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
    // Slice 6.2: a courier's news finds its parcel by the courier's number.
    index('courier_parcels_consignment_idx').on(t.tenantId, t.courierKey, t.consignmentId),
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
