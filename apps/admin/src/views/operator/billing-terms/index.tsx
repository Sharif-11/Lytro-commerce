import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCreateBillingTerm,
  useDeleteBillingTerm,
  useOperatorBillingTerms,
  useUpdateBillingTerm,
} from '@/api/operator-billing-terms';
import { errorMessage } from '@/api/error-message';
import { ErrorBanner } from '@/components/error-banner';
import { Button } from '@/components/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  BillingTermForm,
  type BillingTermFormValues,
} from '@/views/operator/billing-terms/billing-term-form';
import { BillingTermList } from '@/views/operator/billing-terms/billing-term-list';
import type { BillingTerm } from '@/types/billing-admin';

type Panel = { mode: 'create' } | { mode: 'edit'; term: BillingTerm } | null;

/** Container (ENGINEERING-STANDARDS.md §2a) — mirrors views/roles/index.tsx's own shape exactly, the same
    CRUD-with-a-panel pattern, just over billing terms instead of roles. */
export function OperatorBillingTerms(): React.JSX.Element {
  const { t } = useTranslation();
  const terms = useOperatorBillingTerms();
  const createTerm = useCreateBillingTerm();
  const updateTerm = useUpdateBillingTerm();
  const deleteTerm = useDeleteBillingTerm();
  const [panel, setPanel] = useState<Panel>(null);
  const [deleteTarget, setDeleteTarget] = useState<BillingTerm | null>(null);

  const formPending = createTerm.isPending || updateTerm.isPending;
  const formError = createTerm.error ?? updateTerm.error;

  function closePanel(): void {
    setPanel(null);
    createTerm.reset();
    updateTerm.reset();
  }

  function handleSubmit(values: BillingTermFormValues): void {
    if (panel?.mode === 'create') {
      createTerm.mutate(values, { onSuccess: closePanel });
      return;
    }
    if (panel?.mode === 'edit') {
      updateTerm.mutate({ id: panel.term.id, ...values }, { onSuccess: closePanel });
    }
  }

  function closeDeleteConfirm(): void {
    setDeleteTarget(null);
    deleteTerm.reset();
  }

  function confirmDelete(): void {
    if (!deleteTarget) return;
    deleteTerm.mutate(deleteTarget.id, { onSuccess: closeDeleteConfirm });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            {t('operator.billingTerms.title')}
          </h1>
          {terms.data ? (
            <p className="mt-1 text-sm text-slate-500">
              {t('operator.billingTerms.count', { count: terms.data.length })}
            </p>
          ) : null}
        </div>
        {panel === null ? (
          <Button
            type="button"
            variant="primary"
            className="w-auto! shrink-0"
            onClick={() => {
              setPanel({ mode: 'create' });
            }}
          >
            {t('operator.billingTerms.addTerm')}
          </Button>
        ) : null}
      </div>

      {panel !== null ? (
        <BillingTermForm
          mode={panel.mode}
          initial={panel.mode === 'edit' ? panel.term : undefined}
          onCancel={closePanel}
          onSubmit={handleSubmit}
          pending={formPending}
          error={formError ? errorMessage(formError, t) : null}
        />
      ) : null}

      {terms.isLoading ? (
        <p className="text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}
      {terms.isError ? <ErrorBanner message={errorMessage(terms.error, t)} /> : null}
      {terms.data ? (
        <BillingTermList
          terms={terms.data}
          onEdit={(term) => {
            setPanel({ mode: 'edit', term });
          }}
          onDelete={(term) => {
            setDeleteTarget(term);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('operator.billingTerms.deleteTitle')}
        message={deleteTerm.error ? errorMessage(deleteTerm.error, t) : undefined}
        confirmLabel={t('common.delete')}
        danger
        pending={deleteTerm.isPending}
        onConfirm={confirmDelete}
        onCancel={closeDeleteConfirm}
      />
    </div>
  );
}
