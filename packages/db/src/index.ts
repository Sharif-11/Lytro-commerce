// Public entry point of the database package. Consumers import from '@lytronix/db' only.
export * from './schema';
export { DatabaseConnector, type Database, type DatabaseHandle, type PoolSettings } from './client';
export { MigrationRunner } from './migrate';
export { ActivityLogPurger } from './purge-activity-log';
export { QueueBootstrapper } from './bootstrap-queue';
export { TestDatabasePreparer, type PreparedDatabase } from './prepare-database';
export { OperatorCreator } from './create-operator';
export { OperatorTwoFactorReset } from './reset-operator-2fa';
export { TransactionRunner, type Executor, type Transaction } from './transactions';
export {
  TenantRepository,
  type TenantLookupRow,
  type TenantSummaryRow,
  type TenantSearchCursor,
  type TenantSearchRow,
  type BalanceRow,
  type BillingInfoRow,
  type LapsingCandidateRow,
  type LifecycleFactsRow,
  type StageLengthsSnapshot,
  type PaygCandidateRow,
  type DeletedShopRow,
  type ContactDetailsRow,
  type RevocationCandidateRow,
} from './repositories/tenancy/tenant.repository';
export {
  TenantDomainRepository,
  type DomainToCheckRow,
} from './repositories/tenancy/tenant-domain.repository';
export { SlugRepository } from './repositories/tenancy/slug.repository';
export {
  ChallengeRepository,
  type ChallengeRow,
} from './repositories/identity/challenge.repository';
export { AccountRepository } from './repositories/identity/account.repository';
export { OauthStateRepository } from './repositories/identity/oauth-state.repository';
export {
  SignInFailureRepository,
  type FailureScope,
} from './repositories/identity/sign-in-failure.repository';
export { SignupAttemptRepository } from './repositories/identity/signup-attempt.repository';
export { TrialCreationRepository } from './repositories/identity/trial-creation.repository';
export {
  SessionRepository,
  type SessionRow,
  type NewSession,
} from './repositories/identity/session.repository';
export { ActivityLogRepository } from './repositories/audit/activity-log.repository';
export {
  JobOutboxRepository,
  type ClaimedOutboxRow,
} from './repositories/queue/job-outbox.repository';
export { RoleRepository } from './repositories/staff/role.repository';
export { UserRepository } from './repositories/staff/user.repository';
export {
  SmsRepository,
  type ClaimedSmsMessage,
  type NewSmsMessage,
} from './repositories/messaging/sms.repository';
export {
  MailRepository,
  type ClaimedMailMessage,
  type NewMailMessage,
} from './repositories/messaging/mail.repository';
export {
  EssentialSmsUsageRepository,
  type NewEssentialSmsUsage,
} from './repositories/messaging/essential-sms-usage.repository';
export {
  OperatorAccountRepository,
  type OperatorAccountRow,
  type NewOperatorAccount,
} from './repositories/operator/operator-account.repository';
export {
  OperatorBackupCodeRepository,
  type OperatorBackupCodeRow,
} from './repositories/operator/operator-backup-code.repository';
export {
  OperatorSessionRepository,
  type OperatorSessionRow,
  type NewOperatorSession,
} from './repositories/operator/operator-session.repository';
export {
  PlatformAuditLogRepository,
  type NewPlatformAuditEntry,
} from './repositories/platform/platform-audit-log.repository';
export { PlatformSettingsRepository } from './repositories/platform/platform-settings.repository';
export {
  BalanceLedgerRepository,
  type LedgerFilters,
  type LedgerCursor,
} from './repositories/balance/balance-ledger.repository';
export { RatesRepository } from './repositories/balance/rates.repository';
export { ShopSettingsRepository } from './repositories/balance/shop-settings.repository';
export {
  BrandIdentityRepository,
  type BrandIdentityValues,
} from './repositories/brand/brand-identity.repository';
export {
  PlansRepository,
  type NewPlan,
  type PlanEdit,
} from './repositories/billing/plans.repository';
export {
  BillingTermsRepository,
  PlanPricesRepository,
  type NewBillingTerm,
  type BillingTermEdit,
} from './repositories/billing/billing-terms.repository';
export { PlanAssignmentsRepository } from './repositories/billing/plan-assignments.repository';
export { PlanLimitOverridesRepository } from './repositories/billing/plan-limit-overrides.repository';
export {
  ApiKeyRepository,
  type ApiShopRow,
  type NewApiKey,
} from './repositories/api/api-key.repository';
export {
  ApiUsageRepository,
  type ApiUsageCounts,
  type ApiUsageDayRow,
  type ApiUsageRow,
} from './repositories/api/api-usage.repository';
export { UsageWarningRepository } from './repositories/usage/usage-warning.repository';
export {
  PlatformWalletsRepository,
  type NewPlatformWallet,
  type UpdatePlatformWallet,
} from './repositories/billing/platform-wallets.repository';
export {
  InvoiceCountersRepository,
  InvoicesRepository,
  type InvoiceLine,
  type NewInvoice,
} from './repositories/billing/invoices.repository';
export {
  AddonRepository,
  type AddonEdit,
  type AddonRow,
  type NewAddonValues,
} from './repositories/billing/addon.repository';
export {
  AddonPurchaseRepository,
  addonUnitList,
  type ActiveAddonRow,
  type AddonActivation,
  type AddonPurchaseRow,
  type AddonUnits,
  type CyclePackFields,
  type NewAddonPurchaseValues,
  type PackPurchaseRow,
  type PaymentAddonRow,
  type RenewingAddonRow,
  type TenantTotal,
} from './repositories/billing/addon-purchase.repository';
export {
  PlanPaymentsRepository,
  UsedTransactionIdsRepository,
  type NewPlanPayment,
  type PaymentNeedingAttentionRow,
  type TenantPaymentFilter,
  type TenantPaymentRow,
} from './repositories/billing/plan-payments.repository';
export {
  IdempotencyKeysRepository,
  type IdempotencyScope,
} from './repositories/platform/idempotency-keys.repository';
export {
  ScheduledPlanChangesRepository,
  type NewScheduledPlanChange,
} from './repositories/billing/scheduled-plan-changes.repository';
export { DataExportsRepository } from './repositories/tenancy/data-exports.repository';
export { AttributeRepository } from './repositories/catalogue/attribute.repository';
export { CategoryRepository } from './repositories/catalogue/category.repository';
export {
  ProductRepository,
  type ProductListFilter,
  type ProductListRow,
  type ProductStateCounts,
  type ProductPatch,
} from './repositories/catalogue/product.repository';
export { VariantRepository, type VariantPatch } from './repositories/catalogue/variant.repository';
export { AdTrackingRepository } from './repositories/api/ad-tracking.repository';
export { CatalogFeedRepository } from './repositories/api/catalog-feed.repository';
export {
  PublicCatalogueRepository,
  prefixQuery,
  type CatalogueVersions,
  type FeedAttributeRow,
  type FeedImageRow,
  type FeedVariantRow,
  type PublicProductFilter,
  type PublicProductRow,
  type PublicSwatchRow,
  type CategoryProductCount,
} from './repositories/catalogue/public-catalogue.repository';
export { PresetRepository, type PresetPatch } from './repositories/catalogue/preset.repository';
export {
  SizeChartRepository,
  type SizeChartContent,
  type SizeChartOwner,
} from './repositories/catalogue/size-chart.repository';
export { OptionSetRepository } from './repositories/catalogue/option-set.repository';
export {
  ComboRepository,
  type ComboPartRow,
  type ComboPartStockRow,
  type ComboUseRow,
  type PartVariantRow,
} from './repositories/catalogue/combo.repository';
export { CatalogueDataRepository } from './repositories/catalogue/catalogue-data.repository';
export {
  StockRepository,
  type NewStockMovement,
  type OutgoingRow,
  type ReferencedMovementRow,
  type ReturnedRow,
  type ShortfallRow,
  type StockHistoryRow,
  type StockValueRow,
  type StockVariantRow,
  type VariantStockRow,
} from './repositories/inventory/stock.repository';
export { SerialRepository, type NewSerial } from './repositories/inventory/serial.repository';
export {
  MediaRepository,
  type MediaOutcome,
  type MediaSize,
  type MediaUses,
  type NewMedia,
  type NewMediaObject,
  type ProductImageRow,
} from './repositories/media/media.repository';
export {
  MediaBandwidthRepository,
  type BandwidthCycleRow,
  type BandwidthDayRow,
  type EdgeShopRow,
} from './repositories/media/media-bandwidth.repository';
export {
  ReservationRepository,
  type NewReservation,
} from './repositories/inventory/reservation.repository';
export {
  StockBatchRepository,
  type NewStockBatch,
  type StockBatchListRow,
} from './repositories/inventory/stock-batch.repository';
export {
  StockCheckRepository,
  type StockCheckLineRow,
  type StockCheckRow,
  type StockCheckSummaryRow,
} from './repositories/inventory/stock-check.repository';
export {
  OrderRepository,
  type NewOrderCall,
  type NewOrderHistory,
  type NewOrderLine,
  type NewOrderPayment,
  type OrderLinePatch,
  type OrderListFilter,
  type OrderPatch,
  type OrderRow,
  type OrderHomeCounts,
  type OrderSummaryRow,
} from './repositories/orders/order.repository';
export { CustomerRepository } from './repositories/orders/customer.repository';
export {
  SalesRepository,
  type BestSellerRow,
  type SalesDayCost,
  type SalesDayLines,
  type SalesDayOrders,
  type SalesPeriod,
} from './repositories/orders/sales.repository';
export { TaxClassRepository } from './repositories/catalogue/tax-class.repository';
export {
  ModifierRepository,
  type ModifierGroupRow,
  type NewModifierGroup,
} from './repositories/catalogue/modifier.repository';
export {
  PaymentMethodRepository,
  type NewPaymentAccount,
} from './repositories/payments/payment-method.repository';
export {
  ShopperRepository,
  type NewShopperAddress,
  type ShopperPatch,
} from './repositories/orders/shopper.repository';
export {
  SupplierRepository,
  type SupplierListRow,
  type SupplierPatch,
} from './repositories/purchasing/supplier.repository';
export {
  PurchaseOrderRepository,
  type PurchaseLinePatch,
  type PurchaseLineRow,
  type PurchaseOrderPatch,
  type PurchaseOrderRow,
  type PurchaseOrderSummaryRow,
  type PurchaseUnitsRow,
} from './repositories/purchasing/purchase-order.repository';
export {
  PurchaseReceiptRepository,
  type PurchaseHistoryRow,
  type PurchaseReceiptLineRow,
  type PurchaseReceiptRow,
} from './repositories/purchasing/purchase-receipt.repository';
export { LocationRepository, type LocationList } from './repositories/delivery/location.repository';
export {
  DeliveryZoneRepository,
  type DeliveryZonePatch,
  type ZoneAreas,
  type ZoneLimitedProduct,
} from './repositories/delivery/delivery-zone.repository';
export {
  PlatformLibraryRepository,
  type PlatformOptionSetPatch,
} from './repositories/catalogue/platform-library.repository';
