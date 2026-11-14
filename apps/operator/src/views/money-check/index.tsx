import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { ReconciliationDifferenceKind, ReconciliationDifferenceState } from '@lytronix/validators';
import { useDifferenceCount, useDifferences } from '@/api/reconciliation';
import { Chip, Chips } from '@/components/ui/chips';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { Pager } from '@/components/ui/pager';
import { SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { enumValue } from '@/lib/enum-value';
import { formatDay } from '@/lib/format';
import { formatSessionTime } from '@/lib/session-time';
import type { ReconciliationDifference } from '@/types/operator';
import { differenceFigures, differenceLinks } from './difference-words';
import { ResolvePanel } from './resolve-panel';

const TEXT = 'text-[14px] leading-[1.5] text-neutral-700';
const LINK = 'text-[14px] font-semibold text-primary underline';
const FILTER =
  'h-9 rounded-control border border-line-strong bg-surface px-2.5 text-[14px] text-ink';
const KINDS = Object.values(ReconciliationDifferenceKind);

function Links({ difference }: { difference: ReconciliationDifference }): React.JSX.Element | null {
  const { t } = useTranslation();
  const links = differenceLinks(difference);
  if (links.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1">
      {links.map((link) =>
        link.kind === 'shop' ? (
          <Link key="shop" to="/shops/$id" params={{ id: link.shopId }} className={LINK}>
            {t('moneyCheck.openShop')}
          </Link>
        ) : link.kind === 'payment' ? (
          <Link key="payment" to="/queue/$id" params={{ id: link.paymentId }} className={LINK}>
            {t('moneyCheck.openPayment')}
          </Link>
        ) : (
          <Link key="receipt" to="/phones/receipts" className={LINK}>
            {t('moneyCheck.openReceipt')}
          </Link>
        ),
      )}
    </div>
  );
}

/**
 * DAT-52, D9-16 (Slice 9.9): what the daily money check found. Each difference says what doesn't match, where and by how
 * much, with ways to look at it; an open one is marked resolved with what was done, kept with it for whoever looks later.
 */
export function MoneyCheck(): React.JSX.Element {
  const { t } = useTranslation();
  const [state, setState] = useState<ReconciliationDifferenceState>(
    ReconciliationDifferenceState.Open,
  );
  const [day, setDay] = useState('');
  const [kind, setKind] = useState<ReconciliationDifferenceKind | ''>('');
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<ReconciliationDifference | null>(null);
  const list = useDifferences({
    state,
    page,
    ...(day ? { day } : {}),
    ...(kind ? { kind } : {}),
  });
  const openCount = useDifferenceCount(ReconciliationDifferenceState.Open);
  const resolvedCount = useDifferenceCount(ReconciliationDifferenceState.Resolved);
  const open = state === ReconciliationDifferenceState.Open;
  const lastRun = list.data?.lastRun ?? null;

  function choose(next: ReconciliationDifferenceState): void {
    setState(next);
    setPage(1);
  }

  const columns: Column<ReconciliationDifference>[] = [
    {
      key: 'what',
      label: t('moneyCheck.what'),
      width: 'minmax(240px,2fr)',
      main: true,
      cell: (difference) => (
        <>
          <div className="text-[15px] font-semibold whitespace-normal text-ink">
            {t(`moneyCheck.kinds.${difference.kind}`)}
          </div>
          <div className={`${TEXT} whitespace-normal`}>
            {t(`moneyCheck.kindHints.${difference.kind}`)}
          </div>
          <Links difference={difference} />
          {difference.state === ReconciliationDifferenceState.Resolved ? (
            <div className="mt-2 rounded-lg border border-line bg-neutral-50 px-2.5 py-2">
              <div className={TEXT}>
                {t('moneyCheck.resolvedBy', {
                  by: difference.resolvedByEmail ?? '—',
                  d: difference.resolvedAt ? formatSessionTime(difference.resolvedAt) : '—',
                })}
              </div>
              {difference.note ? (
                <div className="text-[14px] whitespace-normal text-ink">{difference.note}</div>
              ) : null}
            </div>
          ) : null}
        </>
      ),
    },
    {
      key: 'shop',
      label: t('moneyCheck.shop'),
      width: 'minmax(170px,1.2fr)',
      cell: (difference) =>
        difference.shopName ? (
          <>
            <div className="text-[14px] font-semibold text-ink">{difference.shopName}</div>
            <div className={TEXT}>{difference.shopSlug}.lytro.app</div>
          </>
        ) : (
          <StatusChip tone="mute">{t('moneyCheck.lytro')}</StatusChip>
        ),
    },
    {
      key: 'day',
      label: t('moneyCheck.day'),
      width: '120px',
      cell: (difference) => (
        <span className="text-[14px] tabular-nums">
          {formatDay(`${difference.day}T12:00:00+06:00`)}
        </span>
      ),
    },
    {
      key: 'expected',
      label: t('moneyCheck.expected'),
      width: '120px',
      cell: (difference) => (
        <span className="text-[14px] font-semibold tabular-nums">
          {differenceFigures(difference, t).expected}
        </span>
      ),
    },
    {
      key: 'found',
      label: t('moneyCheck.found'),
      width: '120px',
      cell: (difference) => (
        <span className="text-[14px] font-semibold tabular-nums">
          {differenceFigures(difference, t).found}
        </span>
      ),
    },
    ...(open
      ? [
          {
            key: 'actions',
            label: '',
            width: '150px',
            actions: true,
            cell: (difference: ReconciliationDifference) => (
              <Button
                type="button"
                tone="outline"
                small
                fit
                className={SMALL_BUTTON}
                onClick={(event) => {
                  event.stopPropagation();
                  setResolving(difference);
                }}
              >
                {t('moneyCheck.resolve')}
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <ConsolePage>
      <PageTitle title={t('nav.moneyCheck')} lead={t('moneyCheck.lead')} />
      {lastRun ? (
        <div className={TEXT}>
          {t('moneyCheck.ran', {
            d: formatDay(`${lastRun.day}T12:00:00+06:00`),
            time: formatSessionTime(lastRun.ranAt).split(', ').pop() ?? '',
          })}
        </div>
      ) : null}
      {list.isError ? (
        <LoadFailed
          onRetry={() => {
            void list.refetch();
          }}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Chips>
              <Chip
                on={open}
                count={openCount.data ?? 0}
                onClick={() => {
                  choose(ReconciliationDifferenceState.Open);
                }}
              >
                {t('moneyCheck.open')}
              </Chip>
              <Chip
                on={!open}
                count={resolvedCount.data ?? 0}
                onClick={() => {
                  choose(ReconciliationDifferenceState.Resolved);
                }}
              >
                {t('moneyCheck.resolved')}
              </Chip>
            </Chips>
            <input
              type="date"
              aria-label={t('moneyCheck.day')}
              value={day}
              onChange={(event) => {
                setDay(event.target.value);
                setPage(1);
              }}
              className={FILTER}
            />
            <select
              aria-label={t('moneyCheck.kindAll')}
              value={kind}
              onChange={(event) => {
                const chosen = event.target.value;
                setKind(
                  chosen === ''
                    ? ''
                    : enumValue<ReconciliationDifferenceKind>(
                        KINDS,
                        chosen,
                        kind === '' ? ReconciliationDifferenceKind.PaymentWithoutProof : kind,
                      ),
                );
                setPage(1);
              }}
              className={`${FILTER} max-w-full min-w-0`}
            >
              <option value="">{t('moneyCheck.kindAll')}</option>
              {KINDS.map((each) => (
                <option key={each} value={each}>
                  {t(`moneyCheck.kinds.${each}`)}
                </option>
              ))}
            </select>
          </div>
          <DataTable
            columns={columns}
            rows={list.data?.differences ?? []}
            rowKey={(difference) => difference.id}
            loading={list.isPending}
            empty={
              open ? (
                <EmptyBox
                  icon="receipt"
                  title={t('moneyCheck.emptyTitle')}
                  hint={t('moneyCheck.emptyHint')}
                />
              ) : (
                <EmptyBox
                  icon="receipt"
                  title={t('moneyCheck.emptyResolvedTitle')}
                  hint={t('moneyCheck.emptyResolvedHint')}
                />
              )
            }
          />
          <Pager page={page} pages={list.data?.pages ?? 1} onPage={setPage} />
        </>
      )}
      {resolving ? (
        <ResolvePanel
          difference={resolving}
          onClose={() => {
            setResolving(null);
          }}
        />
      ) : null}
    </ConsolePage>
  );
}
