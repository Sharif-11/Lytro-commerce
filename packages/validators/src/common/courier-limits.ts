// CRR-18: a courier call counts as lost after [30] seconds. CRR-19: bookings and syncs a shop may make in a minute.
export const COURIER_CALL_TIMEOUT_SECONDS = 30;
export const COURIER_CALLS_PER_MINUTE = 60;
// Slice 6.1 read (SEC-16): how much of a courier's own refusal staff are shown.
export const COURIER_REFUSAL_MAX_LENGTH = 200;
// A courier credential's field, a parcel's number with the courier, its invoice, and staff's note for the courier.
export const COURIER_FIELD_MAX_LENGTH = 255;
export const CONSIGNMENT_ID_MAX_LENGTH = 100;
export const PARCEL_INVOICE_MAX_LENGTH = 100;
export const PARCEL_NOTE_MAX_LENGTH = 500;
export const COURIER_STATUS_MAX_LENGTH = 100;
