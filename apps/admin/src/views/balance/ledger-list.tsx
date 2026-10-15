import { useTranslation } from 'react-i18next';
import { LedgerEntryType } from '@lytronix/validators';
import { Button } from '@/components/button';
import { ErrorBanner } from '@/components/error-banner';
import type { LedgerFilters } from '@/api/balance';
import type { LedgerEntry, LedgerPage } from '@/types/balance';

interface LedgerListProps {
  pages: LedgerPage[];
  filters: LedgerFilters;
  onFiltersChange: (filters: LedgerFilters) => void;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

const TYPE_LABEL_KEYS: Record<LedgerEntryType, string> = {
  [LedgerEntryType.TopUp]: 'balance.type.topUp',
  [LedgerEntryType.Sms]: 'balance.type.sms',
  [LedgerEntryType.Ai]: 'balance.type.ai',
  [LedgerEntryType.Extraction]: 'balance.type.extraction',
  [LedgerEntryType.FraudCheck]: 'balance.type.fraudCheck',
  [LedgerEntryType.OrderFee]: 'balance.type.orderFee',
  [LedgerEntryType.ProductFee]: 'balance.type.productFee',
  [LedgerEntryType.PlanPayment]: 'balance.type.planPayment',
  [LedgerEntryType.Adjustment]: 'balance.type.adjustment',
  [LedgerEntryType.Reversal]: 'balance.type.reversal',
};

function typeLabel(entry: LedgerEntry, t: (key: string) => string): string {
  const key = TYPE_LABEL_KEYS[entry.type];
  return key ? t(key) : entry.type;
}

/** Mobile cards below sm, a table from sm up -- same split as StaffList/RoleList, for the same reason
    (ENGINEERING-STANDARDS.md §4). */
export function LedgerList({
  pages,
  filters,
  onFiltersChange,
  isLoading,
  isError,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: LedgerListProps): React.JSX.Element {
  const { t } = useTranslation();
  const entries = pages.flatMap((page) => page.entries);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-3 shadow-sm sm:p-4">
        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
          value={filters.type ?? ''}
          onChange={(event) => {
            onFiltersChange({ ...filters, type: event.target.value || undefined });
          }}
        >
          <option value="">{t('balance.ledgerAllTypes')}</option>
          {Object.values(LedgerEntryType).map((type) => (
            <option key={type} value={type}>
              {t(TYPE_LABEL_KEYS[type])}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label={t('balance.ledgerDateFrom')}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
          value={filters.dateFrom ?? ''}
          onChange={(event) => {
            onFiltersChange({ ...filters, dateFrom: event.target.value || undefined });
          }}
        />
        <input
          type="date"
          aria-label={t('balance.ledgerDateTo')}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
          value={filters.dateTo ?? ''}
          onChange={(event) => {
            onFiltersChange({ ...filters, dateTo: event.target.value || undefined });
          }}
        />
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}
      {isError && error ? <ErrorBanner message={error} /> : null}

      {!isLoading && entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">{t('balance.noneYet')}</p>
      ) : null}

      {entries.length > 0 ? (
        <>
          <div className="space-y-3 sm:hidden">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-900">{typeLabel(entry, t)}</p>
                  <p className="font-semibold text-slate-900">{entry.amount}</p>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {t('balance.ledgerBalanceAfter')}: {entry.balanceAfter}
                </p>
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">{t('balance.ledgerDate')}</th>
                  <th className="px-4 py-3 font-medium">{t('balance.ledgerType')}</th>
                  <th className="px-4 py-3 font-medium">{t('balance.ledgerAmount')}</th>
                  <th className="px-4 py-3 font-medium">{t('balance.ledgerBalanceAfter')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50"
                  >
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-900">{typeLabel(entry, t)}</td>
                    <td className="px-4 py-3 text-slate-900">{entry.amount}</td>
                    <td className="px-4 py-3 text-slate-600">{entry.balanceAfter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              loading={isFetchingNextPage}
              onClick={onLoadMore}
              className="w-auto!"
            >
              {t('balance.loadMore')}
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
