import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { useManualEntries, type ManualEntryFilters } from '@/api/manual-entries';
import { useOperatorMe } from '@/api/operator-auth';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { Pager } from '@/components/ui/pager';
import { NOTE } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { dhakaDay, formatDay, taka } from '@/lib/format';
import { formatSessionTime } from '@/lib/session-time';
import type { ManualEntry } from '@/types/manual-entries';
import { EntryPanel } from './entry-panel';
import { RecordPanel } from './record-panel';
import { FILTERS, PICK_CONTROL, useEntryWhat, usePaidTo } from './entry-words';
import { Pick } from './parts';
import { ReversePanel } from './reverse-panel';
import { EntryShotPanel } from './screenshot-panel';

const PAGE_SIZE = 50;
// The shops the filter offers: those with an entry among the most recent ones, since entries are few.
const SHOP_SPAN = 100;

type Open = { step: 'new' } | { step: 'entry' | 'reverse' | 'shot'; entry: ManualEntry } | null;

/**
 * OPERATOR-CONSOLE-DESIGN v7 §4b (ADM-14 to ADM-16, D8-47 to D8-56): payments that reached Lytro outside the normal flow,
 * recorded by hand, and their reversals. An entry is never changed; a reversal stands beside it.
 */
export function ManualEntries(): React.JSX.Element {
  const { t } = useTranslation();
  const me = useOperatorMe();
  const [tenantId, setTenantId] = useState('');
  const [mine, setMine] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Open>(null);
  const what = useEntryWhat();
  const paidTo = usePaidTo();

  const filters: ManualEntryFilters = {
    page,
    limit: PAGE_SIZE,
    ...(tenantId ? { tenantId } : {}),
    ...(mine && me.data ? { operatorId: me.data.id } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };
  const entries = useManualEntries(filters);
  const recent = useManualEntries({ page: 1, limit: SHOP_SPAN });
  const today = dhakaDay(new Date());
  const todays = useManualEntries({ page: 1, limit: SHOP_SPAN, dateFrom: today, dateTo: today });
  const madeToday = (todays.data?.entries ?? []).filter(
    (entry) => entry.reversesEntryId === null,
  ).length;

  const rows = entries.data?.entries ?? [];
  const shops = new Map<string, string>();
  for (const entry of recent.data?.entries ?? []) shops.set(entry.tenantId, entry.shopName);
  // A reversal names the entry it reverses; that entry, when it is on this page, gives its day, TrxID and number.
  const reversed = (entry: ManualEntry): ManualEntry | undefined =>
    rows.find((each) => each.id === entry.reversesEntryId);
  const close = (): void => {
    setOpen(null);
  };
  const filtered = (change: () => void) => {
    change();
    setPage(1);
  };

  const columns: Column<ManualEntry>[] = [
    {
      key: 'when',
      label: t('manual.cWhen'),
      width: '112px',
      cell: (entry) => (
        <>
          <span className="tabular-nums">{formatSessionTime(entry.createdAt)}</span>
          <div className="text-[12px] text-fg-muted">{entry.enteredByEmail ?? '—'}</div>
        </>
      ),
    },
    {
      key: 'what',
      label: t('manual.cWhat'),
      width: 'minmax(170px,1.5fr)',
      main: true,
      cell: (entry) => {
        const original = reversed(entry);
        return (
          <>
            <button
              type="button"
              className="text-left"
              onClick={(event) => {
                event.stopPropagation();
                setOpen({ step: 'entry', entry: original ?? entry });
              }}
            >
              {entry.shopName}
            </button>
            <div className="text-[13px] font-normal whitespace-normal text-fg-muted">
              {entry.reversesEntryId === null
                ? what(entry)
                : original
                  ? t('manual.reversalOf', { d: formatDay(original.createdAt) })
                  : t('manual.reversalOfEarlier')}
              {entry.reversedBy ? (
                <>
                  {' · '}
                  <StatusChip tone="mute">{t('manual.reversed')}</StatusChip>
                </>
              ) : null}
            </div>
          </>
        );
      },
    },
    {
      key: 'amount',
      label: t('manual.cAmount'),
      width: '92px',
      right: true,
      cell: (entry) => (
        <span
          className={`font-semibold tabular-nums ${entry.reversesEntryId ? 'text-danger' : ''}`}
        >
          {entry.reversesEntryId ? `−${taka(entry.amount)}` : taka(entry.amount)}
        </span>
      ),
    },
    {
      key: 'paid',
      label: t('manual.cPaid'),
      width: 'minmax(130px,1fr)',
      cell: (entry) => {
        const source = entry.reversesEntryId ? reversed(entry) : entry;
        return (
          <>
            <div className="mono">{source?.transactionId ?? '—'}</div>
            <div className="text-[12px] text-fg-muted">
              {source?.bankAccountId ? `${t('manual.reference')} · ` : ''}
              {paidTo(source)}
            </div>
          </>
        );
      },
    },
    {
      key: 'evidence',
      label: t('manual.cEvidence'),
      width: '44px',
      cell: (entry) => {
        if (entry.evidenceId) {
          return (
            <span title={t('manual.shot')} className="text-neutral-700">
              <ConsoleIcon name="image" />
              <span className="sr-only">{t('manual.shot')}</span>
            </span>
          );
        }
        if (entry.evidenceLine) {
          return (
            <span title={t('manual.line')} className="text-neutral-700">
              <ConsoleIcon name="receipt" />
              <span className="sr-only">{t('manual.line')}</span>
            </span>
          );
        }
        return null;
      },
    },
  ];

  const pages = Math.max(1, Math.ceil((entries.data?.total ?? 0) / PAGE_SIZE));

  return (
    <ConsolePage>
      <PageTitle
        title={t('nav.manual')}
        lead={t('manual.lead')}
        actions={
          <Button
            type="button"
            small
            fit
            className="flex-[1_1_auto] sm:flex-none"
            onClick={() => {
              setOpen({ step: 'new' });
            }}
          >
            <ConsoleIcon name="plus" size={18} />
            {t('manual.record')}
          </Button>
        }
      />
      <div className={FILTERS}>
        <Pick label={t('manual.shop')}>
          <select
            value={tenantId}
            onChange={(event) => {
              const value = event.target.value;
              filtered(() => {
                setTenantId(value);
              });
            }}
            className={PICK_CONTROL}
          >
            <option value="">{t('manual.anyShop')}</option>
            {[...shops].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Pick>
        <Pick label={t('manual.who')}>
          <select
            value={mine ? 'me' : ''}
            onChange={(event) => {
              const value = event.target.value;
              filtered(() => {
                setMine(value === 'me');
              });
            }}
            className={PICK_CONTROL}
          >
            <option value="">{t('manual.anyone')}</option>
            <option value="me">{t('manual.onlyMine')}</option>
          </select>
        </Pick>
        <Pick label={t('manual.from')}>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => {
              const value = event.target.value;
              filtered(() => {
                setDateFrom(value);
              });
            }}
            className={PICK_CONTROL}
          />
        </Pick>
        <Pick label={t('manual.to')}>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => {
              const value = event.target.value;
              filtered(() => {
                setDateTo(value);
              });
            }}
            className={PICK_CONTROL}
          />
        </Pick>
      </div>
      {rows.length > 0 && todays.data ? (
        <div className={NOTE}>{t('manual.today', { count: madeToday })}</div>
      ) : null}
      {entries.isError ? (
        <LoadFailed
          onRetry={() => {
            void entries.refetch();
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(entry) => entry.id}
          loading={entries.isPending}
          onOpen={(entry) => {
            setOpen({ step: 'entry', entry: reversed(entry) ?? entry });
          }}
          faded={(entry) => entry.reversedBy !== null}
          empty={<EmptyBox icon="receipt" title={t('manual.empty')} hint={t('manual.emptyHint')} />}
        />
      )}
      <Pager page={page} pages={pages} onPage={setPage} />
      {open?.step === 'new' ? <RecordPanel onClose={close} /> : null}
      {open?.step === 'entry' ? (
        <EntryPanel
          entry={open.entry}
          reversal={rows.find((each) => each.id === open.entry.reversedBy?.id)}
          onClose={close}
          onShot={() => {
            setOpen({ step: 'shot', entry: open.entry });
          }}
          onReverse={() => {
            setOpen({ step: 'reverse', entry: open.entry });
          }}
        />
      ) : null}
      {open?.step === 'shot' ? (
        <EntryShotPanel
          entry={open.entry}
          onBack={() => {
            setOpen({ step: 'entry', entry: open.entry });
          }}
        />
      ) : null}
      {open?.step === 'reverse' ? (
        <ReversePanel
          entry={open.entry}
          onClose={close}
          onBack={() => {
            setOpen({ step: 'entry', entry: open.entry });
          }}
        />
      ) : null}
    </ConsolePage>
  );
}
