import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LISTENER_UNREAD_ALERT_PER_DAY } from '@lytronix/validators';
import { useUnreadShapes } from '@/api/phones';
import { Chip, Chips } from '@/components/ui/chips';
import { ConsolePage } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { StatusChip } from '@/components/ui/status-chip';
import { formatDay } from '@/lib/format';
import type { UnreadShape } from '@/types/operator';
import { PhonesHead } from './phones-head';

const PERIODS = [7, 30, 90];

/** VER-06: what the reader couldn't read: only the wording and how many, so a new wording shows the reader needs updating. */
export function Unread(): React.JSX.Element {
  const { t } = useTranslation();
  const [days, setDays] = useState(7);
  const shapes = useUnreadShapes(days);

  const columns: Column<UnreadShape>[] = [
    {
      key: 'shape',
      label: t('unread.wording'),
      width: 'minmax(260px,2.4fr)',
      main: true,
      cell: (shape) => <span className="mono text-[13px] font-normal">{shape.shape}</span>,
    },
    {
      key: 'day',
      label: t('unread.day'),
      width: '110px',
      cell: (shape) => <span className="tabular-nums">{formatDay(shape.day)}</span>,
    },
    {
      key: 'count',
      label: t('unread.count'),
      width: '160px',
      cell: (shape) => (
        <>
          <span className="tabular-nums">{t('unread.messages', { count: shape.count })}</span>{' '}
          {shape.count >= LISTENER_UNREAD_ALERT_PER_DAY ? (
            <StatusChip tone="warn">{t('unread.told')}</StatusChip>
          ) : null}
        </>
      ),
    },
  ];

  return (
    <ConsolePage>
      <PhonesHead active="unread" />
      <div className="text-[14px] text-fg-muted">{t('unread.lead')}</div>
      {shapes.isError ? (
        <LoadFailed
          onRetry={() => {
            void shapes.refetch();
          }}
        />
      ) : (
        <>
          <Chips>
            {PERIODS.map((period) => (
              <Chip
                key={period}
                on={days === period}
                onClick={() => {
                  setDays(period);
                }}
              >
                {t('unread.days', { n: period })}
              </Chip>
            ))}
          </Chips>
          <DataTable
            columns={columns}
            rows={shapes.data ?? []}
            rowKey={(shape) => `${shape.day}-${shape.shape}`}
            loading={shapes.isPending}
            empty={<EmptyBox icon="inbox" title={t('unread.empty')} hint={t('unread.emptyHint')} />}
          />
        </>
      )}
    </ConsolePage>
  );
}
