// Every request limit in one place. The database schema, the server and the request shapes all read these,
// so a limit is changed once (ENGINEERING-STANDARDS §4).

// AUTH-01: shop name and owner name, up to 60 characters each.
export const NAME_MAX_LENGTH = 60;

// AUTH-11: a shop address is 3 to 30 characters of lowercase letters, digits and hyphens, with no leading or
// trailing hyphen.
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 30;
export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$/;

// AUTH-05: one-time codes are six digits.
export const CODE_LENGTH = 6;
export const CODE_PATTERN = new RegExp(`^\\d{${String(CODE_LENGTH)}}$`);

// D2: passwords are 8–20 characters.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 20;

// TEN-30: a free-text shop/business street address, shown on the storefront footer (SFT-21).
export const BUSINESS_ADDRESS_MAX_LENGTH = 300;

// BAL-17 and every other money amount stored in a `numeric(12,2)` column: 10 integer digits is the column's
// own ceiling (DATABASE-SCHEMA's convention throughout). An amount past this overflows the column with a raw,
// unhandled Postgres error instead of a clean validation message -- the bound belongs in the schema, at the
// one place every such amount is defined, not rediscovered per field.
export const MONEY_AMOUNT_MAX = 9_999_999_999.99;
