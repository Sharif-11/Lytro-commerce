import type { ConsumerMetric, LedgerEntryType, TenantState } from '@lytronix/validators';

// ADM-08, ADM-09, MED-12 (Phase 8 Slices 8.4 and 8.6): the reports, the platform audit log and the media costs, as the
// server's DTOs answer them (apps/server/src/modules/team/dto/operator-reports.dto.ts, operator-media-costs.dto.ts).

/** Taka as the server writes it, to two places: "1347.00". */
type Money = string;

export interface RevenueFigures {
  wallet: { purchase: Money; renewal: Money; upgrade: Money; addon: Money };
  balance: Partial<Record<LedgerEntryType, Money>>;
  givenBack: Money;
  manual: { plans: Money; plansReversed: Money; topUps: Money; topUpsReversed: Money };
  earned: Money;
}

export interface RevenueReport {
  dateFrom: string;
  dateTo: string;
  buckets: (RevenueFigures & { from: string; to: string })[];
  total: RevenueFigures;
  recordedSince: string | null;
}

export interface ShopMovements {
  opened: number;
  becamePaying: number;
  lapsed: number;
}

export interface ShopsReport {
  dateFrom: string;
  dateTo: string;
  now: {
    total: number;
    byState: { state: TenantState; count: number }[];
    byPlan: {
      planId: string | null;
      planName: string | null;
      payAsYouGo: boolean;
      count: number;
    }[];
  };
  buckets: (ShopMovements & { from: string; to: string })[];
  total: ShopMovements;
}

export interface ConsumersReport {
  dateFrom: string;
  dateTo: string;
  metric: ConsumerMetric;
  shops: { id: string; name: string; slug: string; ownerPhone: string | null; value: number }[];
}

export interface AuditEntry {
  id: number;
  actorType: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  result: string;
  summary: unknown;
  createdAt: string;
  shop: { id: string; name: string; slug: string } | null;
}

export interface AuditPage {
  items: AuditEntry[];
  next: number | null;
}

/** US dollars to two places: "5.60". */
type Dollars = string;

interface CostLine {
  operations: number;
  billableMillions: number;
  cost: Dollars;
}

export interface MediaCosts {
  period: { dateFrom: string; dateTo: string; days: number; daysRecorded: number };
  connected: boolean;
  readAt: string | null;
  budget: {
    amount: Dollars;
    alertPercent: number;
    alertAt: Dollars;
    usedPercent: number;
    alertEmail: string | null;
    alertSentAt: string | null;
  };
  r2: {
    classA: CostLine;
    classB: CostLine;
    storage: { gbMonths: number; billableGbMonths: number; cost: Dollars };
    cost: Dollars;
    buckets: {
      bucket: string;
      classA: number;
      classB: number;
      freeOps: number;
      gbMonths: number;
      latestBytes: number;
      objects: number;
    }[];
  };
  workers: {
    requests: number;
    bytes: number;
    billableMillions: number;
    monthly: Dollars;
    cost: Dollars;
  };
  total: Dollars;
  topShops: { tenantId: string; name: string; slug: string; requests: number; bytes: number }[];
  periods: { dateFrom: string; dateTo: string }[];
  prices: {
    r2ClassAPerMillion: number;
    r2ClassBPerMillion: number;
    r2StoragePerGbMonth: number;
    r2FreeClassAMillions: number;
    r2FreeClassBMillions: number;
    r2FreeStorageGbMonths: number;
    workersMonthly: number;
    workersIncludedMillions: number;
    workersPerMillion: number;
  };
}
