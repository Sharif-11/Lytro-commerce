import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextField } from '@lytronix/ui';
import { useCreateBillingTerm, useUpdateBillingTerm } from '@/api/billing-terms';
import { ActionPanel } from '@/components/ui/action-panel';
import { TWO_FIELDS } from '@/components/ui/sizes';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { problemsOf } from '@/lib/form-problems';
import type { OperatorBillingTerm } from '@/types/operator';

const FIELDS = ['labelEn', 'labelBn', 'months', 'displayOrder', 'defaultDiscountPct', 'tenantId'];

/** OPERATOR-CONSOLE-DESIGN §7. A single-shop term is set when it is made: the server doesn't change whose it is. */
export function TermPanel({
  term,
  nextOrder,
  onClose,
}: {
  term: OperatorBillingTerm | null;
  nextOrder: number;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateBillingTerm();
  const update = useUpdateBillingTerm();
  const [labelEn, setLabelEn] = useState(term?.labelEn ?? '');
  const [labelBn, setLabelBn] = useState(term?.labelBn ?? '');
  const [months, setMonths] = useState(term ? String(term.months) : '');
  const [order, setOrder] = useState(String(term?.displayOrder ?? nextOrder));
  const [discount, setDiscount] = useState(
    term?.defaultDiscountPct ? String(Number(term.defaultDiscountPct)) : '',
  );
  const [visible, setVisible] = useState(term?.visible ?? true);
  const [tenantId, setTenantId] = useState(term?.tenantId ?? '');
  const saving = term ? update : create;
  const problems = problemsOf(saving.error, t, FIELDS);

  function submit(): void {
    const values = {
      labelEn: labelEn.trim(),
      labelBn: labelBn.trim(),
      months: Number(months),
      displayOrder: Number(order),
      visible,
    };
    if (term) {
      // A cleared discount can't be sent as nothing, since nothing leaves it as it was.
      update.mutate(
        { id: term.id, ...values, defaultDiscountPct: Number(discount) },
        {
          onSuccess: () => {
            toast(t('billingTerms.saved', { term: values.labelEn }));
            onClose();
          },
        },
      );
      return;
    }
    create.mutate(
      {
        ...values,
        defaultDiscountPct: discount.trim() === '' ? undefined : Number(discount),
        tenantId: tenantId.trim() === '' ? undefined : tenantId.trim(),
      },
      {
        onSuccess: () => {
          toast(t('billingTerms.created', { term: values.labelEn }));
          onClose();
        },
      },
    );
  }

  return (
    <ActionPanel
      title={term ? t('billingTerms.editTitle') : t('billingTerms.newTitle')}
      sub={term?.labelEn}
      onClose={onClose}
      actionLabel={term ? t('common.save') : t('billingTerms.create')}
      pending={saving.isPending}
      canSubmit={labelEn.trim() !== '' && labelBn.trim() !== '' && months.trim() !== ''}
      error={problems.banner}
      onSubmit={submit}
    >
      <div className={TWO_FIELDS}>
        <TextField
          label={t('billingTerms.labelEn')}
          name="labelEn"
          required
          maxLength={100}
          data-autofocus
          error={problems.field('labelEn')}
          value={labelEn}
          onChange={(event) => {
            setLabelEn(event.target.value);
          }}
        />
        <TextField
          label={t('billingTerms.labelBn')}
          name="labelBn"
          required
          maxLength={100}
          error={problems.field('labelBn')}
          value={labelBn}
          onChange={(event) => {
            setLabelBn(event.target.value);
          }}
        />
      </div>
      <div className={TWO_FIELDS}>
        <TextField
          label={t('billingTerms.months')}
          name="months"
          required
          mono
          inputMode="numeric"
          error={problems.field('months')}
          value={months}
          onChange={(event) => {
            setMonths(event.target.value);
          }}
        />
        <TextField
          label={t('billingTerms.order')}
          name="order"
          required
          mono
          inputMode="numeric"
          error={problems.field('displayOrder')}
          value={order}
          onChange={(event) => {
            setOrder(event.target.value);
          }}
        />
      </div>
      <TextField
        label={t('billingTerms.discount')}
        name="discount"
        mono
        inputMode="decimal"
        placeholder="0"
        hint={t('billingTerms.discountHelp')}
        error={problems.field('defaultDiscountPct')}
        value={discount}
        onChange={(event) => {
          setDiscount(event.target.value);
        }}
      />
      <Switch checked={visible} onChange={setVisible} label={t('billingTerms.visible')} showLabel />
      <TextField
        label={t('billingTerms.single')}
        name="tenantId"
        mono
        placeholder="ten-…"
        disabled={term !== null}
        hint={term ? t('billingTerms.singleFixed') : t('billingTerms.singleHelp')}
        error={problems.field('tenantId')}
        value={tenantId}
        onChange={(event) => {
          setTenantId(event.target.value);
        }}
      />
    </ActionPanel>
  );
}
