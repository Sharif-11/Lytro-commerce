import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { ErrorBanner } from '@/components/error-banner';
import type { TenantSummary } from '@/types/tenant';

interface TenantListProps {
  tenants: TenantSummary[];
  query: string;
  onQueryChange: (query: string) => void;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  suspendingId: string | null;
  onStartSuspend: (tenantId: string) => void;
  onCancelSuspend: () => void;
  onConfirmSuspend: (tenantId: string, reason: string) => void;
  suspendPending: boolean;
  suspendError: string | null;
  onRestore: (tenantId: string) => void;
  restorePending: boolean;
}

/** LIF-24: one row per tenant, with the only two actions this console offers it directly in the row --
    suspending opens an inline reason field (the same shape RateList's own inline edit uses) rather than a
    separate screen, since a reason is the only extra input suspend needs. */
export function TenantList({
  tenants,
  query,
  onQueryChange,
  isLoading,
  isError,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  suspendingId,
  onStartSuspend,
  onCancelSuspend,
  onConfirmSuspend,
  suspendPending,
  suspendError,
  onRestore,
  restorePending,
}: TenantListProps): React.JSX.Element {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  function startSuspend(tenantId: string): void {
    setReason('');
    onStartSuspend(tenantId);
  }

  function handleSuspendSubmit(event: SyntheticEvent<HTMLFormElement>, tenantId: string): void {
    event.preventDefault();
    onConfirmSuspend(tenantId, reason);
  }

  return (
    <div className="space-y-3">
      <input
        type="search"
        placeholder={t('operator.tenants.searchPlaceholder')}
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
        }}
        className="w-full max-w-sm rounded-xl border border-slate-200 px-4 py-2.5 text-sm shadow-sm"
      />

      {isLoading ? (
        <p className="text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}
      {isError && error ? <ErrorBanner message={error} /> : null}
      {!isLoading && tenants.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">{t('operator.tenants.noneFound')}</p>
      ) : null}

      <div className="space-y-3">
        {tenants.map((tenant) => (
          <div key={tenant.id} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{tenant.shopName}</p>
                <p className="text-xs text-slate-400">
                  {tenant.slug} · {t(`billing.state.${tenant.state}`)}
                  {tenant.planName ? ` · ${tenant.planName}` : ''}
                  {tenant.suspendedAt ? ` · ${t('operator.tenants.suspended')}` : ''}
                </p>
              </div>

              {suspendingId === tenant.id ? null : tenant.suspendedAt ? (
                <Button
                  type="button"
                  variant="outline"
                  loading={restorePending}
                  onClick={() => {
                    onRestore(tenant.id);
                  }}
                  className="w-auto!"
                >
                  {t('operator.tenants.restore')}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    startSuspend(tenant.id);
                  }}
                  className="w-auto!"
                >
                  {t('operator.tenants.suspend')}
                </Button>
              )}
            </div>

            {suspendingId === tenant.id ? (
              <form
                onSubmit={(event) => {
                  handleSuspendSubmit(event, tenant.id);
                }}
                className="mt-3 flex flex-wrap items-end gap-2 border-t border-dashed border-slate-100 pt-3"
              >
                <input
                  type="text"
                  required
                  placeholder={t('operator.tenants.reason')}
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                  }}
                  className="min-w-48 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <Button type="submit" variant="danger" loading={suspendPending} className="w-auto!">
                  {t('operator.tenants.confirmSuspend')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancelSuspend}
                  className="w-auto!"
                >
                  {t('common.cancel')}
                </Button>
              </form>
            ) : null}
            {suspendingId === tenant.id && suspendError ? (
              <div className="mt-2">
                <ErrorBanner message={suspendError} />
              </div>
            ) : null}
          </div>
        ))}
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
    </div>
  );
}
