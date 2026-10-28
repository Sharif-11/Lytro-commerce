import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { useStockCheck } from '@/api/stock-checks';
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatRow, StatTile } from '@/components/ui/stat-tile';
import { useErrorText } from '@/hooks/use-error-text';
import { ShellPage } from '@/shell/shell-page';
import type { StockCheck, StockCheckLine } from '@/types/stock';
import { formatDayMonth } from '@/lib/dates';
import { changeText } from './check-lines';
import { CheckTable, Difference, type TableLine } from './check-table';
import { useCheckWords } from './check-words';

/** Up to this many lines show at first, every changed one among them; the rest all matched (the sketch's "+20"). */
const SHOWN_FIRST = 4;

interface SavedLine extends TableLine {
  /** The variant's own words ("M"), for the figures' "M −1". */
  short: string;
  change: number;
  counted: string;
}

/**
 * One stock check (the prototype's `stock-check-detail`; INV-07): its number, when, who counted and its note; how
 * many lines and how many changed, and, for someone who may see costs, what was gained and lost with the lines that
 * did it; then its lines, the changed ones always shown, the rest that matched behind "+n more lines, all matched".
 */
export function CheckDetailView({ checkId }: { checkId: string }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const check = useStockCheck(checkId);
  const words = useCheckWords();
  const [all, setAll] = useState(false);

  if (!check.data) {
    return (
      <ShellPage>
        {check.isError ? (
          <Banner tone="bad">{errorText(check.error)}</Banner>
        ) : (
          <Card flush>
            <SkeletonRows count={4} />
          </Card>
        )}
      </ShellPage>
    );
  }

  const saved = check.data;
  const lines = savedLines(saved, (line) => words.variantOf(saved, line), t('productGone'));
  const changed = lines.filter((line) => line.change !== 0);
  const folded =
    lines.length <= SHOWN_FIRST
      ? lines
      : lines.filter((line, at) => line.change !== 0 || at < SHOWN_FIRST);
  const hidden = lines.length - folded.length;
  const moved = (sign: 1 | -1) =>
    changed
      .filter((line) => Math.sign(line.change) === sign)
      .map((line) => `${line.short} ${changeText(line.change)}`)
      .join(', ');
  const { valueGained, valueLost } = saved.totals;

  return (
    <ShellPage title={`#${String(saved.number)}`}>
      <p className="-mt-3.5 text-[14px] text-fg-muted lg:mt-0">{words.about(saved)}</p>
      <StatRow label={t('linesL')} tight>
        <StatTile
          tight
          label={t('linesL')}
          value={saved.totals.lines}
          note={t('changedOf', { count: saved.totals.changed })}
        />
        {valueGained !== undefined ? (
          <StatTile tight label={t('gained')} value={formatTaka(valueGained)} note={moved(1)} />
        ) : null}
        {valueLost !== undefined ? (
          <StatTile
            tight
            label={t('lost')}
            value={formatTaka(valueLost)}
            note={moved(-1)}
            noteTone="bad"
          />
        ) : null}
      </StatRow>
      <CheckTable
        lines={all ? lines : folded}
        labelled
        counted={(line) => line.counted}
        difference={(line) => <Difference change={line.change} />}
        after={
          // Opened, the matched lines fold again with Show less, as the Stock page's fine ones do.
          hidden > 0 ? (
            <button
              type="button"
              aria-expanded={all}
              onClick={() => {
                setAll(!all);
              }}
              className="text-left"
            >
              {all ? t('showLess') : t('moreMatched', { count: hidden })}
            </button>
          ) : null
        }
      />
    </ShellPage>
  );
}

/** A saved check's lines as its table shows them: a product's batch lines under its name, each with its difference. */
function savedLines(
  check: StockCheck,
  variantOf: (line: StockCheckLine) => string | null,
  gone: string,
): SavedLine[] {
  return check.lines.map((line) => {
    const product = line.productName ?? gone;
    const variant = variantOf(line);
    const batch = line.batch
      ? [
          variant,
          line.batch.batchCode,
          line.batch.expiresOn ? formatDayMonth(line.batch.expiresOn) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;
    return {
      key: `${line.variantId}/${line.batch?.id ?? ''}`,
      name: batch ?? (variant ? `${product} · ${variant}` : product),
      group: batch ? product : null,
      expected: Number(line.expected),
      counted: String(Number(line.counted)),
      change: Number(line.difference),
      short: batch ?? variant ?? product,
    };
  });
}
