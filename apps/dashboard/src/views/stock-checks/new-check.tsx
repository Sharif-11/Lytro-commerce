import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { STOCK_NOTE_MAX_LENGTH } from '@lytronix/validators';
import { useBatchesOf } from '@/api/stock';
import { useRecordStockCheck, type CountedLine } from '@/api/stock-checks';
import { Icon } from '@/components/icon';
import { ActionBar } from '@/components/ui/action-bar';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useErrorText } from '@/hooks/use-error-text';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { StockPageProduct } from '@/types/stock';
import { isMeasured } from '../product/stock-words';
import { useCountLines, mustName, type CountLine } from './check-lines';
import { CheckPickSheet } from './check-pick-sheet';
import { CheckTable, Difference } from './check-table';
import { MissingSheet } from './missing-sheet';

/** A typed count: a whole number, or one with decimals in a measured unit. */
const AMOUNT = /^\d+(\.\d+)?$/;

/**
 * A new stock check (the prototype's `stock-check`, Part 20's `stock-check-batches` and v3.8's `stock-check-start`,
 * `stock-check-note`; INV-07, INV-12, INV-14): what to count picked first, then each line's count beside what the
 * shop's records expect with the difference, a batch-kept product batch by batch, a serial line counted short naming
 * the IMEIs not found; a note; and what the changes come to at average cost. Lines left blank are not counted. Saved,
 * every difference is recorded as "counted again" and the check's own page opens.
 */
export function NewCheckView(): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug } = useShell();
  const record = useRecordStockCheck();
  const countLines = useCountLines();
  const [picked, setPicked] = useState<StockPageProduct[]>([]);
  const [picking, setPicking] = useState(false);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [named, setNamed] = useState<Record<string, string[]>>({});
  const [naming, setNaming] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const kept = picked.filter((product) => product.batchTracked);
  const batches = useBatchesOf(kept.map((product) => product.productId));
  const loading = batches.some((each) => each.isPending);
  const lines = picked.flatMap((product) => {
    const at = kept.indexOf(product);
    return countLines(product, at < 0 ? undefined : batches[at]?.data?.batches);
  });

  /** A line's count as typed: a number, null when left blank, NaN when it is not one the unit allows. */
  const countOf = (line: CountLine): number | null => {
    const value = (typed[line.key] ?? '').trim();
    if (value === '') return null;
    return AMOUNT.test(value) && (isMeasured(line.unit) || Number.isInteger(Number(value)))
      ? Number(value)
      : Number.NaN;
  };
  const counted = lines.filter((line) => countOf(line) !== null);
  const invalid = counted.some((line) => Number.isNaN(countOf(line)));
  const unnamed = counted.some(
    (line) => (named[line.key]?.length ?? 0) < mustName(line, countOf(line)),
  );
  const changes = counted
    .map((line) => ({ line, change: (countOf(line) ?? 0) - line.expected }))
    .filter((each) => !Number.isNaN(each.change) && each.change !== 0);
  const valueOf = (sign: 1 | -1) =>
    changes
      .filter((each) => Math.sign(each.change) === sign)
      .reduce((total, each) => total + Math.abs(each.change) * (each.line.avgCost ?? 0), 0);
  const lost = valueOf(-1);
  const gained = valueOf(1);
  const worth = [
    lost > 0 ? t('lostAmount', { amount: formatTaka(lost) }) : null,
    gained > 0 ? t('gainedAmount', { amount: formatTaka(gained) }) : null,
  ]
    .filter(Boolean)
    .join(', ');
  const namingLine = lines.find((line) => line.key === naming) ?? null;

  const save = () => {
    const body: CountedLine[] = counted.map((line) => ({
      variantId: line.variantId,
      ...(line.batchId ? { batchId: line.batchId } : {}),
      counted: countOf(line) ?? 0,
      ...((named[line.key]?.length ?? 0) > 0 ? { missingSerials: named[line.key] } : {}),
    }));
    record.mutate(
      { lines: body, ...(note.trim() ? { note: note.trim() } : {}) },
      {
        onSuccess: (check) => {
          void navigate({
            to: '/$shop/stock/checks/$checkId',
            params: { shop: slug, checkId: check.id },
            replace: true,
          });
        },
      },
    );
  };

  return (
    <ShellPage>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setPicking(true);
          }}
          className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-button border border-line-strong bg-surface px-3 text-left text-[16px] text-fg-subtle"
        >
          <Icon name="search" />
          {t('pickToCount')}
        </button>
      </div>
      {picked.length === 0 ? (
        <Card>
          <EmptyState icon="list">{t('checkStart')}</EmptyState>
        </Card>
      ) : loading ? (
        <Card flush>
          <SkeletonRows count={4} />
        </Card>
      ) : (
        <CheckTable
          lines={lines}
          counted={(line) => (
            <input
              aria-label={t('countedFor', { name: line.name })}
              inputMode={isMeasured(line.unit) ? 'decimal' : 'numeric'}
              placeholder="—"
              value={typed[line.key] ?? ''}
              aria-invalid={Number.isNaN(countOf(line)) ? true : undefined}
              onChange={(event) => {
                setTyped((current) => ({ ...current, [line.key]: event.target.value }));
              }}
              className={[
                'num h-9 w-[72px] rounded-[6px] border bg-surface px-2 text-right outline-none placeholder:text-neutral-400 focus-visible:outline-2 focus-visible:outline-focus',
                Number.isNaN(countOf(line))
                  ? 'border-danger'
                  : countOf(line) !== null && countOf(line) !== line.expected
                    ? 'border-accent'
                    : 'border-line-strong',
              ].join(' ')}
            />
          )}
          difference={(line) => {
            const count = countOf(line);
            return count === null || Number.isNaN(count) ? null : (
              <Difference change={count - line.expected} />
            );
          }}
          below={(line) => {
            const least = mustName(line, countOf(line));
            if (least === 0) return null;
            const serials = named[line.key] ?? [];
            return (
              <span className="mt-0.5 flex flex-col">
                {serials.length > 0 ? (
                  <span className="text-[13px] text-fg-muted">
                    {t('missingNamed', { serials: serials.join(', ') })}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setNaming(line.key);
                  }}
                  className="self-start text-left text-[13px] font-semibold text-danger underline"
                >
                  {t('nameMissing')}
                </button>
              </span>
            );
          }}
        />
      )}
      {picked.length > 0 ? (
        <Field
          label={t('note')}
          placeholder={t('checkNotePh')}
          value={note}
          maxLength={STOCK_NOTE_MAX_LENGTH}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      ) : null}
      {counted.length > 0 ? (
        <Banner tone="info">
          {[t('changedN', { count: changes.length }), worth].filter(Boolean).join(' · ')}.{' '}
          {t('checkNote')}
        </Banner>
      ) : null}
      {record.isError ? <Banner tone="bad">{errorText(record.error)}</Banner> : null}
      <ActionBar>
        <Link to="/$shop/stock/checks" params={{ shop: slug }} className={buttonClass('outline')}>
          {t('cancel')}
        </Link>
        <Button
          busy={record.isPending}
          disabled={counted.length === 0 || invalid || unnamed}
          onClick={save}
        >
          {t('saveCheck')}
        </Button>
      </ActionBar>
      <CheckPickSheet
        open={picking}
        onPick={(products) => {
          setPicking(false);
          setPicked((current) => [
            ...current,
            ...products.filter(
              (product) => !current.some((each) => each.productId === product.productId),
            ),
          ]);
        }}
        onClose={() => {
          setPicking(false);
        }}
      />
      <MissingSheet
        line={namingLine}
        counted={namingLine ? countOf(namingLine) : null}
        named={namingLine ? (named[namingLine.key] ?? []) : []}
        onDone={(serials) => {
          if (namingLine) setNamed((current) => ({ ...current, [namingLine.key]: serials }));
          setNaming(null);
        }}
        onClose={() => {
          setNaming(null);
        }}
      />
    </ShellPage>
  );
}
