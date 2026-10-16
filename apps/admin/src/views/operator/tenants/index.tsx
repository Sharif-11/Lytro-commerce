import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchTenants, useRestoreTenant, useSuspendTenant } from '@/api/operator-tenants';
import { errorMessage } from '@/api/error-message';
import { TenantList } from '@/views/operator/tenants/tenant-list';

/** Container (ENGINEERING-STANDARDS.md §2a) — owns the search query, the paginated tenant list, which row's
    suspend reason field is open, and both mutations. TenantList stays presentational. */
export function OperatorTenants(): React.JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const tenants = useSearchTenants(query);
  const suspendTenant = useSuspendTenant();
  const restoreTenant = useRestoreTenant();
  const [suspendingId, setSuspendingId] = useState<string | null>(null);

  function startSuspend(tenantId: string): void {
    setSuspendingId(tenantId);
    suspendTenant.reset();
  }

  function cancelSuspend(): void {
    setSuspendingId(null);
    suspendTenant.reset();
  }

  function confirmSuspend(tenantId: string, reason: string): void {
    suspendTenant.mutate(
      { tenantId, reason },
      {
        onSuccess: () => {
          setSuspendingId(null);
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
        {t('operator.tenants.title')}
      </h1>

      <TenantList
        tenants={tenants.data?.pages.flatMap((page) => page.entries) ?? []}
        query={query}
        onQueryChange={setQuery}
        isLoading={tenants.isLoading}
        isError={tenants.isError}
        error={tenants.error ? errorMessage(tenants.error, t) : null}
        hasNextPage={tenants.hasNextPage}
        isFetchingNextPage={tenants.isFetchingNextPage}
        onLoadMore={() => void tenants.fetchNextPage()}
        suspendingId={suspendingId}
        onStartSuspend={startSuspend}
        onCancelSuspend={cancelSuspend}
        onConfirmSuspend={confirmSuspend}
        suspendPending={suspendTenant.isPending}
        suspendError={suspendTenant.error ? errorMessage(suspendTenant.error, t) : null}
        onRestore={(tenantId) => {
          restoreTenant.mutate(tenantId);
        }}
        restorePending={restoreTenant.isPending}
      />
    </div>
  );
}
