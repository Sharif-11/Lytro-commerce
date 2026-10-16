import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlanLimits } from '@lytronix/validators';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';
import type { Plan } from '@/types/billing-admin';

export interface PlanFormValues {
  name: string;
  description?: string;
  rank: number;
  forSale: boolean;
  limits: PlanLimits;
  features: Record<string, boolean>;
}

interface PlanFormProps {
  mode: 'create' | 'edit';
  initial?: Plan;
  onCancel: () => void;
  onSubmit: (values: PlanFormValues) => void;
  pending: boolean;
  error: string | null;
}

// PLN-02/D3: every key planLimitsSchema defines, kept here as the one place a new limit key would also need
// adding to this editor's grid.
const LIMIT_FIELDS: { key: keyof PlanLimits; labelKey: string }[] = [
  { key: 'products', labelKey: 'operator.plans.limit.products' },
  { key: 'orders_total', labelKey: 'operator.plans.limit.ordersTotal' },
  { key: 'orders_handled_monthly', labelKey: 'operator.plans.limit.ordersHandledMonthly' },
  { key: 'staff', labelKey: 'operator.plans.limit.staff' },
  { key: 'paired_devices', labelKey: 'operator.plans.limit.pairedDevices' },
  { key: 'storage_mb', labelKey: 'operator.plans.limit.storageMb' },
  { key: 'bandwidth_gb', labelKey: 'operator.plans.limit.bandwidthGb' },
  { key: 'essential_sms_total', labelKey: 'operator.plans.limit.essentialSmsTotal' },
  { key: 'essential_sms_monthly', labelKey: 'operator.plans.limit.essentialSmsMonthly' },
  { key: 'activity_retention_days', labelKey: 'operator.plans.limit.activityRetentionDays' },
];

// PLN-19: every limit except activity_retention_days (a retention period, not a usage cap) can be unlimited.
const UNLIMITED_ELIGIBLE: ReadonlySet<keyof PlanLimits> = new Set(
  LIMIT_FIELDS.filter((field) => field.key !== 'activity_retention_days').map((field) => field.key),
);

function limitsToDraft(limits: PlanLimits | undefined): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const field of LIMIT_FIELDS) {
    const value = limits?.[field.key];
    draft[field.key] = value === undefined || value === null ? '' : String(value);
  }
  return draft;
}

function limitsToUnlimited(limits: PlanLimits | undefined): Record<string, boolean> {
  const draft: Record<string, boolean> = {};
  for (const field of LIMIT_FIELDS) {
    draft[field.key] = limits?.[field.key] === null;
  }
  return draft;
}

/** Create/edit, one form. Unlike RoleForm's fixed permission checklist, `features` has no fixed key set
    (planSchema.features is `z.record(z.boolean())`) — edited as free-form key/value rows the operator adds
    and removes, the same "arbitrary map" shape the server itself stores. */
export function PlanForm({
  mode,
  initial,
  onCancel,
  onSubmit,
  pending,
  error,
}: PlanFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [rank, setRank] = useState(String(initial?.rank ?? 0));
  const [forSale, setForSale] = useState(initial?.forSale ?? true);
  const [limitsDraft, setLimitsDraft] = useState(limitsToDraft(initial?.limits));
  const [unlimitedDraft, setUnlimitedDraft] = useState(limitsToUnlimited(initial?.limits));
  const [featureRows, setFeatureRows] = useState(
    initial ? Object.entries(initial.features).map(([key, value]) => ({ key, value })) : [],
  );

  function addFeatureRow(): void {
    setFeatureRows((rows) => [...rows, { key: '', value: true }]);
  }

  function removeFeatureRow(index: number): void {
    setFeatureRows((rows) => rows.filter((_, i) => i !== index));
  }

  function updateFeatureRow(index: number, patch: Partial<{ key: string; value: boolean }>): void {
    setFeatureRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const limits: PlanLimits = {};
    for (const field of LIMIT_FIELDS) {
      if (UNLIMITED_ELIGIBLE.has(field.key) && unlimitedDraft[field.key]) {
        (limits as Record<keyof PlanLimits, number | null | undefined>)[field.key] = null;
        continue;
      }
      const raw = limitsDraft[field.key];
      if (raw !== undefined && raw.trim() !== '') limits[field.key] = Number(raw);
    }
    const features: Record<string, boolean> = {};
    for (const row of featureRows) {
      if (row.key.trim() !== '') features[row.key.trim()] = row.value;
    }
    onSubmit({
      name,
      description: description.trim() === '' ? undefined : description,
      rank: Number(rank),
      forSale,
      limits,
      features,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-slate-900">
        {mode === 'create'
          ? t('operator.plans.addTitle')
          : t('operator.plans.editTitle', { name: initial?.name })}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('operator.plans.name')}
          name="name"
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <TextField
          label={t('operator.plans.rank')}
          name="rank"
          type="number"
          required
          value={rank}
          onChange={(event) => {
            setRank(event.target.value);
          }}
        />
      </div>

      <TextField
        label={t('operator.plans.description')}
        name="description"
        value={description}
        onChange={(event) => {
          setDescription(event.target.value);
        }}
      />

      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          checked={forSale}
          onChange={(event) => {
            setForSale(event.target.checked);
          }}
        />
        {t('operator.plans.forSale')}
      </label>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          {t('operator.plans.limits')}
        </span>
        <div className="grid gap-3 sm:grid-cols-2">
          {LIMIT_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1">
              <TextField
                label={t(field.labelKey)}
                name={field.key}
                type="number"
                min={0}
                disabled={unlimitedDraft[field.key]}
                value={unlimitedDraft[field.key] ? '' : limitsDraft[field.key]}
                onChange={(event) => {
                  setLimitsDraft((draft) => ({ ...draft, [field.key]: event.target.value }));
                }}
              />
              {UNLIMITED_ELIGIBLE.has(field.key) ? (
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={unlimitedDraft[field.key] ?? false}
                    onChange={(event) => {
                      setUnlimitedDraft((draft) => ({
                        ...draft,
                        [field.key]: event.target.checked,
                      }));
                    }}
                  />
                  {t('operator.plans.unlimited')}
                </label>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">{t('operator.plans.features')}</span>
          <button
            type="button"
            onClick={addFeatureRow}
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            {t('operator.plans.addFeature')}
          </button>
        </div>
        <div className="space-y-2">
          {featureRows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                placeholder={t('operator.plans.featureKey')}
                value={row.key}
                onChange={(event) => {
                  updateFeatureRow(index, { key: event.target.value });
                }}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-1.5 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={row.value}
                  onChange={(event) => {
                    updateFeatureRow(index, { value: event.target.checked });
                  }}
                />
                {t('common.active')}
              </label>
              <button
                type="button"
                onClick={() => {
                  removeFeatureRow(index);
                }}
                className="text-sm font-medium text-red-600 hover:underline"
              >
                {t('common.delete')}
              </button>
            </div>
          ))}
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="flex gap-2">
        <Button type="submit" loading={pending} className="w-auto! flex-1 sm:flex-none">
          {mode === 'create' ? t('operator.plans.create') : t('common.save')}
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
