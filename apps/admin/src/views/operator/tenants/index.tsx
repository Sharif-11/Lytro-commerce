import { useTranslation } from 'react-i18next';
import { useRestoreTenant, useSuspendTenant } from '@/api/operator-tenants';
import { errorMessage } from '@/api/error-message';
import { TenantLifecycleForm } from '@/views/operator/tenants/tenant-lifecycle-form';

/** Container (ENGINEERING-STANDARDS.md §2a) — owns the suspend/restore mutations; TenantLifecycleForm stays
    presentational. */
export function OperatorTenants(): React.JSX.Element {
  const { t } = useTranslation();
  const suspendTenant = useSuspendTenant();
  const restoreTenant = useRestoreTenant();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
        {t('operator.tenants.title')}
      </h1>

      <TenantLifecycleForm
        onSuspend={(tenantId, reason) => {
          suspendTenant.mutate({ tenantId, reason });
        }}
        suspendPending={suspendTenant.isPending}
        suspendError={suspendTenant.error ? errorMessage(suspendTenant.error, t) : null}
        suspendSuccess={suspendTenant.isSuccess}
        onRestore={(tenantId) => {
          restoreTenant.mutate(tenantId);
        }}
        restorePending={restoreTenant.isPending}
        restoreError={restoreTenant.error ? errorMessage(restoreTenant.error, t) : null}
        restoreSuccess={restoreTenant.isSuccess}
      />
    </div>
  );
}
