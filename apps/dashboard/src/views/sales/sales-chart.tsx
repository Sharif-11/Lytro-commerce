import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import type { SalesBucket } from '@lytronix/validators';
import { Card } from '@/components/ui/card';
import { Kv } from '@/components/ui/kv';
import type { SalesBucketRow } from '@/types/sales';
import { useBucketWords } from './sales-words';

/** Past this many bars they keep their width, and the chart scrolls sideways. */
const BARS_THAT_FIT = 12;

/**
 * Revenue by week, month, quarter or year (TENANT-DASHBOARD-DESIGN §7.34, the prototype's `sa32Chart`): a bar for each,
 * the last one marked, then each with its orders and revenue, newest first. Many bars open on the newest
 * (`sales32-many`), and take the keyboard's focus so the older ones can be scrolled to without a pointer.
 */
export function SalesChart({
  bucket,
  rows,
  title,
}: {
  bucket: SalesBucket;
  rows: readonly SalesBucketRow[];
  title: string;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const wordsOf = useBucketWords();
  const scroller = useRef<HTMLDivElement>(null);
  const many = rows.length > BARS_THAT_FIT;
  // A row says its year only where a month or quarter would otherwise appear twice.
  const plain = rows.map((row) => wordsOf(bucket, row, false));
  const repeats = new Set(plain.map((each) => each.short)).size < rows.length;
  const words = repeats ? rows.map((row) => wordsOf(bucket, row, true)) : plain;
  const most = Math.max(...rows.map((row) => Number(row.revenue)), 0);
  const width = many ? 'w-[34px] flex-none' : 'flex-1';

  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [rows]);

  return (
    <Card>
      <h3 className="text-[17px] font-semibold">{title}</h3>
      <div
        ref={scroller}
        role="group"
        aria-label={title}
        tabIndex={many ? 0 : undefined}
        className={many ? 'overflow-x-auto [scrollbar-width:none]' : undefined}
      >
        <div className={many ? 'w-max' : undefined}>
          <div className="mt-3 flex h-[120px] items-end gap-1.5">
            {rows.map((row, index) => (
              <i
                key={row.from}
                className={`${width} rounded-t-[2px] ${
                  index === rows.length - 1 ? 'bg-primary' : 'bg-brand-300'
                }`}
                style={{
                  height: `${String(
                    most > 0 ? Math.max(4, Math.round((Number(row.revenue) / most) * 100)) : 4,
                  )}%`,
                }}
              />
            ))}
          </div>
          <div className="num mt-1 flex gap-1.5 text-fg-muted">
            {rows.map((row, index) => (
              <span key={row.from} className={`${width} text-center text-[11px]`}>
                {words[index]?.short}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2">
        {rows
          .map((row, index) => ({ row, long: words[index]?.long ?? '' }))
          .reverse()
          .map(({ row, long }) => (
            <Kv
              key={row.from}
              label={`${long} · ${t('saOrdersN', { count: row.orders })}`}
              value={formatTaka(row.revenue)}
            />
          ))}
      </div>
    </Card>
  );
}
