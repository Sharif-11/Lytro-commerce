import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useBillingTerms,
  useCreateBillingTerm,
  useDeleteBillingTerm,
  useRetireBillingTerm,
  useUpdateBillingTerm,
} from '@/api/billing-terms';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyLine, Page, PageHeader } from '@/components/ui/fields';
import { ErrorBanner } from '@/components/ui/notice';
import type { BillingTerm } from '@/types/operator';
import { BillingTermForm, type BillingTermFormValues } from './billing-term-form';
import { BillingTermList } from './billing-term-list';

type Panel = { mode: 'create' } | { mode: 'edit'; term: BillingTerm } | null;
type Confirm = { kind: 'retire' | 'delete'; term: BillingTerm } | null;

/** TRM-01, TRM-11, TRM-12: the billing terms, with retire for a referenced one and delete for an unused one. */
export function BillingTerms(): React.JSX.Element {
  const { t } = useTranslation();
  const terms = useBillingTerms();
  const create = useCreateBillingTerm();
  const update = useUpdateBillingTerm();
  const retire = useRetireBillingTerm();
  const remove = useDeleteBillingTerm();
  const [panel, setPanel] = useState<Panel>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  function closePanel(): void {
    setPanel(null);
    create.reset();
    update.reset();
  }

  function closeConfirm(): void {
    setConfirm(null);
    retire.reset();
    remove.reset();
  }

  function handleSubmit(values: BillingTermFormValues): void {
    if (panel?.mode === 'create') {
      create.mutate(values, { onSuccess: closePanel });
    } else if (panel?.mode === 'edit') {
      // tenantId is set at creation only (TRM-14); the update schema has no such field.
      update.mutate(
        {
          id: panel.term.id,
          labelBn: values.labelBn,
          labelEn: values.labelEn,
          months: values.months,
          visible: values.visible,
          displayOrder: values.displayOrder,
          defaultDiscountPct: values.defaultDiscountPct,
        },
        { onSuccess: closePanel },
      );
    }
  }

  const confirmMutation = confirm?.kind === 'retire' ? retire : remove;

  return (
    <Page>
      <PageHeader
        title={t('billingTerms.title')}
        lead={terms.data ? t('billingTerms.count', { count: terms.data.length }) : undefined}
        action={
          panel === null ? (
            <Button
              type="button"
              fit
              onClick={() => {
                setPanel({ mode: 'create' });
              }}
            >
              {t('billingTerms.add')}
            </Button>
          ) : null
        }
      />

      {panel !== null ? (
        <BillingTermForm
          mode={panel.mode}
          initial={panel.mode === 'edit' ? panel.term : undefined}
          pending={create.isPending || update.isPending}
          error={
            create.isError
              ? errorMessage(create.error, t)
              : update.isError
                ? errorMessage(update.error, t)
                : null
          }
          onCancel={closePanel}
          onSubmit={handleSubmit}
        />
      ) : null}

      {terms.isLoading ? <EmptyLine>{t('common.loading')}</EmptyLine> : null}
      {terms.isError ? <ErrorBanner message={errorMessage(terms.error, t)} /> : null}
      {terms.data ? (
        <BillingTermList
          terms={terms.data}
          onEdit={(term) => {
            setPanel({ mode: 'edit', term });
          }}
          onRetire={(term) => {
            setConfirm({ kind: 'retire', term });
          }}
          onDelete={(term) => {
            setConfirm({ kind: 'delete', term });
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.kind === 'retire' ? t('billingTerms.retireTitle') : t('billingTerms.deleteTitle')
        }
        message={
          confirm
            ? `${confirm.term.labelEn} · ${confirm.kind === 'retire' ? t('billingTerms.retireLead') : t('billingTerms.deleteLead')}`
            : null
        }
        error={confirmMutation.isError ? errorMessage(confirmMutation.error, t) : null}
        confirmLabel={confirm?.kind === 'retire' ? t('billingTerms.retire') : t('common.delete')}
        danger
        pending={confirmMutation.isPending}
        onConfirm={() => {
          if (!confirm) return;
          confirmMutation.mutate(confirm.term.id, { onSuccess: closeConfirm });
        }}
        onCancel={closeConfirm}
      />
    </Page>
  );
}
