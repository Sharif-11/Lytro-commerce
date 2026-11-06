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
// Slice 6.2: how much of a courier's message is kept, and how much of it a shopper's tracking shows.
export const COURIER_MESSAGE_MAX_LENGTH = 500;
export const TRACKED_MESSAGE_MAX_LENGTH = 200;
// CRR-14, CRR-15, D6-4: the night check's and Sync's figures, until the operator's settings say otherwise.
export const DEFAULT_COURIER_CHECK_MIN_AGE_HOURS = 6;
export const DEFAULT_COURIER_CHECK_QUIET_HOURS = 24;
export const DEFAULT_COURIER_CHECK_STOP_DAYS = 30;
export const DEFAULT_COURIER_SYNC_MINUTES = 10;
// CUS-10, CUS-12 (Slice 6.4): a page of a courier's areas for the operator, and how many a booking's search shows.
export const COURIER_AREA_PAGE_SIZE = 50;
export const COURIER_AREA_PAGE_MAX = 200;
export const COURIER_AREA_SEARCH_MAX = 50;
