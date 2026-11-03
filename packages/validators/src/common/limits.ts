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
// MNU-01 (Slice 4.6b): a product's modifier groups, the options in one, and the names of both.
export const MODIFIER_GROUPS_MAX = 10;
export const MODIFIER_OPTIONS_MAX = 20;
export const MODIFIER_NAME_MAX_LENGTH = 60;
// TAX-01 (Slice 4.6a): a tax class's name, and how many one shop may name.
export const TAX_CLASS_NAME_MAX_LENGTH = 60;
export const TAX_CLASSES_MAX = 20;

// WAL-01, WAL-02, WAL-14 (Phase 5 Slice 5.1): a shop's payment accounts, at most 10 for each method.
export const PAYMENT_ACCOUNTS_PER_METHOD_MAX = 10;
// PAY-01 (Slice 5.2): the addresses a session returns to.
export const PAYMENT_RETURN_URL_MAX_LENGTH = 500;
// PAY-07, VER-02 (Slice 5.3, one shape for every ID): a wallet payment's transaction ID, wherever it is typed.
export const TRANSACTION_ID_MIN_LENGTH = 6;
export const TRANSACTION_ID_MAX_LENGTH = 20;
// PAY-24 (Slice 5.2b, agreed 2026-10-31): how long a payment link staff send stays open.
export const PAYMENT_LINK_HOURS = 24;
// TVR-02: a report's note, and the reports one visitor may send in an hour.
export const PAGE_REPORT_NOTE_MAX_LENGTH = 500;
export const PAGE_REPORTS_PER_VISITOR_PER_HOUR = 5;
export const PAYMENT_ACCOUNT_NAME_MAX_LENGTH = 100;
export const PAYMENT_ACCOUNT_NOTE_MAX_LENGTH = 500;
export const BANK_FIELD_MAX_LENGTH = 100;
export const BANK_INSTRUCTIONS_MAX_LENGTH = 500;
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
// ORD-15: a bank transfer's reference, as staff type it.
export const BANK_REFERENCE_MAX_LENGTH = 64;
// PAY-14, PAY-20 (Slice 5.3): a note on a rejected or refunded payment.
export const PAYMENT_NOTE_MAX_LENGTH = 500;
// PAY-19: a page of the shop's payments.
export const PAYMENT_PAGE_SIZE = 20;
// LSN-01, LSN-09 to LSN-13 (Phase 5 Slice 5.4a): a pairing code -- [8] characters, open [10] minutes, void after [10]
// tries -- and a pairing caller's [5] failed attempts in [15] minutes; a device token's [32] random bytes; how often a
// phone reports ([15] minutes) and may ([4] an hour); [3] installation flags revoke it; a device's name and its app's
// installation ID; revoked devices and used or lapsed codes kept [30] and [1] days before the purge (LSN-05).
export const LISTENER_CODE_LENGTH = 8;
export const LISTENER_CODE_MINUTES = 10;
export const LISTENER_CODE_TRIES_MAX = 10;
export const LISTENER_PAIR_FAILS_PER_IP = 5;
export const LISTENER_PAIR_FAIL_WINDOW_MINUTES = 15;
export const LISTENER_TOKEN_BYTES = 32;
export const LISTENER_HEARTBEAT_MINUTES = 15;
export const LISTENER_HEARTBEATS_PER_HOUR = 4;
export const LISTENER_FLAGS_MAX = 3;
export const LISTENER_DEVICE_NAME_MAX_LENGTH = 60;
export const LISTENER_INSTALLATION_ID_MAX_LENGTH = 100;
export const LISTENER_REVOKED_KEPT_DAYS = 30;
export const LISTENER_CODES_KEPT_DAYS = 1;
// LSN-13 to LSN-17, LSN-04 (Phase 5 Slice 5.4b): a phone's uploads a minute and a shop's; a batch's messages, a request's
// bytes and a message's characters; [500] messages an hour flag a phone; how far a received time may stray; test mode's
// [10] minutes; receipt text kept [90] days.
export const LISTENER_UPLOADS_PER_DEVICE_PER_MINUTE = 30;
export const LISTENER_UPLOADS_PER_SHOP_PER_MINUTE = 120;
export const LISTENER_BATCH_MAX = 50;
export const LISTENER_REQUEST_MAX_BYTES = 64 * 1024;
export const LISTENER_MESSAGE_MAX_LENGTH = 1000;
export const LISTENER_VOLUME_PER_HOUR = 500;
export const LISTENER_RECEIVED_AHEAD_MINUTES = 5;
export const LISTENER_RECEIVED_OLDEST_DAYS = 7;
export const LISTENER_TEST_MODE_MINUTES = 10;
export const LISTENER_TEXT_KEPT_DAYS = 90;
// LSN-16: the senders whose SMS count as a wallet's, when the operator has set no list of their own.
export const LISTENER_SENDERS: readonly string[] = ['bKash'];
export const LISTENER_SENDER_MAX_LENGTH = 30;
// VER-02: how far a receipt's amount may be from the one asked, in paisa (0.01 TK).
export const LISTENER_AMOUNT_SLACK_PAISA = 1n;
// VER-04 (amended 2026-11-02): a receipt from more than [5] minutes before its payment page opened goes to staff.
export const LISTENER_OLD_RECEIPT_MINUTES = 5;
// VER-06 (amended 2026-11-02): an unreadable message's masked shape, and the day's count that tells Lytro.
export const LISTENER_SHAPE_MAX_LENGTH = 300;
export const LISTENER_UNREAD_ALERT_PER_DAY = 20;
// The receipts the app shows, and a page of the staff's list.
export const LISTENER_RECENT_DEFAULT = 20;
export const LISTENER_RECENT_MAX = 50;
export const LISTENER_RECEIPT_PAGE_SIZE = 20;
// PAY-07 (amended 2026-11-02): how many times a shopper may correct a typed transaction ID.
export const PAYMENT_ID_CHANGES_MAX = 3;
// VER-07: minutes a payment waits on a phone before staff are told.
export const PAYMENT_STAFF_TOLD_MINUTES = 5;
// LSN-03, VER-07, LSN-18: a phone counts online when seen within [30] minutes, and the oldest app version that may
// call, when the operator has set no figures of their own.
export const LISTENER_OFFLINE_MINUTES = 30;
export const LISTENER_MIN_APP_VERSION = '1.0.0';
// TVR-04 (Slice 5.3, agreed 2026-10-31): a new shop's verified online payments a day, and for how many days it is new,
// when the operator has set no figures of their own.
export const NEW_SHOP_PAYMENT_CAP_AMOUNT = 20_000;
export const NEW_SHOP_PAYMENT_CAP_DAYS = 30;
// ATR-08: what one captured-at-order value may say.
export const CAPTURED_VALUE_MAX_LENGTH = 200;
// ORD-51, ORD-52: a call's note, and a cancellation's.
export const CALL_NOTE_MAX_LENGTH = 500;
export const CANCEL_NOTE_MAX_LENGTH = 500;
