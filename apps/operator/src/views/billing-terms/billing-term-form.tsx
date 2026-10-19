import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardTitle, CheckboxRow, ErrorBanner, TextField } from '@lytronix/ui';
import type { BillingTerm } from '@/types/operator';

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
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: BillingTermFormValues) => void;
}

/** One form for create and edit. TRM-14's single-tenant id is set at creation only; the operator pastes
    the tenant id from the tenants screen. */
export function BillingTermForm({
  mode,
  initial,
  pending,
  error,
  onCancel,
  onSubmit,
}: BillingTermFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [labelEn, setLabelEn] = useState(initial?.labelEn ?? '');
  const [labelBn, setLabelBn] = useState(initial?.labelBn ?? '');
  const [months, setMonths] = useState(String(initial?.months ?? 1));
  const [visible, setVisible] = useState(initial?.visible ?? true);
  const [displayOrder, setDisplayOrder] = useState(String(initial?.displayOrder ?? 0));
  const [discount, setDiscount] = useState(initial?.defaultDiscountPct ?? '');
  const [tenantId, setTenantId] = useState(initial?.tenantId ?? '');

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({
      labelEn: labelEn.trim(),
      labelBn: labelBn.trim(),
      months: Number(months),
      visible,
      displayOrder: Number(displayOrder),
      defaultDiscountPct: discount.trim() === '' ? undefined : Number(discount),
      tenantId: tenantId.trim() === '' ? undefined : tenantId.trim(),
    });
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <CardTitle>
          {mode === 'create'
            ? t('billingTerms.addTitle')
            : t('billingTerms.editTitle', { name: initial?.labelEn })}
        </CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('billingTerms.labelEn')}
            name="labelEn"
            required
            maxLength={100}
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
            lang="bn"
            value={labelBn}
            onChange={(event) => {
              setLabelBn(event.target.value);
            }}
          />
          <TextField
            label={t('billingTerms.months')}
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
            label={t('billingTerms.displayOrder')}
            name="displayOrder"
            type="number"
            value={displayOrder}
            onChange={(event) => {
              setDisplayOrder(event.target.value);
            }}
          />
          <TextField
            label={t('billingTerms.defaultDiscountPct')}
            name="defaultDiscountPct"
            type="number"
            min={0}
            max={100}
            step="0.01"
            suffix="%"
            hint={t('billingTerms.discountHint')}
            value={discount}
            onChange={(event) => {
              setDiscount(event.target.value);
            }}
          />
          {mode === 'create' ? (
            <TextField
              label={t('billingTerms.tenantId')}
              name="tenantId"
              mono
              hint={t('billingTerms.tenantIdHint')}
              value={tenantId}
              onChange={(event) => {
                setTenantId(event.target.value);
              }}
            />
          ) : null}
        </div>
        <CheckboxRow label={t('billingTerms.visible')} checked={visible} onChange={setVisible} />
        {error ? <ErrorBanner message={error} /> : null}
        <div className="flex gap-2">
          <Button type="submit" fit loading={pending}>
            {mode === 'create' ? t('billingTerms.create') : t('common.save')}
          </Button>
          <Button type="button" tone="outline" fit onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
