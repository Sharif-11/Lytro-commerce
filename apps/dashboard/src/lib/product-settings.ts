import {
  DeliveryMode,
  ItemCondition,
  PaymentPolicy,
  SerialFormat,
  StockTracking,
  StockUnit,
} from '@lytronix/validators';
import type { ProductDefaults } from '@/types/attribute';
import type { ProductDetail, SizeChartView } from '@/types/product';
import type { ImageView } from '@/types/me';

/**
 * A product's own settings as the editor holds them while they are typed (TENANT-DASHBOARD-DESIGN §7.4's third card
 * and More settings, Part 15; Slice 11.7c): how its stock is counted, delivered and paid for.
 */
export interface ProductSettings {
  stockTracking: StockTracking;
  stockUnit: StockUnit;
  lowStockThreshold: string;
  batchTracked: boolean;
  serialTracked: boolean;
  serialFormat: SerialFormat;
  condition: ItemCondition;
  weightKg: string;
  deliveryCharge: string;
  /** PRD-16: with a weight, whether the charge grows with it. */
  adjustByWeight: boolean;
  /** PRD-08: its own policy, or null to follow the shop's default. */
  paymentPolicy: PaymentPolicy | null;
  advanceAmount: string;
}

/** PST-02: the settings a shop type gives a new product, the ones the category's type may change (PST-06). */
export const TYPE_SETTINGS = [
  'stockTracking',
  'stockUnit',
  'lowStockThreshold',
  'batchTracked',
  'serialTracked',
  'serialFormat',
] as const;
export type TypeSetting = (typeof TYPE_SETTINGS)[number];

/** A stored amount as a field shows it: "0.400" is 0.4; none is empty. */
const typed = (stored: string | null): string => (stored === null ? '' : String(Number(stored)));

export function settingsOf(product: ProductDetail): ProductSettings {
  return {
    stockTracking: product.stockTracking,
    stockUnit: product.stockUnit,
    lowStockThreshold: typed(product.lowStockThreshold),
    batchTracked: product.batchTracked,
    serialTracked: product.serialTracked,
    serialFormat: product.serialFormat,
    condition: product.condition,
    weightKg: typed(product.weightKg),
    deliveryCharge: typed(product.deliveryCharge),
    // PRD-16: saved with no weight, the mode could only be the default; a weight typed now adjusts, as on a new one.
    adjustByWeight: product.weightKg === null || product.deliveryMode === DeliveryMode.Adjustable,
    paymentPolicy: product.paymentPolicy,
    advanceAmount: typed(product.advanceAmount),
  };
}

/** A new product: the shop type's defaults, delivered wherever the shop delivers, following the shop's policy. */
export function settingsFrom(defaults: ProductDefaults | undefined): ProductSettings {
  return {
    stockTracking: defaults?.stockTracking ?? StockTracking.Tracked,
    stockUnit: defaults?.stockUnit ?? StockUnit.Piece,
    lowStockThreshold: typed(defaults?.lowStockThreshold ?? '5'),
    batchTracked: defaults?.batchTracked ?? false,
    serialTracked: defaults?.serialTracked ?? false,
    serialFormat: defaults?.serialFormat ?? SerialFormat.Any,
    condition: ItemCondition.New,
    weightKg: '',
    deliveryCharge: '',
    adjustByWeight: true,
    paymentPolicy: null,
    advanceAmount: '',
  };
}

/**
 * PST-06: a new product's category changed while it is typed: the type's settings it brings, except those changed
 * by hand. Answers the settings and the names of those that moved, for the banner.
 */
export function applyDefaults(
  settings: ProductSettings,
  defaults: ProductDefaults,
  touched: ReadonlySet<TypeSetting>,
): { settings: ProductSettings; moved: TypeSetting[] } {
  const offered = settingsFrom(defaults);
  const next = { ...settings };
  const moved: TypeSetting[] = [];
  for (const key of TYPE_SETTINGS) {
    if (touched.has(key) || next[key] === offered[key]) continue;
    (next as Record<TypeSetting, unknown>)[key] = offered[key];
    moved.push(key);
  }
  return { settings: next, moved };
}

/** An amount typed as the server takes it, or null when the field is empty. */
const amountOf = (text: string): number | null => (text.trim() === '' ? null : Number(text.trim()));

/**
 * PRD-01, PRD-08, PRD-16, UOM-01, INV-02/08/12/14/23, FED-02: the settings as the server takes them. With no weight
 * the charge cannot grow with it, so the mode is the default (PRD-16); an advance is only a partial advance's.
 */
export function settingsBody(settings: ProductSettings) {
  const weight = amountOf(settings.weightKg);
  const tracked = settings.stockTracking === StockTracking.Tracked;
  return {
    stockTracking: settings.stockTracking,
    stockUnit: settings.stockUnit,
    lowStockThreshold: amountOf(settings.lowStockThreshold) ?? 0,
    batchTracked: tracked && settings.batchTracked,
    serialTracked: tracked && settings.serialTracked,
    serialFormat: settings.serialFormat,
    condition: settings.condition,
    weightKg: weight,
    deliveryCharge: amountOf(settings.deliveryCharge),
    deliveryMode:
      weight !== null && settings.adjustByWeight ? DeliveryMode.Adjustable : DeliveryMode.Default,
    paymentPolicy: settings.paymentPolicy,
    advanceAmount:
      settings.paymentPolicy === PaymentPolicy.PartialAdvance
        ? amountOf(settings.advanceAmount)
        : null,
  };
}

/** What changed of the settings, as a PATCH takes it. */
export function changedSettings(
  saved: ProductSettings,
  form: ProductSettings,
): Partial<ReturnType<typeof settingsBody>> {
  const before = settingsBody(saved);
  const after = settingsBody(form);
  const changed: Partial<typeof after> = {};
  for (const key of Object.keys(after) as (keyof typeof after)[]) {
    if (after[key] !== before[key]) (changed as Record<string, unknown>)[key] = after[key];
  }
  // A partial advance goes with its amount, whichever of the two changed.
  if ('advanceAmount' in changed || 'paymentPolicy' in changed) {
    changed.paymentPolicy = after.paymentPolicy;
    changed.advanceAmount = after.advanceAmount;
  }
  return changed;
}

/**
 * PRD-17: the product's size chart as the editor holds it: its own (a table, or a picture of the shop's), or its
 * category's, shown as it is.
 */
export interface ChartForm {
  own: boolean;
  mode: 'table' | 'picture';
  rows: string[][];
  image: ImageView | null;
}

/** A table to start from: the measures named in the first row, the sizes in the first column. */
export const BLANK_CHART: string[][] = [
  ['', ''],
  ['', ''],
];

export function chartOf(view: SizeChartView | null): ChartForm {
  if (view?.source === 'product') {
    return view.image
      ? { own: true, mode: 'picture', rows: BLANK_CHART, image: view.image }
      : { own: true, mode: 'table', rows: view.rows ?? BLANK_CHART, image: null };
  }
  return { own: false, mode: 'table', rows: view?.rows ?? BLANK_CHART, image: null };
}

/** The product's own chart as the server takes it; null when it follows its category's. */
export function chartBody(chart: ChartForm): { rows: string[][] } | { imageId: string } | null {
  if (!chart.own) return null;
  if (chart.mode === 'picture') return chart.image ? { imageId: chart.image.id } : null;
  return { rows: chart.rows.map((row) => row.map((cell) => cell.trim())) };
}

/** How a product's settings move as one switch moves: batches and serials never together, both counted (INV-12/14). */
export function switchSerials(on: boolean): Partial<ProductSettings> {
  return on
    ? { serialTracked: true, batchTracked: false, stockTracking: StockTracking.Tracked }
    : { serialTracked: false };
}

export function switchBatches(on: boolean): Partial<ProductSettings> {
  return on
    ? { batchTracked: true, serialTracked: false, stockTracking: StockTracking.Tracked }
    : { batchTracked: false };
}
