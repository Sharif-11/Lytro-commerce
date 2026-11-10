import type {
  AddonKind,
  AddonRenewal,
  AttributeDataType,
  CredentialUseAction,
  ListenerDeviceStatus,
  ListenerIgnoredReason,
  ListenerMessageStatus,
  PaymentMethod,
  PaymentMethodKind,
  PaymentPageReportReason,
  PaymentPageReportStatus,
  PaymentReviewReason,
  PaymentWay,
  PlanLimits,
  PlanPaymentKind,
  PlanPaymentStatus,
  PlatformAuditAction,
  ProductFormField,
  RateKey,
  SerialFormat,
  StockTracking,
  StockUnit,
  TenantState,
  UnitKind,
} from '@lytronix/validators';

/**
 * The console's view of the server's operator responses. No shared package exports response shapes yet
 * (only request validation and error codes), so these are deliberate structural duplicates of server-only
 * types; each names the file it mirrors.
 */

/** apps/server/src/modules/operator: POST /auth/operator/signin. */
export type OperatorSigninResult =
  { next: 'enroll-2fa'; secret: string; uri: string } | { next: 'verify-2fa' };

/** GET /auth/operator/me. */
export interface OperatorMe {
  /** Slice 8.8: the console's "only mine" filters. */
  id: string;
  email: string;
  unusedBackupCodes: number;
  signedInAt: string;
  userAgent: string | null;
}

export interface OperatorEnrolled {
  csrfToken: string;
  backupCodes: string[];
}

export interface OperatorVerified {
  csrfToken: string;
}

/** `planSchema` in apps/server/src/modules/team/dto/billing-response.dto.ts. */
export interface Plan {
  id: string;
  name: string;
  description: string | null;
  rank: number;
  forSale: boolean;
  version: number;
  limits: PlanLimits;
  features: Record<string, boolean>;
  createdAt: string;
}

/** `operatorPlanSchema`: a plan as GET /operator/plans lists it. */
export interface OperatorPlan extends Plan {
  shopsByVersion: { version: number; shops: number }[];
  deletable: boolean;
}

export interface PlanVersion {
  id: string;
  planId: string;
  version: number;
  name: string;
  description: string | null;
  rank: number;
  forSale: boolean;
  limits: PlanLimits;
  features: Record<string, boolean>;
  recordedAt: string;
}

export interface PlanPrice {
  planId: string;
  billingTermId: string;
  price: string;
}

export interface BillingTerm {
  id: string;
  labelBn: string;
  labelEn: string;
  months: number;
  visible: boolean;
  displayOrder: number;
  defaultDiscountPct: string | null;
  tenantId: string | null;
  retiredAt: string | null;
  createdAt: string;
}

/** `operatorBillingTermSchema`: a term as GET /operator/billing-terms lists it. */
export interface OperatorBillingTerm extends BillingTerm {
  invoices: number;
  deletable: boolean;
}

/** apps/server/src/modules/billing/types/plan-assignment.ts. */
export interface PlanAssignment {
  id: string;
  tenantId: string;
  planId: string;
  expiry: string | null;
  reason: string;
  assignedBy: string;
  assignedAt: string;
}

export interface PlanLimitOverride {
  id: string;
  tenantId: string;
  limitKey: string;
  value: number | boolean | null;
  reason: string;
  setBy: string;
  setByEmail: string | null;
  setAt: string;
}

/** apps/server/src/modules/balance/types/rate.ts and the rate history DTO. */
export interface RateValue {
  key: RateKey;
  value: string;
  effectiveFrom: string;
}

export interface RateHistoryEntry {
  id: number;
  key: RateKey;
  oldValue: string | null;
  newValue: string;
  changedBy: string | null;
  changedByEmail: string | null;
  noticeId: string | null;
  changedAt: string;
}

/** apps/server/src/modules/platform-settings/types/platform-setting.ts. */
export interface PlatformSetting {
  key: string;
  value: number | string | boolean | string[];
  description: string;
  updatedBy: string | null;
  updatedByEmail: string | null;
  updatedAt: string;
}

/** `operatorAddonSchema` in apps/server/src/modules/team/dto/addons-response.dto.ts. */
export interface OperatorAddon {
  id: string;
  key: string;
  kind: AddonKind;
  limitKey: string | null;
  unitSize: number | null;
  price: string;
  labelEn: string;
  labelBn: string;
  retiredAt: string | null;
  createdAt: string;
  running: number;
  boughtThisMonth: number;
}

/** `presetViewSchema` in apps/server/src/modules/team/dto/catalogue-response.dto.ts. */
export interface ShopTypePreset {
  key: string;
  labelBn: string;
  labelEn: string;
  defaults: {
    stockUnit: StockUnit;
    stockTracking: StockTracking;
    batchTracked: boolean;
    serialTracked: boolean;
    serialFormat: SerialFormat;
    lowStockThreshold: string;
    suggestedAttributeIds: string[];
    suggestedCategories: string[];
    upFrontFields: ProductFormField[];
  };
}

/** `optionViewSchema` there. */
export interface LibraryOption {
  id: string;
  value: string;
  swatchColor: string | null;
  retired: boolean;
}

/** `attributeViewSchema` there. */
export interface LibraryAttribute {
  id: string;
  name: string;
  dataType: AttributeDataType;
  unitKind: UnitKind | null;
  retired: boolean;
  options: LibraryOption[];
}

/** `optionSetViewSchema` there. */
export interface LibraryOptionSet {
  id: string;
  name: string;
  options: string[];
  presetKey: string | null;
}

/** `tenantSummarySchema` in apps/server/src/modules/team/dto/balance-response.dto.ts. */
export interface TenantSummary {
  id: string;
  slug: string;
  shopName: string;
  state: TenantState;
  suspendedAt: string | null;
  planId: string | null;
  planName: string | null;
  planVersion: number | null;
  overrideCount: number;
  periodEnd: string | null;
}

export interface TenantSummaryPage {
  entries: TenantSummary[];
  nextCursor: string | null;
}

/** apps/server/src/modules/payments/types/plan-payment.ts. */
export interface PlanPayment {
  id: string;
  tenantId: string;
  kind: PlanPaymentKind;
  planId: string | null;
  billingTermId: string | null;
  amount: string;
  creditAmount: string;
  quotedAt: string;
  status: PlanPaymentStatus;
  senderNumber: string | null;
  transactionId: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

/** `paymentAddonSchema` in apps/server/src/modules/team/dto/billing-response.dto.ts. */
export interface PaymentAddon {
  id: string;
  key: string;
  labelEn: string;
  labelBn: string;
  quantity: number;
  price: string;
  status: string;
  startsAt: string | null;
  expiresAt: string;
}

/** `queuedPaymentSchema` there: a payment as the queue lists it. */
export interface QueuedPayment extends PlanPayment {
  submittedAt: string | null;
  addons: PaymentAddon[];
  shopName: string;
  shopSlug: string;
  wallet: PaymentMethod | null;
  amountSent: string | null;
  amountArrived: string | null;
  reviewReason: PaymentReviewReason | null;
}

/** `operatorShopSchema` in apps/server/src/modules/team/dto/operator-console.dto.ts. */
export interface OperatorShop {
  id: string;
  slug: string;
  shopName: string;
  state: TenantState;
  createdAt: string;
  planId: string | null;
  planName: string | null;
  planVersion: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  overrideCount: number;
  suspension: { at: string; reason: string | null; by: string | null } | null;
  paymentPageSuspension: { at: string; reason: string | null } | null;
  newShopCap: { set: boolean | null; holds: boolean };
}

/** `operatorShopAddonsSchema` there. */
export interface ShopAddon {
  id: string;
  key: string;
  kind: AddonKind;
  labelEn: string;
  labelBn: string;
  quantity: number;
  expiresAt: string;
  renewal: AddonRenewal;
  monthlyPrice: string;
  paidFrom: 'balance' | 'wallet';
}

export interface ShopPack {
  metric: 'bandwidth' | 'requests';
  left: number;
  autoBuy: boolean;
}

export interface LimitPart {
  key: string;
  plan: unknown;
  overridden: boolean;
  override: unknown;
  addons: number;
  effective: unknown;
}

export interface ShopAddons {
  addons: ShopAddon[];
  packs: ShopPack[];
  limits: LimitPart[];
}

/** `recentChangeSchema` there. */
export interface RecentChange {
  id: number;
  action: PlatformAuditAction;
  at: string;
  by: string | null;
  key: string | null;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  /** NTC-13: a rate change's history id, for a notice of it; null for other changes and older rate changes. */
  rateChangeId: number | null;
  shop: { id: string; name: string; slug: string } | null;
}

/** `PaymentPageReportListDto` in apps/server/src/modules/team/dto/payment-pages.dto.ts. */
export interface PaymentPageReport {
  id: string;
  shop: { id: string; name: string; slug: string; paymentPageSuspended: boolean };
  paymentUrl: string;
  reason: PaymentPageReportReason;
  note: string | null;
  ip: string | null;
  status: PaymentPageReportStatus;
  createdAt: string;
  handledAt: string | null;
}

/** apps/server/src/modules/team/dto/listener.dto.ts. */
export interface ListenerDevice {
  id: string;
  name: string;
  model: string | null;
  appVersion: string;
  pairedAt: string;
  lastSeenAt: string | null;
  online: boolean;
  status: ListenerDeviceStatus;
  flags: number;
  uploadsToday: number;
  installationId: string;
}

export interface ListenerDeviceList {
  devices: ListenerDevice[];
  active: number;
  limit: number | null;
}

export interface ListenerCode {
  code: string;
  expiresAt: string;
}

export interface LytroReceipt {
  id: string;
  method: PaymentMethod | null;
  amount: string | null;
  transactionId: string | null;
  status: ListenerMessageStatus;
  reviewReason: PaymentReviewReason | null;
  ignoredReason: ListenerIgnoredReason | null;
  receivedAt: string;
  senderNumber: string | null;
  deviceId: string;
  planPaymentId: string | null;
  text: string | null;
}

export interface LytroReceiptPage {
  receipts: LytroReceipt[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface UnreadShape {
  day: string;
  shape: string;
  count: number;
}

export interface CredentialUse {
  method: PaymentMethod;
  action: CredentialUseAction;
  accountId: string;
  sessionId: string | null;
  succeeded: boolean;
  at: string;
}

export interface CredentialUsePage {
  uses: CredentialUse[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** apps/server/src/modules/balance/types/platform-wallet.ts. */
/** apps/server/src/modules/lytro-payments/types/lytro-payments.ts: Lytro's own checkout for a method, never its keys. */
export interface LytroGateway {
  connected: boolean;
  unreadable: boolean;
  sandbox: boolean;
  number: string | null;
}

export interface LytroPaymentMethod {
  method: string;
  kind: PaymentMethodKind;
  enabled: boolean;
  way: PaymentWay;
  ways: PaymentWay[];
  gateway: LytroGateway | null;
}

export interface LytroBankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string | null;
  routingNumber: string | null;
  swiftCode: string | null;
  instructions: string | null;
  enabled: boolean;
  displayOrder: number;
  createdAt: string;
}

export interface LytroPaymentMethods {
  methods: LytroPaymentMethod[];
  bankAccounts: LytroBankAccount[];
}

export interface LytroGatewayTest {
  ok: boolean;
  code: string | null;
}

export interface PlatformWallet {
  id: string;
  provider: string;
  number: string;
  label: string | null;
  enabled: boolean;
  displayOrder: number;
  createdAt: string;
}

/** apps/server/src/modules/balance/types/ledger-entry.ts: what a balance adjustment returns. */
export interface LedgerEntry {
  id: number;
  type: string;
  amount: string;
  balanceAfter: string;
  createdAt: string;
}
