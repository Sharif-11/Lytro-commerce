import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';

interface TenantLifecycleFormProps {
  onSuspend: (tenantId: string, reason: string) => void;
  suspendPending: boolean;
  suspendError: string | null;
  suspendSuccess: boolean;
  onRestore: (tenantId: string) => void;
  restorePending: boolean;
  restoreError: string | null;
  restoreSuccess: boolean;
}

/** LIF-24: two small forms, not one — suspend needs a reason (SuspendTenantDto requires it), restore
    doesn't. Each takes its own tenant id field rather than sharing one, since an operator restoring a
    tenant isn't necessarily the same tab that just suspended one. */
export function TenantLifecycleForm({
  onSuspend,
  suspendPending,
  suspendError,
  suspendSuccess,
  onRestore,
  restorePending,
  restoreError,
  restoreSuccess,
}: TenantLifecycleFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [suspendTenantId, setSuspendTenantId] = useState('');
  const [reason, setReason] = useState('');
  const [restoreTenantId, setRestoreTenantId] = useState('');

  function handleSuspend(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSuspend(suspendTenantId.trim(), reason);
  }

  function handleRestore(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onRestore(restoreTenantId.trim());
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <form
        onSubmit={handleSuspend}
        className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5"
      >
        <h2 className="text-base font-semibold text-slate-900">
          {t('operator.tenants.suspendTitle')}
        </h2>
        <TextField
          label={t('operator.tenants.tenantId')}
          name="suspendTenantId"
          required
          value={suspendTenantId}
          onChange={(event) => {
            setSuspendTenantId(event.target.value);
          }}
        />
        <TextField
          label={t('operator.tenants.reason')}
          name="reason"
          required
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
        {suspendError ? <ErrorBanner message={suspendError} /> : null}
        {suspendSuccess ? (
          <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
            {t('operator.tenants.suspendSuccess')}
          </p>
        ) : null}
        <Button type="submit" variant="danger" loading={suspendPending} className="w-auto!">
          {t('operator.tenants.suspend')}
        </Button>
      </form>

      <form
        onSubmit={handleRestore}
        className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5"
      >
        <h2 className="text-base font-semibold text-slate-900">
          {t('operator.tenants.restoreTitle')}
        </h2>
        <TextField
          label={t('operator.tenants.tenantId')}
          name="restoreTenantId"
          required
          value={restoreTenantId}
          onChange={(event) => {
            setRestoreTenantId(event.target.value);
          }}
        />
        {restoreError ? <ErrorBanner message={restoreError} /> : null}
        {restoreSuccess ? (
          <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
            {t('operator.tenants.restoreSuccess')}
          </p>
        ) : null}
        <Button type="submit" variant="outline" loading={restorePending} className="w-auto!">
          {t('operator.tenants.restore')}
        </Button>
      </form>
    </div>
  );
}
