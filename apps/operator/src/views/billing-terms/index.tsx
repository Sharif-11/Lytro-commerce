import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button, ErrorBanner } from '@lytronix/ui';
import {
  useBillingTerms,
  useDeleteBillingTerm,
  useRetireBillingTerm,
  useUpdateBillingTerm,
} from '@/api/billing-terms';
import { usePlanPrices, usePlans } from '@/api/plans';
import { ActionPanel } from '@/components/ui/action-panel';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { Consequence } from '@/components/ui/consequence';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { CELL_NOTE, QUIET_BUTTON, SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { formatDay } from '@/lib/format';
import type { OperatorBillingTerm } from '@/types/operator';
import { TermPanel } from './term-panel';

type Open =
  { step: 'new' } | { step: 'edit' | 'retire' | 'delete'; term: OperatorBillingTerm } | null;

function RetirePanel({
  term,
  onClose,
}: {
  term: OperatorBillingTerm;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const retire = useRetireBillingTerm();
  return (
    <ActionPanel
      title={t('billingTerms.retireTitle')}
      sub={term.labelEn}
      onClose={onClose}
      actionLabel={t('billingTerms.retire')}
      danger
      pending={retire.isPending}
      error={retire.isError ? errorMessage(retire.error, t) : null}
      onSubmit={() => {
        retire.mutate(term.id, {
          onSuccess: () => {
            toast(t('billingTerms.retired', { term: term.labelEn }));
            onClose();
          },
        });
      }}
    >
      <Consequence tone="danger">
        {t('billingTerms.retireConsequence', { count: term.invoices })}
      </Consequence>
    </ActionPanel>
  );
}

function DeletePanel({
  term,
  onClose,
}: {
  term: OperatorBillingTerm;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const remove = useDeleteBillingTerm();
  return (
    <ActionPanel
      title={t('billingTerms.deleteTitle')}
      sub={term.labelEn}
      onClose={onClose}
      actionLabel={t('common.delete')}
      danger
      pending={remove.isPending}
      error={remove.isError ? errorMessage(remove.error, t) : null}
      onSubmit={() => {
        remove.mutate(term.id, {
          onSuccess: () => {
            toast(t('billingTerms.deleted', { term: term.labelEn }));
            onClose();
          },
        });
      }}
    >
      <Consequence tone="danger">{t('billingTerms.deleteConsequence')}</Consequence>
    </ActionPanel>
  );
}

/** OPERATOR-CONSOLE-DESIGN §7: how long a plan can be bought for. */
export function BillingTerms(): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const terms = useBillingTerms();
  const plans = usePlans();
  const prices = usePlanPrices();
  const update = useUpdateBillingTerm();
  const [open, setOpen] = useState<Open>(null);
  const sorted = [...(terms.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
  const forSale = (plans.data ?? []).filter((plan) => plan.forSale);
  const pricedPlans = (termId: string): number =>
    forSale.filter((plan) =>
      (prices.data ?? []).some(
        (price) => price.planId === plan.id && price.billingTermId === termId,
      ),
    ).length;
  const close = (): void => {
    setOpen(null);
  };

  const columns: Column<OperatorBillingTerm>[] = [
    {
      key: 'term',
      label: t('billingTerms.cTerm'),
      width: 'minmax(180px,1.4fr)',
      main: true,
      cell: (term) => (
        <>
          <div>{term.labelEn}</div>
          <div className={CELL_NOTE}>{term.labelBn}</div>
        </>
      ),
    },
    {
      key: 'months',
      label: t('billingTerms.cMonths'),
      width: '90px',
      right: true,
      cell: (term) => <span className="tabular-nums">{term.months}</span>,
    },
    {
      key: 'visible',
      label: t('billingTerms.cVisible'),
      width: '110px',
      cell: (term) => (
        <Switch
          checked={term.visible && term.retiredAt === null}
          disabled={term.retiredAt !== null || update.isPending}
          label={`${t('billingTerms.cVisible')}: ${term.labelEn}`}
          onChange={(visible) => {
            update.mutate(
              { id: term.id, visible },
              {
                onSuccess: () => {
                  toast(
                    t(visible ? 'billingTerms.nowVisible' : 'billingTerms.nowHidden', {
                      term: term.labelEn,
                    }),
                  );
                },
              },
            );
          }}
        />
      ),
    },
    {
      key: 'discount',
      label: t('billingTerms.cDiscount'),
      width: '90px',
      right: true,
      cell: (term) =>
        Number(term.defaultDiscountPct ?? 0) > 0
          ? `${String(Number(term.defaultDiscountPct))}%`
          : '—',
    },
    {
      key: 'priced',
      label: t('billingTerms.cPriced'),
      width: '120px',
      cell: (term) => (
        <span className="tabular-nums">
          {pricedPlans(term.id)} / {forSale.length}
        </span>
      ),
    },
    {
      key: 'flags',
      label: '',
      width: '130px',
      cell: (term) => (
        <span className="flex flex-wrap gap-1">
          {term.tenantId ? (
            <StatusChip tone="mute" plain>
              {t('billingTerms.oneShop')}
            </StatusChip>
          ) : null}
          {term.retiredAt ? (
            <StatusChip tone="mute" plain>
              {t('billingTerms.retiredOn', { d: formatDay(term.retiredAt) })}
            </StatusChip>
          ) : null}
        </span>
      ),
    },
    {
      key: 'acts',
      label: '',
      width: '150px',
      actions: true,
      cell: (term) =>
        term.retiredAt ? (
          <Button
            type="button"
            tone="ghost"
            small
            fit
            disabled={!term.deletable}
            className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
            onClick={() => {
              setOpen({ step: 'delete', term });
            }}
          >
            {t('common.delete')}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              tone="outline"
              small
              fit
              className={SMALL_BUTTON}
              onClick={() => {
                setOpen({ step: 'edit', term });
              }}
            >
              {t('common.edit')}
            </Button>
            <Button
              type="button"
              tone="ghost"
              small
              fit
              className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
              onClick={() => {
                setOpen({ step: 'retire', term });
              }}
            >
              {t('billingTerms.retire')}
            </Button>
          </>
        ),
    },
  ];

  return (
    <ConsolePage>
      <PageTitle
        title={t('nav.billingTerms')}
        lead={t('billingTerms.lead')}
        actions={
          <Button
            type="button"
            small
            fit
            className="flex-[1_1_auto] sm:flex-none"
            onClick={() => {
              setOpen({ step: 'new' });
            }}
          >
            <ConsoleIcon name="plus" size={18} />
            {t('billingTerms.new')}
          </Button>
        }
      />
      {update.isError ? <ErrorBanner message={errorMessage(update.error, t)} /> : null}
      {terms.isError || plans.isError || prices.isError ? (
        <LoadFailed
          onRetry={() => {
            void terms.refetch();
            void plans.refetch();
            void prices.refetch();
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={sorted}
          rowKey={(term) => term.id}
          faded={(term) => term.retiredAt !== null}
          loading={terms.isLoading || plans.isLoading || prices.isLoading}
          empty={
            <EmptyBox
              icon="calendar"
              title={t('billingTerms.empty')}
              hint={t('billingTerms.emptyHint')}
            />
          }
        />
      )}
      {open?.step === 'new' ? (
        <TermPanel
          term={null}
          nextOrder={Math.max(0, ...sorted.map((term) => term.displayOrder)) + 1}
          onClose={close}
        />
      ) : null}
      {open?.step === 'edit' ? (
        <TermPanel term={open.term} nextOrder={open.term.displayOrder} onClose={close} />
      ) : null}
      {open?.step === 'retire' ? <RetirePanel term={open.term} onClose={close} /> : null}
      {open?.step === 'delete' ? <DeletePanel term={open.term} onClose={close} /> : null}
    </ConsolePage>
  );
}
