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
