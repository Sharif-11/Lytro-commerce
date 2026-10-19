import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LedgerEntryType, Permission } from '@lytronix/validators';
import {
  ledgerExportUrl,
  useBalance,
  useConfirmTopUp,
  useCurrentRates,
  useEssentialSms,
  useLedger,
  useQuoteTopUp,
  type LedgerFilters,
} from '@/api/balance';
import { usePlatformWallets } from '@/api/billing';
import { ApiClientError } from '@/api/client';
import { errorMessage } from '@/api/error-message';
import { useMe } from '@/api/me';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/chip';
import { Card, EmptyLine, Page, PageHeader, SelectField } from '@/components/ui/fields';
import { formatDate, formatDateTime } from '@/lib/dates';
import { ErrorBanner, Notice } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';
import { formatTaka, formatTakaExact } from '@/lib/money';
import { hasPermission } from '@/lib/permissions';
import type { PlanPayment } from '@/types/billing';
import { PaymentForm } from '@/views/checkout/payment-form';
import { RATE_LABEL_KEYS, TYPE_LABEL_KEYS } from './label-keys';

/** BAL-01..14, RAT-06, AUTH-21: the balance, a top-up (quote then pay), the free-SMS allowance, the current
    rates and the statement with its CSV export. */
export function Balance(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const canManage = hasPermission(me.data, Permission.BalanceManage);
  const balance = useBalance();
  const rates = useCurrentRates();
  const sms = useEssentialSms();
  const wallets = usePlatformWallets();
  const [filters, setFilters] = useState<LedgerFilters>({});
  const ledger = useLedger(filters);
  const quoteTopUp = useQuoteTopUp();
  const confirmTopUp = useConfirmTopUp();
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<PlanPayment | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function topUpError(error: unknown): string {
    if (error instanceof ApiClientError && error.code === 'validation_error') {
      const min = typeof error.details.min === 'number' ? error.details.min : undefined;
      const max = typeof error.details.max === 'number' ? error.details.max : undefined;
      if (min !== undefined && max !== undefined) {
        return t('balance.amountOutOfRange', { min: formatTaka(min), max: formatTaka(max) });
      }
    }
    return errorMessage(error, t);
  }

  const entries = ledger.data?.pages.flatMap((page) => page.entries) ?? [];

  return (
    <Page>
      <PageHeader title={t('nav.balance')} />

      {balance.isError ? <ErrorBanner message={errorMessage(balance.error, t)} /> : null}
      {balance.data ? (
        <Card>
          <p className="text-[14px] text-neutral-700">{t('balance.current')}</p>
          <p className="num mt-1 text-[34px] font-bold leading-none text-ink">
            {formatTaka(balance.data.amount)}
          </p>
          {balance.data.frozen ? (
            <div className="mt-3 space-y-2">
              <Tag tone="neutral">{t('balance.frozen')}</Tag>
              <p className="text-[14px] text-neutral-700">{t('balance.frozenNote')}</p>
            </div>
          ) : null}
          {sms.data ? (
            <p className="num mt-3 text-[14px] text-neutral-700">
              {t('balance.smsAllowance', {
                used: sms.data.monthlyUsed,
                limit:
                  sms.data.monthlyLimit === null ? t('plans.unlimited') : sms.data.monthlyLimit,
              })}
            </p>
          ) : null}
        </Card>
      ) : null}

      {canManage ? (
        <Card>
          <h2 className="text-[16px] font-bold text-ink">{t('balance.topUp')}</h2>
          {submitted ? (
            <Notice tone="success" className="mt-3">
              {t('balance.submitted')}
            </Notice>
          ) : null}
          {quote ? (
            <div className="mt-3 space-y-3">
              <p className="num text-[15px] text-ink">
                {t('balance.quoted', { amount: formatTaka(quote.amount) })}
              </p>
              <PaymentForm
                quote={quote}
                wallets={wallets.data}
                pending={confirmTopUp.isPending}
                error={confirmTopUp.isError ? topUpError(confirmTopUp.error) : null}
                onSubmit={(values) => {
                  confirmTopUp.mutate(
                    { paymentId: quote.id, ...values },
                    {
                      onSuccess: () => {
                        setQuote(null);
                        setAmount('');
                        setSubmitted(true);
                      },
                    },
                  );
                }}
              />
              <Button
                type="button"
                tone="ghost"
                fit
                onClick={() => {
                  setQuote(null);
                  quoteTopUp.reset();
                }}
              >
                {t('balance.startOver')}
              </Button>
            </div>
          ) : (
            <form
              className="mt-3 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const value = Number(amount);
                if (!Number.isFinite(value) || value <= 0) return;
                setSubmitted(false);
                quoteTopUp.mutate({ amount: value }, { onSuccess: setQuote });
              }}
            >
              <TextField
                label={t('balance.amount')}
                name="amount"
                type="number"
                inputMode="decimal"
                min="1"
                step="1"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                }}
              />
              {quoteTopUp.isError ? <ErrorBanner message={topUpError(quoteTopUp.error)} /> : null}
              <Button type="submit" fit loading={quoteTopUp.isPending}>
                {t('balance.quote')}
              </Button>
            </form>
          )}
        </Card>
      ) : null}

      {rates.data && rates.data.length > 0 ? (
        <Card>
          <h2 className="text-[16px] font-bold text-ink">{t('balance.ratesTitle')}</h2>
          <dl className="mt-3 divide-y divide-line">
            {rates.data.map((rate) => (
              <div
                key={rate.key}
                className="flex items-baseline justify-between gap-3 py-2 text-[14px]"
              >
                <dt className="text-neutral-700">{t(RATE_LABEL_KEYS[rate.key])}</dt>
                <dd className="num text-right text-ink">
                  <span className="font-semibold">{rate.value}</span>
                  <span className="ml-2 text-[12px] text-neutral-700">
                    {t('balance.ratesEffectiveFrom', {
                      date: formatDate(rate.effectiveFrom, i18n.language),
                    })}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[16px] font-bold text-ink">{t('balance.ledgerTitle')}</h2>
          <a
            href={ledgerExportUrl(filters)}
            className="inline-flex min-h-10 items-center text-[14px] font-bold text-brand-800 underline"
          >
            {t('balance.exportCsv')}
          </a>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <SelectField
            label={t('balance.ledgerType')}
            name="type"
            value={filters.type ?? ''}
            onChange={(event) => {
              setFilters({ ...filters, type: event.target.value || undefined });
            }}
          >
            <option value="">{t('balance.ledgerAllTypes')}</option>
            {Object.values(LedgerEntryType).map((type) => (
              <option key={type} value={type}>
                {t(TYPE_LABEL_KEYS[type])}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('activity.filters.dateFrom')}
            name="ledgerFrom"
            type="date"
            value={filters.dateFrom ?? ''}
            onChange={(event) => {
              setFilters({ ...filters, dateFrom: event.target.value || undefined });
            }}
          />
          <TextField
            label={t('activity.filters.dateTo')}
            name="ledgerTo"
            type="date"
            value={filters.dateTo ?? ''}
            onChange={(event) => {
              setFilters({ ...filters, dateTo: event.target.value || undefined });
            }}
          />
        </div>
        {ledger.isLoading ? (
          <p className="mt-3 text-[15px] text-neutral-700">{t('common.loading')}</p>
        ) : null}
        {ledger.isError ? (
          <div className="mt-3">
            <ErrorBanner message={errorMessage(ledger.error, t)} />
          </div>
        ) : null}
        {!ledger.isLoading && entries.length === 0 ? (
          <EmptyLine>{t('balance.noneYet')}</EmptyLine>
        ) : null}
        {entries.length > 0 ? (
          <ul className="mt-3 divide-y divide-line">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">
                    {t(TYPE_LABEL_KEYS[entry.type])}
                  </p>
                  <p className="num text-[13px] text-neutral-700">
                    {formatDateTime(entry.createdAt, i18n.language)}
                  </p>
                </div>
                <div className="num shrink-0 text-right">
                  <p
                    className={`text-[15px] font-bold ${Number(entry.amount) < 0 ? 'text-danger' : 'text-success'}`}
                  >
                    {Number(entry.amount) > 0 ? '+' : ''}
                    {formatTakaExact(entry.amount)}
                  </p>
                  <p className="text-[12px] text-neutral-700">
                    {t('balance.ledgerBalanceAfter')} {formatTakaExact(entry.balanceAfter)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {ledger.hasNextPage ? (
          <div className="mt-3">
            <Button
              type="button"
              tone="outline"
              fit
              loading={ledger.isFetchingNextPage}
              onClick={() => {
                void ledger.fetchNextPage();
              }}
            >
              {t('common.loadMore')}
            </Button>
          </div>
        ) : null}
      </Card>
    </Page>
  );
}
