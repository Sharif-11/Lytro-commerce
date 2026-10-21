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
  // BAL-03/BAL-05: a verified top-up credits the balance -- tenant-caused.
  BalanceToppedUp = 'balance_topped_up',
  // DWN-01/04/17: the owner's own scheduling actions.
  DowngradeScheduled = 'downgrade_scheduled',
  DowngradeCancelled = 'downgrade_cancelled',
  // DWN-06/08/17: the system applying an already-scheduled downgrade at its effective date -- D2-5 puts
  // this on the tenant's own log only, the same split TRL-07's trial-conversion job already established.
  DowngradeApplied = 'downgrade_applied',
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
  AuditAction.BalanceToppedUp,
  AuditAction.DowngradeScheduled,
  AuditAction.DowngradeCancelled,
  AuditAction.DowngradeApplied,
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
  // LIF-21, BAL-18: a deleted shop's remaining balance moved into the owner's new shop, one entry on each side.
  CarryOver = 'carry_over',
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
}

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
}

// D2-1: what a control.plan_payments row is for -- a purchase, a renewal, an upgrade, or a balance top-up.
export enum PlanPaymentKind {
  Purchase = 'purchase',
  Renewal = 'renewal',
  Upgrade = 'upgrade',
  TopUp = 'top_up',
}

// D2-1: BIL-04/BIL-06's pending -> needs_review/verified/rejected state machine; `expired` is BIL-15's
// 24-hour pending-purchase timeout (the sweep itself is slice 7's job, this value is just the resting state).
export enum PlanPaymentStatus {
  Pending = 'pending',
  NeedsReview = 'needs_review',
  Verified = 'verified',
  Rejected = 'rejected',
  Expired = 'expired',
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

export function enumTuple<T extends string>(values: readonly T[]): [T, ...T[]] {
  const [first, ...rest] = values;
  if (first === undefined) throw new Error('an enum must have at least one value');
  return [first, ...rest];
}
