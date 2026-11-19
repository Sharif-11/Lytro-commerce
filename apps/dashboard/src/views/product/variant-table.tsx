import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SerialFormat, type StockUnit } from '@lytronix/validators';
import { Icon } from '@/components/icon';
import { StatusTag } from '@/components/ui/status-tag';
import {
  keyOf,
  SHOWN_VARIANTS,
  type FillColumn,
  type SplitAttribute,
  type VariantRow,
} from '@/lib/variant-matrix';
import { keptOf } from '@/lib/opening';
import { useBatchText } from './stock-words';
import { sheetProblems } from './variant-problems';
import { useVariantWords } from './variant-words';

/** The table's columns besides the variant and its price, as the product is (Part 14, the prototype's `pfMatrix`). */
export interface TableColumns {
  /** A new, counted product's stock already on the shelf, per variant (INV-03). */
  opening: boolean;
  /** INV-12: that stock is a batch, entered in its sheet with how much (Part 15's "Opening batch"). */
  batch: boolean;
  /** INV-14: a new serial-numbered product's opening serials, in their format. */
  serials: SerialFormat | null;
  /** INV-14: a saved one's serials held of what each holds ("7 / 7"), by variant id; null when not shown. */
  held: ReadonlyMap<string, string> | null;
  /** What each saved variant can sell, by its id (read-only, 11.7b read); null when not shown. */
  canSell: ReadonlyMap<string, string> | null;
  /** INV-24: the unit each variant's pack of the shared stock is in; null when the variants hold their own. */
  pack: StockUnit | null;
  /** The product's unit, which a variant's stock is counted in (the fixes PR: "Stock (pcs)", "6 pcs"). */
  unit: StockUnit;
  /** The fixes PR (`fx-pf-new`): a new product's SKU per variant, typed in the table. */
  sku: boolean;
}

/**
 * The fixes PR's quick Add stock (`fx-product-quick`, 2026-11-14): a saved, counted product's box per variant, what it
 * can sell now under it, its SKU under its name; all added on Save, or none.
 */
export interface QuickStock {
  values: Readonly<Record<string, string>>;
  /** A box's problem, by its variant id: the words to say under it. */
  problems: Readonly<Record<string, string>>;
  onChange: (variantId: string, value: string) => void;
}

function Head({ sticky, children }: { sticky?: boolean; children: ReactNode }): React.JSX.Element {
  return (
    <th
      className={[
        'border-b border-line px-2.5 py-2 text-left align-bottom text-[12px] font-semibold tracking-[.02em] whitespace-nowrap text-fg-muted',
        sticky ? 'sticky left-0 z-[1] bg-surface' : '',
      ].join(' ')}
    >
      {children}
    </th>
  );
}

/** A typed box (the prototype's `.in`), boxed red with its problem under it when the server or the check refuses it. */
function Box({
  value,
  label,
  width,
  placeholder,
  prefix,
  suffix,
  invalid,
  error,
  readOnly,
  numeric,
  onChange,
}: {
  value: string;
  label: string;
  width: 'narrow' | 'wide' | 'sku';
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  invalid: boolean;
  error?: string;
  readOnly: boolean;
  numeric: boolean;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <>
      <span
        className={[
          'flex h-9 items-center gap-1 rounded-control border bg-surface px-2 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus',
          width === 'sku' ? 'w-[150px]' : width === 'wide' ? 'w-[110px]' : 'w-[92px]',
          invalid ? 'border-danger' : 'border-line-strong',
        ].join(' ')}
      >
        {prefix ? <span className="text-[13px] text-fg-muted">{prefix}</span> : null}
        <input
          aria-label={label}
          aria-invalid={invalid || undefined}
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          inputMode={numeric ? 'decimal' : undefined}
          className={[
            'min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-muted',
            numeric
              ? 'num text-right'
              : width === 'sku'
                ? 'font-mono text-[14px]'
                : 'text-left text-fg-muted',
          ].join(' ')}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        {suffix ? <span className="text-[13px] text-fg-muted">{suffix}</span> : null}
      </span>
      {error ? (
        <span className="mt-1 block max-w-[180px] text-[14px] leading-[1.4] whitespace-normal text-danger-text">
          {error}
        </span>
      ) : null}
    </>
  );
}

function Cell(props: Parameters<typeof Box>[0]): React.JSX.Element {
  return (
    <td className="border-b border-line px-2.5 py-2 align-top">
      <Box {...props} />
    </td>
  );
}

/**
 * A cell that opens a sheet (Part 15: "24 · exp 2027-08", "add batch", "3 / 5"), boxed as the typed cells are. The
 * batch's box is wider than drawn, where the drawn text overflows.
 */
function SheetCell({
  text,
  label,
  wide,
  invalid,
  onOpen,
}: {
  text: string;
  label: string;
  wide?: boolean;
  invalid: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  return (
    <td className="border-b border-line px-2.5 py-2 align-top">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={onOpen}
        className={[
          'flex h-9 items-center justify-end rounded-control border bg-surface px-2 whitespace-nowrap',
          wide ? 'w-[150px]' : 'w-[92px]',
          invalid ? 'border-danger' : 'border-line-strong',
        ].join(' ')}
      >
        {text}
      </button>
    </td>
  );
}

/**
 * The variant table (TENANT-DASHBOARD-DESIGN §7.4, Part 14; ATR-11, ATR-17): a row per variant with its price (empty
 * follows the product's, shown greyed), and as the product is: its pack of a shared stock, a new product's stock in its
 * unit and its SKU (the fixes PR, 2026-11-14: an empty SKU shows the one it is given), a saved one's "Can sell" -- or,
 * where it may add stock, a quick Add stock box with what it can sell now under it and its SKU under its name (a
 * variant this edit adds starts at 0, marked New). Fill all heads Price and the new product's Stock. The first 6 show,
 * then "Show all"; the limits line ends it. A
 * variant's other settings are set in its sheet, opened from its name, which is marked when the server refuses a field
 * the sheet holds (design v3.15).
 */
export function VariantTable({
  rows,
  splits,
  columns,
  basePrice,
  isNew,
  problems,
  readOnly,
  lockedIds = new Set<string>(),
  showAll,
  onShowAll,
  onRow,
  onFill,
  onOpen,
  onBatch,
  onSerials,
  onHeld,
  pictureOf,
  autoSku,
  quick = null,
}: {
  rows: readonly VariantRow[];
  splits: readonly SplitAttribute[];
  columns: TableColumns;
  basePrice: string;
  /** A new product: no variant is "new" in it. */
  isNew: boolean;
  /** The server's problems with the rows, by `variants.<index>.<field>`. */
  problems: Readonly<Record<string, string>>;
  readOnly: boolean;
  /** OF-17: the sizes a running offer has priced; their price is locked until it ends or lets them go. */
  lockedIds?: ReadonlySet<string>;
  showAll: boolean;
  onShowAll: () => void;
  onRow: (index: number, patch: Partial<VariantRow>) => void;
  onFill: (column: FillColumn) => void;
  /** Opens a variant's own settings (the variant sheet). */
  onOpen: (index: number) => void;
  /** Opens a variant's opening batch, or its opening serials (Part 15's sheets). */
  onBatch: (index: number) => void;
  onSerials: (index: number) => void;
  /** ATR-19 (Part 40's `pd-product`): a design variant's cover, by its options; none for a product without designs. */
  pictureOf?: (optionIds: readonly string[]) => string | undefined;
  /** Opens a saved variant's serials (the Stock card's IMEI / serials sheet). */
  onHeld: (index: number) => void;
  /** The SKU a variant left without one is given, shown greyed in its empty box (the fixes PR). */
  autoSku: (optionIds: readonly string[]) => string;
  /** A saved product's quick Add stock; null where it isn't offered. */
  quick?: QuickStock | null;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const words = useVariantWords();
  const batchText = useBatchText();
  const shown = showAll ? rows : rows.slice(0, SHOWN_VARIANTS);
  const fresh = !isNew && rows.some((row) => row.id === null);
  const canSell = quick ? null : columns.canSell;
  const span =
    2 +
    (columns.pack ? 1 : 0) +
    (columns.opening ? 1 : 0) +
    (canSell ? 1 : 0) +
    (quick ? 1 : 0) +
    (columns.sku ? 1 : 0) +
    (columns.serials ? 1 : 0) +
    (columns.held ? 1 : 0);
  const fill = (column: FillColumn) =>
    readOnly || rows.length < 2 ? null : (
      <button
        type="button"
        className="mt-0.5 block text-[12px] font-semibold text-primary"
        onClick={() => {
          onFill(column);
        }}
      >
        {t('fillAll')}
      </button>
    );
  const packUnit = columns.pack ? t(`su_${columns.pack}`) : '';
  const unit = t(`su_${columns.unit}`);
  const note = quick ? t('tableQuickNote') : columns.sku ? t('tableNewNote') : null;
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="min-w-full border-collapse text-[14px]">
        <thead>
          <tr>
            <Head sticky>
              {columns.pack ? t('packCol') : quick ? t('variantSkuCol') : t('variantCol')}
            </Head>
            {columns.pack ? <Head>{t('packHolds')}</Head> : null}
            <Head>
              {t('price')}
              {fill('price')}
            </Head>
            {columns.opening && columns.batch ? <Head>{t('openingBatch')}</Head> : null}
            {columns.opening && !columns.batch ? (
              <Head>
                {`${t('stockCol')} (${unit})`}
                {fill('openingStock')}
              </Head>
            ) : null}
            {canSell ? <Head>{t('canSell')}</Head> : null}
            {quick ? <Head>{`${t('addStockCol')} (${unit})`}</Head> : null}
            {columns.sku ? <Head>{t('skuCol')}</Head> : null}
            {columns.serials ? <Head>{t('openingSerials')}</Head> : null}
            {columns.held ? <Head>{t('heldSerialsTitle')}</Head> : null}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => {
            const index = rows.indexOf(row);
            const name = words.variant(row.optionIds, splits);
            const at = (field: string) => `variants.${String(index)}.${field}`;
            const bad = (field: string) =>
              Object.keys(problems).some(
                (key) => key === at(field) || key.startsWith(`${at(field)}.`),
              );
            const kept = keptOf(row.openingSerials).length;
            // The SKU is in the table now, so a refused SKU is said under its box, not on the name.
            const refused = Object.entries(sheetProblems(problems, index))
              .filter(([field]) => !(field === 'sku' && (columns.sku || quick)))
              .map(([, message]) => message);
            const skuBox = (
              <Box
                value={row.sku}
                label={t('cellSku', { variant: name })}
                width="sku"
                placeholder={autoSku(row.optionIds)}
                prefix={quick ? 'SKU' : undefined}
                invalid={bad('sku')}
                error={problems[at('sku')]}
                readOnly={readOnly}
                numeric={false}
                onChange={(sku) => {
                  onRow(index, { sku });
                }}
              />
            );
            return (
              <tr key={keyOf(row.optionIds)}>
                <td className="sticky left-0 z-[1] border-b border-line bg-surface px-2.5 py-2 align-top whitespace-nowrap">
                  <button
                    type="button"
                    aria-label={[t('openVariant', { variant: name }), ...refused].join(' · ')}
                    className={[
                      'inline-flex min-h-9 items-center gap-1 text-left underline underline-offset-2',
                      refused.length > 0
                        ? 'text-danger-text decoration-danger-text'
                        : 'decoration-line-strong',
                    ].join(' ')}
                    onClick={() => {
                      onOpen(index);
                    }}
                  >
                    {pictureOf ? (
                      <span className="mr-1 h-[25px] w-5 flex-none overflow-hidden rounded-[4px] bg-neutral-100">
                        {pictureOf(row.optionIds) ? (
                          <img
                            src={pictureOf(row.optionIds)}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : null}
                      </span>
                    ) : null}
                    {name}
                    {refused.length > 0 ? <Icon name="alert" size={14} /> : null}
                  </button>
                  {quick ? <div className="mt-0.5">{skuBox}</div> : null}
                </td>
                {columns.pack ? (
                  <Cell
                    value={row.packAmount}
                    label={t('cellPack', { variant: name })}
                    width="narrow"
                    suffix={packUnit}
                    invalid={bad('packAmount')}
                    error={problems[at('packAmount')]}
                    readOnly={readOnly}
                    numeric
                    onChange={(packAmount) => {
                      onRow(index, { packAmount });
                    }}
                  />
                ) : null}
                <Cell
                  value={row.price}
                  placeholder={basePrice}
                  label={t('cellPrice', { variant: name })}
                  width="narrow"
                  prefix="৳"
                  invalid={bad('price')}
                  error={problems[at('price')]}
                  readOnly={readOnly || (row.id !== null && lockedIds.has(row.id))}
                  numeric
                  onChange={(price) => {
                    onRow(index, { price });
                  }}
                />
                {columns.opening && columns.batch ? (
                  <SheetCell
                    text={batchText(row.openingStock, row.openingBatch) || t('addBatch')}
                    label={t('cellBatch', { variant: name })}
                    wide
                    invalid={bad('openingStock') || bad('openingBatch') || bad('openingUnitCost')}
                    onOpen={() => {
                      onBatch(index);
                    }}
                  />
                ) : null}
                {columns.opening && !columns.batch ? (
                  <Cell
                    value={row.openingStock}
                    label={t('cellOpening', { variant: name })}
                    width="narrow"
                    placeholder="0"
                    suffix={unit}
                    invalid={bad('openingStock')}
                    error={problems[at('openingStock')]}
                    readOnly={readOnly}
                    numeric
                    onChange={(openingStock) => {
                      onRow(index, { openingStock });
                    }}
                  />
                ) : null}
                {canSell ? (
                  <td className="num border-b border-line px-2.5 py-2 whitespace-nowrap">
                    {row.id === null ? (
                      <>
                        0{' '}
                        <StatusTag tone="info" small>
                          {t('newVariant')}
                        </StatusTag>
                      </>
                    ) : (
                      (canSell.get(row.id) ?? '')
                    )}
                  </td>
                ) : null}
                {quick ? (
                  <td className="border-b border-line px-2.5 py-2 align-top">
                    {row.id === null ? (
                      <span className="num inline-flex min-h-9 items-center gap-1 whitespace-nowrap">
                        0{' '}
                        <StatusTag tone="info" small>
                          {t('newVariant')}
                        </StatusTag>
                      </span>
                    ) : (
                      <>
                        <Box
                          value={quick.values[row.id] ?? ''}
                          label={t('cellAddStock', { variant: name })}
                          width="narrow"
                          placeholder="+"
                          suffix={unit}
                          invalid={quick.problems[row.id] !== undefined}
                          error={quick.problems[row.id]}
                          readOnly={readOnly}
                          numeric
                          onChange={(value) => {
                            if (row.id) quick.onChange(row.id, value);
                          }}
                        />
                        <span className="num mt-1 block text-[14px] whitespace-nowrap text-fg-muted">
                          {t('canSellNow', { n: columns.canSell?.get(row.id) ?? '0', unit })}
                        </span>
                      </>
                    )}
                  </td>
                ) : null}
                {columns.sku ? (
                  <td className="border-b border-line px-2.5 py-2 align-top">{skuBox}</td>
                ) : null}
                {columns.serials ? (
                  <SheetCell
                    text={
                      kept > 0
                        ? t('serialsOf', { kept, units: row.openingStock.trim() || '0' })
                        : t(columns.serials === SerialFormat.Imei ? 'addImeis' : 'addSerials')
                    }
                    label={t('cellSerials', { variant: name })}
                    invalid={bad('openingSerials')}
                    onOpen={() => {
                      onSerials(index);
                    }}
                  />
                ) : null}
                {columns.held && row.id !== null ? (
                  <SheetCell
                    text={columns.held.get(row.id) ?? ''}
                    label={t('cellHeld', { variant: name })}
                    invalid={false}
                    onOpen={() => {
                      onHeld(index);
                    }}
                  />
                ) : columns.held ? (
                  <td className="border-b border-line px-2.5 py-2" />
                ) : null}
              </tr>
            );
          })}
          <tr>
            <td
              colSpan={span}
              className="border-b border-line px-2.5 py-2 text-[13px] text-fg-muted"
            >
              {rows.length > shown.length ? (
                <>
                  <button
                    type="button"
                    className="font-semibold text-primary underline"
                    onClick={onShowAll}
                  >
                    {t('showAllVariants', { count: rows.length })}
                  </button>{' '}
                  ·{' '}
                </>
              ) : null}
              {fresh ? `${t('newVariantNote')} ` : null}
              {t('limitsLine')}
            </td>
          </tr>
        </tbody>
      </table>
      {note ? <p className="mt-2 text-[14px] leading-[1.5] text-fg-muted">{note}</p> : null}
    </div>
  );
}
