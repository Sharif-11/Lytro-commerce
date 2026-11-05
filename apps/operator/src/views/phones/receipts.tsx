import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { ListenerMessageStatus } from '@lytronix/validators';
import { useLytroPhones, useLytroReceipts, useReceiptCount } from '@/api/phones';
import { Banner } from '@/components/ui/banner';
import { Chip, Chips } from '@/components/ui/chips';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsolePage } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { KeyValue, KeyValues } from '@/components/ui/key-values';
import { LoadFailed } from '@/components/ui/load-failed';
import { Pager } from '@/components/ui/pager';
import { Panel } from '@/components/ui/panel';
import { CELL_NOTE } from '@/components/ui/sizes';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';
import { taka, useAgo } from '@/lib/format';
import { formatSessionTime } from '@/lib/session-time';
import type { LytroReceipt } from '@/types/operator';
import { PhonesHead } from './phones-head';

const SEARCH_DEBOUNCE_MS = 300;

const STATUSES = [
  ListenerMessageStatus.Unmatched,
  ListenerMessageStatus.NeedsReview,
  ListenerMessageStatus.Matched,
  ListenerMessageStatus.Duplicate,
  ListenerMessageStatus.Ignored,
];

const TONES: Record<ListenerMessageStatus, ChipTone> = {
  [ListenerMessageStatus.Matched]: 'ok',
  [ListenerMessageStatus.NeedsReview]: 'warn',
  [ListenerMessageStatus.Unmatched]: 'info',
  [ListenerMessageStatus.Duplicate]: 'mute',
  [ListenerMessageStatus.Ignored]: 'mute',
};

function ReceiptChip({ status }: { status: ListenerMessageStatus }): React.JSX.Element {
  const { t } = useTranslation();
  return <StatusChip tone={TONES[status]}>{t(`receiptStatuses.${status}`)}</StatusChip>;
}

function StatusChipCount({
  status,
  on,
  query,
  onClick,
}: {
  status: ListenerMessageStatus;
  on: boolean;
  query: string;
  onClick: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const count = useReceiptCount(status, query);
  return (
    <Chip on={on} count={count.data ?? 0} onClick={onClick}>
      {t(`receiptStatuses.${status}`)}
    </Chip>
  );
}

function ReceiptPanel({
  receipt,
  phoneName,
  onClose,
}: {
  receipt: LytroReceipt;
  phoneName: string;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ago = useAgo();
  const paymentId = receipt.planPaymentId;
  // Only a payment still waiting is in the queue to open.
  const openable = paymentId !== null && receipt.status === ListenerMessageStatus.NeedsReview;
  return (
    <Panel
      open
      title={`${receipt.amount ? taka(receipt.amount) : '—'}${receipt.method ? ` · ${receipt.method}` : ''}`}
      sub={receipt.transactionId ?? undefined}
      onClose={onClose}
      footer={
        openable ? (
          <Button
            type="button"
            small
            fit
            onClick={() => {
              void navigate({ to: '/queue/$id', params: { id: paymentId } });
            }}
          >
            {t('receipts.openPayment')}
          </Button>
        ) : undefined
      }
    >
      {receipt.reviewReason ? (
        <Banner tone="warn" icon="warn">
          <b className="font-semibold">{t(`reviewReasons.${receipt.reviewReason}`)}</b>
        </Banner>
      ) : null}
      <KeyValues>
        <KeyValue label={t('phones.status')}>
          <ReceiptChip status={receipt.status} />
        </KeyValue>
        <KeyValue label={t('receipts.sender')} mono>
          {receipt.senderNumber ?? '—'}
        </KeyValue>
        <KeyValue label={t('phones.phone')}>{phoneName}</KeyValue>
        <KeyValue label={t('receipts.received')}>
          {formatSessionTime(receipt.receivedAt)} · {ago(receipt.receivedAt)}
        </KeyValue>
      </KeyValues>
      <div className="flex flex-col gap-1.5">
        <span className="text-label font-field-label text-field-label">{t('receipts.text')}</span>
        {receipt.text ? (
          <div className="mono rounded-control border border-line-strong px-3 py-2.5 text-[13px] leading-[1.5]">
            {receipt.text}
          </div>
        ) : (
          <div className="text-[13px] text-fg-muted">{t('receipts.redacted')}</div>
        )}
      </div>
    </Panel>
  );
}

/** PAY-21: what Lytro's phones forwarded, newest first, by status and searched. */
export function Receipts(): React.JSX.Element {
  const { t } = useTranslation();
  const ago = useAgo();
  const [status, setStatus] = useState<ListenerMessageStatus | null>(null);
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<LytroReceipt | null>(null);
  const receipts = useLytroReceipts(status, query, page);
  const everything = useReceiptCount(null, query);
  const phones = useLytroPhones();

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setQuery(typed.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handle);
    };
  }, [typed]);

  function phoneOf(deviceId: string): string {
    return phones.data?.devices.find((device) => device.id === deviceId)?.name ?? '—';
  }

  function choose(next: ListenerMessageStatus | null): void {
    setStatus(next);
    setPage(1);
  }

  const columns: Column<LytroReceipt>[] = [
    {
      key: 'money',
      label: t('receipts.amount'),
      width: '100px',
      main: true,
      cell: (receipt) =>
        receipt.amount ? (
          <button
            type="button"
            className="font-display font-bold tracking-[-0.01em] tabular-nums"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(receipt);
            }}
          >
            {taka(receipt.amount)}
          </button>
        ) : (
          <span className="font-normal text-fg-muted">—</span>
        ),
    },
    {
      key: 'trx',
      label: `${t('receipts.trx')} · ${t('receipts.sender')}`,
      width: 'minmax(170px,1.2fr)',
      cell: (receipt) =>
        receipt.transactionId ? (
          <>
            <span className="mono text-[13px]">{receipt.transactionId}</span>
            <div className={`mono ${CELL_NOTE}`}>
              {receipt.senderNumber ?? '—'}
              {receipt.method ? ` · ${receipt.method}` : ''}
            </div>
          </>
        ) : (
          <>
            <span className="mono text-[13px]">{receipt.senderNumber ?? '—'}</span>
            {receipt.ignoredReason ? (
              <div className={CELL_NOTE}>{t(`ignoredReasons.${receipt.ignoredReason}`)}</div>
            ) : null}
          </>
        ),
    },
    {
      key: 'phone',
      label: t('phones.phone'),
      width: 'minmax(130px,1fr)',
      cell: (receipt) => phoneOf(receipt.deviceId),
    },
    {
      key: 'age',
      label: t('receipts.received'),
      width: '90px',
      cell: (receipt) => <span className="tabular-nums">{ago(receipt.receivedAt)}</span>,
    },
    {
      key: 'state',
      label: t('phones.status'),
      width: '120px',
      cell: (receipt) => (
        <>
          <ReceiptChip status={receipt.status} />
          {receipt.reviewReason ? (
            <div className={`mt-0.5 ${CELL_NOTE}`}>
              {t(`reviewReasons.${receipt.reviewReason}`)}
            </div>
          ) : null}
        </>
      ),
    },
  ];

  return (
    <ConsolePage>
      <PhonesHead active="receipts" />
      <div className="text-[14px] text-fg-muted">{t('receipts.lead')}</div>
      <div className="flex h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-fg-subtle focus-within:border-line-active focus-within:ring-2 focus-within:ring-field-ring">
        <ConsoleIcon name="search" />
        <input
          type="search"
          aria-label={t('receipts.search')}
          placeholder={t('receipts.search')}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            // Typing starts again from the first page; nothing else about the search should.
            setPage(1);
          }}
          className="min-w-0 flex-1 bg-transparent text-input text-ink outline-none placeholder:text-placeholder"
        />
      </div>
      {receipts.isError ? (
        <LoadFailed
          onRetry={() => {
            void receipts.refetch();
          }}
        />
      ) : (
        <>
          <Chips>
            <Chip
              on={status === null}
              count={everything.data ?? 0}
              onClick={() => {
                choose(null);
              }}
            >
              {t('receipts.all')}
            </Chip>
            {STATUSES.map((each) => (
              <StatusChipCount
                key={each}
                status={each}
                query={query}
                on={status === each}
                onClick={() => {
                  choose(each);
                }}
              />
            ))}
          </Chips>
          <DataTable
            columns={columns}
            rows={receipts.data?.receipts ?? []}
            rowKey={(receipt) => receipt.id}
            loading={receipts.isPending}
            onOpen={setOpen}
            empty={
              <EmptyBox icon="inbox" title={t('receipts.empty')} hint={t('receipts.emptyHint')} />
            }
          />
          <Pager page={page} pages={receipts.data?.pages ?? 1} onPage={setPage} />
        </>
      )}
      {open ? (
        <ReceiptPanel
          receipt={open}
          phoneName={phoneOf(open.deviceId)}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </ConsolePage>
  );
}
