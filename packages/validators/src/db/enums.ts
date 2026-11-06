// Shared enumerations for the platform (ENGINEERING-STANDARDS §4). The database schema builds its Postgres enums from
// these, and the server and any frontend read the same values. Keep this file free of runtime dependencies.

export enum TenantState {
  Trial = 'trial',
  PayAsYouGo = 'pay_as_you_go',
  Active = 'active',
  Grace = 'grace',
  ReadOnly = 'read_only',
  Locked = 'locked',
  Archived = 'archived',
  Deleted = 'deleted',
}

/**
 * 2.3: past the paid period's end and not yet deleted. A purchase or choosing pay-as-you-go restores a shop from
 * any of these (LIF-15), and the owner's own sign-in codes in them are never counted as usage (LIF-10).
 */
export const LAPSED_TENANT_STATES: readonly TenantState[] = [
  TenantState.Grace,
  TenantState.ReadOnly,
  TenantState.Locked,
  TenantState.Archived,
];

export enum KycStatus {
  Unverified = 'unverified',
  Pending = 'pending',
  Verified = 'verified',
  Revoked = 'revoked',
}

export enum DomainStatus {
  Pending = 'pending',
  Active = 'active',
  Failed = 'failed',
  Removed = 'removed',
}

export enum IdentityKind {
  Phone = 'phone',
  Email = 'email',
  Google = 'google',
  Facebook = 'facebook',
}

export enum SignInMethod {
  Code = 'code',
  Password = 'password',
  Reset = 'reset',
  Oauth = 'oauth',
}

export enum OauthProvider {
  Google = 'google',
  Facebook = 'facebook',
}

export enum ChallengeChannel {
  Sms = 'sms',
  Email = 'email',
}

export enum ChallengeKind {
  Signin = 'signin',
  Reset = 'reset',
}

export enum SmsKind {
  // AUTH-21: a sign-up or password-reset send is platform cost, always excluded. A sign-in send to an
  // already-existing shop is the owner's own choice (they have a password) -- that one counts toward the
  // shop's essential-SMS allowance, recorded separately in control.essential_sms_usage, not here.
  Otp = 'otp',
  // AUTH-21, revised 2026-10-17: platform cost, like Otp's sign-up case -- it's what makes the shop usable
  // in the first place, not something charged to the tenant's essential allowance.
  ShopReady = 'shop_ready',
  // LIF-18, PYG-21: a platform-sent notice (deletion warning, inactivity warning) -- never charged to the
  // tenant and never counted toward its essential-SMS allowance (the same carve-out as LIF-10).
  LifecycleNotice = 'lifecycle_notice',
}

// SMS-07, SMS-17 (Phase 7 Slice 7.1): what a shop's own SMS log holds, read agreed 2026-11-06: the codes that come from
// the shop's own use, which the free allowance and then the balance pay for, and its shoppers' sign-up codes, which
// the balance always pays for. Slice 7.2 adds the shop's SMS events.
export enum SmsLogKind {
  SigninCode = 'signin_code',
  StaffResetCode = 'staff_reset_code',
  ShopperCode = 'shopper_code',
}

// SMS-07, SMS-17: what became of one. Sent means the provider accepted it; it has no delivery reports (D7-15).
export enum SmsLogStatus {
  Sent = 'sent',
  Failed = 'failed',
  Blocked = 'blocked',
}

export enum SmsStatus {
  Pending = 'pending',
  Sending = 'sending',
  Sent = 'sent',
  Failed = 'failed',
}

// D28: mail's own outbox, mirroring SMS's (SMS-18, D6) exactly.
export enum MailKind {
  Otp = 'otp',
  ShopReady = 'shop_ready',
  // LIF-18, PYG-21: mirrors SmsKind.LifecycleNotice above.
  LifecycleNotice = 'lifecycle_notice',
  // LIF-16: the owner's requested data export is ready to download.
  DataExportReady = 'data_export_ready',
}

export enum MailStatus {
  Pending = 'pending',
  Sending = 'sending',
  Sent = 'sent',
  Failed = 'failed',
}

// The permission names a role can hold. Dashboard users and API key scopes use the same names (TEN-5, API-06).
// Add a name here before any route checks it; the docs list the areas each one guards.
export enum Permission {
  AuditRead = 'audit:read',
  BalanceRead = 'balance:read',
  BalanceManage = 'balance:manage',
  ChatRead = 'chat:read',
  ChatReply = 'chat:reply',
  ChatManage = 'chat:manage',
  CouriersManage = 'couriers:manage',
  CustomersRead = 'customers:read',
  CustomersManage = 'customers:manage',
  FraudRead = 'fraud:read',
  FraudManage = 'fraud:manage',
  // INV-20: viewing stock, and changing it (edits, stock checks, write-offs, purchasing). Cost, stock value and
  // profit need manage (D3-9).
  InventoryRead = 'inventory:read',
  InventoryManage = 'inventory:manage',
  KeysManage = 'keys:manage',
  ListenerRead = 'listener:read',
  ListenerManage = 'listener:manage',
  NoticesRead = 'notices:read',
  OrdersRead = 'orders:read',
  OrdersManage = 'orders:manage',
  OrdersDelete = 'orders:delete',
  PaymentsRead = 'payments:read',
  PaymentsManage = 'payments:manage',
  PaymentsVerify = 'payments:verify',
  ProductsRead = 'products:read',
  ProductsManage = 'products:manage',
  SettingsManage = 'settings:manage',
  SmsRead = 'sms:read',
  SmsManage = 'sms:manage',
  StaffRead = 'staff:read',
  StaffManage = 'staff:manage',
  WalletsRead = 'wallets:read',
  WalletsManage = 'wallets:manage',
  WebhooksRead = 'webhooks:read',
  WebhooksManage = 'webhooks:manage',
}

// WAL-07, STF-07 (amended 2026-10-31, Phase 5 Slice 5.1): permissions only the owner holds, never put in a staff role --
// changing the accounts shoppers pay into would let a staff member swap in their own number.
export const OWNER_ONLY_PERMISSIONS: readonly Permission[] = [Permission.WalletsManage];

// The actions the activity log records (AUD-01). Add a name here before any code writes it; the action codes are
// never translated. Each slice that adds an audited action extends this list, never a second one.
export enum AuditAction {
  SignIn = 'sign_in',
  SignInFailed = 'sign_in_failed',
  SignOut = 'sign_out',
  PasswordChanged = 'password_changed',
  PasswordReset = 'password_reset',
  StaffCreated = 'staff_created',
  StaffUpdated = 'staff_updated',
  StaffDeactivated = 'staff_deactivated',
  StaffReactivated = 'staff_reactivated',
  RoleCreated = 'role_created',
  RoleUpdated = 'role_updated',
  RoleDeleted = 'role_deleted',
  // PLN-17: an operator's not-for-sale plan assignment is operator-caused but changes the tenant's own plan, so
  // it writes both this log (D2-5) and PlatformAuditAction.PlanAssigned below.
  PlanAssigned = 'plan_assigned',
  // TRL-07: a system-caused lifecycle transition (the trial-end job, later the grace/read-only/locked
  // cascade too) -- D2-5 puts these on the tenant's own log only, so the owner sees why, with no platform
  // audit mirror (an operator can already see tenant state directly).
  LifecycleStateChanged = 'lifecycle_state_changed',
  // BIL-05: a confirmed purchase/renewal/upgrade activates the plan -- tenant-caused (the owner paid), so it
  // writes here; the operator's confirmation action itself is PlatformAuditAction.PlanPaymentVerified below.
  PlanPurchased = 'plan_purchased',
  PlanRenewed = 'plan_renewed',
  // UPG-15: a confirmed upgrade -- tenant-caused, records old plan, new plan and both amounts.
  PlanUpgraded = 'plan_upgraded',
  // PLN-13, PLN-14: an add-on bought, paid from the balance or approved from the queue.
  AddonPurchased = 'addon_purchased',
  // PLN-14: the owner switching an add-on's renewal on or off.
  AddonRenewalSet = 'addon_renewal_set',
  // PLN-14, BIL-17: auto-renew renewed the plan, but the balance did not reach this add-on, which ends with its period.
  AddonNotRenewed = 'addon_not_renewed',
  // PLN-14: an add-on ended with nothing continuing it -- not renewed, or its shop's grace over. System-caused.
  AddonLapsed = 'addon_lapsed',
  // PLN-14: the 7- or 1-day warning that an add-on will not renew (`summary.day`). Email only, never SMS.
  AddonEndingWarned = 'addon_ending_warned',
  // PLN-15, BND-04, RTE-11: the owner switching auto-buy of bandwidth or request packs on or off.
  PackAutoBuySet = 'pack_auto_buy_set',
  // BND-04: auto-buy reached the cycle's allowance but the balance was short of a pack. System-caused.
  PackAutoBuyFailed = 'pack_auto_buy_failed',
  // BAL-03/BAL-05: a verified top-up credits the balance -- tenant-caused.
  BalanceToppedUp = 'balance_topped_up',
  // DWN-01/04/17: the owner's own scheduling actions.
  DowngradeScheduled = 'downgrade_scheduled',
  DowngradeCancelled = 'downgrade_cancelled',
  // DWN-06/08/17: the system applying an already-scheduled downgrade at its effective date -- D2-5 puts
  // this on the tenant's own log only, the same split TRL-07's trial-conversion job already established.
  DowngradeApplied = 'downgrade_applied',
  // DWN-14: the final warning, 30 days after a downgrade, that the shop is still over the limits it left.
  DowngradeFinalWarningSent = 'downgrade_final_warning_sent',
  // PYG-01, PYG-10, LIF-15: the owner choosing pay-as-you-go -- scheduled for the period's end while a paid
  // period runs (and cancellable like a downgrade), or applied at once to a lapsed shop; the system applying
  // a scheduled one at its effective date writes PayAsYouGoApplied too.
  PayAsYouGoScheduled = 'pay_as_you_go_scheduled',
  PayAsYouGoCancelled = 'pay_as_you_go_cancelled',
  PayAsYouGoApplied = 'pay_as_you_go_applied',
  // DWN-11: a downgrade that shortens activity-log retention -- sent once, at apply time, 14 days before the
  // shorter retention actually takes effect. System-caused, tenant's own log.
  RetentionShortenedNoticeSent = 'retention_shortened_notice_sent',
  // LIF-01: the owner's own cancellation intent, set and cleared before period end.
  SubscriptionCancelled = 'subscription_cancelled',
  // PYG-09: the owner closing a pay-as-you-go shop, which archives it at once.
  ShopClosed = 'shop_closed',
  SubscriptionCancellationUndone = 'subscription_cancellation_undone',
  // BIL-17: the owner's own "renew automatically from balance" toggle. The renewal itself, once triggered,
  // reuses PlanRenewed (PurchaseService.activate already writes it) -- no separate action needed for that.
  AutoRenewToggled = 'auto_renew_toggled',
  // BIL-19: a payment request the shop closed itself before sending anything (BIL-15 would have lapsed it at 24 hours).
  PlanPaymentCancelled = 'plan_payment_cancelled',
  // LIF-18: a day-45/57 deletion warning. System-caused, tenant's own log (same split as LifecycleStateChanged).
  DeletionWarningSent = 'deletion_warning_sent',
  // BIL-14: a renewal reminder -- 7/3/1 days before period end while still `active`, then once per calendar
  // day while `grace`. Email only, never SMS (the requirement's own carve-out); `summary.day` distinguishes
  // the two shapes (a number for the pre-period-end set, absent for a daily grace send).
  RenewalReminderSent = 'renewal_reminder_sent',
  // LIF-19: the day-60 business-data deletion itself.
  TenantDeleted = 'tenant_deleted',
  // LIF-24: an operator's suspend/restore, mirrored to the platform log (PlatformAuditAction below).
  TenantSuspended = 'tenant_suspended',
  TenantRestored = 'tenant_restored',
  // AUD-08, ADM-04: other operator actions on a shop, mirrored to the platform log and shown to the shop as
  // "Platform support" with the operator's reason, never the operator's identity.
  BalanceAdjusted = 'balance_adjusted',
  PlanLimitOverrideSet = 'plan_limit_override_set',
  PlanLimitOverrideRemoved = 'plan_limit_override_removed',
  PlanPaymentRejected = 'plan_payment_rejected',
  // TEN-30: the owner (or a holder of settings:manage) updating contact phone/email/business address.
  ShopSettingsUpdated = 'shop_settings_updated',
  // LIF-16/17: the owner's own data export -- one entry when requested, one when actually downloaded.
  DataExportRequested = 'data_export_requested',
  DataExportDownloaded = 'data_export_downloaded',
  // PRD-05: a product's own changes. Stock changes are the stock ledger's (INV-03), never these.
  ProductCreated = 'product_created',
  ProductUpdated = 'product_updated',
  ProductVariantsSaved = 'product_variants_saved',
  ProductSlugChanged = 'product_slug_changed',
  ProductDeleted = 'product_deleted',
  // PRD-13: an archived product brought back to the list, counted against the limit again.
  ProductRestored = 'product_restored',
  CategoryCreated = 'category_created',
  CategoryUpdated = 'category_updated',
  CategoryDeleted = 'category_deleted',
  AttributeCreated = 'attribute_created',
  AttributeUpdated = 'attribute_updated',
  // PST-01: the shop's main business type, which sets new products' defaults (PST-02).
  BusinessTypeChanged = 'business_type_changed',
  // Phase 3 Slice 1c: delivery zones (DLV-01, DLV-04).
  DeliveryZoneCreated = 'delivery_zone_created',
  DeliveryZoneUpdated = 'delivery_zone_updated',
  DeliveryZoneDeleted = 'delivery_zone_deleted',
  DeliveryHomeAreaChanged = 'delivery_home_area_changed',
  // ATR-16: a shop's own option sets.
  OptionSetCreated = 'option_set_created',
  OptionSetDeleted = 'option_set_deleted',
  // Phase 3 Slice 2a: manual stock changes and write-offs (INV-21), and a hand-entered average cost (INV-10).
  StockAdjusted = 'stock_adjusted',
  VariantCostSet = 'variant_cost_set',
  // Phase 3 Slice 2b: a stock check and the recounts it recorded (INV-07, INV-21).
  StockChecked = 'stock_checked',
  // Phase 3 Slice 3b: serials added to units already held, corrected or removed (INV-14, INV-21).
  SerialsAdded = 'serials_added',
  SerialCorrected = 'serial_corrected',
  SerialRemoved = 'serial_removed',
  // Phase 3 Slice 4a: suppliers, and purchases made, changed, placed, cancelled or deleted as drafts (PUR-01, PUR-10).
  SupplierCreated = 'supplier_created',
  SupplierUpdated = 'supplier_updated',
  PurchaseCreated = 'purchase_created',
  PurchaseUpdated = 'purchase_updated',
  PurchasePlaced = 'purchase_placed',
  PurchaseCancelled = 'purchase_cancelled',
  PurchaseDeleted = 'purchase_deleted',
  // Phase 3 Slice 4b: a delivery received (in full at once, by Add stock or new stock arriving), and a purchase closed
  // short (PUR-04, PUR-06, PUR-07, PUR-10).
  PurchaseReceived = 'purchase_received',
  PurchaseClosedShort = 'purchase_closed_short',
  // Phase 3 Slice 6a: a product's photos set in order, the shop's logo set, and a media item deleted (PRD-11, TEN-16,
  // MED-09).
  ProductImagesSaved = 'product_images_saved',
  ShopLogoSaved = 'shop_logo_saved',
  MediaDeleted = 'media_deleted',
  // Phase 3 Slice 6b: a product's video set or removed (PRD-11).
  ProductVideoSaved = 'product_video_saved',
  // Phase 3 Slice 8: a public API key made, its name or website addresses changed, or revoked (API-01, API-21).
  ApiKeyCreated = 'api_key_created',
  ApiKeyUpdated = 'api_key_updated',
  ApiKeyRevoked = 'api_key_revoked',
  // Phase 3 Slice 9b: the Meta Pixel ID or the Conversions API token set, changed or removed (LND-17), and the catalog
  // feed's link replaced (FED-05).
  AdTrackingUpdated = 'ad_tracking_updated',
  AdTrackingRemoved = 'ad_tracking_removed',
  CatalogFeedRegenerated = 'catalog_feed_regenerated',
  // Phase 3 Slice 11.2: the shop's brand identity saved, and switched on or off (BRN-02).
  BrandSaved = 'brand_saved',
  BrandSwitchedOn = 'brand_switched_on',
  BrandSwitchedOff = 'brand_switched_off',
  // Phase 4 Slice 4.1: an order made, its details or items changed, its status moved (confirmed, held, put in review,
  // cancelled, cleared), deleted, and a call to its customer logged (AUD-01, ORD-51).
  OrderCreated = 'order_created',
  OrderUpdated = 'order_updated',
  OrderStatusChanged = 'order_status_changed',
  OrderDeleted = 'order_deleted',
  OrderCallLogged = 'order_call_logged',
  // Phase 3 Slice 13: the shop's own domain added, verified, its record found missing (the shop back on its subdomain),
  // and removed (TEN-09 to TEN-14).
  DomainAdded = 'domain_added',
  DomainActivated = 'domain_activated',
  DomainLost = 'domain_lost',
  DomainRemoved = 'domain_removed',
  // Phase 4 Slice 4.3b: a payment staff recorded on an order, verified as it was recorded, and one voided (AUD-01's
  // "payment verified or rejected", ORD-15).
  OrderPaymentRecorded = 'order_payment_recorded',
  OrderPaymentVoided = 'order_payment_voided',
  // Phase 4 Slice 4.4a: a customer deleted at a privacy request (CUS-09); the entry names no personal detail.
  CustomerErased = 'customer_erased',
  // Phase 4 Slice 4.4b: staff set a new password for a customer's shopper account (CUS-14); no password is recorded.
  ShopperPasswordSet = 'shopper_password_set',
  // Phase 4 Slice 4.6a: a tax class named, renamed or re-rated, or made the default; and one deleted (TAX-01).
  TaxClassSaved = 'tax_class_saved',
  TaxClassDeleted = 'tax_class_deleted',
  // Phase 5 Slice 5.1: a payment method's accounts saved, or the method switched on or off (WAL-01 to WAL-07).
  PaymentMethodSaved = 'payment_method_saved',
  // Phase 5 Slice 5.2b: staff made a payment link for an order (PAY-24); Lytro suspended the shop's payment page, or
  // restored it (TVR-03, AUD-08).
  PaymentLinkMade = 'payment_link_made',
  PaymentPageSuspended = 'payment_page_suspended',
  PaymentPageRestored = 'payment_page_restored',
  // Phase 5 Slice 5.3: a payment verified or rejected by hand (VER-01, PAY-14, AUD-01); one marked refunded (PAY-20);
  // Lytro set the shop's new-shop cap (TVR-04).
  PaymentVerified = 'payment_verified',
  // PAY-07 (Phase 5 Slice 5.4b, agreed 2026-11-02): a shopper corrected the transaction ID they typed.
  PaymentIdChanged = 'payment_id_changed',
  // LSN-04: test mode switched on from the paired phone.
  ListenerTestModeStarted = 'listener_test_mode_started',
  // WAL-09, WAL-10, PAY-06 (Phase 5 Slice 5.7): the owner's gateway credentials, automated account and way of taking a wallet's money.
  GatewayCredentialsSaved = 'gateway_credentials_saved',
  GatewayCredentialsRemoved = 'gateway_credentials_removed',
  GatewayAccountSelected = 'gateway_account_selected',
  // AUD-01, CRR-02 to CRR-05, CRR-20 (Phase 6 Slice 6.1): a shop's courier connections.
  CourierConnected = 'courier_connected',
  CourierDisconnected = 'courier_disconnected',
  CourierDefaultChanged = 'courier_default_changed',
  // CRR-03 (Slice 6.2): a connection's message address and token replaced.
  CourierAddressReplaced = 'courier_address_replaced',
  // Slice 6.3: the store a courier's parcels leave from.
  CourierPickupStoreChanged = 'courier_pickup_store_changed',
  // CRR-23, CRR-25 (Slice 6.6): Lytro retiring a courier the shop is connected to, and undoing it.
  CourierRetiring = 'courier_retiring',
  CourierRetiringUndone = 'courier_retiring_undone',
  // Slice 6.1, read agreed 2026-11-04: a booking cancelled with the order kept, and a lost answer settled by staff (D6-11).
  ParcelCancelled = 'parcel_cancelled',
  ParcelSettled = 'parcel_settled',
  PaymentWayChosen = 'payment_way_chosen',
  PaymentRejected = 'payment_rejected',
  OrderPaymentRefunded = 'order_payment_refunded',
  NewShopCapSet = 'new_shop_cap_set',
  // Phase 5 Slice 5.4a (LSN-22): a listener phone paired, renamed or revoked (by the owner, Lytro, or itself after
  // repeated installation flags); one flagged; a pairing the plan's device limit refused.
  ListenerDevicePaired = 'listener_device_paired',
  ListenerDeviceRenamed = 'listener_device_renamed',
  ListenerDeviceRevoked = 'listener_device_revoked',
  ListenerDeviceFlagged = 'listener_device_flagged',
  ListenerLimitRefused = 'listener_limit_refused',
  ListenerVolumeFlagged = 'listener_volume_flagged',
}

// FED-02: what a product is, for Meta's catalog: new unless the shop says otherwise.
export enum ItemCondition {
  New = 'new',
  Refurbished = 'refurbished',
  Used = 'used',
}

// API-01, D3-1: the kinds of API key. A public key is for a browser, from registered website addresses; secret keys
// arrive in Phase 8.
export enum ApiKeyType {
  Public = 'public',
}

// Phase 3 Slice 12, agreed 2026-10-29: a key the platform keeps for one of its own surfaces rather than one the shop
// made. The shop's storefront and landing pages call the public API with it (SFT-11, SFT-15), as any website would.
export enum ApiKeyPurpose {
  Storefront = 'storefront',
}

// MED-03, STO-01, D3-4: an uploaded item -- an image or a video -- and how far it has got: its upload link given out,
// its file being processed, ready to use, or refused (nothing of it stored or counted).
export enum MediaKind {
  Image = 'image',
  Video = 'video',
}

export enum MediaStatus {
  Uploading = 'uploading',
  Processing = 'processing',
  Ready = 'ready',
  Failed = 'failed',
}

// MED-03: what an upload is for, named when it starts, so the right permission and the room left are checked before
// any file is sent. The item can still be attached elsewhere once ready.
export enum MediaPurpose {
  ProductImage = 'product_image',
  ProductVideo = 'product_video',
  CategoryImage = 'category_image',
  SwatchImage = 'swatch_image',
  SizeChartImage = 'size_chart_image',
  ShopLogo = 'shop_logo',
}

// STO-01, STO-04, STO-09: each stored file of an item: the picture itself, its thumbnail, a video's poster.
export enum MediaObjectRole {
  Main = 'main',
  Thumbnail = 'thumbnail',
  Poster = 'poster',
}

// AUD-07: these action kinds (payment, wallet, credential, plan, balance) are kept 24 months regardless of
// plan, overriding AUD-06's own plan-based retention -- the one list the purge job reads, so a new
// money-related action is added here deliberately, the same discipline AuditAction's own comment asks for.
export const MONEY_RELATED_AUDIT_ACTIONS: ReadonlySet<AuditAction> = new Set([
  AuditAction.PasswordChanged,
  // API-21: an API key is a credential.
  AuditAction.ApiKeyCreated,
  AuditAction.ApiKeyUpdated,
  AuditAction.ApiKeyRevoked,
  // LND-17: so is the Conversions API token.
  AuditAction.AdTrackingUpdated,
  AuditAction.AdTrackingRemoved,
  AuditAction.PasswordReset,
  AuditAction.PlanAssigned,
  AuditAction.PlanPurchased,
  AuditAction.PlanRenewed,
  AuditAction.PlanUpgraded,
  AuditAction.AddonPurchased,
  AuditAction.BalanceToppedUp,
  AuditAction.DowngradeScheduled,
  AuditAction.DowngradeCancelled,
  AuditAction.DowngradeApplied,
  AuditAction.DowngradeFinalWarningSent,
  AuditAction.PayAsYouGoScheduled,
  AuditAction.PayAsYouGoCancelled,
  AuditAction.PayAsYouGoApplied,
  AuditAction.BalanceAdjusted,
  AuditAction.PlanLimitOverrideSet,
  AuditAction.PlanLimitOverrideRemoved,
  AuditAction.PlanPaymentRejected,
  AuditAction.SubscriptionCancelled,
  AuditAction.SubscriptionCancellationUndone,
]);

// LIF-19: the events that explain why a deleted shop's data is gone -- its lifecycle changes (the archive that led to
// the deletion among them), the day-45 and day-57 warnings, the deletion itself, the owner closing the shop, and the
// owner's own data export. With the money-related entries above (its billing), they are all a deleted shop's activity
// log keeps, each for 24 months from its own date; the purge job removes every other entry. An action belongs here
// only if it is part of how a shop comes to be deleted.
export const DELETION_AUDIT_ACTIONS: ReadonlySet<AuditAction> = new Set([
  AuditAction.LifecycleStateChanged,
  AuditAction.DeletionWarningSent,
  AuditAction.TenantDeleted,
  AuditAction.ShopClosed,
  AuditAction.DataExportRequested,
  AuditAction.DataExportDownloaded,
]);

// The pg-boss queues this codebase uses (SCL-08, D25). Add a name here before any code enqueues to it.
export enum QueueName {
  Sms = 'sms',
  Mail = 'mail',
  // D27: a bounded retry for an OTP's failed synchronous send, kept apart from `Sms` since its jobs carry a
  // plaintext code and expire with that code, unlike whatever `Sms` ends up carrying later.
  OtpRetry = 'otp_retry',
  // D2-6: the recurring lifecycle tick (LIF-03). The first queue in this codebase driven by pg-boss's own
  // `schedule()` (a cron), not the transactional outbox -- there is no single business transaction to anchor
  // a periodic scan to.
  LifecycleTick = 'lifecycle_tick',
  // LIF-16: generates the owner's data export asynchronously (SCL-08's own transactional-outbox shape --
  // this one does have a single business transaction to anchor to, the export request itself).
  DataExport = 'data_export',
  // INV-13: the daily expiry pass, a cron like LifecycleTick: warns of batches about to expire and takes expired ones
  // out of available stock.
  InventoryExpiryTick = 'inventory_expiry_tick',
  // INV-16: every minute, releases the stock held for orders whose online payment never came.
  ReservationExpiryTick = 'reservation_expiry_tick',
  // PAY-03, D5-4 (Phase 5 Slice 5.2): every minute, a session nobody paid in time expires and its checkout order is
  // cancelled, its stock let go.
  PaymentSessionExpiryTick = 'payment_session_expiry_tick',
  // LSN-05 (Phase 5 Slice 5.4a): daily, listener pairing codes spent or run out and phones long revoked are removed.
  ListenerPurgeTick = 'listener_purge_tick',
  // VER-09 (Slice 5.7): a checkout that ran out with no return from the wallet is asked after before it closes.
  GatewayReconcileTick = 'gateway_reconcile_tick',
  // D6-11 (Phase 6 Slice 6.1): bookings whose answer was lost are asked after, and accepted ones not yet settled are finished.
  CourierBookingTick = 'courier_booking_tick',
  // CRR-15, D6-4 (Slice 6.2): once a night, parcels on their way that no message has told of are asked after.
  CourierNightTick = 'courier_night_tick',
  // CUS-10 (Slice 6.4): once a week, the area lists of the couriers that have one are read again.
  CourierAreasTick = 'courier_areas_tick',
  // MED-03: an uploaded file to validate and turn into what is stored; MED-07, MED-09: stored files to delete, with the
  // deletion job's own key.
  MediaProcess = 'media_process',
  // Slice 6 design point 2: videos have their own queue, so one runs at a time while images run two.
  MediaProcessVideo = 'media_process_video',
  MediaDelete = 'media_delete',
  // MED-04: the nightly comparison of each shop's recorded files with what R2 holds.
  MediaReconcileTick = 'media_reconcile_tick',
  // BND-02, MED-10: every minute, the media Worker's usage is totalled and its shared store brought up to date.
  MediaBandwidthTick = 'media_bandwidth_tick',
  // LIM-01: a usage warning to write and send, queued in the transaction that crossed its share of a limit.
  UsageNotice = 'usage_notice',
  // BND-04, RTE-11: a pack to buy from the balance, queued by the minute's count that reached the cycle's allowance.
  PackAutoBuy = 'pack_auto_buy',
  // LND-16: a shopper's order told to Meta's Conversions API, queued in the order's own transaction, retried apart
  // from it.
  MetaPurchase = 'meta_purchase',
  // TEN-11 (Slice 13): every 10 minutes, each waiting domain's records looked for, and each active one's once a day.
  DomainCheckTick = 'domain_check_tick',
  // API-11, KNOWN-GAPS §106: once a day, every idempotency key past its 24 hours goes, with the reply stored for it.
  IdempotencyPurgeTick = 'idempotency_purge_tick',
}

// Who performed the action (AUD-02). `system` is the platform itself (a scheduled job); `platform_support` is an
// operator acting on a tenant, shown to the tenant as "Platform support" (AUD-08).
export enum ActorType {
  User = 'user',
  ApiKey = 'api_key',
  System = 'system',
  PlatformSupport = 'platform_support',
}

// Whether the audited action succeeded (AUD-02).
export enum AuditResult {
  Success = 'success',
  Failure = 'failure',
}

// Who performed a platform-level action (ADM-08), a separate, smaller list from ActorType above: the platform
// audit log only ever sees the operator console itself or a scheduled job, never a tenant-side actor.
export enum PlatformActorType {
  Operator = 'operator',
  System = 'system',
}

// The actions this codebase writes to control.platform_audit_log (ADM-08). Add a name here before any code
// writes it, same discipline as AuditAction for the tenant log.
export enum PlatformAuditAction {
  // ADM-18: break-glass recovery after an operator loses both their TOTP device and backup codes.
  BreakGlass2faReset = 'break_glass_2fa_reset',
  // ADM-01: an operator regenerating their own backup-code set, invalidating the old one.
  BackupCodesRegenerated = 'backup_codes_regenerated',
  // RAT-05: every rate change, by the operator who made it.
  RateChanged = 'rate_changed',
  // BAL-17: an operator's balance adjustment, never a tenant-initiated change.
  BalanceAdjusted = 'balance_adjusted',
  // PLN-02/D2-3: a plan edit, each one preceded by its own version snapshot; PLN-08: a plan deleted while nothing
  // references it.
  PlanCreated = 'plan_created',
  PlanUpdated = 'plan_updated',
  PlanRetired = 'plan_retired',
  PlanDeleted = 'plan_deleted',
  // PLN-17: mirrors AuditAction.PlanAssigned above, written to this log too (D2-5).
  PlanAssigned = 'plan_assigned',
  // PLN-11: a per-tenant limit override, set or removed.
  PlanLimitOverrideSet = 'plan_limit_override_set',
  PlanLimitOverrideRemoved = 'plan_limit_override_removed',
  // PLN-13: the add-on catalogue, edited by the operator.
  AddonCreated = 'addon_created',
  AddonUpdated = 'addon_updated',
  AddonRetired = 'addon_retired',
  // BIL-02/BAL-03: the platform's own wallet numbers, by the operator who changed them.
  PlatformWalletAdded = 'platform_wallet_added',
  PlatformWalletUpdated = 'platform_wallet_updated',
  PlatformWalletRemoved = 'platform_wallet_removed',
  // TRM-16: every billing-term change, a deletion included; TRM-03: a plan's price for a term, set or removed.
  BillingTermCreated = 'billing_term_created',
  BillingTermUpdated = 'billing_term_updated',
  BillingTermRetired = 'billing_term_retired',
  BillingTermDeleted = 'billing_term_deleted',
  PlanPriceSet = 'plan_price_set',
  PlanPriceRemoved = 'plan_price_removed',
  // LIF-26: a platform-wide setting change (e.g. trial length), by the operator who made it.
  SettingsChanged = 'settings_changed',
  // D2-1/ADM-06: an operator reviewing a control.plan_payments row -- the manual stand-in for Phase 5's real
  // hosted-page/gateway verification. Approving activates the plan or credits the balance (BIL-05/BAL-03).
  PlanPaymentVerified = 'plan_payment_verified',
  PlanPaymentRejected = 'plan_payment_rejected',
  // BIL-06 (Slice 5.6, agreed 2026-11-03): money for a plan or add-on at the wrong amount, put on the balance instead.
  PlanPaymentCredited = 'plan_payment_credited',
  // LIF-24: mirrors AuditAction.TenantSuspended/TenantRestored above (D2-5).
  TenantSuspended = 'tenant_suspended',
  TenantRestored = 'tenant_restored',
  // PST-04, ATL-01, ATR-16: the operator curating the shop-type presets and the platform's attribute library.
  PresetUpdated = 'preset_updated',
  PlatformAttributeCreated = 'platform_attribute_created',
  PlatformAttributeUpdated = 'platform_attribute_updated',
  PlatformOptionCreated = 'platform_option_created',
  PlatformOptionUpdated = 'platform_option_updated',
  PlatformOptionSetCreated = 'platform_option_set_created',
  PlatformOptionSetUpdated = 'platform_option_set_updated',
  PlatformOptionSetDeleted = 'platform_option_set_deleted',
  // RTE-12: a shop spent a fast share of its cycle's API requests in one hour; the operators were told.
  UsageFastSpendAlerted = 'usage_fast_spend_alerted',
  // TVR-03, ADM-12 (Phase 5 Slice 5.2b): a shop's payment page suspended or restored; a page report dismissed.
  PaymentPageSuspended = 'payment_page_suspended',
  PaymentPageRestored = 'payment_page_restored',
  PaymentPageReportDismissed = 'payment_page_report_dismissed',
  // TVR-04 (Phase 5 Slice 5.3): a shop's new-shop cap switched on or off, or back to its kind's default.
  NewShopCapSet = 'new_shop_cap_set',
  // LSN-21, LSN-22 (Phase 5 Slice 5.4a): a listener phone paired, revoked or flagged, a pairing refused by the plan's
  // limit, and an app installation blocked across the platform.
  ListenerDevicePaired = 'listener_device_paired',
  ListenerDeviceRevoked = 'listener_device_revoked',
  ListenerDeviceFlagged = 'listener_device_flagged',
  ListenerLimitRefused = 'listener_limit_refused',
  ListenerVolumeFlagged = 'listener_volume_flagged',
  ListenerInstallationBlocked = 'listener_installation_blocked',
  // CUS-10 (Phase 6 Slice 6.4): the operator assigning a courier's area to a thana, confirming suggested ones, or reading the list again.
  CourierAreaAssigned = 'courier_area_assigned',
  CourierAreasConfirmed = 'courier_areas_confirmed',
  CourierAreasRefreshed = 'courier_areas_refreshed',
  // CRR-23, CRR-24 (Slice 6.6): the operator retiring a courier, undoing it, and removing it for good.
  CourierRetired = 'courier_retired',
  CourierRetireUndone = 'courier_retire_undone',
  CourierRemoved = 'courier_removed',
}

// BAL-02: what a balance-ledger entry is for. One list, shared by every module that ever charges or credits a
// tenant's balance — add a value here before any code writes a new kind of entry, never a second enum for it.
export enum LedgerEntryType {
  TopUp = 'top_up',
  Sms = 'sms',
  Ai = 'ai',
  Extraction = 'extraction',
  FraudCheck = 'fraud_check',
  OrderFee = 'order_fee',
  ProductFee = 'product_fee',
  PlanPayment = 'plan_payment',
  Adjustment = 'adjustment',
  Reversal = 'reversal',
  // WAL-20, RAT-16 (Phase 5 Slice 5.4b): what Lytro charges for a payment it verified by itself.
  VerificationFee = 'verification_fee',
  // LIF-21, BAL-18: a deleted shop's remaining balance moved into the owner's new shop, one entry on each side.
  CarryOver = 'carry_over',
  // PLN-13, PLN-14: an add-on bought from the balance.
  Addon = 'addon',
}

// RAT-01: the platform-wide, per-use rates control.rates holds. Add a key here before any code reads or writes
// it — the single list of what "a rate" means on this platform.
export enum RateKey {
  SmsPerUnit = 'sms_per_unit',
  AiReply = 'ai_reply',
  FraudCheck = 'fraud_check',
  PaygOrderFeeMin = 'payg_order_fee_min',
  PaygOrderFeePct = 'payg_order_fee_pct',
  PaygProductFee = 'payg_product_fee',
  SmsUnitSizeChars = 'sms_unit_size_chars',
  // RAT-16 (Phase 5 Slice 5.4b): the listener's verification fee, a percent of the payment.
  ListenerVerificationPct = 'listener_verification_pct',
  // RAT-15 (Phase 5 Slice 5.7): the gateway's verification fee, a percent of the payment.
  GatewayVerificationPct = 'gateway_verification_pct',
  // ORD-34, D7-16 (Phase 7 Slice 7.6): one read of a customer's delivery details from a pasted message.
  AiExtraction = 'ai_extraction',
}

// RAT-01, D7-16: the rates a shop or the operator is shown. The chat-reply rate stays stored, but nothing offers chat in
// this release (D7-1), so no screen shows a price for it.
export const SHOWN_RATE_KEYS: readonly RateKey[] = Object.values(RateKey).filter(
  (key) => key !== RateKey.AiReply,
);

// LIM-02: what the usage page shows, each against the shop's limit. Essential SMS is per cycle on a paid plan and in
// total on a trial (TRL-03), whichever the shop's limits set.
export enum UsageMetric {
  Products = 'products',
  Seats = 'seats',
  Storage = 'storage',
  Bandwidth = 'bandwidth',
  Requests = 'requests',
  EssentialSmsMonthly = 'essential_sms_monthly',
  EssentialSmsTotal = 'essential_sms_total',
  // QTA-01, QTA-04, QTA-05 (Phase 4 Slice 4.3): orders handled in the billing period, in a trial's whole life, and today.
  OrdersMonthly = 'orders_monthly',
  OrdersTotal = 'orders_total',
  OrdersDaily = 'orders_daily',
}

// LIF-26: every platform-wide editable value that isn't a per-use rate (those are RateKey above). Add a key
// here before any code reads or writes it. Trial length is the first; slice 7 adds the grace/read-only/
// locked stage lengths to this same list.
export enum PlatformSettingKey {
  TrialDays = 'trial_days',
  // BAL-04: top-up amount bounds, in TK, editable by the operator and effective for the next top-up attempted,
  // never retroactive to a quote already created (slice 4 reads these at quote time, not at confirm time).
  TopUpMinAmount = 'top_up_min_amount',
  TopUpMaxAmount = 'top_up_max_amount',
  // LIF-26, §2.3: the lifecycle stage lengths, each a day-count from the *start* of that stage (not
  // cumulative from period end) -- grace 0-3, read_only 3-7, locked 7-15, archived 15-60 by default.
  GraceDays = 'grace_days',
  ReadOnlyDays = 'read_only_days',
  LockedDays = 'locked_days',
  ArchivedDays = 'archived_days',
  // INV-16, D3-6: how long stock stays held for an order awaiting online payment before it is released. Phase 5 sets
  // it from the payment session's own lifetime.
  ReservationExpiryMinutes = 'reservation_expiry_minutes',
  // STO-04, STO-05 (2.1, "editable"): the largest image and video one upload may be, in MB.
  MediaImageMaxMb = 'media_image_max_mb',
  MediaVideoMaxMb = 'media_video_max_mb',
  // CCH-03 (editable): how long a shopper's browser may keep each kind of public catalogue answer, in seconds, and how
  // long a product list may still be shown while it is fetched again.
  CatalogueListMaxAgeSeconds = 'catalogue_list_max_age_seconds',
  CatalogueListStaleSeconds = 'catalogue_list_stale_seconds',
  CatalogueDetailMaxAgeSeconds = 'catalogue_detail_max_age_seconds',
  CatalogueSearchMaxAgeSeconds = 'catalogue_search_max_age_seconds',
  CatalogueCategoriesMaxAgeSeconds = 'catalogue_categories_max_age_seconds',
  // RTE-06 (editable, KNOWN-GAPS §82): how many requests one visitor may make to one shop in any minute, through its
  // public keys and its catalog feed.
  PublicRequestsPerVisitorPerMinute = 'public_requests_per_visitor_per_minute',
  // BND-03, RTE-03 (editable): how far past 100 percent of its bandwidth or API requests a shop is still served while
  // its owner is told, as a percent of the limit, before they stop.
  UsageGracePercent = 'usage_grace_percent',
  // RTE-12 (editable, KNOWN-GAPS §82): the share of a cycle's API requests that, spent in one hour, tells the owner and
  // the operator. Nothing is refused.
  FastSpendPercent = 'fast_spend_percent',
  // RTE-08 (amended 2026-10-30, editable): how many orders shoppers may place in one shop in any minute, every plan
  // alike -- a flood guard, never a cap on demand (QTA-07). One visitor is held apart by RTE-06's 10.
  PublicOrdersPerShopPerMinute = 'public_orders_per_shop_per_minute',
  // RTE-08 (amended 2026-10-31, Phase 5 Slice 5.2b): payment sessions a minute in one shop, every plan alike.
  PaymentSessionsPerShopPerMinute = 'payment_sessions_per_shop_per_minute',
  // TVR-04 (Phase 5 Slice 5.3, agreed 2026-10-31): a new shop's verified online payments a day, in TK, and how many
  // days a shop counts as new.
  NewShopPaymentCapAmount = 'new_shop_payment_cap_amount',
  NewShopPaymentCapDays = 'new_shop_payment_cap_days',
  // LSN-03, VER-07, LSN-18 (Phase 5 Slice 5.4a): the minutes after which a listener phone counts offline, and the
  // oldest listener app version that may call.
  ListenerOfflineMinutes = 'listener_offline_minutes',
  ListenerMinAppVersion = 'listener_min_app_version',
  // LSN-16 (Phase 5 Slice 5.4b, agreed 2026-11-02): the senders whose SMS count as a wallet's, one list for every shop.
  ListenerSenders = 'listener_senders',
  // QTA-03 (editable): what handling an order past the period's limit does -- refused, or done with a prompt to upgrade.
  OrderLimitMode = 'order_limit_mode',
  // LEG-01 (editable): the terms and privacy versions now in force, which a new account accepts.
  // CRR-14, CRR-15, D6-4 (Slice 6.2): keeping calls to couriers down.
  CourierCheckMinAgeHours = 'courier_check_min_age_hours',
  CourierCheckQuietHours = 'courier_check_quiet_hours',
  CourierCheckStopDays = 'courier_check_stop_days',
  CourierSyncMinutes = 'courier_sync_minutes',
  TermsVersion = 'terms_version',
  PrivacyVersion = 'privacy_version',
  // AI-10, D7-4 (Phase 7 Slice 7.6): the AI that reads a customer's delivery details, and its model, switched by the
  // operator without a release.
  AddressReadProvider = 'address_read_provider',
  AddressReadModel = 'address_read_model',
  // ORD-33 (Slice 7.6, editable): how many address reads one shop may make in a minute, a flood guard.
  AddressReadsPerShopPerMinute = 'address_reads_per_shop_per_minute',
}

// AI-10, D7-4: the AIs Lytro can read a pasted message with. One today; the setting names which.
export enum AiProvider {
  Gemini = 'gemini',
}

// ORD-30 (amended 2026-11-06, Slice 7.6's read): how sure a read is of each delivery detail. Found: read and, for a
// place, matched to Lytro's list by its own name. Check: read, but a near match or a number that isn't a mobile, for
// staff to look at. Missing: not in the message, or no place on the list.
export enum AddressFieldState {
  Found = 'found',
  Check = 'check',
  Missing = 'missing',
}

// PLN-20: what paid for one use of a pay-per-use service -- the balance at the rate, or an allowance add-on's use.
export enum PerUsePaidFrom {
  Balance = 'balance',
  Allowance = 'allowance',
}

// QTA-03: the period's handling limit refuses the handling action, or lets it through and prompts an upgrade.
export enum OrderLimitMode {
  Block = 'block',
  AllowWithPrompt = 'allow_with_prompt',
}

// D2-1: what a control.plan_payments row is for -- a purchase, a renewal, an upgrade, a balance top-up, or an add-on
// (PLN-14).
export enum PlanPaymentKind {
  Purchase = 'purchase',
  Renewal = 'renewal',
  Upgrade = 'upgrade',
  TopUp = 'top_up',
  Addon = 'addon',
}

// D2-1: BIL-04/BIL-06's pending -> needs_review/verified/rejected state machine; `expired` is BIL-15's
// 24-hour pending-purchase timeout (the sweep itself is slice 7's job, this value is just the resting state);
// `cancelled` is a request closed before anything was sent -- by the shop, or by its next request of the same kind.
export enum PlanPaymentStatus {
  Pending = 'pending',
  NeedsReview = 'needs_review',
  Verified = 'verified',
  Rejected = 'rejected',
  Expired = 'expired',
  Cancelled = 'cancelled',
}

// BIL-19: who closed a payment request before anything was sent: the shop's own Cancel, or a newer request of the same
// kind taking its place (one open request per kind).
export enum PaymentCancelReason {
  Seller = 'seller',
  Replaced = 'replaced',
}

// BIL-19: a payment as the shop reads it -- the status and whether a transaction ID was ever submitted, folded into
// one word. The dashboard's Billing section filters and labels by it; `billingPaymentStateOf` is its one definition,
// and the list query's SQL twin lives beside the repository.
export enum BillingPaymentState {
  /** Quoted, nothing submitted yet; lapses 24 hours after the quote (BIL-15). */
  Awaiting = 'awaiting',
  /** Submitted with a transaction ID and waiting for the operator (BIL-04, BIL-06). */
  Checking = 'checking',
  Paid = 'paid',
  Rejected = 'rejected',
  Expired = 'expired',
  /** Closed before anything was sent: cancelled by the shop, or replaced by its newer request. */
  Cancelled = 'cancelled',
}

export function billingPaymentStateOf(
  status: PlanPaymentStatus,
  transactionId: string | null,
): BillingPaymentState {
  switch (status) {
    case PlanPaymentStatus.Verified:
      return BillingPaymentState.Paid;
    case PlanPaymentStatus.Rejected:
      return BillingPaymentState.Rejected;
    case PlanPaymentStatus.Expired:
      return BillingPaymentState.Expired;
    case PlanPaymentStatus.Cancelled:
      return BillingPaymentState.Cancelled;
    default:
      return transactionId === null ? BillingPaymentState.Awaiting : BillingPaymentState.Checking;
  }
}

// BIL-02, BIL-12: how a plan payment was paid -- from the shop's balance, or a wallet transfer the operator
// verified. One list for the purchase and upgrade requests and the invoice that records it.
export const PLAN_PAYMENT_METHODS = ['balance', 'wallet'] as const;
export type PlanPaymentMethod = (typeof PLAN_PAYMENT_METHODS)[number];

// BIL-12: what produced an invoice.
export enum InvoiceKind {
  Purchase = 'purchase',
  Renewal = 'renewal',
  Upgrade = 'upgrade',
  // PLN-14: an add-on bought on its own.
  Addon = 'addon',
}

// BIL-12, PLN-14: one line of an invoice -- the plan, an add-on, or an upgrade's credit (negative).
export enum InvoiceLineKind {
  Plan = 'plan',
  Addon = 'addon',
  Credit = 'credit',
}

// PLN-13: what an add-on is. A limit add-on raises a limit for the period; a pack is used up as it is consumed
// (Slice 10a.3); a feature add-on switches a feature on for the period; an allowance covers a number of uses of a
// pay-per-use service (PLN-20, Phase 7).
export enum AddonKind {
  Limit = 'limit',
  Pack = 'pack',
  Feature = 'feature',
  Allowance = 'allowance',
}

// PLN-13: the add-on kinds bought by quote, for the period (packs are bought apart, by POST /addons/packs). Allowances
// joined in Phase 7 Slice 7.6 (D7-17).
export const BUYABLE_ADDON_KINDS: readonly AddonKind[] = [
  AddonKind.Limit,
  AddonKind.Feature,
  AddonKind.Allowance,
];

// PLN-13, PLN-20: the pay-per-use services an allowance add-on can cover, named in its `limitKey`. Reading delivery
// details from Slice 7.6; fraud checks join once they have a price (D7-7).
export enum AllowanceService {
  AddressReads = 'address_reads',
}

// BRN-05: the feature add-on that switches a shop's own brand identity on.
export const BRAND_IDENTITY_ADDON = 'brand_identity';
// TEN-09, TEN-10 (Slice 13): the plan feature (or add-on key) that lets a shop serve its own domain; Growth and Pro
// carry it in their features.
export const CUSTOM_DOMAIN_FEATURE = 'custom_domain';

// BRN-02 (agreed for Slice 11.2): the curated typefaces a brand identity's headings and its body text are set in, each
// a Bangla face with the Latin face that suits it, all from Google Fonts. Galada with Playfair Display is for headings
// only. The faces themselves are in BRAND_FONTS.
export enum BrandFont {
  NotoSansBengaliInter = 'noto_sans_bengali_inter',
  HindSiliguriPlusJakartaSans = 'hind_siliguri_plus_jakarta_sans',
  AnekBanglaDmSans = 'anek_bangla_dm_sans',
  BalooDa2Poppins = 'baloo_da_2_poppins',
  TiroBanglaLora = 'tiro_bangla_lora',
  NotoSerifBengaliFraunces = 'noto_serif_bengali_fraunces',
  GaladaPlayfairDisplay = 'galada_playfair_display',
}

// BRN-02: a brand identity's corners and spacing, as presets; packages/ui holds what each measures.
export enum BrandCorners {
  Square = 'square',
  Soft = 'soft',
  Round = 'round',
}

export enum BrandSpacing {
  Compact = 'compact',
  Comfortable = 'comfortable',
  Airy = 'airy',
}

// BRN-03, BRN-04: the colour pairs a brand identity is checked on -- the text on its main colour, on its accent and on
// its background; the main colour itself on the background (an icon, a heading); and the fixed status colours on the
// background.
export enum BrandPair {
  TextOnMain = 'text_on_main',
  TextOnAccent = 'text_on_accent',
  TextOnBackground = 'text_on_background',
  MainOnBackground = 'main_on_background',
  StatusOnBackground = 'status_on_background',
}

// PLN-14 (agreed for Slice 10a): the most of one add-on a single purchase may buy; a feature add-on is only ever one.
export const ADDON_QUANTITY_MAX = 10;

// PLN-14 (agreed for Slice 10a.2): how long an add-on runs when the shop has no plan period to align it with -- on
// pay-as-you-go or a no-expiry plan -- each renewed from the balance at its own end.
export const ADDON_PERIOD_DAYS = 30;

// PLN-14: how many days before an add-on ends the owner is warned that it will not renew.
export const ADDON_WARNING_DAYS: readonly number[] = [7, 1];

// PLN-15 (agreed for Slice 10a.3): the most packs auto-buy buys for one metric in one cycle; past it, the grace and the
// stop apply as without auto-buy.
export const PACK_AUTO_BUY_CAP = 3;

// BND-04, RTE-11: a pack has no end -- it is used up, not outlived (PLN-13) -- so its purchase row's end is this, after
// every period there will be.
export const PACK_NEVER_ENDS = new Date('9999-12-31T00:00:00.000Z');

// BND-04, RTE-11: what a pack tops up, by the limit it raises -- media bandwidth or API requests.
export const PACK_LIMIT_KEYS = ['bandwidth_gb', 'requests_monthly'] as const;
export type PackLimitKey = (typeof PACK_LIMIT_KEYS)[number];

// BND-04: how auto-buy stands in a cycle -- a pack asked for and not yet bought, or one the balance could not pay.
export enum PackAutoBuyState {
  Requested = 'requested',
  Failed = 'failed',
}

// PLN-14: what became of a bought add-on. Pending while its payment is quoted; active from when it takes effect;
// lapsed once it ended with nothing continuing it; cancelled when its payment never activated it -- the quote was
// turned down, or expired (an expired quote paid late and approved still activates it, BIL-15), or the shop could
// take no add-on when the payment was approved, and the amount went to its balance.
export enum AddonPurchaseStatus {
  Pending = 'pending',
  Active = 'active',
  Lapsed = 'lapsed',
  Cancelled = 'cancelled',
}

// PLN-14: how an add-on the shop has will renew -- in the plan's renewal payment; from the balance at the end of its
// own 30 days (pay-as-you-go and no-expiry plans); not at all because the owner switched it off; or never, because its
// item is retired or the limit it raises is unlimited on the shop's plan.
export enum AddonRenewal {
  WithPlan = 'with_plan',
  FromBalance = 'from_balance',
  Off = 'off',
  Retired = 'retired',
  Unlimited = 'unlimited',
  // Set to renew from the balance, which is too short of its price today.
  BalanceShort = 'balance_short',
}

// DWN-01, PYG-10: what a control.scheduled_plan_changes row is for -- a downgrade, or a switch from a plan to
// pay-as-you-go, both taking effect at the current period's end.
export enum ScheduledPlanChangeKind {
  Downgrade = 'downgrade',
  PayAsYouGoSwitch = 'pay_as_you_go_switch',
}

/**
 * The values of a string enum as the non-empty tuple that Drizzle's `pgEnum` expects. Throws on an empty enum,
 * which cannot happen for the enums above; the check keeps the type honest without a cast.
 */
// UOM-01: the unit a product's stock is counted in. piece, dozen, pack and box are whole numbers; the rest take
// up to three decimals (UOM-03).
export enum StockUnit {
  Piece = 'piece',
  Kg = 'kg',
  G = 'g',
  Liter = 'liter',
  Ml = 'ml',
  Dozen = 'dozen',
  Pack = 'pack',
  Box = 'box',
}

// INV-02: whether a product's stock is counted at all ("made to order" when not).
export enum StockTracking {
  Tracked = 'tracked',
  NotTracked = 'not_tracked',
}

// CMB-01 (Phase 4 Slice 4.5): an ordinary product, or a combo pack made of other products' variants. Chosen when the
// product is made and never changed (agreed 2026-10-30); a combo holds no stock of its own.
export enum ProductKind {
  Standard = 'standard',
  Combo = 'combo',
}

// CCH-08: what the public catalogue says about a product's stock.
export enum StockState {
  In = 'in',
  Low = 'low',
  Out = 'out',
}

// UOM-03: the units stock may be held in fractions of (up to three decimals); every other unit is whole numbers.
export const MEASURED_STOCK_UNITS: readonly StockUnit[] = [
  StockUnit.Kg,
  StockUnit.G,
  StockUnit.Liter,
  StockUnit.Ml,
];

// INV-24: the combination key of a product's stock-holder variant, the hidden variant holding a shared stock. No real
// combination can take it, since a real key is "attributeId=optionId" pairs or ''. Mirrored in the database's
// product_variants_stock_holder_check.
export const STOCK_HOLDER_KEY = '#stock';

// INV-14, INV-23: what a product's serials look like: an IMEI (15 digits with its check digit), or any code of letters,
// digits and dashes.
export enum SerialFormat {
  Imei = 'imei',
  Any = 'any',
}

// INV-14: where one serial-numbered unit is. Reserved arrives with reservations (Slice 5), sold and returned with
// orders (Phase 4). In stock and reserved are the units the shop holds.
export enum SerialStatus {
  InStock = 'in_stock',
  Reserved = 'reserved',
  Sold = 'sold',
  Returned = 'returned',
  WrittenOff = 'written_off',
}

// INV-15: where stock held for an order line stands: held (active), shipped (consumed) or let go (released). Only an
// active reservation counts in a level's reserved stock.
export enum ReservationStatus {
  Active = 'active',
  Consumed = 'consumed',
  Released = 'released',
}

// INV-12, INV-13: where a batch stands against its expiry date: expired (past its last sellable day, never sold, waiting
// to be written off), expiring (within EXPIRY_WARNING_DAYS), or fine (later, or no expiry at all).
export enum BatchState {
  Fine = 'fine',
  Expiring = 'expiring',
  Expired = 'expired',
}

// PUR-02: where a purchase stands. A draft has no number yet and may be deleted; placing it with the supplier gives it
// the next number (PUR-03). Partly and fully received, and closed short, come with receiving (Slice 4b).
export enum PurchaseStatus {
  Draft = 'draft',
  Ordered = 'ordered',
  PartiallyReceived = 'partially_received',
  Received = 'received',
  ClosedShort = 'closed_short',
  Cancelled = 'cancelled',
}

// PUR-05: the placed purchases still open, whose outstanding items are on their way ("coming").
export const OPEN_PURCHASE_STATUSES: readonly PurchaseStatus[] = [
  PurchaseStatus.Ordered,
  PurchaseStatus.PartiallyReceived,
];

// INV-04: why on-hand stock changed. Every stock movement carries one.
export enum StockReason {
  Initial = 'initial',
  PurchaseReceipt = 'purchase_receipt',
  Sale = 'sale',
  ReturnReceived = 'return_received',
  Damaged = 'damaged',
  Lost = 'lost',
  Expired = 'expired',
  Recount = 'recount',
  ManualAdjustment = 'manual_adjustment',
}

// INV-06: the one-tap reasons offered when a tenant types a new stock number. "New stock arrived" records a manual
// adjustment until purchasing (Slice 4) makes it a received purchase; skipping the tap is "other".
export enum StockEditReason {
  NewStock = 'new_stock',
  CountedAgain = 'counted_again',
  DamagedOrLost = 'damaged_or_lost',
  Other = 'other',
}

// PRD-16: how a product's delivery charge is worked out. Adjustable needs a weight.
export enum DeliveryMode {
  Default = 'default',
  Adjustable = 'adjustable',
}

// PRD-08: what a shopper pays before delivery.
export enum PaymentPolicy {
  None = 'none',
  DeliveryChargeOnly = 'delivery_charge_only',
  PartialAdvance = 'partial_advance',
  FullPrepayment = 'full_prepayment',
}

// ATL-01: an attribute's kind of value.
export enum AttributeDataType {
  EnumSingle = 'enum_single',
  EnumMulti = 'enum_multi',
  NumberWithUnit = 'number_with_unit',
  Text = 'text',
  Boolean = 'boolean',
}

// UOM-02: what a number-with-unit attribute measures.
export enum UnitKind {
  Weight = 'weight',
  Volume = 'volume',
  Count = 'count',
}

// ATL-02: what an attribute does on one product.
export enum AttributeRole {
  VariantDefining = 'variant_defining',
  Informational = 'informational',
  CapturedAtOrder = 'captured_at_order',
}

/**
 * The attribute types that hold options (ATL-01). A number-with-unit attribute's options are numbers in its unit
 * kind's base unit (grams, millilitres, a count), so they sort and compare as numbers (UOM-02).
 */
export const OPTION_DATA_TYPES: readonly AttributeDataType[] = [
  AttributeDataType.EnumSingle,
  AttributeDataType.EnumMulti,
  AttributeDataType.NumberWithUnit,
];

/** The types that can split a product into variants (ATR-04): one option each. Never enum-multi (ATL-02). */
export const VARIANT_DATA_TYPES: readonly AttributeDataType[] = [
  AttributeDataType.EnumSingle,
  AttributeDataType.NumberWithUnit,
];

/** The types a shopper or staff member can fill in when ordering (ATR-08): free text or a number. */
export const CAPTURED_DATA_TYPES: readonly AttributeDataType[] = [
  AttributeDataType.Text,
  AttributeDataType.NumberWithUnit,
];

// PST-05: the optional product-form fields a shop type can show up front; every other one sits under
// "More settings". Every field stays reachable for every shop type.
export enum ProductFormField {
  StockTracking = 'stockTracking',
  BatchTracked = 'batchTracked',
  SerialTracked = 'serialTracked',
  ItemCondition = 'itemCondition',
  SizeChart = 'sizeChart',
  WeightKg = 'weightKg',
  LowStockThreshold = 'lowStockThreshold',
  DeliveryCharge = 'deliveryCharge',
  PaymentPolicy = 'paymentPolicy',
}

// ORD-40: what an order's payments have reached. Only the server moves it, from payment events (Slice 4.3, Phase 5); a
// cash-on-delivery order with nothing paid yet stays `unverified`.
export enum OrderPaymentStatus {
  Unverified = 'unverified',
  PendingVerification = 'pending_verification',
  PartiallyPaid = 'partially_paid',
  Paid = 'paid',
  PaymentFailed = 'payment_failed',
  Refunded = 'refunded',
}

// ORD-40, ORD-42: how far an order's goods have gone. Only the server moves it, from shipping, delivery and courier
// events.
export enum FulfillmentStatus {
  Unfulfilled = 'unfulfilled',
  Processing = 'processing',
  PartiallyShipped = 'partially_shipped',
  Shipped = 'shipped',
  PartiallyDelivered = 'partially_delivered',
  Delivered = 'delivered',
  Returned = 'returned',
}

// SRS §2.3.1, ORD-41: the status an order shows, worked out from its two axes, its confirming call and a manual
// override (`visibleOrderStatus`); never stored.
export enum OrderStatus {
  Unverified = 'unverified',
  Pending = 'pending',
  Confirmed = 'confirmed',
  Processing = 'processing',
  Shipped = 'shipped',
  Delivered = 'delivered',
  PartialDelivered = 'partial_delivered',
  Completed = 'completed',
  Cancelled = 'cancelled',
  Hold = 'hold',
  InReview = 'in_review',
  Refunded = 'refunded',
  Returned = 'returned',
  Rejected = 'rejected',
}

// ORD-41: the statuses staff set by hand, which show instead of the worked-out one until cleared. A cancellation is
// final (ORD-52).
export enum StatusOverride {
  Hold = 'hold',
  Cancelled = 'cancelled',
  InReview = 'in_review',
}

// MNU-04: how an order reaches its customer. Only a delivery has a courier, a zone and a delivery charge.
export enum FulfilmentType {
  Delivery = 'delivery',
  Takeaway = 'takeaway',
  DineIn = 'dine_in',
}

// ORD-01, ORD-02: where an order came from.
export enum OrderSource {
  Dashboard = 'dashboard',
  Api = 'api',
  Storefront = 'storefront',
  LandingPage = 'landing_page',
}

// ORD-51: how a call to the customer ended.
export enum CallOutcome {
  Confirmed = 'confirmed',
  NoAnswer = 'no_answer',
  CallBackLater = 'call_back_later',
  Cancelled = 'cancelled',
}

// ORD-52: why an order was cancelled; "other" needs a note. Kept for the fake-order checks (FRD).
export enum CancelReason {
  CustomerCancelled = 'customer_cancelled',
  FakeOrder = 'fake_order',
  Unreachable = 'unreachable',
  OutOfStock = 'out_of_stock',
  Duplicate = 'duplicate',
  // D5-4 (Phase 5, agreed 2026-10-31): the order's advance was not paid in time, or its payment was rejected; the server
  // gives it, and staff may choose it too.
  AdvanceNotPaid = 'advance_not_paid',
  Other = 'other',
}

// ORD-08, ORD-14: what one entry of an order's history records: its making, a confirming call, a status set by hand or
// by an event, and a price or delivery charge staff set by hand.
export enum OrderHistoryField {
  Created = 'created',
  Confirmed = 'confirmed',
  StatusOverride = 'status_override',
  PaymentStatus = 'payment_status',
  FulfillmentStatus = 'fulfillment_status',
  UnitPrice = 'unit_price',
  DeliveryCharge = 'delivery_charge',
  // ORD-10, INV-17 (Slice 4.3): units that came back, sellable or damaged.
  Return = 'return',
}

// ORD-15, ORD-22, D4-6 (Slice 4.3): how money for an order came in. Cash on delivery is what the courier collected when
// the order was delivered (agreed 2026-10-30); cash is paid at the counter; the rest carry a transaction ID.
export enum PaymentMethod {
  CashOnDelivery = 'cash_on_delivery',
  Cash = 'cash',
  Bkash = 'bkash',
  Nagad = 'nagad',
  Rocket = 'rocket',
  Upay = 'upay',
  Bank = 'bank',
}

// WAL-18 (Phase 5 Slice 5.1): a payment method type's kind -- a mobile wallet's number, or a bank account's details
// (WAL-14).
export enum PaymentMethodKind {
  Wallet = 'wallet',
  Bank = 'bank',
}

// WAL-01: what kind of account a wallet number is, which decides how a shopper pays it (PAY-05): Send Money to a
// personal number, Cash Out to an agent's, Payment to a merchant's.
export enum WalletAccountType {
  Personal = 'personal',
  Agent = 'agent',
  Merchant = 'merchant',
}

// §2.4, PAY-03, PAY-07 (Phase 5 Slice 5.2): a payment session's state. A session is made awaiting payment; a
// transaction ID typed moves it to checking (D5-5), where it waits for staff, the listener or the gateway.
export enum PaymentSessionState {
  AwaitingPayment = 'awaiting_payment',
  Checking = 'checking',
  Verified = 'verified',
  NeedsReview = 'needs_review',
  Failed = 'failed',
  Expired = 'expired',
  Cancelled = 'cancelled',
}

// Slice 5.2 (agreed 2026-10-31): who opened a session -- a shopper at checkout, whose unpaid order the window's end
// cancels (D5-4), or staff sending a payment link, which only expires.
export enum PaymentSessionSource {
  Checkout = 'checkout',
  StaffLink = 'staff_link',
}

// LSN-06 (Phase 5 Slice 5.4b): the wallets whose receipts Lytro can read. A phone is no use to any other wallet's payment.
export const LISTENER_WALLETS: readonly PaymentMethod[] = [PaymentMethod.Bkash];

// VER-02 to VER-06, LSN-15, LSN-16 (Phase 5 Slice 5.4b): where a receipt a phone forwarded stands. `matched`: it became a
// payment. `unmatched`: nobody has claimed it yet (VER-04). `needs_review`: it claims a payment but staff must decide.
// `duplicate`: another phone already forwarded it (VER-03). `ignored`: it verifies nothing.
export enum ListenerMessageStatus {
  Matched = 'matched',
  Unmatched = 'unmatched',
  NeedsReview = 'needs_review',
  Duplicate = 'duplicate',
  Ignored = 'ignored',
}

// VER-06, LSN-04, LSN-15, LSN-16 (Phase 5 Slice 5.4b): why a message verifies nothing.
export enum ListenerIgnoredReason {
  UnknownSender = 'unknown_sender',
  UnknownFormat = 'unknown_format',
  NotReceipt = 'not_receipt',
  NotMoneyIn = 'not_money_in',
  TooOld = 'too_old',
  TooNew = 'too_new',
  TestMode = 'test_mode',
}

// VER-02, VER-04, WAL-21, D5-4 (Phase 5 Slice 5.4b, read agreed 2026-11-02): why a receipt that claims a payment waits for
// staff instead of verifying it.
export enum PaymentReviewReason {
  Amount = 'amount',
  Sender = 'sender',
  Wallet = 'wallet',
  OldReceipt = 'old_receipt',
  LowBalance = 'low_balance',
  OrderClosed = 'order_closed',
  TransactionIdUsed = 'transaction_id_used',
  // BIL-15 (Slice 5.6): the seller's request had closed when the money arrived.
  RequestClosed = 'request_closed',
  // Slice 5.7 (agreed 2026-11-03): the shop checks this wallet's payments by hand, so a receipt only helps staff.
  ByHand = 'by_hand',
}

// PAY-06 (amended 2026-11-03, Slice 5.7 read): how a shop takes a wallet's payments, its owner's choice for each wallet.
export enum PaymentWay {
  Automated = 'automated',
  Listener = 'listener',
  Manual = 'manual',
}

// VER-09, PAY-08 (Slice 5.7): how the last try at a wallet's own checkout ended, for the page to offer another.
export enum GatewayResult {
  Cancelled = 'cancelled',
  Failed = 'failed',
}

// CRR-01 (Phase 6): the couriers there are adapters for. Steadfast first, then Pathao and RedX (D6-2).
export enum CourierKey {
  Steadfast = 'steadfast',
  Pathao = 'pathao',
  RedX = 'redx',
}

// CRR-15, D6-4: a connection whose login the courier refuses makes no more calls until it is fixed.
export enum CourierConnectionState {
  Active = 'active',
  LoginRefused = 'login_refused',
}

// CRR-06, CRR-08, CRR-18, CRR-28, D6-11: a parcel's booking. `booking` is out with the courier; `unknown` lost its answer, so it
// may exist; `refused` never existed; `cancelled` was booked and has been called off.
export enum ParcelState {
  Booking = 'booking',
  Booked = 'booked',
  Unknown = 'unknown',
  Refused = 'refused',
  Cancelled = 'cancelled',
}

// CRR-08: the states in which a parcel stands for its order, so a second can't be booked. The unique index in migration 0107
// (courier_parcels_live_key) spells out the same three.
export const LIVE_PARCEL_STATES: readonly ParcelState[] = [
  ParcelState.Booking,
  ParcelState.Booked,
  ParcelState.Unknown,
];

// SEC-11 (Slice 6.1): what a stored courier credential was used for.
export enum CourierCallAction {
  Test = 'test',
  Book = 'book',
  LookUp = 'look_up',
  Cancel = 'cancel',
  // Slice 6.2: Sync, or the night check, asking where a parcel stands.
  Track = 'track',
  // Slice 6.3: a courier whose login ends, renewing it.
  Renew = 'renew',
  // Slice 6.5: reading a courier's payouts, the list or one of them.
  Payouts = 'payouts',
}

// CRR-29 (Slice 6.2): what a courier's status means here. Each adapter maps its own onto these, and shared code reads only these.
export enum ParcelReading {
  // In the courier's system, not yet with it.
  Booked = 'booked',
  WithCourier = 'with_courier',
  // The courier itself calls this unconfirmed: the rider's word, which settles nothing.
  Unconfirmed = 'unconfirmed',
  Hold = 'hold',
  Delivered = 'delivered',
  PartlyDelivered = 'partly_delivered',
  Returning = 'returning',
  // Something is wrong with it, by the courier's word; it shows and moves nothing.
  Problem = 'problem',
}

// D6-4, read agreed 2026-11-05: a parcel the night check no longer asks after. Its messages still show.
export const FINISHED_PARCEL_READINGS: readonly ParcelReading[] = [
  ParcelReading.Delivered,
  ParcelReading.PartlyDelivered,
  ParcelReading.Returning,
];

// CRR-13: how a piece of courier news reached us.
export enum CourierNewsSource {
  Message = 'message',
  Check = 'check',
  Sync = 'sync',
}

// Slice 6.2 read: what staff should look at on a parcel; nothing has moved on its account.
export enum ParcelAttention {
  CashDiffers = 'cash_differs',
  CodChanged = 'cod_changed',
  ReportAfterDelivered = 'report_after_delivered',
  DeliveredAfterCancel = 'delivered_after_cancel',
}

// CUS-10 (Phase 6 Slice 6.4, read agreed 2026-11-06): how a courier's area came to its thana. Only an area named after its thana, or
// one the operator placed, counts; a name in brackets or a near spelling is a suggestion until the operator confirms it.
export enum CourierAreaMatch {
  OwnName = 'own_name',
  Operator = 'operator',
  Suggested = 'suggested',
  None = 'none',
}

// The operator's lists of a courier's areas.
export enum CourierAreaState {
  Unassigned = 'unassigned',
  Suggested = 'suggested',
  Assigned = 'assigned',
  Retired = 'retired',
}

// CRR-23, CRR-24 (Slice 6.6): a courier as the platform holds it. Retiring keeps every shop already connected working and lets no
// new one connect; removed is for good, once nothing waits on it, and its code then goes.
export enum CourierAdapterState {
  Active = 'active',
  Retiring = 'retiring',
  Removed = 'removed',
}

// CRR-24 (Slice 6.6): why an order still holds a courier back from being removed.
export enum CourierBlockReason {
  NotSettled = 'not_settled',
  OnItsWay = 'on_its_way',
  AwaitingPayout = 'awaiting_payout',
}

// CRR-02, D6-3, read agreed 2026-11-05: how a connection's messages stand, for the owner.
export enum CourierMessagesState {
  NoneYet = 'none_yet',
  Arriving = 'arriving',
  TokenMissing = 'token_missing',
}

// SEC-11 (Slice 5.7): what a stored gateway credential was used for.
export enum CredentialUseAction {
  Token = 'token',
  Create = 'create',
  Execute = 'execute',
  Query = 'query',
}

// PAY-14: what the payment page may tell a shopper of a review -- never the shop's balance or anything else of its own.
export enum PaymentPageReviewReason {
  Amount = 'amount',
  Sender = 'sender',
  Other = 'other',
}

// LSN-02, LSN-12, LSN-19, LSN-21 (Phase 5 Slice 5.4a): why a listener phone stopped working -- its shop revoked it,
// Lytro did, it was flagged too often for another installation's calls, or Lytro blocked its installation.
export enum ListenerRevokeReason {
  Owner = 'owner',
  Operator = 'operator',
  Flags = 'flags',
  InstallationBlocked = 'installation_blocked',
  // Phase 5 Slice 5.4b: the phone unpaired itself, from its own menu or because the SIM is not in it.
  Device = 'device',
}

// LSN-02, LSN-20: a listener phone as its shop's list shows it -- paired and working, or revoked.
export enum ListenerDeviceStatus {
  Active = 'active',
  Revoked = 'revoked',
}

// PAY-14 (Phase 5 Slice 5.3, agreed 2026-10-31): why staff rejected a payment, as the shopper is told on the page.
export enum PaymentRejectReason {
  NoPaymentFound = 'no_payment_found',
  TransactionIdUsed = 'transaction_id_used',
  Other = 'other',
}

// PAY-19 (Phase 5 Slice 5.3, agreed 2026-10-31): where a payment in the shop's one list stands -- a transaction ID a
// shopper typed waits to be verified or was rejected; money in is verified, and may later be voided or refunded.
export enum PaymentListStatus {
  ToVerify = 'to_verify',
  Verified = 'verified',
  Rejected = 'rejected',
  Voided = 'voided',
  Refunded = 'refunded',
}

// TVR-02 (Phase 5 Slice 5.2b, agreed 2026-10-31): why a shopper reported a payment page.
export enum PaymentPageReportReason {
  AskedForPin = 'asked_for_pin',
  WrongShop = 'wrong_shop',
  WrongAmount = 'wrong_amount',
  Other = 'other',
}

// ADM-12: where a page report stands -- waiting for the operator, dismissed, or acted on by suspending the page.
export enum PaymentPageReportStatus {
  Open = 'open',
  Dismissed = 'dismissed',
  Actioned = 'actioned',
}

// VER-01 to VER-12: how a payment is verified -- by staff, by a paired listener phone reading the receipt SMS, or by
// the wallet's own gateway.
export enum VerificationLevel {
  Manual = 'manual',
  Listener = 'listener',
  Gateway = 'gateway',
}

// STA-01, STA-03 (Slice 4.7): how a period's sales figures are split. A week runs Saturday to Friday (agreed 2026-10-30).
export enum SalesBucket {
  Week = 'week',
  Month = 'month',
  Quarter = 'quarter',
  Year = 'year',
}

// STA-02 (Slice 4.7): what best sellers are ranked by.
export enum SalesRanking {
  Units = 'units',
  Revenue = 'revenue',
}

export function enumTuple<T extends string>(values: readonly T[]): [T, ...T[]] {
  const [first, ...rest] = values;
  if (first === undefined) throw new Error('an enum must have at least one value');
  return [first, ...rest];
}
