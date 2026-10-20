import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LedgerEntryType } from '@lytronix/validators';
import { ledgerExportUrl, useLedger, type LedgerFilters } from '@/api/balance';
import { errorMessage } from '@lytronix/api-client';
import {
  Button,
  Chip,
  EmptyLine,
  ErrorBanner,
  formatDate,
  formatRate,
  formatTakaExact,
  Icon,
  type IconName,
  TextField,
} from '@lytronix/ui';
import { Sheet } from '@/components/ui/sheet';
import { dayLabel, formatTime, groupByDay } from '@/lib/dates';
import { readLedgerReference } from '@/lib/ledger-reference';
import type { LedgerEntry } from '@/types/balance';

/** The filter chips: one per group of entry types, "All" first. */
const TYPE_CHIPS: { key: string; types: LedgerEntryType[] }[] = [
  { key: 'all', types: [] },
  { key: 'topUps', types: [LedgerEntryType.TopUp] },
  { key: 'sms', types: [LedgerEntryType.Sms] },
  { key: 'ai', types: [LedgerEntryType.Ai, LedgerEntryType.Extraction] },
  {
    key: 'fees',
    types: [LedgerEntryType.FraudCheck, LedgerEntryType.OrderFee, LedgerEntryType.ProductFee],
  },
  { key: 'plan', types: [LedgerEntryType.PlanPayment] },
  {
    key: 'other',
    types: [LedgerEntryType.Adjustment, LedgerEntryType.Reversal, LedgerEntryType.CarryOver],
  },
];

const ICONS: Record<LedgerEntryType, IconName> = {
  [LedgerEntryType.TopUp]: 'arrow',
  [LedgerEntryType.Sms]: 'sms',
  [LedgerEntryType.Ai]: 'signal',
  [LedgerEntryType.Extraction]: 'orders',
  [LedgerEntryType.FraudCheck]: 'shield',
  [LedgerEntryType.OrderFee]: 'truck',
  [LedgerEntryType.ProductFee]: 'box',
  [LedgerEntryType.PlanPayment]: 'tag',
  [LedgerEntryType.Adjustment]: 'pen',
  [LedgerEntryType.Reversal]: 'back',
  [LedgerEntryType.CarryOver]: 'store',
};

/**
 * BAL-14: the statement grouped by day, each row with an icon by type, a detail line from the units, the
 * rate and the reference, the signed amount and the balance after. The API filters one type at a time, so
 * a chip that groups several types fetches without a type filter and narrows on the client.
 */
export function Statement(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [chip, setChip] = useState('all');
  const [dates, setDates] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [datesOpen, setDatesOpen] = useState(false);
  const [draftDates, setDraftDates] = useState(dates);

  const selected = TYPE_CHIPS.find((option) => option.key === chip) ?? TYPE_CHIPS[0];
  const filters: LedgerFilters = {
    type: selected && selected.types.length === 1 ? selected.types[0] : undefined,
    dateFrom: dates.from || undefined,
    dateTo: dates.to || undefined,
  };
  const ledger = useLedger(filters);
  const entries = (ledger.data?.pages ?? [])
    .flatMap((page) => page.entries)
    .filter(
      (entry) => !selected || selected.types.length <= 1 || selected.types.includes(entry.type),
    );
  const groups = groupByDay(entries, (entry) => entry.createdAt);

  function heading(iso: string): string {
    const label = dayLabel(iso);
    if (label.kind === 'today') return t('dates.today');
    if (label.kind === 'yesterday') return t('dates.yesterday');
    return formatDate(label.iso, i18n.language);
  }

  return (
    <section className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[17px] font-bold text-ink">{t('balance.statement')}</h2>
        <div className="flex gap-1.5">
          <Button
            type="button"
            tone="outline"
            fit
            className="min-h-10! px-3! text-[14px]!"
            onClick={() => {
              setDraftDates(dates);
              setDatesOpen(true);
            }}
          >
            <Icon name="calendar" size={16} />
            {dates.from || dates.to ? t('balance.datesSet') : t('balance.dates')}
          </Button>
          <a
            href={ledgerExportUrl(filters)}
            className="inline-flex min-h-10 items-center gap-2 rounded-control border border-line-strong bg-white px-3 text-[14px] font-semibold text-ink"
          >
            <Icon name="share" size={16} />
            CSV
          </a>
        </div>
      </div>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {TYPE_CHIPS.map((option) => (
          <Chip
            key={option.key}
            selected={option.key === chip}
            className="shrink-0 min-h-10!"
            onClick={() => {
              setChip(option.key);
            }}
          >
            {t(`balance.typeChips.${option.key}`)}
          </Chip>
        ))}
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
        {ledger.isLoading ? <EmptyLine>{t('common.loading')}</EmptyLine> : null}
        {ledger.isError ? (
          <div className="p-4">
            <ErrorBanner message={errorMessage(ledger.error, t)} />
          </div>
        ) : null}
        {ledger.data && entries.length === 0 ? <EmptyLine>{t('balance.noneYet')}</EmptyLine> : null}
        {groups.map((group) => (
          <div key={group.key}>
            <p className="border-t border-line bg-neutral-50 px-4 pt-2.5 pb-1 text-[12px] font-bold text-neutral-700 first:border-t-0">
              {heading(group.iso)}
            </p>
            {group.items.map((entry) => (
              <Row key={entry.id} entry={entry} language={i18n.language} />
            ))}
          </div>
        ))}
        {ledger.hasNextPage ? (
          <div className="flex justify-center border-t border-line p-2">
            <Button
              type="button"
              tone="ghost"
              fit
              loading={ledger.isFetchingNextPage}
              onClick={() => {
                void ledger.fetchNextPage();
              }}
            >
              {t('balance.showEarlier')}
            </Button>
          </div>
        ) : null}
      </div>

      <Sheet
        open={datesOpen}
        title={t('balance.dates')}
        onClose={() => {
          setDatesOpen(false);
        }}
        footer={
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              tone="outline"
              onClick={() => {
                setDates({ from: '', to: '' });
                setDatesOpen(false);
              }}
            >
              {t('balance.clearDates')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDates(draftDates);
                setDatesOpen(false);
              }}
            >
              {t('balance.applyDates')}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <TextField
            label={t('balance.dateFrom')}
            name="dateFrom"
            type="date"
            value={draftDates.from}
            onChange={(event) => {
              setDraftDates((current) => ({ ...current, from: event.target.value }));
            }}
          />
          <TextField
            label={t('balance.dateTo')}
            name="dateTo"
            type="date"
            value={draftDates.to}
            onChange={(event) => {
              setDraftDates((current) => ({ ...current, to: event.target.value }));
            }}
          />
        </div>
      </Sheet>
    </section>
  );
}

function Row({ entry, language }: { entry: LedgerEntry; language: string }): React.JSX.Element {
  const { t } = useTranslation();
  const positive = Number(entry.amount) > 0;
  const reference = readLedgerReference(entry.reference);
  const details: string[] = [];
  if (reference.orderId)
    details.push(t('balance.ref.order', { id: reference.orderId.slice(0, 8) }));
  if (reference.productId) details.push(t('balance.ref.product'));
  if (reference.reason) details.push(reference.reason);
  if (entry.units !== null && entry.rateUsed !== null) {
    details.push(
      t('balance.ref.unitsAtRate', {
        units: formatRate(entry.units),
        rate: formatRate(entry.rateUsed),
      }),
    );
  }
  details.push(formatTime(entry.createdAt, language));

  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-2.5">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${
          positive ? 'bg-success-soft text-success' : 'bg-neutral-100 text-neutral-700'
        }`}
      >
        <Icon name={ICONS[entry.type]} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-ink">{t(`balance.type.${entry.type}`)}</p>
        <p className="num truncate text-[13px] text-neutral-700">{details.join(' · ')}</p>
      </div>
      <div className="num shrink-0 text-right">
        <p className={`text-[15px] font-bold ${positive ? 'text-success' : 'text-ink'}`}>
          {positive ? '+' : ''}
          {formatTakaExact(entry.amount)}
        </p>
        <p className="text-[12px] text-neutral-700">
          {t('balance.after', { amount: formatTakaExact(entry.balanceAfter) })}
        </p>
      </div>
    </div>
  );
}
