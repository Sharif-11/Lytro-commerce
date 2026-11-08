// API-27, D8-21 (Phase 8 Slice 8.1, read agreed 2026-11-07): every response carries an ID that its log lines carry too,
// short enough for a seller to read out over WhatsApp: eight characters in two halves, like K7MQ-4XR2, from letters and
// digits that can't be mistaken for each other (no 0 or O, no 1, I or L).
export const REQUEST_ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const REQUEST_ID_HALF_LENGTH = 4;
export const REQUEST_ID_PATTERN = /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;
export const REQUEST_ID_HEADER = 'X-Request-Id';

// D8-3: how long a shop's server fault is kept for the operator's shop page.
export const REQUEST_ERROR_KEEP_DAYS = 7;
