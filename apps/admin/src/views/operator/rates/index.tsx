import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RateKey } from '@lytronix/validators';
import { useOperatorRates, useRateHistory, useUpdateRate } from '@/api/operator-rates';
import { errorMessage } from '@/api/error-message';
import { ErrorBanner } from '@/components/error-banner';
import { RateList } from '@/views/operator/rates/rate-list';

/** Container (ENGINEERING-STANDARDS.md §2a) — owns the rates query, which row is being edited, which row's
    history is expanded, and the update mutation. RateList stays presentational. */
export function OperatorRates(): React.JSX.Element {
  const { t } = useTranslation();
  const rates = useOperatorRates();
  const updateRate = useUpdateRate();
  const [editingKey, setEditingKey] = useState<RateKey | null>(null);
  const [historyKey, setHistoryKey] = useState<RateKey | null>(null);
  const history = useRateHistory(historyKey);

  function startEdit(key: RateKey): void {
    setEditingKey(key);
    updateRate.reset();
  }

  function cancelEdit(): void {
    setEditingKey(null);
    updateRate.reset();
  }

  function submitEdit(value: number): void {
    if (!editingKey) return;
    updateRate.mutate({ key: editingKey, value }, { onSuccess: cancelEdit });
  }

  function toggleHistory(key: RateKey): void {
    setHistoryKey((current) => (current === key ? null : key));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          {t('operator.rates.title')}
        </h1>
      </div>

      {rates.isLoading ? (
        <p className="text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}
      {rates.isError ? <ErrorBanner message={errorMessage(rates.error, t)} /> : null}
      {rates.data ? (
        <RateList
          rates={rates.data}
          editingKey={editingKey}
          onStartEdit={startEdit}
          onCancelEdit={cancelEdit}
          onSubmitEdit={submitEdit}
          editPending={updateRate.isPending}
          editError={updateRate.error ? errorMessage(updateRate.error, t) : null}
          historyKey={historyKey}
          onToggleHistory={toggleHistory}
          history={history.data}
          historyLoading={history.isLoading}
        />
      ) : null}
    </div>
  );
}
