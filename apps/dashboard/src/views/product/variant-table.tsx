import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SerialFormat, type StockUnit } from '@lytronix/validators';
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
import { useVariantWords } from './variant-words';

/** The table's columns besides the variant and its price, as the product is (Part 14, the prototype's `pfMatrix`). */
export interface TableColumns {
  /** A new, counted product's stock already on the shelf, per variant (INV-03). */
  opening: boolean;
  /** INV-12: that stock is a batch, entered in its sheet with how much (Part 15's "Opening batch"). */
  batch: boolean;
  /** INV-14: a new serial-numbered product's opening serials, in their format, where others show the SKU. */
  serials: SerialFormat | null;
  /** INV-14: a saved one's serials held of what each holds ("7 / 7"), by variant id; null when not shown. */
  held: ReadonlyMap<string, string> | null;
  /** What each saved variant can sell, by its id (read-only, 11.7b read); null when not shown. */
  canSell: ReadonlyMap<string, string> | null;
  /** INV-24: the unit each variant's pack of the shared stock is in; null when the variants hold their own. */
  pack: StockUnit | null;
  sku: boolean;
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

function Cell({
  value,
  label,
  wide,
  placeholder,
  suffix,
  invalid,
  readOnly,
  numeric,
  onChange,
}: {
  value: string;
  label: string;
  wide?: boolean;
  placeholder?: string;
  suffix?: string;
  invalid: boolean;
  readOnly: boolean;
  numeric: boolean;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <td className="border-b border-line px-2.5 py-2">
      <span
        className={[
          'flex h-9 items-center gap-1 rounded-control border bg-surface px-2 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus',
          wide ? 'w-[110px]' : 'w-[92px]',
          invalid ? 'border-danger' : 'border-line-strong',
        ].join(' ')}
      >
        <input
          aria-label={label}
          aria-invalid={invalid || undefined}
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          inputMode={numeric ? 'decimal' : undefined}
          className={[
            'min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-muted',
            numeric ? 'num text-right' : 'text-left text-fg-muted',
          ].join(' ')}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        {suffix ? <span className="text-[13px] text-fg-muted">{suffix}</span> : null}
      </span>
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
    <td className="border-b border-line px-2.5 py-2">
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
 * follows the product's, shown greyed), and as the product is: its pack of a shared stock, a new product's opening
 * stock, a saved one's "Can sell" (a variant this edit adds starts at 0, marked New), its SKU. Fill all heads Price and
 * Opening stock. The first 6 show, then "Show all"; the limits line ends it.
 */
export function VariantTable({
  rows,
  splits,
  columns,
  basePrice,
  isNew,
  problems,
  readOnly,
  showAll,
  onShowAll,
  onRow,
  onFill,
  onOpen,
  onBatch,
  onSerials,
  onHeld,
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
  showAll: boolean;
  onShowAll: () => void;
  onRow: (index: number, patch: Partial<VariantRow>) => void;
  onFill: (column: FillColumn) => void;
  /** Opens a variant's own settings (the variant sheet). */
  onOpen: (index: number) => void;
  /** Opens a variant's opening batch, or its opening serials (Part 15's sheets). */
  onBatch: (index: number) => void;
  onSerials: (index: number) => void;
  /** Opens a saved variant's serials (the Stock card's IMEI / serials sheet). */
  onHeld: (index: number) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const words = useVariantWords();
  const batchText = useBatchText();
  const shown = showAll ? rows : rows.slice(0, SHOWN_VARIANTS);
  const fresh = !isNew && rows.some((row) => row.id === null);
  const span =
    2 +
    (columns.pack ? 1 : 0) +
    (columns.opening ? 1 : 0) +
    (columns.canSell ? 1 : 0) +
    (columns.serials ? 1 : 0) +
    (columns.held ? 1 : 0) +
    (columns.sku ? 1 : 0);
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
  const unit = columns.pack ? t(`su_${columns.pack}`) : '';
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="min-w-full border-collapse text-[14px]">
        <thead>
          <tr>
            <Head sticky>{columns.pack ? t('packCol') : t('variantCol')}</Head>
            {columns.pack ? <Head>{t('packHolds')}</Head> : null}
            <Head>
              {t('price')}
              {fill('price')}
            </Head>
            {columns.opening && columns.batch ? <Head>{t('openingBatch')}</Head> : null}
            {columns.opening && !columns.batch ? (
              <Head>
                {t('openingStock')}
                {fill('openingStock')}
              </Head>
            ) : null}
            {columns.canSell ? <Head>{t('canSell')}</Head> : null}
            {columns.serials ? <Head>{t('openingSerials')}</Head> : null}
            {columns.held ? <Head>{t('heldSerialsTitle')}</Head> : null}
            {columns.sku ? <Head>{t('skuCol')}</Head> : null}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => {
            const index = rows.indexOf(row);
            const name = words.variant(row.optionIds, splits);
            const bad = (field: string) =>
              Object.keys(problems).some(
                (key) =>
                  key === `variants.${String(index)}.${field}` ||
                  key.startsWith(`variants.${String(index)}.${field}.`),
              );
            const kept = keptOf(row.openingSerials).length;
            return (
              <tr key={keyOf(row.optionIds)}>
                <td className="sticky left-0 z-[1] border-b border-line bg-surface px-2.5 py-2 whitespace-nowrap">
                  <button
                    type="button"
                    aria-label={t('openVariant', { variant: name })}
                    className="text-left underline decoration-line-strong underline-offset-2"
                    onClick={() => {
                      onOpen(index);
                    }}
                  >
                    {name}
                  </button>
                </td>
                {columns.pack ? (
                  <Cell
                    value={row.packAmount}
                    label={t('cellPack', { variant: name })}
                    suffix={unit}
                    invalid={bad('packAmount')}
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
                  invalid={bad('price')}
                  readOnly={readOnly}
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
                    invalid={bad('openingStock')}
                    readOnly={readOnly}
                    numeric
                    onChange={(openingStock) => {
                      onRow(index, { openingStock });
                    }}
                  />
                ) : null}
                {columns.canSell ? (
                  <td className="num border-b border-line px-2.5 py-2 whitespace-nowrap">
                    {row.id === null ? (
                      <>
                        0{' '}
                        <StatusTag tone="info" small>
                          {t('newVariant')}
                        </StatusTag>
                      </>
                    ) : (
                      (columns.canSell.get(row.id) ?? '')
                    )}
                  </td>
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
                {columns.sku ? (
                  <Cell
                    value={row.sku}
                    label={t('cellSku', { variant: name })}
                    wide
                    invalid={bad('sku')}
                    readOnly={readOnly}
                    numeric={false}
                    onChange={(sku) => {
                      onRow(index, { sku });
                    }}
                  />
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
    </div>
  );
}
