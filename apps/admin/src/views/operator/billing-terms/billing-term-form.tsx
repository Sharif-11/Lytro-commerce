import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';
import type { BillingTerm } from '@/types/billing-admin';

export interface BillingTermFormValues {
  labelBn: string;
  labelEn: string;
  months: number;
  visible: boolean;
  displayOrder: number;
  defaultDiscountPct?: number;
  tenantId?: string;
}

interface BillingTermFormProps {
  mode: 'create' | 'edit';
  initial?: BillingTerm;
  onCancel: () => void;
  onSubmit: (values: BillingTermFormValues) => void;
  pending: boolean;
  error: string | null;
}

/** Create/edit, one form — same shape both ways (mirrors RoleForm's own reasoning,
    ENGINEERING-STANDARDS.md §2a). TRM-14's single-tenant `tenantId` is a plain optional text field since
    there's no tenant picker anywhere in this app yet; the operator pastes the id they already have. */
export function BillingTermForm({
  mode,
  initial,
  onCancel,
  onSubmit,
  pending,
  error,
}: BillingTermFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [labelBn, setLabelBn] = useState(initial?.labelBn ?? '');
  const [labelEn, setLabelEn] = useState(initial?.labelEn ?? '');
  const [months, setMonths] = useState(String(initial?.months ?? 1));
  const [visible, setVisible] = useState(initial?.visible ?? true);
  const [displayOrder, setDisplayOrder] = useState(String(initial?.displayOrder ?? 0));
  const [defaultDiscountPct, setDefaultDiscountPct] = useState(initial?.defaultDiscountPct ?? '');
  const [tenantId, setTenantId] = useState(initial?.tenantId ?? '');

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({
      labelBn,
      labelEn,
      months: Number(months),
      visible,
      displayOrder: Number(displayOrder),
      defaultDiscountPct: defaultDiscountPct === '' ? undefined : Number(defaultDiscountPct),
      tenantId: tenantId.trim() === '' ? undefined : tenantId.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-slate-900">
        {mode === 'create'
          ? t('operator.billingTerms.addTitle')
          : t('operator.billingTerms.editTitle', { name: initial?.labelEn })}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('operator.billingTerms.labelEn')}
          name="labelEn"
          required
          value={labelEn}
          onChange={(event) => {
            setLabelEn(event.target.value);
          }}
        />
        <TextField
          label={t('operator.billingTerms.labelBn')}
          name="labelBn"
          required
          value={labelBn}
          onChange={(event) => {
            setLabelBn(event.target.value);
          }}
        />
        <TextField
          label={t('operator.billingTerms.months')}
          name="months"
          type="number"
          min={1}
          max={60}
          required
          value={months}
          onChange={(event) => {
            setMonths(event.target.value);
          }}
        />
        <TextField
          label={t('operator.billingTerms.displayOrder')}
          name="displayOrder"
          type="number"
          value={displayOrder}
          onChange={(event) => {
            setDisplayOrder(event.target.value);
          }}
        />
        <TextField
          label={t('operator.billingTerms.defaultDiscountPct')}
          name="defaultDiscountPct"
          type="number"
          min={0}
          max={100}
          value={defaultDiscountPct}
          onChange={(event) => {
            setDefaultDiscountPct(event.target.value);
          }}
        />
        <TextField
          label={t('operator.billingTerms.tenantId')}
          name="tenantId"
          value={tenantId}
          onChange={(event) => {
            setTenantId(event.target.value);
          }}
        />
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          checked={visible}
          onChange={(event) => {
            setVisible(event.target.checked);
          }}
        />
        {t('operator.billingTerms.visible')}
      </label>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="flex gap-2">
        <Button type="submit" loading={pending} className="w-auto! flex-1 sm:flex-none">
          {mode === 'create' ? t('operator.billingTerms.create') : t('common.save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="w-auto! flex-1 sm:flex-none"
        >
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
