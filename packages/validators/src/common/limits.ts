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

// BAL-13: a balance at or below this many taka is low -- the owner is told once per crossing, and Home says so.
export const LOW_BALANCE_AMOUNT = 50;

// Catalogue (SRS-detailed §14). A product's name and description (PRD-01), a category's name and depth (PRD-03),
// an attribute's name and an option's value (ATL-01), and the variant limits (ATR-14), enforced by the request
// shapes here and again by the database (ATL-03).
export const PRODUCT_NAME_MAX_LENGTH = 200;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 5000;
export const CATEGORY_NAME_MAX_LENGTH = 80;
export const CATEGORY_MAX_DEPTH = 4;
export const ATTRIBUTE_NAME_MAX_LENGTH = 80;
export const OPTION_VALUE_MAX_LENGTH = 80;
export const MAX_VARIANT_ATTRIBUTES = 3;
export const MAX_VARIANTS_PER_PRODUCT = 100;
// CMB-10: a combo's parts, each part's quantity in one combo, and the variants a part may be chosen from.
export const COMBO_PARTS_MAX = 10;
export const COMBO_PART_QUANTITY_MAX = 20;
export const COMBO_PART_VARIANTS_MAX = 100;
// ATL-02: the attributes that may describe one product (or be asked about it when ordering, ATR-08).
export const ATTRIBUTES_PER_PRODUCT_MAX = 50;
// STA-01 to STA-03 (Slice 4.7): the longest period sales figures cover, and how many best sellers one read ranks.
export const SALES_PERIOD_DAYS_MAX = 1830;
export const BEST_SELLERS_DEFAULT = 10;
export const BEST_SELLERS_MAX = 50;
// PRD-12: the dashboard's product list pages.
export const PRODUCT_PAGE_SIZE = 20;
export const LIST_PAGE_SIZE_MAX = 100;
// PRD-09, CCH-11: the public catalogue's list pages.
export const PUBLIC_PAGE_SIZE = 24;
export const PUBLIC_PAGE_SIZE_MAX = 60;
// Slice 12b: a product added within this many days shows as "New" on a storefront card.
export const PRODUCT_NEW_DAYS = 14;
// LND-04: a product's link slug. Letters (Bangla included), digits and hyphens, no leading or trailing hyphen.
export const PRODUCT_SLUG_MAX_LENGTH = 120;
export const PRODUCT_SLUG_PATTERN = /^[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*$/u;
export const SKU_MAX_LENGTH = 64;
// The `numeric(10,2)` price and charge columns, and the `numeric(10,3)` weight and `numeric(14,3)` quantity ones.
export const PRICE_MAX = 99_999_999.99;
export const WEIGHT_KG_MAX = 9_999_999.999;
export const QUANTITY_MAX = 99_999_999_999.999;
// PRD-17: a size chart table, up to 15 rows of up to 10 short cells.
export const SIZE_CHART_MAX_ROWS = 15;
export const SIZE_CHART_MAX_COLUMNS = 10;
export const SIZE_CHART_CELL_MAX_LENGTH = 40;
// ATR-16: an option set's name and how many values it holds.
export const OPTION_SET_NAME_MAX_LENGTH = 60;
export const OPTION_SET_MAX_OPTIONS = 50;
// ATR-18, BRN-02: a colour, as #RRGGBB -- an option's swatch, a brand identity's colours.
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
// DLV-01: delivery zones. A shop starts with "Inside Dhaka city" at 70 TK and the fallback at 130 TK, and may hold
// up to 20 zones in all. A zone's areas are capped by what exists: 64 zillas, 11 cities, every thana.
export const DELIVERY_ZONE_NAME_MAX_LENGTH = 60;
export const MAX_DELIVERY_ZONES = 20;
export const DEFAULT_HOME_CITY = 'dhaka';
export const DEFAULT_HOME_ZONE_CHARGE = '70.00';
export const DEFAULT_FALLBACK_ZONE_CHARGE = '130.00';
export const DELIVERY_ZONE_MAX_ZILLAS = 64;
export const DELIVERY_ZONE_MAX_CITIES = 11;
export const DELIVERY_ZONE_MAX_THANAS = 600;
// INV-03, INV-06: a stock movement's optional note.
export const STOCK_NOTE_MAX_LENGTH = 200;
// INV-09: a page of stock history.
export const STOCK_HISTORY_PAGE_SIZE = 20;
// INV-12: a batch's optional code (a lot number), and a page of batches.
export const STOCK_BATCH_CODE_MAX_LENGTH = 40;
export const STOCK_BATCH_PAGE_SIZE = 20;
// INV-14, INV-23: one serial (an IMEI is 15 digits), the serials one request may enter, and a page of them.
export const SERIAL_MAX_LENGTH = 64;
export const SERIALS_PER_ENTRY_MAX = 500;
export const SERIAL_PAGE_SIZE = 50;
// INV-13: a batch expiring within this many days raises its one notice.
export const EXPIRY_WARNING_DAYS = 30;
// INV-07: the variants one stock check may count, and a page of past checks.
export const STOCK_CHECK_LINES_MAX = 500;
export const STOCK_CHECK_PAGE_SIZE = 20;
// PUR-01: a supplier's name, address and notes, and a page of suppliers.
export const SUPPLIER_NAME_MAX_LENGTH = 200;
export const SUPPLIER_ADDRESS_MAX_LENGTH = 500;
export const SUPPLIER_NOTES_MAX_LENGTH = 1000;
export const SUPPLIER_PAGE_SIZE = 20;
// PUR-02: the lines one purchase may hold, its notes, and a page of purchases.
export const PURCHASE_LINES_MAX = 200;
export const PURCHASE_NOTES_MAX_LENGTH = 1000;
export const PURCHASE_PAGE_SIZE = 20;
// BIL-19: a page of the shop's payments to the platform, and how long a rejected or lapsed one stays on Home.
export const BILLING_PAYMENT_PAGE_SIZE = 20;
export const PAYMENT_ATTENTION_DAYS = 7;
// PUR-04, PUR-06: why units were rejected on a delivery, or why a purchase was closed short; and a page of a variant's
// purchase history (PUR-09).
export const PURCHASE_REASON_MAX_LENGTH = 200;
export const PURCHASE_HISTORY_PAGE_SIZE = 20;
// PRD-11: the photos one product may show (raised from 10 on 2026-10-22), and a page of the shop's media.
export const PRODUCT_IMAGES_MAX = 50;
export const MEDIA_PAGE_SIZE = 40;
// API-01, API-02: a key's name, the website addresses one public key may be used from, and the live keys a shop holds.
export const API_KEY_NAME_MAX_LENGTH = 80;
export const API_KEY_WEBSITES_MAX = 10;
export const API_KEYS_LIVE_MAX = 20;
// ORD-01, ORD-13: an order's customer name, address and notes, the items one order may hold, a dine-in table's
// reference (MNU-04), and a page of orders.
export const CUSTOMER_NAME_MAX_LENGTH = 100;
export const ORDER_ADDRESS_MAX_LENGTH = 500;
export const ORDER_NOTES_MAX_LENGTH = 1000;
export const ORDER_LINES_MAX = 100;
export const TABLE_REF_MAX_LENGTH = 30;
export const ORDER_PAGE_SIZE = 20;
// LND-07: what a shopper may add for the shop as they order, kept apart from staff notes.
export const SHOPPER_NOTE_MAX_LENGTH = 500;
// ORD-09, D4-7: the courier and its tracking code or link, typed when an order is marked shipped by hand.
export const COURIER_NAME_MAX_LENGTH = 80;
export const TRACKING_CODE_MAX_LENGTH = 100;
export const TRACKING_LINK_MAX_LENGTH = 500;
// TAX-01 (Slice 4.6a): a tax class's name, and how many one shop may name.
export const TAX_CLASS_NAME_MAX_LENGTH = 60;
export const TAX_CLASSES_MAX = 20;
// CUS-02: a page of customers.
export const CUSTOMER_PAGE_SIZE = 20;
// CUS-03 to CUS-06, ORD-18 (Slice 4.4b): a shopper's sign-in lasts this many days; up to 10 saved addresses, each with
// a short label ("Home"); sign-up codes one shop may send in an hour, each paid from its balance (SMS-11, CUS-04); and
// a page of a shopper's orders.
export const SHOPPER_SESSION_DAYS = 30;
export const SHOPPER_ADDRESSES_MAX = 10;
export const ADDRESS_LABEL_MAX_LENGTH = 30;
export const SHOPPER_CODES_PER_SHOP_PER_HOUR = 30;
export const SHOPPER_ORDER_PAGE_SIZE = 20;
// ORD-15: a wallet's transaction ID, or a bank transfer's reference, as staff type it.
export const TRANSACTION_ID_MAX_LENGTH = 64;
// ATR-08: what one captured-at-order value may say.
export const CAPTURED_VALUE_MAX_LENGTH = 200;
// ORD-51, ORD-52: a call's note, and a cancellation's.
export const CALL_NOTE_MAX_LENGTH = 500;
export const CANCEL_NOTE_MAX_LENGTH = 500;
