import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ledgerExportUrl, useLedger } from '@/api/balance';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chips';
import { buttonClass } from '@/components/ui/classes';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Taka } from '@/components/ui/taka';
import { useErrorText } from '@/hooks/use-error-text';
import { dayLabel, formatDayMonthYear, formatTime, groupByDay } from '@/lib/dates';
import { signedTaka } from '@/lib/money';
import type { LedgerEntry } from '@/types/balance';
import type { BillingPayment } from '@/types/billing';
import {
  entryDetail,
  entryIcon,
  entryTitle,
  paymentIdOf,
  STATEMENT_CHIPS,
} from './statement-words';

/** One entry (the prototype's `ledger` row): its lead, what it was, units at the rate and the time; the amount and the
    balance after it. */
function Entry({
  entry,
  payment,
}: {
  entry: LedgerEntry;
  payment: BillingPayment | undefined;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const credit = Number(entry.amount) > 0;
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-3">
      <span
        className={[
          'flex size-10 flex-none items-center justify-center rounded-[8px]',
          credit ? 'bg-success-soft text-success' : 'bg-neutral-100 text-neutral-700',
        ].join(' ')}
      >
        <Icon name={entryIcon(entry)} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium">
          {entryTitle(entry, t, i18n.language, payment)}
        </span>
        <span className="num truncate text-[14px] text-fg-muted">
          {entryDetail(entry, t, formatTime(entry.createdAt, i18n.language))}
        </span>
      </span>
      <span className="flex flex-none flex-col items-end gap-1 text-right sm:flex-row sm:items-center sm:gap-4">
        <span className={`num text-[16px] font-semibold ${credit ? 'text-success' : ''}`}>
          <Taka amount={entry.amount} plus />
        </span>
        <span className="num text-[13px] text-fg-subtle sm:min-w-[60px]">
          {t('after', { amount: signedTaka(entry.balanceAfter) })}
        </span>
      </span>
    </div>
  );
}

/**
 * The statement (TENANT-DASHBOARD-DESIGN §7.11, BAL-14): the entries grouped by day, newest first, with the chips that
 * read several types at once, dates, the CSV of what is shown, and Show earlier. A top-up's, a plan's or an add-on's row
 * names its payment from Billing's list when that payment is in it.
 */
export function Statement({
  payments,
}: {
  payments: readonly BillingPayment[];
}): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const { t: tDefault } = useTranslation();
  const errorText = useErrorText();
  const [chip, setChip] = useState('all');
  const [dates, setDates] = useState({ from: '', to: '' });
  const [draft, setDraft] = useState(dates);
  const [picking, setPicking] = useState(false);
  const types = STATEMENT_CHIPS.find((each) => each.key === chip)?.types ?? [];
  const filters = { types, dateFrom: dates.from || undefined, dateTo: dates.to || undefined };
  const ledger = useLedger(filters);
  const entries = (ledger.data?.pages ?? []).flatMap((page) => page.entries);
  const paymentOf = (entry: LedgerEntry): BillingPayment | undefined => {
    const id = paymentIdOf(entry);
    return id ? payments.find((payment) => payment.id === id) : undefined;
  };

  function heading(iso: string): string {
    const label = dayLabel(iso);
    if (label.kind === 'today') return t('today');
    if (label.kind === 'yesterday') return t('yesterday');
    return formatDayMonthYear(label.iso);
  }

  return (
    <Card flush>
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-2">
        <h2 className="text-[17px] font-semibold">{t('statement')}</h2>
        <span className="flex gap-2">
          <Button
            tone="outline"
            size="xs"
            onClick={() => {
              setDraft(dates);
              setPicking(true);
            }}
          >
            <Icon name="calendar" />
            {t('dates')}
          </Button>
          <a href={ledgerExportUrl(filters)} className={buttonClass('outline', 'xs')}>
            <Icon name="download" />
            CSV
          </a>
        </span>
      </div>
      <div className="px-4 pb-2">
        <ChipRow>
          {STATEMENT_CHIPS.map((each) => (
            <Chip
              key={each.key}
              on={each.key === chip}
              onClick={() => {
                setChip(each.key);
              }}
            >
              {each.key === 'sms' ? t('row.sms') : t(each.key)}
            </Chip>
          ))}
        </ChipRow>
      </div>
      {ledger.isLoading ? <SkeletonRows count={3} /> : null}
      {ledger.isError ? (
        <div className="px-4 pb-4">
          <Banner tone="bad">{errorText(ledger.error)}</Banner>
        </div>
      ) : null}
      {ledger.isSuccess && entries.length === 0 ? (
        <EmptyState icon="banknote">{t('nothingYet')}</EmptyState>
      ) : null}
      {groupByDay(entries, (entry) => entry.createdAt).map((group) => (
        <div key={group.key}>
          <div className="bg-neutral-50 px-4 pt-3 pb-1 text-[13px] font-semibold text-neutral-700">
            {heading(group.iso)}
          </div>
          <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">
            {group.items.map((entry) => (
              <Entry key={entry.id} entry={entry} payment={paymentOf(entry)} />
            ))}
          </div>
        </div>
      ))}
      {ledger.hasNextPage ? (
        <div className="px-4 pt-2 pb-3">
          <Button
            tone="outline"
            size="sm"
            wide
            busy={ledger.isFetchingNextPage}
            onClick={() => {
              void ledger.fetchNextPage();
            }}
          >
            {t('showEarlier')}
          </Button>
        </div>
      ) : null}
      <Sheet
        open={picking}
        title={t('dates')}
        onClose={() => {
          setPicking(false);
        }}
        footer={
          <>
            <Button
              tone="outline"
              onClick={() => {
                setDates({ from: '', to: '' });
                setPicking(false);
              }}
            >
              {tDefault('balance.clearDates')}
            </Button>
            <Button
              onClick={() => {
                setDates(draft);
                setPicking(false);
              }}
            >
              {tDefault('balance.applyDates')}
            </Button>
          </>
        }
      >
        <Field
          label={tDefault('balance.dateFrom')}
          type="date"
          value={draft.from}
          lang={i18n.language}
          onChange={(event) => {
            setDraft((current) => ({ ...current, from: event.target.value }));
          }}
        />
        <Field
          label={tDefault('balance.dateTo')}
          type="date"
          value={draft.to}
          lang={i18n.language}
          onChange={(event) => {
            setDraft((current) => ({ ...current, to: event.target.value }));
          }}
        />
      </Sheet>
    </Card>
  );
}
